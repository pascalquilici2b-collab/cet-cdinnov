"""The document's optional context survives PDF and structured Factur-X export."""
from copy import deepcopy

from lxml import etree
import pytest

from cdi_facturx.billing_document import DraftDocument
from cdi_facturx.billing_issuance import invoice_from_document
from cdi_facturx.document_pdf import render_document
from cdi_facturx.xml_invoice import create_xml, NS
from tests.test_billing_issuance import document
from tests.test_document_pdf import extract


@pytest.mark.parametrize('description', [
    'CONTEXTE-DOCUMENT-FICTIF : étude <Corse> & animation.\nMission de démonstration.',
    'DESCRIPTION-DEBUT ' + ('Contexte commercial fictif. ' * 200)[:3964] + ' DESCRIPTION-FIN',
])
def test_pdf_and_xml_keep_description_without_changing_numbers_lines_or_amounts(description):
    source = document()
    before = deepcopy(source)
    number = 'TEST-DESCRIPTION-001'
    legacy = invoice_from_document(DraftDocument.model_validate(source), number)
    source['description'] = description
    draft = DraftDocument.model_validate(source)
    frozen = deepcopy(draft.model_dump())
    invoice = invoice_from_document(draft, number)
    pdf = render_document(draft.model_dump(), draft.calculated(), number=number, issued=True)
    xml = etree.fromstring(create_xml(invoice, 'en16931'))  # Includes real XSD validation.
    compact = lambda value: ''.join(value.split())
    assert compact(description) in compact(extract(pdf))
    notes = xml.xpath('//ram:IncludedNote[ram:SubjectCode="AAI"]/ram:Content/text()', namespaces=NS)
    assert any(description in note for note in notes)
    assert xml.xpath('//rsm:ExchangedDocument/ram:ID/text()', namespaces=NS) == [number]
    assert xml.xpath('//ram:SpecifiedTradeProduct/ram:Name/text()', namespaces=NS) == [row['description'] for row in before['lines']]
    assert invoice.model_dump(exclude={'notes'}) == legacy.model_dump(exclude={'notes'})
    assert invoice.calculated() == legacy.calculated()
    assert draft.model_dump() == frozen
    assert source == {**before, 'description': description}


def test_absent_empty_or_whitespace_description_preserves_legacy_xml_bytes():
    source = document()
    draft = DraftDocument.model_validate(source)
    assert 'description' not in draft.model_dump()
    number = 'TEST-LEGACY-001'
    legacy = invoice_from_document(draft, number)
    legacy_xml = create_xml(legacy, 'en16931')
    for empty in ('', ' \n '):
        candidate = invoice_from_document(DraftDocument.model_validate({**source, 'description': empty}), number)
        assert candidate == legacy
        assert create_xml(candidate, 'en16931') == legacy_xml
