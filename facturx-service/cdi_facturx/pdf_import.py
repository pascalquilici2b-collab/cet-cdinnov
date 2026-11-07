"""Conservative text extraction. Every candidate still requires human review."""
import hashlib
import base64
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import math
from decimal import Decimal
import pymupdf
from pypdf import PdfReader
from .extract_fields import extract_fields
from .pdf_safety import ensure_static_pdf
from .ocr_bridge import (validate_ocr_pages, merge_text, ocr_warnings, ocr_fingerprint,
                         has_visual_annotations, MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE, MAX_IMAGE_BYTES)

MAX_BYTES = 20 * 1024 * 1024
MAX_PAGES = 50


def _isolated_read(data: bytes, operation: str, page: int = 0):
    if len(data) > MAX_BYTES or not data.startswith(b'%PDF-'):
        raise ValueError('PDF non valide ou trop volumineux.')
    # All uploaded-PDF parsing stays outside the web process, including the
    # source check used during conversion. Native parser hangs/crashes cannot
    # retain the API slot forever or exhaust the server address space.
    with tempfile.TemporaryFile() as output:
        try:
            result = subprocess.run([sys.executable, '-m', 'cdi_facturx.pdf_read_worker', operation, str(page)],
                                    input=data, stdout=output, stderr=subprocess.DEVNULL, timeout=35,
                                    cwd=os.path.dirname(os.path.dirname(__file__)), check=False,
                                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        except subprocess.TimeoutExpired:
            raise ValueError('Le contrôle du PDF a dépassé le délai autorisé.') from None
        output.seek(0)
        raw = output.read(6 * 1024 * 1024 + 1)
    if result.returncode or len(raw) > 6 * 1024 * 1024:
        raise ValueError('Traitement du PDF interrompu : utilisez une copie simplifiée.')
    try:
        response = json.loads(raw)
    except (ValueError, UnicodeError):
        raise ValueError('Le PDF ne peut pas être lu.') from None
    if not response.get('ok'):
        raise ValueError('Le PDF ne peut pas être lu ou dépasse les limites de traitement.')
    return response['result']


def inspect_pdf(data: bytes):
    return tuple(_isolated_read(data, 'inspect'))


def _inspect_pdf(data: bytes, page_texts=False):
    if len(data) > MAX_BYTES:
        raise ValueError('PDF limité à 20 Mo.')
    if not data.startswith(b'%PDF-'):
        raise ValueError('Le fichier ne possède pas un en-tête PDF valide.')
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        raise ValueError('Déchiffrez le PDF avant import.')
    if not 1 <= len(reader.pages) <= MAX_PAGES:
        raise ValueError('Le document doit contenir entre 1 et 50 pages.')
    ensure_static_pdf(reader)
    if reader.trailer['/Root'].get('/Perms') or any(
        f.get('/FT') == '/Sig' for f in (reader.get_fields() or {}).values()
    ):
        raise ValueError('Le PDF comporte une signature ou un champ de signature ; utilisez l’original non signé.')
    if reader.attachments:
        raise ValueError('Ce PDF contient déjà des pièces jointes. Utilisez la facture PDF originale.')
    with pymupdf.open(stream=data, filetype='pdf') as doc:
        parts, size = [], 0
        for page in doc:
            part = page.get_text(sort=True)
            size += len(part) + 1
            if size > 500_000:
                raise ValueError('Le contenu du PDF dépasse la limite d’analyse.')
            parts.append(part)
        text = '\n'.join(parts)
    return parts if page_texts else (text, len(reader.pages))


def preview_pdf(data: bytes, page: int = 0):
    return base64.b64decode(_isolated_read(data, 'preview', page), validate=True)


def ocr_page_pdf(data: bytes, page: int = 0):
    return _isolated_read(data, 'ocr-page', page)


def _ocr_page_pdf(data: bytes, page: int = 0):
    # Run every source/security check before exposing even a rendered preview.
    _, pages = _inspect_pdf(data)
    if type(page) is not int or not 0 <= page < pages:
        raise ValueError('Page non disponible.')
    visual_annotations=has_visual_annotations(PdfReader(io.BytesIO(data)).pages[page])
    with pymupdf.open(stream=data, filetype='pdf') as doc:
        selected = doc[page]
        width, height = selected.rect.width, selected.rect.height
        scale = min(300 / 72, (MAX_IMAGE_SIDE - 1) / max(width, height), math.sqrt((MAX_IMAGE_PIXELS - 10000) / (width * height)))
        picture = selected.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False, colorspace=pymupdf.csRGB)
        image = picture.tobytes('jpeg', jpg_quality=88)
        if len(image) > MAX_IMAGE_BYTES or picture.width * picture.height > MAX_IMAGE_PIXELS:
            raise ValueError('Image OCR trop volumineuse.')
        native = selected.get_text(sort=True)
        raster_area = sum(abs(rect.width * rect.height) for item in selected.get_images(full=True)
                          for rect in selected.get_image_rects(item[0]))
        return {'source_sha256': hashlib.sha256(data).hexdigest(), 'page': page, 'pages': pages,
                'image': 'data:image/jpeg;base64,' + base64.b64encode(image).decode('ascii'),
                'width': picture.width, 'height': picture.height, 'nativeText': native[:10000],
                'needsOCR': len(native.strip()) < 40 or raster_area > width * height * .2 or visual_annotations}


