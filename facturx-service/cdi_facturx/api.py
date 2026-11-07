import asyncio
import base64
import io
import json
import logging
import os
import queue
import secrets
import threading
import zipfile
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from starlette.datastructures import Headers
from pydantic import ValidationError
from .models import GenerationRequest
from .billing_document import PreviewRequest
from .document_pdf import render_document, DocumentPDFError
from .intervention_pdf import render_intervention_report
from .billing_document import InterventionReportRequest
from .billing_issuance import IssuedRequest, preflight as billing_preflight, generate_issued
from .pdf_import import MAX_BYTES, extract_pdf, preview_pdf, ocr_page_pdf
from .service import ROOT, ConversionError, generate, health
from .recipient_lookup import RecipientQuery, LookupError, lookup_recipient

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s %(message)s')
app = FastAPI(title='CDI · Atelier Factur-X', version='1.0.0', docs_url=None, redoc_url=None, description='Conversion locale et contrôles bloquants XSD, Schematron France et PDF/A-3b.')
MAX_CONCURRENCY = int(os.getenv('FACTURX_MAX_CONCURRENCY', '2'))
SLOTS = threading.BoundedSemaphore(MAX_CONCURRENCY)


class BodyLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        size = 0

        async def limited():
            nonlocal size
            message = await receive()
            size += len(message.get('body', b''))
            maximum = 300000 if scope.get('path', '').startswith('/api/billing/') else MAX_BYTES + 2 * 1024 * 1024
            if size > maximum:
                raise HTTPException(413, 'Requête trop volumineuse (PDF 20 Mo maximum).')
            return message
        await self.app(scope, limited, send)


app.add_middleware(BodyLimitMiddleware)


