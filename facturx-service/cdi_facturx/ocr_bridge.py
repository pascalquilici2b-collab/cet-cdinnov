"""Bounded machine-supplied OCR, with no network access or model credentials.

Only the authenticated portal Worker supplies these transcriptions. A source
hash is an integrity binding, never an authentication mechanism by itself.
"""
import hashlib
import json
import re

MAX_OCR_TEXT_BYTES = 500_000
MAX_OCR_PAGE_BYTES = 60_000
MAX_IMAGE_PIXELS = 4_000_000
MAX_IMAGE_SIDE = 2560
MAX_IMAGE_BYTES = 3 * 1024 * 1024


def has_visual_annotations(page):
    """Bounded visible handwriting/form hints, never signature verification.

    Parent fields may own a widget's value. Resolve at most eight ancestors and
    reject excessive/cyclic structures instead of hiding an unread annotation.
    Call only after the existing static-PDF and digital-signature checks.
    """
    from pypdf.generic import NullObject
    def resolve(value):
        return value.get_object() if hasattr(value, 'get_object') else value
    annotations=resolve(page.get('/Annots',[]))
    if not isinstance(annotations,(list,tuple)) or len(annotations)>2048:
        raise ValueError('Annotations trop nombreuses ou invalides.')
    def filled(value):
        value=resolve(value)
        if value is None or value is False or isinstance(value,NullObject):return False
        if isinstance(value,(list,tuple)):
            if len(value)>256:raise ValueError('Valeur de formulaire trop volumineuse.')
            values=[resolve(v) for v in value]
            if any(isinstance(v,(dict,list,tuple)) for v in values):
                raise ValueError('Valeur de formulaire imbriquée invalide.')
            return any(filled(v) for v in values)
        if isinstance(value,dict):return False
        if isinstance(value,(str,bytes)) and len(value)>10000:return True
        if isinstance(value,bytes):return value.strip() not in (b'',b'Off',b'/Off')
        return str(value).strip() not in ('','Off','/Off')
    for reference in annotations:
        annotation=resolve(reference)
        if not isinstance(annotation,dict):raise ValueError('Annotation invalide.')
        # Invisible, Hidden and NoView annotations are not part of the visible
        # page. A printing flag alone does not hide an ordinary annotation.
        if int(annotation.get('/F',0)) & (1|2|32):continue
        subtype=resolve(annotation.get('/Subtype'))
        if subtype in ('/Ink','/FreeText'):return True
        if subtype!='/Widget':continue
        node=annotation;seen=set();value=None;field_type=None
        for _ in range(8):
            if id(node) in seen:raise ValueError('Parent de formulaire cyclique.')
            seen.add(id(node))
            if field_type is None:field_type=resolve(node.get('/FT'))
            if value is None:value=node.get('/V')
            parent=node.get('/Parent')
            if parent is None:break
            node=resolve(parent)
            if not isinstance(node,dict):raise ValueError('Parent de formulaire invalide.')
        else:raise ValueError('Hiérarchie de formulaire trop profonde.')
        if field_type!='/Sig' and filled(value):return True
    return False


def validate_ocr_pages(raw, pages, entries):
    if entries is None:
        return {}
    if not isinstance(entries, list) or len(entries) > pages:
        raise ValueError('Pages OCR invalides ou trop nombreuses.')
    source = hashlib.sha256(raw).hexdigest()
    result = {}
    total = 0
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) - {'page', 'text', 'source_sha256', 'model', 'complete', 'warnings'}:
            raise ValueError('Lecture OCR invalide.')
        page = entry.get('page')
        text = entry.get('text')
        if type(page) is not int or not 0 <= page < pages or page in result or entry.get('source_sha256') != source:
            raise ValueError('La lecture OCR ne correspond pas aux pages de ce PDF.')
        if not isinstance(text, str) or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', text):
            raise ValueError('Texte OCR invalide.')
        try:
            size = len(text.encode('utf-8'))
        except UnicodeEncodeError:
            raise ValueError('Texte OCR UTF-8 invalide.') from None
        total += size
        if size > MAX_OCR_PAGE_BYTES or total > MAX_OCR_TEXT_BYTES:
            raise ValueError('Le texte OCR dépasse la limite autorisée.')
        complete = entry.get('complete', True)
        warnings = entry.get('warnings', [])
        model = entry.get('model', '')
        if type(complete) is not bool or not isinstance(warnings, list) or len(warnings) > 10 or any(not isinstance(w, str) or len(w) > 300 for w in warnings):
            raise ValueError('État de lecture OCR invalide.')
        try:
            if any(re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]',w) or len(w.encode('utf-8'))>1200 for w in warnings):
                raise ValueError('Avertissement OCR invalide.')
        except UnicodeEncodeError:
            raise ValueError('Avertissement OCR UTF-8 invalide.') from None
        if not isinstance(model, str) or len(model) > 120 or model and not re.fullmatch(r'@cf/[\w./-]+', model):
            raise ValueError('Modèle OCR invalide.')
        result[page] = {'page': page, 'text': text, 'source_sha256': source,
                        'complete': complete, 'warnings': warnings, 'model': model}
    return result


def ocr_fingerprint(entries):
    ordered = [entries[p] for p in sorted(entries)]
    return hashlib.sha256(json.dumps(ordered, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def merge_text(native, vision):
    # Preserve both readings and contradictory values. Suppress only exactly
    # repeated lines, so native+vision cannot duplicate an identical invoice row.
    lines = native.splitlines()
    seen = {line.strip() for line in lines if line.strip()}
    for line in vision.splitlines():
        if not line.strip() or line.strip() not in seen:
            lines.append(line)
            seen.add(line.strip())
    return '\n'.join(lines)


def ocr_warnings(entries):
    warnings = []
    for page in sorted(entries):
        item = entries[page]
        if not item['complete']:
            warnings.append(f'Page {page + 1} : lecture OCR incomplète. Vérifiez les zones illisibles manuellement.')
        warnings.extend(f'Page {page + 1} : {w}' for w in item['warnings'])
    return list(dict.fromkeys(warnings))
