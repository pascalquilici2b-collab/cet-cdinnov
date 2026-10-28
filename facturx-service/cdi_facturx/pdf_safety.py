"""Reject executable/external PDF actions without decoding content streams."""
from urllib.parse import urlsplit

from pypdf.errors import PdfReadError
from pypdf.generic import ArrayObject, DictionaryObject, IndirectObject

ACTION_KINDS = {'/GoTo', '/GoToR', '/GoToE', '/Launch', '/Thread', '/URI', '/Sound', '/Movie',
                '/Hide', '/Named', '/SubmitForm', '/ResetForm', '/ImportData', '/JavaScript',
                '/SetOCGState', '/Rendition', '/Trans', '/GoTo3DView'}
ANNOTATION_KINDS = {'/Text', '/Link', '/FreeText', '/Line', '/Square', '/Circle', '/Polygon',
                    '/PolyLine', '/Highlight', '/Underline', '/Squiggly', '/StrikeOut', '/Stamp',
                    '/Caret', '/Ink', '/Popup', '/FileAttachment', '/Sound', '/Movie', '/Widget',
                    '/Screen', '/PrinterMark', '/TrapNet', '/Watermark', '/3D', '/Redact', '/RichMedia'}


def ensure_static_pdf(reader):
    root = reader.trailer['/Root']
    pending = [(root, False, False)]
    seen = set()
    count = 0
    while pending:
        value, action, optional_outline = pending.pop()
        if isinstance(value, IndirectObject):
            marker = ('ref', value.idnum, value.generation, action)
            if marker in seen:
                continue
            seen.add(marker)
            try:
                value = value.get_object()
            except PdfReadError:
                # The existing canonicalizer removes a dangling root bookmark
                # reference only after checking that every page stays identical.
                # Do not extend this exception to actions or other PDF content.
                if optional_outline:
                    continue
                raise
        if not isinstance(value, (DictionaryObject, ArrayObject)):
            if action:
                raise ValueError('Action PDF invalide.')
            continue
        marker = ('obj', id(value), action)
        if marker in seen:
            continue
        seen.add(marker)
        count += 1
        if count > 100000:
            raise ValueError('Structure PDF trop complexe.')
        if isinstance(value, ArrayObject):
            pending.extend((item, action, False) for item in value)
            continue
        if any(key in value for key in ('/AA', '/OpenAction', '/JS', '/JavaScript', '/XFA', '/RichMediaContent', '/RichMediaSettings')):
            raise ValueError('Actions actives dans le PDF : fournir une copie statique.')
        kind = value.get('/S')
        is_action = action or kind in ACTION_KINDS
        if is_action:
            # Keep ordinary web links and navigation inside this PDF. Everything
            # else can open files, send form data or invoke a viewer feature.
            if kind == '/URI':
                target = urlsplit(str(value.get('/URI', '')))
                if target.scheme not in ('http', 'https', 'mailto'):
                    raise ValueError('Lien actif PDF non pris en charge.')
            elif kind != '/GoTo':
                raise ValueError('Actions actives dans le PDF : fournir une copie statique.')
        for key, child in value.items():
            # /A is also a legal resource name and a tagged-PDF attribute key.
            # Treat it as an action only on an annotation, field or outline;
            # recognised action dictionaries are checked wherever encountered.
            owner = value.get('/Type') == '/Annot' or value.get('/Subtype') in ANNOTATION_KINDS or '/FT' in value or '/Title' in value
            pending.append((child, (key == '/A' and owner) or (is_action and key == '/Next'), value is root and key == '/Outlines'))
