"""Real PDF contract for numbers assigned only when an invoice is finalized."""
import base64
from copy import deepcopy
from io import BytesIO

import pytest
from pypdf import PdfReader
from pydantic import ValidationError

from cdi_facturx.billing_document import DraftDocument
from cdi_facturx.billing_issuance import IssuedRequest, generate_issued, preflight
from cdi_facturx.document_pdf import render_document
from cdi_facturx.billing_document import PreviewRequest
from tests.test_billing_issuance import document, envelope


def pdf_text(raw):
    return '\n'.join(page.extract_text() or '' for page in PdfReader(BytesIO(raw)).pages)


@pytest.mark.parametrize('editable', [False, True])
def test_unissued_invoice_cannot_show_a_caller_supplied_final_number(editable):
    draft = DraftDocument.model_validate(document())
    raw = render_document(draft.model_dump(), draft.calculated(), number='OLD-F-2026-0042', editable=editable)
    reader = PdfReader(BytesIO(raw))
    text = pdf_text(raw)
    assert 'BROUILLON' in text
    assert 'Brouillon - Document non émis' in text
    assert 'Numéro attribué à la finalisation' in text
    assert 'OLD-F-2026-0042' not in text
    assert reader.metadata.title == 'FACTURE BROUILLON'


def test_reserved_quote_number_keeps_its_existing_draft_pdf_behavior():
    draft = DraftDocument.model_validate(document('quote'))
    raw = render_document(draft.model_dump(), draft.calculated(), number='DEVIS-2026-0042')
    text = pdf_text(raw)
    assert 'DEVIS-2026-0042' in text
    assert 'BROUILLON' in text
    assert PdfReader(BytesIO(raw)).metadata.title == 'DEVIS DEVIS-2026-0042'


def test_every_page_of_an_invoice_draft_stays_provisional():
    value = document()
    line = value['lines'][0]
    value['lines'] = [{**line, 'id': f'10000000-0000-4000-8000-{index:012}',
                       'description': f'Prestation fictive {index} avec un compte rendu de démonstration.'}
                      for index in range(1, 46)]
    draft = DraftDocument.model_validate(value)
    raw = render_document(draft.model_dump(), draft.calculated(), number='OLD-F-2026-0042')
    reader = PdfReader(BytesIO(raw))
    assert len(reader.pages) > 1
    for page in reader.pages:
        text = page.extract_text() or ''
        assert 'BROUILLON' in text
        assert 'Brouillon - Document non émis' in text
        assert 'OLD-F-2026-0042' not in text


def test_credit_note_keeps_the_original_invoice_reference_but_no_own_draft_number():
    value = document()
    value.update(schemaVersion=3, creditNote={
        'invoiceId': '30000000-0000-4000-8000-000000000001', 'invoiceVersion': 1,
        'invoiceNumber': 'ORIGINAL-F-2026-0010', 'invoiceDate': '2026-10-01',
        'reason': 'Correction fictive du document original',
    })
    draft = DraftDocument.model_validate(value)
    raw = render_document(draft.model_dump(), draft.calculated(), number='OWN-CREDIT-0042')
    text = pdf_text(raw)
    assert 'AVOIR' in text
    assert 'BROUILLON' in text
    assert 'ORIGINAL-F-2026-0010' in text
    assert 'OWN-CREDIT-0042' not in text


def test_final_pdf_uses_the_exact_number_and_snapshot_accepted_by_preflight():
    source = envelope()
    frozen = deepcopy(source)
    payload = IssuedRequest.model_validate(source)
    checked = preflight(PreviewRequest(document=payload.document), electronic=False)
    assert checked['snapshotSha256'] == payload.snapshotSha256
    result = generate_issued(payload, electronic=False)
    assert source == frozen
    assert result['profile'] == 'invoice-pdf'
    assert result['envelopeSha256'] == payload.envelopeSha256
    assert [artifact['kind'] for artifact in result['artifacts']] == ['pdf']
    text = pdf_text(base64.b64decode(result['artifacts'][0]['base64']))
    for expected in (payload.number, payload.document.buyer.name, '540,00 €'):
        assert expected in text
    assert 'BROUILLON' not in text
    assert 'Numéro en préparation' not in text
    assert 'Numéro attribué à la finalisation' not in text
    changed_number = {**source, 'number': 'CHANGED-0043'}
    with pytest.raises(ValidationError):
        IssuedRequest.model_validate(changed_number)
    changed_snapshot = deepcopy(source)
    changed_snapshot['document']['lines'][0]['unitPrice'] = '1'
    with pytest.raises(ValidationError):
        IssuedRequest.model_validate(changed_snapshot)
