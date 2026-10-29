"""Synthetic cross-format checks for the recipient service reference."""

import re

from lxml import etree

from cdi_facturx.billing_document import DraftDocument
from cdi_facturx.billing_issuance import invoice_from_document
from cdi_facturx.document_pdf import render_document
from cdi_facturx.service import create_xml
from tests.test_billing_issuance import document
from tests.test_document_pdf import extract


def test_numeric_service_keeps_leading_zeroes_in_invoice_pdf_and_facturx_xml():
    source = document()
    source['references'].update(serviceCode='00123', orderReference='BC-00456', engagement='ENG-00789')
    draft = DraftDocument.model_validate(source)
    number = 'FAC-202610071'

    pdf = render_document(draft.model_dump(), draft.calculated(), number=number, issued=True)
    text = re.sub(r'\s+', ' ', extract(pdf))
    assert 'Service destinataire : 00123' in text
    assert 'BC-00456' in text
    assert 'ENG-00789' in text
    assert number in text

    invoice = invoice_from_document(draft, number)
    assert invoice.buyer_reference == '00123'
    root = etree.fromstring(create_xml(invoice, 'en16931'))
    ns = {'ram': 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100'}
    assert root.xpath('//ram:ApplicableHeaderTradeAgreement/ram:BuyerReference/text()', namespaces=ns) == ['00123']
    assert root.xpath('//ram:BuyerOrderReferencedDocument/ram:IssuerAssignedID/text()', namespaces=ns) == ['BC-00456']
    assert root.xpath('//ram:IncludedNote/ram:Content[contains(text(), "Engagement : ENG-00789")]', namespaces=ns)
