"""Public wake readiness never certifies optional Factur-X conversion tools."""
from unittest.mock import patch

from fastapi.testclient import TestClient
import pytest

from cdi_facturx import api
from tests.test_billing_issuance import document, envelope


@pytest.mark.parametrize('kind', ['invoice', 'quote'])
def test_awake_service_without_electronic_tools_still_renders_simple_pdfs(monkeypatch, kind):
    key = 'synthetic-local-engine-health-key-01234567890123456789'
    monkeypatch.setenv('FACTURX_DEPLOYMENT', 'server')
    monkeypatch.setenv('FACTURX_API_KEY', key)
    with patch.object(api, 'health', return_value={'ready': False}), patch(
        'cdi_facturx.billing_issuance.health', return_value={'ready': False}
    ):
        client = TestClient(api.app)
        # The browser wake has no private key, document body or side effects.
        public = client.get('/api/health')
        assert public.status_code == 200
        assert public.json()['ready'] is False
        headers = {'X-API-Key': key}
        preview = client.post('/api/billing/preview-pdf', json={'document': document(kind)}, headers=headers)
        assert preview.status_code == 200
        assert preview.content.startswith(b'%PDF-')
        checked = client.post('/api/billing/preflight-pdf', json={'document': document(kind)}, headers=headers)
        assert checked.status_code == 200
        assert checked.json()['checks'] == {'render': True, 'amounts': True}
        generated = client.post('/api/billing/generate-issued-pdf', json=envelope(kind), headers=headers)
        assert generated.status_code == 200
        assert generated.json()['profile'] == ('invoice-pdf' if kind == 'invoice' else 'quote-pdf')


def test_public_wake_does_not_bypass_facturx_configuration_checks(monkeypatch):
    key = 'synthetic-local-engine-health-key-01234567890123456789'
    monkeypatch.setenv('FACTURX_DEPLOYMENT', 'server')
    monkeypatch.setenv('FACTURX_API_KEY', key)
    with patch.object(api, 'health', return_value={'ready': False}), patch(
        'cdi_facturx.billing_issuance.health', return_value={'ready': False}
    ):
        client = TestClient(api.app)
        assert client.get('/api/health').json()['ready'] is False
        for route, payload in [('/api/billing/preflight', {'document': document()}),
                               ('/api/billing/generate-issued', envelope())]:
            assert client.post(route, json=payload).status_code == 401
            response = client.post(route, json=payload, headers={'X-API-Key': key})
            assert response.status_code == 503
            assert response.json()['detail']['stage'] == 'configuration'
