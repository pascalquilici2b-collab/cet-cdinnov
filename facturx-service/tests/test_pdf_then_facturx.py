import base64
import io
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from cdi_facturx.api import app
from cdi_facturx.billing_document import DraftDocument, PreviewRequest
from cdi_facturx.billing_issuance import IssuedRequest, canonical, digest, snapshot_hash, preflight, generate_issued
from tests.test_billing_issuance import envelope, document


def incomplete_electronic_envelope():
    value = envelope()
    d = value['document']
    d['buyer'].update(electronicAddress='', electronicScheme='', siren='')
    d['businessProcess'] = ''
    value['snapshotSha256'] = snapshot_hash(DraftDocument.model_validate(d))
    value['envelopeSha256'] = digest(canonical({'schemaVersion': 1, 'id': value['id'], 'documentId': value['documentId'],
        'version': value['documentVersion'], 'issuerSiren': value['issuerSiren'], 'number': value['number'],
        'issueDate': d['issueDate'], 'snapshotSha256': value['snapshotSha256']}).encode())
    return value


def test_final_pdf_does_not_require_electronic_routing_or_pdfa_runtime():
    payload = IssuedRequest.model_validate(incomplete_electronic_envelope())
    with patch('cdi_facturx.billing_issuance.health', side_effect=AssertionError('PDF does not call the electronic runtime')):
        checked = preflight(PreviewRequest(document=payload.document), electronic=False)
        result = generate_issued(payload, electronic=False)
    assert checked['snapshotSha256'] == payload.snapshotSha256
    assert checked['checks'] == {'render': True, 'amounts': True}
    assert result['profile'] == 'invoice-pdf'
    assert [item['kind'] for item in result['artifacts']] == ['pdf']
    raw = base64.b64decode(result['artifacts'][0]['base64'])
    assert digest(raw) == result['artifacts'][0]['sha256']
    pdf = PdfReader(io.BytesIO(raw))
    text = '\n'.join(page.extract_text() for page in pdf.pages)
    assert payload.number in text and 'BROUILLON' not in text
    assert not pdf.attachments
    # Strict electronic generation still rejects precisely the same source.
    with pytest.raises(ValueError, match='électronique'):
        generate_issued(payload)


def test_pdf_requires_actual_parties_lines_and_dates():
    for patch_value in ({'lines': []}, {'issueDate': '2026-02-30'}, {'buyer': {**document()['buyer'], 'name': ''}}):
        with pytest.raises(ValueError):
            preflight(PreviewRequest(document=DraftDocument.model_validate({**document(), **patch_value})), electronic=False)


def test_new_routes_require_machine_auth_and_bound_snapshot():
    payload = incomplete_electronic_envelope()
    with patch.dict('os.environ', {'FACTURX_API_KEY': 'test-pdf-machine-key-01234567890123456789'}), TestClient(app) as client:
        headers = {'X-API-Key': 'test-pdf-machine-key-01234567890123456789'}
        for route, data in [('/api/billing/preflight-pdf', {'document': payload['document']}), ('/api/billing/generate-issued-pdf', payload)]:
            assert client.post(route, json=data).status_code == 401
            result = client.post(route, json=data, headers=headers)
            assert result.status_code == 200, result.text
        changed = {**payload, 'number': 'F-CHANGED'}
        assert client.post('/api/billing/generate-issued-pdf', json=changed, headers=headers).status_code == 422
