"""Only qualified invoice dates become OCR issue-date candidates."""
import pytest

from cdi_facturx.extract_fields import extract_fields


def reading(text, conservative=True):
    ambiguities = set()
    invoice, _, _, warnings = extract_fields(text, conservative=conservative, ambiguities=ambiguities)
    return invoice, ambiguities, warnings


@pytest.mark.parametrize('line', [
    'Date du bon de commande : 01/11/2026', 'Signature le 01/11/2026',
    'Date de livraison : 01/11/2026', 'Date de notification : 01/11/2026',
])
def test_another_event_date_does_not_become_invoice_issue_date(line):
    source = 'Facture n° F-FICTIF-42\n'+line+'\nTotal HT : 1000,00 EUR'
    invoice, ambiguities, warnings = reading(source)
    assert 'issue_date' not in invoice and not ambiguities
    assert any('date de facture' in w for w in warnings)
    assert reading(source, conservative=False)[0]['issue_date'] == '2026-11-01'


@pytest.mark.parametrize('line', [
    'Date de facture : 07/11/2026', 'Date facture : 2026-11-07',
    'Date de la facture : 7 novembre 2026', 'Date d’émission : 07/11/2026',
    "Date d'émission : 07/11/2026", 'Date émission : 07/11/2026',
    'Date : 07/11/2026', 'Fait à Ajaccio le 07/11/2026',
])
def test_qualified_invoice_dates_are_kept_without_using_an_order_or_signature_date(line):
    source = 'Facture n° F-FICTIF-42\nDate du bon de commande : 01/11/2026\n'+line
    assert reading(source)[0]['issue_date'] == '2026-11-07'


def test_distinct_invoice_dates_are_ambiguous_but_an_unqualified_date_does_not_poison_native_evidence():
    invoice, ambiguities, warnings = reading('Facture n° F-FICTIF-42\nDate facture : 01/11/2026\nDate d’émission : 07/11/2026')
    assert 'issue_date' not in invoice and ambiguities == {'issue_date'}
    assert any('Plusieurs dates' in w for w in warnings)
    assert reading('Facture n° F-FICTIF-42\nDate facture : 07/11/2026\nDate de signature : 09/11/2026')[0]['issue_date'] == '2026-11-07'


@pytest.mark.parametrize('heading', ['Bon de commande BC-FICTIF-42', 'Signature', 'Bon pour accord', 'Devis DEV-FICTIF-42'])
def test_a_generic_date_in_an_attached_document_or_signature_section_is_not_an_invoice_date(heading):
    invoice, _, _ = reading('Facture n° F-FICTIF-42\n'+heading+'\nDate : 07/11/2026')
    assert 'issue_date' not in invoice


@pytest.mark.parametrize('separator', [' | ', '\t'])
@pytest.mark.parametrize('label', ['Date de facture', 'Date', 'Date d’émission'])
def test_same_row_invoice_date_cells_preserve_their_qualified_owner(separator, label):
    source = 'Facture n° F-FICTIF-42'+separator+label+' : 07/11/2026'
    assert reading(source)[0]['issue_date'] == '2026-11-07'


@pytest.mark.parametrize('separator', [' | ', '\t'])
def test_generic_date_cells_cannot_borrow_an_earlier_invoice_owner(separator):
    for heading in ['Signature', 'Bon de commande BC-FICTIF-42', 'Devis DEV-FICTIF-42']:
        source = 'Facture n° F-FICTIF-42'+separator+heading+separator+'Date : 07/11/2026'
        assert 'issue_date' not in reading(source)[0]
    conflicting = 'Facture n° F-FICTIF-42'+separator+'Date de facture : 01/11/2026'+separator+'Date d’émission : 07/11/2026'
    invoice, ambiguities, _ = reading(conflicting)
    assert 'issue_date' not in invoice and ambiguities == {'issue_date'}
