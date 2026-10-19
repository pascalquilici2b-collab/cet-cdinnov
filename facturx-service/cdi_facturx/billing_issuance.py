"""Structured document generation: the PDF and CII share one validated snapshot.

This service cannot allocate numbers or change a document. Only the portal's
private server key may call its endpoints; its immutable ledger owns issuance.
"""
import base64
import hashlib
import io
import json
import re
import tempfile
from datetime import date, datetime, timezone
from importlib.metadata import version
from pathlib import Path
from typing import Annotated, Literal

from facturx import generate_from_file
from pydantic import Field, model_validator
from pypdf import PdfReader

from .billing_document import DraftDocument, StrictModel, PreviewRequest, decimal
from .document_pdf import render_document
from .models import Invoice, Line
from .pdf_import import inspect_pdf, MAX_BYTES
from .service import ConversionError, health, runtime, create_xml, schematron, convert_pdfa, verify_attachment, validate_pdfa

GENERATOR_VERSION = 'cdi-billing-1'
UUID = Annotated[str, Field(pattern=r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')]
SHA = Annotated[str, Field(pattern=r'^[a-f0-9]{64}$')]


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def snapshot_hash(document):
    return digest(canonical({'schemaVersion': 1, 'document': document.model_dump(), 'totals': document.calculated()}).encode())


class IssuedRequest(StrictModel):
    schemaVersion: Literal[1]
    id: UUID
    documentId: UUID
    documentVersion: Annotated[int, Field(ge=1, le=9007199254740991)]
    issuerSiren: Annotated[str, Field(pattern=r'^\d{9}$')]
    number: Annotated[str, Field(min_length=1, max_length=35, pattern=r'^[A-Z0-9][A-Z0-9_/-]*$')]
    document: DraftDocument
    snapshotSha256: SHA
    envelopeSha256: SHA

    @model_validator(mode='after')
    def bound_snapshot(self):
        siren = compact(self.document.seller.siren) or (compact(self.document.seller.siret) or '')[:9]
        if siren != self.issuerSiren or snapshot_hash(self.document) != self.snapshotSha256:
            raise ValueError('L’émetteur ou l’empreinte du document ne correspond pas à la réservation.')
        envelope = {'schemaVersion': 1, 'id': self.id, 'documentId': self.documentId, 'version': self.documentVersion,
                    'issuerSiren': self.issuerSiren, 'number': self.number, 'issueDate': self.document.issueDate, 'snapshotSha256': self.snapshotSha256}
        if digest(canonical(envelope).encode()) != self.envelopeSha256:
            raise ValueError('L’empreinte de la réservation ne correspond pas au numéro et au document.')
        return self


def compact(value):
    return re.sub(r'\s', '', value).upper() or None


def optional(value):
    return value.strip() or None


def canonical_decimal(value):
    whole, _, fraction = value.strip().replace(',', '.').partition('.')
    tail = fraction.rstrip('0')
    return (whole.lstrip('0') or '0') + ('.' + tail if tail else '')


def money(minor):
    return f'{int(minor) // 100}.{int(minor) % 100:02}'


def party(p):
    return {'name': p.name.strip(), 'street': '\n'.join(v for v in (p.addressLine1, p.addressLine2) if v.strip()),
            'postal_code': p.postalCode.strip(), 'city': p.city.strip(), 'country': p.country,
            'siren': compact(p.siren), 'siret': compact(p.siret), 'vat_number': compact(p.vatId),
            'contact_email': optional(p.email), 'electronic_address': optional(p.electronicAddress), 'electronic_scheme': optional(p.electronicScheme)}


def mapped_line(line):
    return {'description': line.description.strip(), 'quantity': canonical_decimal(line.quantity), 'unit_price': canonical_decimal(line.unitPrice),
            'discount_percent': canonical_decimal(line.discountPercent), 'unit': line.unitCode, 'vat_category': line.vatCategory,
            'vat_rate': canonical_decimal(line.vatRate), 'exemption_reason': optional(line.exemptionReason)}


def invoice_from_document(d, number):
    totals = d.calculated()
    description = '\n\n'.join(v for v in [d.title, d.notes,
        'Mentions de l’émetteur : ' + d.seller.legal if d.seller.legal else '',
        'Mentions du client : ' + d.buyer.legal if d.buyer.legal else '',
        'Code affaire : ' + d.references.businessCode if d.references.businessCode else '',
        'Projet : ' + d.references.project if d.references.project else '',
        'Engagement : ' + d.references.engagement if d.references.engagement else ''] if v)
    return Invoice.model_validate({'number': number, 'issue_date': d.issueDate, 'type_code': '380', 'currency': d.currency,
        'business_process': d.businessProcess, 'seller': party(d.seller), 'buyer': party(d.buyer), 'lines': [mapped_line(line) for line in d.lines],
        'payment': {'means_code': d.paymentMeans, 'due_date': optional(d.dueDate), 'terms': optional(d.paymentTerms),
                    'iban': compact(d.iban), 'bic': compact(d.bic), 'prepaid': '0.00', 'vat_due': d.vatDue or None},
        'totals': {'net': money(totals['netMinor']), 'vat': money(totals['taxMinor']), 'gross': money(totals['grossMinor']), 'due': money(totals['grossMinor']), 'rounding': '0.00'},
        'notes': {'recovery': d.legalNotes.recovery.strip(), 'penalties': d.legalNotes.penalties.strip(), 'discount': d.legalNotes.discount.strip(), 'description': optional(description)},
        'buyer_reference': optional(d.references.serviceCode), 'order_reference': optional(d.references.orderReference), 'contract_reference': optional(d.references.marketReference)})


def validate_document(d, number='PREFLIGHT'):
    for field in ('issueDate', 'dueDate', 'validUntil'):
        value = getattr(d, field)
        if (field == 'issueDate' or (d.kind == 'quote' and field == 'validUntil')) and not value:
            raise ValueError('Complétez les dates du document.')
        if value and (not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value) or date.fromisoformat(value).year < 1900):
            raise ValueError('Date du document invalide.')
        if value and field != 'issueDate' and value < d.issueDate:
            raise ValueError('La validité et l’échéance ne peuvent précéder le document.')
    if not d.lines:
        raise ValueError('Ajoutez au moins une prestation.')
    for p in (d.seller, d.buyer):
        if any(not getattr(p, field).strip() for field in ('name', 'addressLine1', 'postalCode', 'city')) or not re.fullmatch('[A-Z]{2}', p.country):
            raise ValueError('Complétez les coordonnées des parties.')
    for line in d.lines:
        # Validate before normalization so an unfinished decimal never becomes zero.
        for value, places in ((line.quantity, 6), (line.unitPrice, 6), (line.discountPercent, 2), (line.vatRate, 2)):
            decimal(value, places)
        Line.model_validate(mapped_line(line))
    if d.kind == 'invoice':
        if not d.businessProcess or any(not p.electronicAddress.strip() or not p.electronicScheme.strip() for p in (d.seller, d.buyer)):
            raise ValueError('Complétez le mode et les adresses de facturation électronique.')
        if any(len(canonical_decimal(line.quantity).partition('.')[2]) > 4 for line in d.lines):
            raise ValueError('Les quantités Factur-X France acceptent quatre décimales significatives au maximum.')
        return invoice_from_document(d, number)
    return None


def preflight(payload: PreviewRequest):
    d = payload.document
    invoice = validate_document(d)
    pdf = render_document(d.model_dump(), d.calculated(), issued=False)
    inspect_pdf(pdf)
    if invoice:
        if not health()['ready']:
            raise ConversionError('configuration', 'Les moteurs PDF/A et veraPDF doivent être disponibles.', unavailable=True)
        with tempfile.TemporaryDirectory(prefix='cdi-billing-check-') as tmp:
            report = schematron(create_xml(invoice, 'en16931'), 'en16931', Path(tmp))
        checks = {'render': True, 'amounts': True, 'xsd': True, **report['checks']}
    else:
        checks = {'render': True, 'amounts': True}
    return {'valid': True, 'snapshotSha256': snapshot_hash(d), 'checks': checks, 'generatorVersion': GENERATOR_VERSION}


def generate_issued(payload: IssuedRequest):
    d = payload.document
    invoice = validate_document(d, payload.number)
    source = render_document(d.model_dump(), d.calculated(), number=payload.number, issued=True)
    _, pages = inspect_pdf(source)
    artifacts = []

    def append(kind, data, content_type):
        if not 0 < len(data) <= MAX_BYTES:
            raise ConversionError('output', 'Fichier final trop volumineux.')
        artifacts.append({'kind': kind, 'sha256': digest(data), 'size': len(data), 'contentType': content_type, 'base64': base64.b64encode(data).decode('ascii')})

    if invoice:
        if not health()['ready']:
            raise ConversionError('configuration', 'Les moteurs PDF/A et veraPDF doivent être disponibles.', unavailable=True)
        cfg = runtime()
        with tempfile.TemporaryDirectory(prefix='cdi-billing-issue-') as tmp:
            folder = Path(tmp)
            xml = create_xml(invoice, 'en16931')
            xml_report = schematron(xml, 'en16931', folder)
            archive = convert_pdfa(source, folder, cfg)
            final = folder / 'final.pdf'
            generate_from_file(str(archive), xml, output_pdf_file=str(final), flavor='factur-x', level='en16931', check_xsd=True, check_schematron=False, afrelationship='alternative', lang='fr-FR')
            data = final.read_bytes()
            verify_attachment(data, xml, 'en16931')
            vera = validate_pdfa(final, folder, cfg)
            if len(PdfReader(io.BytesIO(data)).pages) != pages:
                raise ConversionError('pdfa', 'La pagination a changé pendant la conversion.')
        report = {'valid': True, 'profile': 'en16931', 'checked_at': datetime.now(timezone.utc).isoformat(),
            'checks': {'structured_source': True, 'amounts': True, 'xsd': True, **xml_report['checks'], 'embedding': True, 'pdfa_3b': True},
            'envelope_sha256': payload.envelopeSha256, 'source_sha256': digest(source), 'pdf_sha256': digest(data), 'xml_sha256': digest(xml),
            'factur_x_version': version('factur-x'), 'generator_version': GENERATOR_VERSION, 'warnings': xml_report['warnings'],
            'agiris_acceptance': 'not_tested', 'visual_consistency': 'same_structured_snapshot', 'pdf_differences_acknowledged': False}
        append('pdf', data, 'application/pdf')
        append('xml', xml, 'application/xml')
        append('validation', canonical(report).encode(), 'application/json')
        append('verapdf', vera, 'application/xml')
    else:
        append('pdf', source, 'application/pdf')
    return {'schemaVersion': 1, 'envelopeSha256': payload.envelopeSha256, 'generatorVersion': GENERATOR_VERSION,
            'profile': 'en16931' if invoice else 'quote-pdf', 'artifacts': artifacts}
