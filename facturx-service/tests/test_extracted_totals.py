from cdi_facturx.extract_fields import extract_fields
from cdi_facturx.pdf_import import extract_pdf
from cdi_facturx.document_pdf import render_document
from tests.test_document_pdf import fixture


def test_table_header_is_not_an_invoice_total():
    text = '''Désignation    Qté    Prix unit. HT    Taux TVA    Montant HT
1. Accompagnement    1    500 €    20 %    500,00 €
Total HT    500,00 €
TVA 20 %    100,00 €
TOTAL TTC    600,00 €'''
    inv, _, _, warnings = extract_fields(text)
    assert inv['totals'] == {'net': '500.00', 'vat': '100.00', 'gross': '600.00', 'due': '600.00'}
    assert not any('TVA incohérente' in w for w in warnings)


def test_real_generated_pdf_discount_and_document_number():
    doc, totals = fixture()
    result = extract_pdf(render_document(doc, totals, number='F-20261025-011', issued=True))
    assert result['candidates']['number'] == 'F-20261025-011'
    assert result['candidates']['totals'] == {'net': '450.00', 'vat': '90.00', 'gross': '540.00'}
    assert not any('TVA incohérente' in w for w in result['warnings'])


def test_real_generated_pdf_without_discount():
    doc, totals = fixture()
    doc['lines'][0]['discountPercent'] = '0'
    totals.update(netMinor='50000', taxMinor='10000', grossMinor='60000', discountMinor='0')
    totals['taxes'][0].update(baseMinor='50000', taxMinor='10000')
    totals['lines'][0].update(netMinor='50000', discountMinor='0')
    result = extract_pdf(render_document(doc, totals, number='20261025-012', issued=True))
    assert result['candidates']['totals'] == {'net': '500.00', 'vat': '100.00', 'gross': '600.00'}
    assert not any('TVA incohérente' in w for w in result['warnings'])


def test_true_mismatch_still_requires_review():
    _, _, _, warnings = extract_fields('Total HT : 500,00 €\nTVA 20 % : 90,00 €\nTotal TTC : 590,00 €')
    assert any('TVA incohérente' in w for w in warnings)


def test_multiple_rates_and_explicit_total_not_added_twice():
    inv, _, rate, warnings = extract_fields('Total HT\n1 500,00 €\nTVA - 20 %    1 000,00 €    200,00 €\nTVA - 10 %    500,00 €    50,00 €\nTotal TVA    250,00 €\nTotal TTC    1 750,00 €')
    assert inv['totals']['net'] == '1500.00'
    assert inv['totals']['vat'] == '250.00'
    assert rate is None
    assert not any('TVA incohérente' in w for w in warnings)


def test_legacy_invoice_layout_keeps_its_totals():
    inv, _, _, _ = extract_fields('Facture n° 2610065\nMontant total HT : 7.600,00 €\nTVA 20 % : 1.520,00 €\nMontant TTC : 9.120,00 €')
    assert inv['number'] == '2610065'
    assert inv['totals']['net'] == '7600.00'
    assert inv['totals']['vat'] == '1520.00'


def test_amount_on_next_line_must_be_a_standalone_amount():
    inv, _, _, _ = extract_fields('Montant HT\n1. Conseil 500,00 €')
    assert 'net' not in inv['totals']
