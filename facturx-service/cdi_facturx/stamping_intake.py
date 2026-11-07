"""Identify consecutive documents before matching allocations, one OCR page per call."""
import base64
import io
import re
import hashlib
from pypdf import PdfWriter
from .stamping_pdf import (StampError, open_source, canonical, pdfium, extract_fields,
                           local_ocr, render_page, key, same_employee)
from .stamping_vision import needs_ocr, render_ocr
from .ocr_bridge import validate_ocr_pages, merge_text


def descriptor(text, page, method='text', warning=''):
    fields = extract_fields(text)['fields']
    numbering = re.search(r'\bpage\s*:?\s*(\d+)\s*(?:/|sur|of)\s*(\d+)', text, re.I)
    if numbering is None:
        numbering = re.search(r'^\s*(\d{1,3})\s*/\s*(\d{1,3})\s*$', text, re.M)
    return {'page': page, 'fields': fields, 'method': method, 'warning': warning,
            'needsOCR': method == 'text' and len(text.strip()) < 40,
            'hasText': bool(text.strip()),
            'pageNumber': int(numbering[1]) if numbering else None,
            'totalPages': int(numbering[2]) if numbering else None}


def inspect_documents(raw, page=None, ocr_pages=None):
    reader = open_source(raw, max_pages=100)
    vision = validate_ocr_pages(raw, len(reader.pages), ocr_pages)
    requested = (page if isinstance(page, list) else [page]) if page is not None else None
    if requested is not None and (not 1 <= len(requested) <= 3 or any(not isinstance(p,int) or not 0 <= p < len(reader.pages) for p in requested)):
        raise StampError('INVALID_PAGE', 'Sélection limitée à trois pages existantes.')
    _, normal = canonical(reader)
    result = []
    with pdfium.PdfDocument(normal) as pdf:
        for i in (range(len(pdf)) if requested is None else requested):
            p = pdf[i]
            if i in vision:
                tp=p.get_textpage()
                try:text=merge_text(tp.get_text_range(),vision[i]['text'])
                finally:tp.close()
                item=descriptor(text,i,'ocr','; '.join(vision[i]['warnings']))
                item['complete']=vision[i]['complete']
                if not vision[i]['complete']:item['warning']='Lecture OCR incomplète. '+item['warning']
                result.append(item)
            elif page is None:
                tp = p.get_textpage(); text = tp.get_text_range(); tp.close()
                item=descriptor(text, i)
                item['needsOCR']=needs_ocr(p,text,extract_fields(text))
                result.append(item)
            else:
                image = render_ocr(p)
                try: text, warning = local_ocr(image)
                finally: image.close()
                tp=p.get_textpage()
                try:text=tp.get_text_range()+'\n'+text
                finally:tp.close()
                result.append(descriptor(text, i, 'ocr', warning))
            p.close()
    return {'pages': result}


def ranges(pages):
    def unreadable(p):
        warning=p.get('warning','')
        return (not p.get('hasText') or p.get('complete') is False or
                bool(re.search(r'illisib|unreadable|incompl|OCR_FAILED|OCR_UNAVAILABLE',warning,re.I)) or
                bool(warning) and p.get('complete') is not True)
    groups = []
    for p in pages:
        fields = p['fields']
        previous = groups[-1] if groups else None
        start = previous is None
        if previous:
            old = previous['fields']
            identity = ('employee_ref', 'employee_name', 'period', 'invoice_number', 'supplier_ref', 'document_type')
            conflict = any(old.get(k) and fields.get(k) and key(old[k]) != key(fields[k])
                           and not (k == 'employee_name' and same_employee(old[k], fields[k])) for k in identity)
            continuation = p.get('pageNumber', 0) and p['pageNumber'] > 1
            # Never silently attach an unreadable scan to someone else's payslip.
            unknown = unreadable(p)
            repeated_header = fields.get('document_type') and not continuation
            same_identity = (fields.get('employee_ref') or fields.get('employee_name')) and fields.get('period') or fields.get('invoice_number')
            start = bool(previous.get('unknown') or conflict or p.get('pageNumber') == 1 or unknown or
                         (repeated_header and not same_identity))
        if start:
            groups.append({'start': p['page'], 'end': p['page'], 'fields': dict(fields), 'unknown': unreadable(p)})
        else:
            previous['end'] = p['page']
            previous['fields'].update(fields)
    return groups


def split_documents(raw, pages, ocr_pages=None):
    reader = open_source(raw, max_pages=100)
    vision = validate_ocr_pages(raw, len(reader.pages), ocr_pages)
    if not isinstance(pages, list) or [p.get('page') for p in pages] != list(range(len(reader.pages))):
        raise StampError('INVALID_PAGES', 'La lecture des pages est incomplète.')
    parts = ranges(pages)
    if any(p['end'] - p['start'] >= 30 for p in parts):
        raise StampError('INVALID_PDF', 'Une pièce dépasse 30 pages. Séparez les documents avant import.')
    def attest(part,content):
        selected=[{**vision[p],'page':p-part['start'],'source_sha256':hashlib.sha256(content).hexdigest()}
                  for p in sorted(vision) if part['start']<=p<=part['end']]
        if selected:
            # Attestation belongs to the actual split bytes, never the parent
            # PDF's hash or caller-authored descriptor fields. Only compact
            # extracted evidence is returned; full OCR transcripts stay private.
            from .stamping_pdf import extract, reading_receipt
            reading=extract(content,selected)
            receipt=reading_receipt(reading)
            if receipt:part['cachedReading']={'reading':reading,'receipt':receipt}
    if len(parts) == 1:
        part={**parts[0], 'original': True};attest(part,raw)
        return {'parts': [part]}
    total = 0
    for part in parts:
        writer = PdfWriter()
        for i in range(part['start'], part['end'] + 1): writer.add_page(reader.pages[i])
        output = io.BytesIO(); writer.write(output); content = output.getvalue()
        total += len(content)
        if total > 27 * 1024 * 1024 or len(content) > 20 * 1024 * 1024:
            raise StampError('PDF_TOO_LARGE', 'Le découpage est trop volumineux. Importez des PDF plus petits.')
        part['pdf'] = base64.b64encode(content).decode()
        attest(part,content)
    return {'parts': parts}
