import base64
import copy
import io
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from lxml import etree
from pydantic import ValidationError
from pypdf import PdfReader

from cdi_facturx.api import app
from cdi_facturx.billing_document import DraftDocument, PreviewRequest
from cdi_facturx.billing_issuance import IssuedRequest, canonical, digest, snapshot_hash, generate_issued, preflight, invoice_from_document
from cdi_facturx.service import ConversionError
from tests.test_document_pdf import fixture


def document(kind='invoice'):
    d, _ = fixture(kind)
    d['seller'].update(siren='732829320', siret='', vatId='FR44732829320', electronicAddress='732829320', electronicScheme='0225')
    d['buyer'].update(siren='552100554', siret='', vatId='', electronicAddress='552100554', electronicScheme='0225')
    d.update(iban='', bic='', paymentMeans='10')
    return d


def envelope(kind='invoice'):
    d = DraftDocument.model_validate(document(kind))
    value = {'schemaVersion': 1, 'id': '10000000-0000-4000-8000-000000000001', 'documentId': '20000000-0000-4000-8000-000000000001',
             'documentVersion': 2, 'issuerSiren': '732829320', 'number': 'TEST-2026-0042', 'document': d.model_dump(), 'snapshotSha256': snapshot_hash(d)}
    binding = {'schemaVersion': 1, 'id': value['id'], 'documentId': value['documentId'], 'version': value['documentVersion'],
               'issuerSiren': value['issuerSiren'], 'number': value['number'], 'issueDate': d.issueDate, 'snapshotSha256': value['snapshotSha256']}
    value['envelopeSha256'] = digest(canonical(binding).encode())
    return value


class StructuredIssuanceTests(unittest.TestCase):
    def test_binding_rejects_changed_number_document_totals_or_issuer(self):
        for field, value in [('number', 'FORGED'), ('issuerSiren', '552100554'), ('documentVersion', 3), ('snapshotSha256', '0'*64), ('envelopeSha256', '0'*64)]:
            e = envelope(); e[field] = value
            with self.assertRaises(ValidationError):
                IssuedRequest.model_validate(e)
        e = envelope(); e['document']['lines'][0]['unitPrice'] = '1'
        with self.assertRaises(ValidationError):
            IssuedRequest.model_validate(e)
        e = envelope(); e['totals'] = {'grossMinor': '1'}
        with self.assertRaises(ValidationError):
            IssuedRequest.model_validate(e)

    def test_unfinished_fields_and_invalid_identifier_block_preflight(self):
        for field, value in [('quantity', ''), ('quantity', '0'), ('quantity', '1.123456'), ('unitPrice', '12,'), ('description', '')]:
            d = document(); d['lines'][0][field] = value
            with self.assertRaises((ValueError, ConversionError)):
                preflight(PreviewRequest(document=DraftDocument.model_validate(d)))
        d = document(); d['seller']['siren'] = '123456789'
        with self.assertRaises(ValueError):
            preflight(PreviewRequest(document=DraftDocument.model_validate(d)))

    def test_quote_preflight_and_pdf_without_invoice_runtime(self):
        d = DraftDocument.model_validate(document('quote'))
        with patch('cdi_facturx.billing_issuance.health', return_value={'ready': False}):
            result = preflight(PreviewRequest(document=d))
            self.assertEqual(result['snapshotSha256'], snapshot_hash(d))
            result = generate_issued(IssuedRequest.model_validate(envelope('quote')))
        self.assertEqual(result['profile'], 'quote-pdf')
        self.assertEqual([a['kind'] for a in result['artifacts']], ['pdf'])
        pdf = base64.b64decode(result['artifacts'][0]['base64'])
        reader = PdfReader(io.BytesIO(pdf))
        text = '\n'.join(p.extract_text() for p in reader.pages)
        self.assertIn('TEST-2026-0042', text)
        self.assertNotIn('BROUILLON', text)
        self.assertIn('540,00', text)
        self.assertEqual(list(reader.attachments), [])

    def test_missing_runtime_blocks_invoice_preflight(self):
        with patch('cdi_facturx.billing_issuance.health', return_value={'ready': False}):
            with self.assertRaises(ConversionError) as e:
                preflight(PreviewRequest(document=DraftDocument.model_validate(document())))
            self.assertTrue(e.exception.unavailable)

    def test_only_machine_key_can_generate_and_requests_are_bounded(self):
        key = 'test-machine-key-01234567890123456789'
        with patch.dict(os.environ, {'FACTURX_DEPLOYMENT': 'server', 'FACTURX_API_KEY': key}):
            client = TestClient(app)
            payload = envelope('quote')
            path = '/api/billing/generate-issued'
            self.assertEqual(client.post(path, json=payload).status_code, 401)
            with patch('cdi_facturx.api.server_auth.verify', return_value={'email': 'synthetic@example.invalid'}):
                self.assertEqual(client.post(path, json=payload, headers={'Authorization': 'Bearer user-token'}).status_code, 403)
            headers = {'X-API-Key': key}
            self.assertEqual(client.post(path, json=payload, headers={**headers, 'Origin': 'https://evil.invalid'}).status_code, 403)
            self.assertEqual(client.post(path, json={**payload, 'number': 'FORGED'}, headers=headers).status_code, 422)
            self.assertEqual(client.post(path, content='x'*300001, headers={**headers, 'Content-Type': 'application/json'}).status_code, 413)
            result = client.post(path, json=payload, headers=headers)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.headers['cache-control'], 'no-store')

    @unittest.skipUnless(os.getenv('BILLING_FULL_RUNTIME') == '1', 'Explicit full native runtime required')
    def test_actual_pdfa_facturx_xml_and_verapdf(self):
        payload = IssuedRequest.model_validate(envelope())
        checked = preflight(PreviewRequest(document=payload.document))
        self.assertEqual(checked['checks'], {'render': True, 'amounts': True, 'xsd': True, 'schematron': True, 'france': True})
        result = generate_issued(payload)
        artifacts = {a['kind']: base64.b64decode(a['base64']) for a in result['artifacts']}
        for metadata in result['artifacts']:
            data = artifacts[metadata['kind']]
            self.assertEqual(metadata['size'], len(data)); self.assertEqual(metadata['sha256'], digest(data))
        reader = PdfReader(io.BytesIO(artifacts['pdf']))
        self.assertEqual(list(reader.attachments), ['factur-x.xml'])
        self.assertEqual(list(reader.attachments['factur-x.xml']), [artifacts['xml']])
        text = '\n'.join(page.extract_text() for page in reader.pages)
        self.assertIn(payload.number, text); self.assertNotIn('BROUILLON', text); self.assertIn('540,00', text)
        report = json.loads(artifacts['validation'])
        self.assertTrue(all(report['checks'].values())); self.assertTrue(report['checks']['pdfa_3b']); self.assertEqual(report['envelope_sha256'], payload.envelopeSha256)
        self.assertEqual(report['agiris_acceptance'], 'not_tested')
        xml = etree.fromstring(artifacts['verapdf'])
        self.assertEqual(xml.xpath('//*[local-name()="validationReport"]/@isCompliant'), ['true'])
        if os.getenv('BILLING_QA_OUTPUT'):
            out = Path(os.environ['BILLING_QA_OUTPUT']); out.mkdir(parents=True, exist_ok=True)
            for kind, data in artifacts.items():
                ext = {'pdf': 'pdf', 'xml': 'xml', 'validation': 'json', 'verapdf': 'xml'}[kind]
                (out / f'facture-fictive-{kind}.{ext}').write_bytes(data)


if __name__ == '__main__':
    unittest.main()