def _preview_pdf(data: bytes, page: int = 0):
    if len(data)>MAX_BYTES or not data.startswith(b'%PDF-'):
        raise ValueError('PDF non valide ou trop volumineux.')
    with pymupdf.open(stream=data,filetype='pdf') as document:
        if document.needs_pass or not 1<=len(document)<=MAX_PAGES or not 0<=page<len(document):
            raise ValueError('Page non disponible.')
        selected=document[page]
        scale=min(1200/max(selected.rect.width,1),1600/max(selected.rect.height,1),2)
        picture=selected.get_pixmap(matrix=pymupdf.Matrix(scale,scale),alpha=False)
        return picture.tobytes('jpeg',jpg_quality=85)


def extract_pdf(data: bytes, include_preview=False, ocr_pages=None) -> dict:
    if ocr_pages is None:
        text, pages = inspect_pdf(data)
        native_pages=None
    else:
        native_pages=_isolated_read(data,'inspect-pages')
        text='\n'.join(native_pages);pages=len(native_pages)
    native = text
    vision = validate_ocr_pages(data, pages, ocr_pages)
    # Parse one reading per page to avoid doubling invoice rows or VAT. Keep
    # native text separately and compare every independently recognised field.
    parse_text='\n'.join(vision[p]['text'] if p in vision else t for p,t in enumerate(native_pages)) if vision else text
    for page in sorted(vision):
        text = merge_text(text, vision[page]['text'])
    ambiguities=set()
    invoice, code, rate, warnings = extract_fields(parse_text,conservative=bool(vision),ambiguities=ambiguities)
    if vision:
        # The historical invoice decoder chooses one label occurrence. Compare
        # independent readings first: OCR must never silently replace a native
        # invoice number, date, amount, bank account or party identifier.
        decoded = [extract_fields(native,conservative=True,ambiguities=ambiguities), *(extract_fields(vision[p]['text'],conservative=True,ambiguities=ambiguities) for p in sorted(vision))]
        readings = [r[0] for r in decoded]
        paths = [('number',), ('issue_date',), ('totals','net'), ('totals','vat'), ('totals','gross'),
                 ('totals','due'), ('totals','rounding'), ('business_process',),
                 ('buyer_reference',), ('order_reference',), ('contract_reference',)]
        paths += [(role,field) for role in ('seller','buyer') for field in
                  ('name','siret','siren','vat_number','street','city','postal_code','country',
                   'contact_email','electronic_address','electronic_scheme')]
        paths += [('payment',field) for field in ('iban','bic','terms','due_date','prepaid','means_code')]
        def value_at(obj, path):
            for part in path:
                if not isinstance(obj, dict): return None
                obj = obj.get(part)
            return obj
        conflicts = []
        for path in paths:
            recognized = [value_at(r,path) for r in readings if value_at(r,path) not in (None,'')]
            values = {str(v).strip().casefold() for v in recognized}
            if len(values) > 1 or '.'.join(path) in ambiguities:
                target = invoice
                for part in path[:-1]: target = target.get(part,{})
                target.pop(path[-1], None)
                conflicts.append('.'.join(path))
            elif recognized:
                # Two equivalent native/OCR VAT rows must not be summed twice
                # merely because their whitespace differs in the merged text.
                target=invoice
                for part in path[:-1]:target=target.setdefault(part,{})
                target[path[-1]]=recognized[0]
        if len({str(r[1]).strip().casefold() for r in decoded if r[1] not in (None,'')})>1:
            code=None;conflicts.append('business_code')
        if len({str(r[2]) for r in decoded if r[2] is not None})>1:
            rate=None;conflicts.append('vat_rate')
        if 'totals.gross' in conflicts or 'payment.prepaid' in conflicts:
            # A due amount calculated from an ambiguous TTC/deposit is itself
            # ambiguous, even when the native reading had a plausible value.
            invoice.get('totals',{}).pop('due',None)
            if 'totals.due' not in conflicts:conflicts.append('totals.due')
        if conflicts:
            warnings.append('Lectures native et OCR contradictoires : vérifiez manuellement ' + ', '.join(conflicts) + '.')
        warnings.extend(ocr_warnings(vision))
        warnings.append('Lecture OCR automatique : contrôlez les références, dates et montants sur le document original.')
    candidates = {key:invoice[key] for key in ['number','issue_date'] if invoice.get(key)}
    candidates['totals'] = {k:v for k,v in invoice.get('totals',{}).items() if k in ('net','vat','gross')}
    for alias, group, key in [('seller_siret','seller','siret'),('seller_vat_number','seller','vat_number'),('iban','payment','iban'),('bic','payment','bic'),('payment_terms','payment','terms'),('due_date','payment','due_date'),('client','buyer','name')]:
        if invoice.get(group,{}).get(key): candidates[alias]=invoice[group][key]
    if code: candidates['business_code']=code
    if rate is not None: candidates['vat_rate']=rate
    if len(text.strip()) < 30:
        warnings.append('Le PDF ne contient pas de texte exploitable. Utilisez le PDF exporté par votre logiciel ou complétez les champs manuellement.')
    result = {'source_sha256': hashlib.sha256(data).hexdigest(), 'pages': pages, 'text': text,
            'candidates': candidates, 'invoice': invoice, 'warnings': warnings, 'requires_review': True}
    if vision:
        result.update(ocr=True, ocr_complete=all(p['complete'] for p in vision.values()),
                      ocr_fingerprint=ocr_fingerprint(vision),
                      ocr_pages=[{'page': p, 'model': vision[p]['model'], 'complete': vision[p]['complete']} for p in sorted(vision)])
    if include_preview: result['preview_image']='data:image/jpeg;base64,'+base64.b64encode(preview_pdf(data)).decode('ascii')
    return result


