from cdi_facturx.billing_document import DraftDocument
from cdi_facturx.billing_issuance import preflight
from cdi_facturx.billing_document import PreviewRequest
from tests.test_billing_issuance import document
import pytest
from tests.test_document_pdf import fixture, extract
from cdi_facturx.document_pdf import render_document

def test_all_eight_semesters_render_without_changing_historical_shape():
    for number in range(1, 9):
        data = document()
        data['kind'] = 'quote'
        data['validUntil'] = '2027-01-23'
        data['details'] = {'marketObject': '', 'period': f'S{number}', 'personInCharge': '', 'fundingProgramme': '', 'validityMonths': '', 'returnEmail': '', 'interventions': []}
        draft = DraftDocument.model_validate(data)
        assert 'periods' not in draft.model_dump()['details']
        result = preflight(PreviewRequest(document=draft), electronic=False)
        assert result['checks']['render']
    data['details']['period'] = 'S9'
    with pytest.raises(ValueError):
        DraftDocument.model_validate(data)


@pytest.mark.parametrize('kind', ['quote', 'invoice'])
def test_multiple_nonconsecutive_semesters_pdf_and_schema(kind):
    data, totals = fixture(kind)
    data['details'] = {'marketObject': '', 'period': 'S1', 'periods': ['S1', 'S3', 'S8'], 'personInCharge': '', 'fundingProgramme': '', 'validityMonths': '', 'returnEmail': '', 'interventions': []}
    validated = DraftDocument.model_validate(data).model_dump()
    assert validated['details']['periods'] == ['S1', 'S3', 'S8']
    for issued in (False, True):
        text = extract(render_document(validated, totals, number='TEST-PERIODES', issued=issued))
        assert 'Périodes concernées : Semestres 1, 3 et 8' in text
        assert 'Semestre 2' not in text
    data['details']['periods'] = []
    assert 'Période' not in extract(render_document(data, totals))
    for invalid in (['S9'], ['S1'] * 9, None, 'S1'):
        data['details']['periods'] = invalid
        with pytest.raises(ValueError):
            DraftDocument.model_validate(data)