@app.post('/api/stamping/process')
async def stamping_process(request: Request, file: UploadFile = File(...), payload: str = Form(...)):
    # Stamping consumes saved server-side data. Ordinary Factur-X browser sessions cannot invoke it.
    key = os.getenv('FACTURX_API_KEY', '')
    if len(key) < 32 or not secrets.compare_digest(request.headers.get('x-api-key', ''), key):
        raise HTTPException(401, 'Accès serveur requis.')
    if len(payload) > 1500000:
        raise HTTPException(413, 'Lot trop volumineux.')
    raw = await file.read(20 * 1024 * 1024 + 1)
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(413, 'PDF limité à 20 Mo.')
    if not SLOTS.acquire(blocking=False):
        raise HTTPException(503, 'Le moteur traite déjà un document. Réessayez.')
    try:
        import sys
        data = json.loads(payload)
        data['file'] = base64.b64encode(raw).decode()
        child = await asyncio.create_subprocess_exec(sys.executable, '-m', 'cdi_facturx.stamping_job',
                    stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        try:
            stdout, _ = await asyncio.wait_for(child.communicate(json.dumps(data).encode()), timeout=95)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            child.kill(); await child.wait()
            raise HTTPException(503, 'Temps de traitement dépassé. Réessayez cette pièce.') from None
        if child.returncode or len(stdout) > 40 * 1024 * 1024:
            raise HTTPException(422, 'Traitement documentaire interrompu.')
        return json.loads(stdout)
    except (ValueError, TypeError):
        raise HTTPException(422, 'Requête documentaire invalide.') from None
    finally:
        SLOTS.release()

ALLOWED_ORIGINS = set(filter(None, os.getenv('FACTURX_ALLOWED_ORIGINS', 'https://app.cdinnov.eu').split(',')))


@app.middleware('http')
async def access(request: Request, call_next):
    server_mode = os.getenv('FACTURX_DEPLOYMENT') == 'server'
    host = request.url.hostname
    allowed = {'localhost', '127.0.0.1', '::1', 'testserver'}
    allowed.update(filter(None, os.getenv('FACTURX_ALLOWED_HOSTS', '').split(',')))
    if host not in allowed:
        return JSONResponse({'detail': 'Hôte non autorisé.'}, status_code=403)
    if request.method == 'POST':
        origin = request.headers.get('origin')
        if origin and origin not in ALLOWED_ORIGINS and (urlsplit(origin).netloc != request.url.netloc or urlsplit(origin).scheme != request.url.scheme):
            return JSONResponse({'detail': 'Origine non autorisée.'}, status_code=403)
    # Hosted browser identity is owned by the portal. Historical signed bearers,
    # including unexpired ones, must not bypass account changes or logout there.
    if request.url.path == '/api/auth/login':
        return JSONResponse({'detail': 'Connectez-vous depuis le portail CDInnov.'}, status_code=410)
    if request.method == 'POST' or (server_mode and request.method != 'OPTIONS' and request.url.path != '/api/health'):
        key = os.getenv('FACTURX_API_KEY')
        if server_mode and len(key or '') < 32:
            return JSONResponse({'detail': 'Service en ligne non configuré.'}, status_code=503)
        if key and not secrets.compare_digest(request.headers.get('x-api-key', ''), key):
            return JSONResponse({'detail': 'Accès serveur requis.' if server_mode else 'Clé API requise.'}, status_code=401)
    # Preflight for the explicitly allowed management app. Private Network Access
    # is only needed for the legacy loopback mode, never for server deployments.
    if request.method == 'OPTIONS' and request.headers.get('origin') in ALLOWED_ORIGINS:
        response = Response(status_code=204, headers={
            'Access-Control-Allow-Origin': request.headers['origin'],
            'Access-Control-Allow-Methods': 'GET, POST',
            'Access-Control-Allow-Headers': 'Content-Type, X-API-Key', 'Vary': 'Origin'})
        if not server_mode:
            response.headers['Access-Control-Allow-Private-Network'] = 'true'
    else:
        response = await call_next(request)
    return response


class ServiceCORSMiddleware(CORSMiddleware):
    def preflight_response(self, request_headers):
        if os.getenv('FACTURX_DEPLOYMENT') != 'server':
            request_headers = Headers({k: v for k, v in request_headers.items()
                                       if k != 'access-control-request-private-network'})
        response = super().preflight_response(request_headers)
        if response.status_code == 200:
            response.status_code = 204
            response.body = b''
            response.headers['content-length'] = '0'
            if os.getenv('FACTURX_DEPLOYMENT') != 'server':
                response.headers['Access-Control-Allow-Private-Network'] = 'true'
        return response


# Outermost CORS layer also covers authentication errors returned by access().
app.add_middleware(ServiceCORSMiddleware, allow_origins=list(ALLOWED_ORIGINS),
                   allow_methods=['GET', 'POST'], allow_headers=['Content-Type', 'X-API-Key'], max_age=600)


@app.middleware('http')
async def security_headers(request: Request, call_next):
    # This outer layer also covers rejected hosts, authentication and preflight.
    response = await call_next(request)
    response.headers.setdefault('Cache-Control', 'no-store')
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    if os.getenv('FACTURX_DEPLOYMENT') == 'server':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000'
    return response


@app.get('/')
def index():
    return FileResponse(ROOT / 'cdi_facturx/static/index.html')


@app.get('/api/health')
def status():
    return {**health(), 'authentication_required': os.getenv('FACTURX_DEPLOYMENT') == 'server', 'document_ocr_bridge': 'v1'}


@app.get('/docs', include_in_schema=False)
def docs():
    return FileResponse(ROOT / 'cdi_facturx/static/api.html')


@app.get('/api/invoice-schema')
def invoice_schema():
    return GenerationRequest.model_json_schema()


@app.post('/api/recipients/search')
def search_recipient(query: RecipientQuery):
    try:
        return lookup_recipient(query)
    except LookupError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


def read_pdf(pdf):
    data = pdf.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, 'PDF limité à 20 Mo.')
    return data


@app.post('/api/facturx/import-pdf')
@app.post('/api/invoices/read-pdf')
def import_pdf(request: Request, pdf: Annotated[UploadFile, File()], ocrPages: Annotated[str | None, Form()] = None):
    # Browser-authored text is not a source attestation. Only the authenticated
    # portal Worker may attach its bounded OCR result to an uploaded PDF.
    ocr_pages = None
    if ocrPages is not None:
        require_machine(request)
        if len(ocrPages.encode('utf-8')) > 1500000:
            raise HTTPException(413, 'Lecture OCR trop volumineuse.')
        try:
            ocr_pages = json.loads(ocrPages)
        except (ValueError, TypeError):
            raise HTTPException(422, 'Lecture OCR invalide.') from None
    if not SLOTS.acquire(blocking=False):
        raise HTTPException(503, 'Le service traite un autre document. Réessayez dans un instant.')
    try:
        return extract_pdf(read_pdf(pdf),include_preview=True,ocr_pages=ocr_pages)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, str(exc)[:1500]) from exc
    finally:
        SLOTS.release()


