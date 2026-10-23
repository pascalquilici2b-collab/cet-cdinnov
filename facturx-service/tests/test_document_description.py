from copy import deepcopy
from pathlib import Path
import pymupdf as fitz
from tests.test_document_pdf import fixture, extract, DocumentPDFTests
from tests.test_billing_issuance import document
from cdi_facturx.document_pdf import render_document
from cdi_facturx.billing_document import DraftDocument

def test_optional_description_preserves_legacy_envelope():
    d = document()
    assert 'description' not in DraftDocument.model_validate(d).model_dump()
    d['description'] = 'Suivi et animation.\nCadrage et contrôle qualité.'
    normalized = DraftDocument.model_validate(d).model_dump()
    assert normalized['description'] == d['description']
    assert normalized['buyer'] == d['buyer']

def test_recipient_identifiers_hidden_and_description_before_lines():
    out = Path('../platform/.private/projects-description-20261023/pdf')
    out.mkdir(parents=True, exist_ok=True)
    for kind in ['invoice', 'quote']:
        d, totals = fixture(kind)
        d['seller'].update(siren='322556580',siret='32255658000000',name='Conseil Développement Innovation')
        d['buyer'].update(siren='987654321',siret='98765432100019',vatId='IT98765432100',country='IT',electronicAddress='987654321')
        d['description'] = 'Suivi et animation, gestion administrative et rapports.\nCadrage du projet, mobilisation partenariale, contrôle qualité, validation et transmission au chef de file.'
        raw = render_document(d, totals, number='TEST-20261023-001', editable=True)
        text = extract(raw)
        assert '987654321' not in text and 'IT98765432100' not in text
        assert '\nIT\n' not in text and '32255658000000' in text
        assert text.index('Suivi et animation') < text.index('Étude & développement')
        with fitz.open(stream=raw, filetype='pdf') as pdf:
            links = [link['uri'] for page in pdf for link in page.get_links() if 'uri' in link]
            assert any(link.endswith('/description') for link in links)
            assert not any('/buyer.siret' in link or '/buyer.siren' in link or '/buyer.vatId' in link for link in links)
            for i, page in enumerate(pdf):
                page.get_pixmap(matrix=fitz.Matrix(1.2, 1.2)).save(str(out / f'{kind}-{i+1}.png'))
        (out / f'{kind}.pdf').write_bytes(raw)
        DocumentPDFTests().assert_page_layout(raw)
        long = deepcopy(d)
        long['description'] = ('Une mission de suivi et de contrôle qualité. ' * 85) + 'FIN-DESCRIPTION'
        long_pdf = render_document(long, totals, number='TEST-LONG')
        assert 'FIN-DESCRIPTION' in extract(long_pdf)
        DocumentPDFTests().assert_page_layout(long_pdf)
