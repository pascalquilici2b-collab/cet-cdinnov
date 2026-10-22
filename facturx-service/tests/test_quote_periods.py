from cdi_facturx.billing_document import DraftDocument
from cdi_facturx.billing_issuance import preflight
from cdi_facturx.billing_document import PreviewRequest
from tests.test_billing_issuance import document
import pytest

def test_all_eight_semesters_render_without_changing_historical_shape():
    for number in range(1, 9):
        data = document()
        data['kind'] = 'quote'
        data['validUntil'] = '2027-01-23'
        data['details'] = {'marketObject': '', 'period': f'S{number}', 'personInCharge': '', 'fundingProgramme': '', 'validityMonths': '', 'returnEmail': '', 'interventions': []}
        draft = DraftDocument.model_validate(data)
        result = preflight(PreviewRequest(document=draft), electronic=False)
        assert result['checks']['render']
    data['details']['period'] = 'S9'
    with pytest.raises(ValueError):
        DraftDocument.model_validate(data)