def require_machine(request: Request):
    key = os.getenv('FACTURX_API_KEY', '')
    if len(key) < 32 or not secrets.compare_digest(request.headers.get('x-api-key', ''), key):
        raise HTTPException(401, 'Accès serveur requis.')


@app.post('/api/invoices/ocr-page')
def invoice_ocr_page(request: Request, pdf: Annotated[UploadFile, File()], page: Annotated[int, Form()] = 0):
    require_machine(request)
    if not SLOTS.acquire(blocking=False):
        raise HTTPException(503, 'Le service traite un autre document. Réessayez dans un instant.')
    try:
        return ocr_page_pdf(read_pdf(pdf), page)
    except HTTPException:
        raise
    except Exception:
        # Native parser diagnostics may contain private document fragments.
        raise HTTPException(422, 'Page OCR indisponible pour ce document.') from None
    finally:
        SLOTS.release()


@app.post('/api/invoices/preview-pdf')
def preview(pdf: Annotated[UploadFile, File()], page: int = 0):
    if not SLOTS.acquire(blocking=False):
        raise HTTPException(503, 'Le service traite un autre document. Réessayez dans un instant.')
    try:
        return Response(preview_pdf(read_pdf(pdf),page),media_type='image/jpeg')
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422,str(exc)[:1500]) from exc
    finally:
        SLOTS.release()


@app.post('/api/billing/intervention-report')
def intervention_report(payload: InterventionReportRequest):
    if not SLOTS.acquire(blocking=False):
        raise HTTPException(503, 'Le service traite un autre document. Réessayez dans un instant.')
    try:
        return Response(render_intervention_report(payload.document.model_dump(), payload.number, payload.reportDate), media_type='application/pdf')
    except (DocumentPDFError, ValueError) as exc:
        raise HTTPException(422, str(exc)[:1500]) from exc
    finally:
        SLOTS.release()


@app.post('/api/billing/preview-pdf')
def billing_preview(payload: PreviewRequest):
    if not SLOTS.acquire(blocking=False):
        raise HTTPException(503, 'Le service traite un autre document. Réessayez dans un instant.')
    try:
        document = payload.document
        data = render_document(document.model_dump(), document.draft_totals(), number=payload.number, issued=False, editable=payload.editable)
        return Response(data, media_type='application/pdf', headers={
            'Content-Disposition': 'attachment; filename="brouillon.pdf"'})
    except DocumentPDFError as exc:
        raise HTTPException(422, str(exc)[:1500]) from exc
    finally:
        SLOTS.release()


def json_result(result):
    return {**result['report'], 'filename': result['filename'],
            'pdf_base64': base64.b64encode(result['pdf']).decode(), 'xml': result['xml'].decode('utf-8'),
            'verapdf_report': result['verapdf'].decode('utf-8')}


def billing_machine(request, operation, payload):
    # User bearer tokens for the historical converter cannot assert issued numbers.
    key = os.getenv('FACTURX_API_KEY', '')
    if len(key) < 32 or not secrets.compare_digest(request.headers.get('x-api-key', ''), key):
        raise HTTPException(403, 'Accès réservé au serveur de facturation.')
    if not SLOTS.acquire(blocking=False):
        raise HTTPException(503, 'Le service traite un autre document. Réessayez dans un instant.')
    try:
        return operation(payload)
    except ConversionError as exc:
        raise HTTPException(503 if exc.unavailable else 422, {'stage': exc.stage, 'message': exc.message, 'errors': exc.details}) from exc
    except (ValueError, DocumentPDFError) as exc:
        raise HTTPException(422, str(exc)[:1500]) from exc
    except Exception as exc:
        logging.getLogger('cdi_facturx').warning('billing_generation_failed error_type=%s', type(exc).__name__)
        raise HTTPException(503, 'La génération du document a échoué. Réessayez.') from exc
    finally:
        SLOTS.release()


