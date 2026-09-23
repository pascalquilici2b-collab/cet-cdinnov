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
from pydantic import BaseModel, Field, ValidationError
from . import server_auth
from .models import GenerationRequest
from .pdf_import import MAX_BYTES, extract_pdf, preview_pdf
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
            if size > MAX_BYTES + 2 * 1024 * 1024:
                raise HTTPException(413, 'Requête trop volumineuse (PDF 20 Mo maximum).')
            return message
        await self.app(scope, limited, send)


app.add_middleware(BodyLimitMiddleware)

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
    login_route = server_mode and request.url.path == '/api/auth/login' and request.method == 'POST'
    if (request.method == 'POST' and not login_route) or (server_mode and not login_route and request.method != 'OPTIONS' and request.url.path != '/api/health'):
        key = os.getenv('FACTURX_API_KEY')
        if server_mode and len(key or '') < 32:
            return JSONResponse({'detail': 'Service en ligne non configuré.'}, status_code=503)
        if key and not secrets.compare_digest(request.headers.get('x-api-key', ''), key):
            authorization = request.headers.get('authorization', '')
            identity = server_auth.verify(authorization[7:]) if server_mode and authorization.startswith('Bearer ') else None
            if not identity:
                return JSONResponse({'detail': 'Connectez-vous pour utiliser la conversion en ligne.' if server_mode else 'Clé API requise.'}, status_code=401)
            request.state.facturx_user = identity
    # Preflight for the explicitly allowed management app. Private Network Access
    # is only needed for the legacy loopback mode, never for server deployments.
    if request.method == 'OPTIONS' and request.headers.get('origin') in ALLOWED_ORIGINS:
        response = Response(status_code=204, headers={
            'Access-Control-Allow-Origin': request.headers['origin'],
            'Access-Control-Allow-Methods': 'GET, POST',
            'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization', 'Vary': 'Origin'})
        if not server_mode:
            response.headers['Access-Control-Allow-Private-Network'] = 'true'
    else:
        response = await call_next(request)
    response.headers.setdefault('Cache-Control', 'no-store')
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
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
                   allow_methods=['GET', 'POST'], allow_headers=['Content-Type', 'X-API-Key', 'Authorization'], max_age=600)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024, repr=False)


@app.post('/api/auth/login')
def authenticate(credentials: LoginRequest, request: Request):
    if os.getenv('FACTURX_DEPLOYMENT') != 'server':
        raise HTTPException(404, 'Connexion non nécessaire pour le moteur local.')
    try:
        server_auth.signing_key()
        if not server_auth.users():
            raise ValueError('No configured users')
    except (ValueError, TypeError):
        raise HTTPException(503, 'La connexion au service en ligne n’est pas encore configurée.') from None
    email = credentials.email.strip().lower()
    remote = request.client.host if request.client else 'unknown'
    if not server_auth.allow_attempt(remote, email):
        raise HTTPException(429, 'Trop de tentatives. Réessayez dans cinq minutes.')
    result = server_auth.login(email, credentials.password)
    if not result:
        raise HTTPException(401, 'Adresse ou mot de passe incorrect, ou accès au Facturier non autorisé.')
    return result


@app.get('/')
def index():
    return FileResponse(ROOT / 'cdi_facturx/static/index.html')


@app.get('/api/health')
def status():
    return {**health(), 'authentication_required': os.getenv('FACTURX_DEPLOYMENT') == 'server'}


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
def import_pdf(pdf: Annotated[UploadFile, File()]):
    if not SLOTS.acquire(blocking=False):
        raise HTTPException(503, 'Le service traite un autre document. Réessayez dans un instant.')
    try:
        return extract_pdf(read_pdf(pdf),include_preview=True)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, str(exc)[:1500]) from exc
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


def json_result(result):
    return {**result['report'], 'filename': result['filename'],
            'pdf_base64': base64.b64encode(result['pdf']).decode(), 'xml': result['xml'].decode('utf-8'),
            'verapdf_report': result['verapdf'].decode('utf-8')}


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
