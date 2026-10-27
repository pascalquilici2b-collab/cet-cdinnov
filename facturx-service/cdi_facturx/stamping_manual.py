"""Render explicitly confirmed corrections without OCR, AI or automatic rematching."""
from copy import deepcopy
from .stamping_pdf import StampError, process, digest, VERSION
from .stamping_import import cents


def confirm(raw, groups, choice=None, direct=None, options=None, overrides=None):
    choice = choice or {}
    reading = {'fields': {}, 'proofs': {}, 'bases': {}, 'pages': [], 'warnings': [],
               'evidence': [], 'source_sha256': digest(raw), 'algorithm': VERSION,
               'ocr': False, 'manualConfirmed': True}
    if direct:
        from .stamping_direct import direct_allocation
        if direct.get('manualConfirmed') is not True or not direct.get('manualTotal'):
            raise StampError('BASE_REQUIRED', 'Saisissez et confirmez le total TTC relu sur la facture.')
        reading['fields'] = {'document_type': 'INVOICE'}
        selected, base, _ = direct_allocation(raw, reading, direct)
    else:
        if choice.get('identityConfirmed') is not True or choice.get('baseConfirmed') is not True or len(str(choice.get('reason', '')).strip()) < 5:
            raise StampError('REVIEW_REQUIRED', 'Confirmez l’identité, la période et le montant relus dans le PDF.')
        selected = next((deepcopy(g) for g in groups if g['id'] == choice.get('groupId')), None)
        if selected is None or selected.get('errors'):
            raise StampError('INVALID_GROUP', 'Choisissez une répartition confirmée sans erreur.')
        try: base = cents(choice.get('baseAmount'))
        except (ValueError, TypeError): raise StampError('BASE_REQUIRED', 'Renseignez le montant de référence vérifié.')
        if base <= 0: raise StampError('BASE_REQUIRED', 'Le montant de référence doit être positif.')
        reading['fields'] = {k: selected[k] for k in ('document_type', 'employee_ref', 'period', 'supplier_ref', 'invoice_number') if selected.get(k)}
        reading['bases'] = {selected['base_type']: {'amount_cents': base, 'method': 'manual_confirmation'}}
    result = process(raw, [], options, overrides=overrides, reading=reading, resolved=(selected, base, []))
    result['manualConfirmation'] = {'choice': choice, 'direct': direct, 'withoutAnalysis': True}
    return result