@app.post('/api/billing/preflight')
def billing_preflight_route(payload: PreviewRequest, request: Request):
    return billing_machine(request, billing_preflight, payload)


@app.post('/api/billing/preflight-pdf')
def billing_pdf_preflight_route(payload: PreviewRequest, request: Request):
    return billing_machine(request, lambda value: billing_preflight(value, electronic=False), payload)


@app.post('/api/billing/generate-issued-pdf')
def billing_pdf_generate_route(payload: IssuedRequest, request: Request):
    return billing_machine(request, lambda value: generate_issued(value, electronic=False), payload)


@app.post('/api/billing/generate-issued')
def billing_generate_route(payload: IssuedRequest, request: Request):
    return billing_machine(request, generate_issued, payload)


def conversion_stream(data, request):
    """The caller owns a slot; the worker retains it even after disconnection."""
    events = queue.Queue()
    disconnected = threading.Event()

    def emit(event):
        if not disconnected.is_set():
            events.put(event)

    def work():
        try:
            result = generate(data, request, progress=lambda value: emit({'type': 'progress', **value}))
            emit({'type': 'result', 'result': json_result(result)})
        except ConversionError as exc:
            emit({'type': 'error', 'valid': False, 'stage': exc.stage,
                  'message': exc.message, 'errors': exc.details})
        except Exception as exc:
            logging.getLogger('cdi_facturx').warning('conversion_stream_failed error_type=%s', type(exc).__name__)
            emit({'type': 'error', 'valid': False, 'message': 'La conversion a échoué. Réessayez.'})
        finally:
            SLOTS.release()

    async def body():
        try:
            while True:
                try:
                    event = await asyncio.to_thread(events.get, True, 10)
                except queue.Empty:
                    event = {'type': 'heartbeat'}
                yield json.dumps(event, ensure_ascii=False) + '\n'
                if event['type'] in ('result', 'error'):
                    break
        finally:
            disconnected.set()

    try:
        threading.Thread(target=work, name='facturx-conversion', daemon=True).start()
    except BaseException:
        SLOTS.release()
        raise
    return StreamingResponse(body(), media_type='application/x-ndjson',
                             headers={'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no'})


@app.post('/api/facturx/generate')
def convert(pdf: Annotated[UploadFile, File()], payload: Annotated[str, Form()], output: str = 'json'):
    if output not in ('json', 'pdf', 'zip', 'stream'):
        raise HTTPException(422, 'output doit être json, pdf, zip ou stream.')
    try:
        request = GenerationRequest.model_validate_json(payload)
    except ValidationError as exc:
        return JSONResponse({'valid': False, 'stage': 'data', 'message': 'Corrigez les données de facture.',
                             'errors': [{'field': '.'.join(map(str, e['loc'])), 'message': e['msg']} for e in exc.errors()]}, status_code=422)
    if not SLOTS.acquire(blocking=False):
        raise HTTPException(503, 'Le service traite un autre document. Réessayez dans un instant.')
    if output == 'stream':
        try:
            data = read_pdf(pdf)
        except BaseException:
            SLOTS.release()
            raise
        return conversion_stream(data, request)
    try:
        result = generate(read_pdf(pdf), request)
        if output == 'pdf':
            return Response(result['pdf'], media_type='application/pdf', headers={'Content-Disposition': f'attachment; filename="{result["filename"]}"'})
        if output == 'zip':
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
                archive.writestr(result['filename'], result['pdf'])
                archive.writestr('factur-x.xml', result['xml'])
                archive.writestr('validation.json', json.dumps(result['report'], ensure_ascii=False, indent=2))
                archive.writestr('verapdf.xml', result['verapdf'])
            return Response(buffer.getvalue(), media_type='application/zip', headers={'Content-Disposition': 'attachment; filename="factur-x.zip"'})
        return json_result(result)
    except ConversionError as exc:
        return JSONResponse({'valid': False, 'stage': exc.stage, 'message': exc.message, 'errors': exc.details},
                            status_code=503 if exc.unavailable else 422)
    finally:
        SLOTS.release()


app.mount('/static', StaticFiles(directory=ROOT / 'cdi_facturx/static'), name='static')
