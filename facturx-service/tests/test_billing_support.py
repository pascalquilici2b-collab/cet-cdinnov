from io import BytesIO
import fitz
from tests.test_document_pdf import fixture, extract
from cdi_facturx.document_pdf import render_document
from cdi_facturx.intervention_pdf import render_intervention_report


def test_quote_has_no_payment_or_remise_column_and_number_precedes_date():
    data, totals = fixture('quote')
    pdf = render_document(data, totals, number='DEV-TEST', issued=True)
    text = extract(pdf)
    for hidden in ('DOCUMENT ÉMIS', 'Mode de règlement', 'Conditions de paiement', 'Indemnité de recouvrement', 'Pénalités de retard', 'Escompte', 'IBAN', 'BIC'):
        assert hidden not in text
    assert 'Acceptation du devis :' in text
    assert 'acceptant ses conditions sans réserve.' in text.replace('\n',' ')
    assert text.index('Numéro du document') < text.index('Date du document')
    assert text.index('Remise') > text.index('Total HT avant remise')
    assert 'Total HT net' in text
    with fitz.open(stream=pdf, filetype='pdf') as pages:
        assert pages[0].search_for('DEV-TEST')[0].y0 > 90
        spans = [s for b in pages[0].get_text('dict')['blocks'] if 'lines' in b for l in b['lines'] for s in l['spans']]
        assert any(s['size']==7 and '1. ' in s['text'] for s in spans)


def test_report_is_standalone_contains_invoice_context_and_certification():
    data, totals = fixture('invoice')
    data['details'] = {'period':'S1','periods':['S1','S3'],'interventions':[{'label':'Consultant senior','description':'Animation des partenaires','days':'2.5'}]}
    pdf = render_document(data, totals, number='FAC-2610065', issued=True)
    text = extract(pdf)
    assert 'Relevé' not in text
    assert 'Mode de règlement' in text
    report = render_intervention_report(data, 'FAC-2610065', '2026-10-23')
    text = extract(report)
    assert 'Relevé d’intervention relatif à la facture FAC-2610065' in text.replace('\n',' ')
    assert '23/10/2026' in text and data['title'] in text and 'Semestres 1 et 3' in text
    assert 'Certifie que les prestations décrites ci-dessus' in text
    assert 'FACTURE' not in text and 'IBAN' not in text


def test_no_discount_means_no_discount_label():
    data, totals = fixture('invoice')
    data['lines'][0]['discountPercent']='0'
    totals['discountMinor']='0';totals['lines'][0]['discountMinor']='0'
    text=extract(render_document(data,totals,number='TEST',issued=True))
    assert 'Remise' not in text and 'Total HT net' not in text