def check_source(invoice, extracted, corrections=()):
    c = extracted['candidates']
    differences=[]
    def compare(field,recognized,entered,label):
        if recognized is None or recognized=='': return
        same = Decimal(recognized)==Decimal(entered) if field.startswith('totals.') else ' '.join(str(recognized).split())==' '.join(str(entered).split())
        if same: return
        if field not in corrections: raise ValueError(label+' diffère de la valeur reconnue dans le PDF. Corrigez la lecture puis confirmez la relecture du document.')
        differences.append({'field':field,'recognized':str(recognized),'entered':str(entered)})
    compare('number',c.get('number'),invoice.number,'Le numéro saisi')
    compare('issue_date',c.get('issue_date'),invoice.issue_date.isoformat(),'La date saisie')
    for key, value in c.get('totals', {}).items():
        compare('totals.'+key,value,getattr(invoice.totals,key),'Le total '+key)
    for key in ('rounding','due'):
        value=extracted.get('invoice',{}).get('totals',{}).get(key)
        if value is not None: compare('totals.'+key,value,getattr(invoice.totals,key),'Le montant '+key)
    compare('seller.siret',c.get('seller_siret'),invoice.seller.siret,'Le SIRET vendeur')
    compare('payment.iban',c.get('iban'),invoice.payment.iban,'L’IBAN saisi')
    return differences
