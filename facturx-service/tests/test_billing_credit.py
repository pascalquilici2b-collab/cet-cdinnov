"""Real native credit documents, distinct from the not-yet-enabled linked portal workflow."""
import base64
import copy
import io
import json
import os
import unittest
from pathlib import Path
from lxml import etree
from pypdf import PdfReader
from pydantic import ValidationError
from cdi_facturx.billing_document import DraftDocument, PreviewRequest
from cdi_facturx.billing_issuance import IssuedRequest, canonical, digest, snapshot_hash, generate_issued, preflight, validate_document
from cdi_facturx.document_pdf import render_document
from tests.test_billing_issuance import document, envelope


def credit_document(partial=False):
    d = document()
    d.update(schemaVersion=3, title='Avoir sur prestations', creditNote={
        'invoiceId': '30000000-0000-4000-8000-000000000001', 'invoiceVersion': 2,
        'invoiceNumber': 'TEST-F-2026-0041', 'invoiceDate': '2026-10-19',
        'reason': 'Correction des prestations non réalisées'})
    if partial:
        d['lines'] = d['lines'][:1]
        d['lines'][0]['quantity'] = '0.5'
    return d


def credit_envelope(partial=False):
    value = envelope()
    d = DraftDocument.model_validate(credit_document(partial))
    value.update(number='TEST-A-2026-0042', document=d.model_dump(), snapshotSha256=snapshot_hash(d))
    binding = {'schemaVersion': 1, 'id': value['id'], 'documentId': value['documentId'], 'version': value['documentVersion'],
               'issuerSiren': value['issuerSiren'], 'number': value['number'], 'issueDate': d.issueDate, 'snapshotSha256': value['snapshotSha256']}
    value['envelopeSha256'] = digest(canonical(binding).encode())
    return value


class CreditDocumentTests(unittest.TestCase):
    def test_old_wire_shape_hash_and_roundtrip_are_unchanged(self):
        raw = document()
        parsed = DraftDocument.model_validate(raw)
        self.assertEqual(parsed.model_dump(), raw)
        self.assertNotIn('creditNote', parsed.model_dump())
        self.assertEqual(snapshot_hash(parsed), digest(canonical({'schemaVersion': 1, 'document': raw, 'totals': parsed.calculated()}).encode()))
        for value in [None, credit_document()['creditNote']]:
            with self.assertRaises(ValidationError):
                DraftDocument.model_validate({**raw, 'creditNote': value})

    def test_reference_and_reason_are_bound_by_the_envelope(self):
        for key, value in [('invoiceId', '30000000-0000-4000-8000-000000000002'), ('invoiceNumber', 'FORGED'), ('reason', 'Other'), ('invoiceDate', '2026-10-18'), ('invoiceVersion', 3)]:
            altered = credit_envelope(); altered['document']['creditNote'][key] = value
            with self.assertRaises(ValidationError):
                IssuedRequest.model_validate(altered)
        for value in ['', '  ']:
            raw = credit_document(); raw['creditNote']['reason'] = value
            with self.assertRaises(ValueError):
                validate_document(DraftDocument.model_validate(raw))
        raw = credit_document(); raw['creditNote']['invoiceDate'] = '2026-12-31'
        with self.assertRaises(ValueError):
            validate_document(DraftDocument.model_validate(raw))

    def test_credit_draft_pdf_identifies_source_and_never_becomes_a_sale(self):
        raw = credit_document(True); d = DraftDocument.model_validate(raw)
        pdf = render_document(d.model_dump(), d.calculated(), issued=False)
        text = '\n'.join(p.extract_text() for p in PdfReader(io.BytesIO(pdf)).pages)
        for value in ['AVOIR', 'BROUILLON', 'TEST-F-2026-0041', '19/10/2026', raw['creditNote']['reason']]:
            self.assertIn(value, text)
        self.assertNotIn('30000000-0000-4000-8000-000000000001', text)

    @unittest.skipUnless(os.getenv('BILLING_FULL_RUNTIME') == '1', 'Explicit full native runtime required')
    def test_native_full_and_partial_credit_pdfa_xml_and_validation(self):
        for partial in [False, True]:
            with self.subTest(partial=partial):
                payload = IssuedRequest.model_validate(credit_envelope(partial))
                before = copy.deepcopy(payload.document.model_dump())
                check = preflight(PreviewRequest(document=payload.document))
                self.assertTrue(all(check['checks'].values()))
                result = generate_issued(payload)
                artifacts = {a['kind']: base64.b64decode(a['base64']) for a in result['artifacts']}
                self.assertEqual(set(artifacts), {'pdf', 'xml', 'validation', 'verapdf'})
                for metadata in result['artifacts']:
                    self.assertEqual(metadata['size'], len(artifacts[metadata['kind']]))
                    self.assertEqual(metadata['sha256'], digest(artifacts[metadata['kind']]))
                reader = PdfReader(io.BytesIO(artifacts['pdf']))
                self.assertEqual(list(reader.attachments['factur-x.xml']), [artifacts['xml']])
                text = '\n'.join(p.extract_text() for p in reader.pages)
                for value in ['AVOIR', 'TEST-A-2026-0042', 'TEST-F-2026-0041', before['creditNote']['reason']]:
                    self.assertIn(value, text)
                self.assertNotIn('BROUILLON', text)
                root = etree.fromstring(artifacts['xml'])
                ns = {'rsm': 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100', 'ram': 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100'}
                self.assertEqual(root.xpath('string(rsm:ExchangedDocument/ram:TypeCode)', namespaces=ns), '381')
                self.assertEqual(root.xpath('//ram:InvoiceReferencedDocument/ram:IssuerAssignedID/text()', namespaces=ns), ['TEST-F-2026-0041'])
                self.assertEqual(root.xpath('//*[local-name()="InvoiceReferencedDocument"]//*[local-name()="DateTimeString"]/text()'), ['20261019'])
                self.assertEqual(root.xpath('//ram:GrandTotalAmount/text()', namespaces=ns), [str(validate_document(payload.document).totals.gross)])
                report = json.loads(artifacts['validation']); self.assertTrue(all(report['checks'].values()))
                self.assertEqual(report['envelope_sha256'], payload.envelopeSha256)
                self.assertEqual(report['agiris_acceptance'], 'not_tested')
                self.assertEqual(etree.fromstring(artifacts['verapdf']).xpath('//*[local-name()="validationReport"]/@isCompliant'), ['true'])
                self.assertEqual(before, payload.document.model_dump())
                if os.getenv('BILLING_QA_OUTPUT'):
                    out = Path(os.environ['BILLING_QA_OUTPUT']); out.mkdir(parents=True, exist_ok=True)
                    name = 'avoir-partiel' if partial else 'avoir-total'
                    for kind, data in artifacts.items():
                        ext = {'pdf': 'pdf', 'xml': 'xml', 'validation': 'json', 'verapdf': 'xml'}[kind]
                        (out / f'{name}-{kind}.{ext}').write_bytes(data)


if __name__ == '__main__':
    unittest.main()
