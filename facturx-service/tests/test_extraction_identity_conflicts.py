"""Conservative OCR must not choose the first of contradictory printed IDs."""
import hashlib
import io

import pytest
from reportlab.pdfgen import canvas

from cdi_facturx.extract_fields import extract_fields
from cdi_facturx.pdf_import import extract_pdf

IBAN_A = 'FR7611111111111111111111111'
IBAN_B = 'FR7622222222222222222222222'
SIRET_A = '11111111100011'
SIRET_B = '22222222200022'


def decode(text, conservative=True):
    ambiguities = set()
    invoice, _, _, warnings = extract_fields(text, conservative=conservative, ambiguities=ambiguities)
    return invoice, ambiguities, warnings


def test_distinct_ocr_ibans_are_omitted_and_marked_ambiguous_without_changing_legacy_reading():
    text = f'Facture n° F-FICTIF-42\nIBAN : {IBAN_A}\nIBAN : {IBAN_B}\nTotal HT : 1000,00 EUR'
    invoice, ambiguities, warnings = decode(text)
    assert 'iban' not in invoice['payment']
    assert invoice['payment']['means_code'] == '30'
    assert 'payment.iban' in ambiguities and any('IBAN différents' in w for w in warnings)
    assert decode(text, conservative=False)[0]['payment']['iban'] == IBAN_A


def test_equivalent_repeated_bank_accounts_keep_their_exact_normalized_identity():
    spaced = ' '.join(IBAN_A[i:i+4] for i in range(0, len(IBAN_A), 4))
    invoice, ambiguities, warnings = decode(f'Facture fictive\nIBAN : {IBAN_A}\nIBAN : {spaced.lower()}')
    assert invoice['payment']['iban'] == IBAN_A
    assert 'payment.iban' not in ambiguities and not any('IBAN différents' in w for w in warnings)


@pytest.mark.parametrize('role,field', [('Vendeur', 'seller'), ('Acheteur', 'buyer')])
def test_conflicting_sirets_are_scoped_to_the_company_block_and_derived_siren_is_not_kept(role, field):
    text = f'Facture n° F-FICTIF-42\n{role} : Société Fictive\nSIRET : {SIRET_A}\nSIRET : {SIRET_B}\nTotal HT : 1000,00 EUR'
    invoice, ambiguities, warnings = decode(text)
    assert 'siret' not in invoice[field] and 'siren' not in invoice[field]
    assert {field+'.siret', field+'.siren'} <= ambiguities
    assert any('SIRET différents' in w for w in warnings)
    assert decode(text, conservative=False)[0][field]['siret'] == SIRET_A


def test_different_companies_do_not_conflict_and_repeated_establishments_keep_a_consistent_siren():
    text = f'Vendeur : Société Vendeuse\nSIRET : {SIRET_A}\nAcheteur : Commune Acheteuse\nSIRET : {SIRET_B}\nTotal HT : 1000,00 EUR'
    invoice, ambiguities, _ = decode(text)
    assert invoice['seller']['siret'] == SIRET_A and invoice['buyer']['siret'] == SIRET_B
    assert not ambiguities
    invoice, ambiguities, _ = decode(f'Vendeur : Société Fictive\nSIRET : {SIRET_A}\nSIRET : 11111111100022\nTotal HT : 1000,00 EUR')
    assert 'siret' not in invoice['seller'] and invoice['seller']['siren'] == '111111111'
    assert ambiguities == {'seller.siret'}
    invoice, ambiguities, _ = decode(f'Vendeur : Société Fictive\nSIRET : {SIRET_A}\nSIRET : 111 111 111 00011\nTotal HT : 1000,00 EUR')
    assert invoice['seller']['siret'] == SIRET_A and not ambiguities


def test_distinct_budget_sirets_are_not_selected_arbitrarily():
    invoice, ambiguities, _ = decode(f'Acheteur : Commune Fictive\nSIRET BUDGET : {SIRET_A}\nSIRET BUDGET : {SIRET_B}\nTotal HT : 1000,00 EUR')
    assert 'siret' not in invoice['buyer'] and 'siren' not in invoice['buyer']
    assert {'buyer.siret', 'buyer.siren'} <= ambiguities


@pytest.mark.parametrize('role,field', [('Fournisseur', 'seller'), ('Client', 'buyer')])
def test_repeated_company_blocks_cannot_hide_contradictory_sirets(role, field):
    prefix = f'Facture n° F-FICTIF-42\n{role} : Société Fictive\nSIRET : {SIRET_A}\n\n'
    text = prefix + f'{role} : Société Fictive\nSIRET : {SIRET_B}\nTotal HT : 1000,00 EUR'
    invoice, ambiguities, warnings = decode(text)
    assert 'siret' not in invoice[field] and 'siren' not in invoice[field]
    assert {field+'.siret', field+'.siren'} <= ambiguities
    assert any('SIRET différents' in w for w in warnings)
    assert decode(text, conservative=False)[0][field]['siret'] == SIRET_B
    identical = text.replace(SIRET_B, SIRET_A)
    assert decode(identical)[0][field]['siret'] == SIRET_A and not decode(identical)[1]


def test_ocr_internal_identity_conflicts_cannot_be_reintroduced_from_a_single_native_value():
    native = f'Facture n° F-FICTIF-42\nVendeur : Société Fictive\nSIRET : {SIRET_A}\n\nIBAN : {IBAN_A}\nTotal HT : 1000,00 EUR'
    output = io.BytesIO()
    document = canvas.Canvas(output, pagesize=(595, 842))
    for index, line in enumerate(native.splitlines()):
        document.drawString(30, 800-index*20, line)
    document.save()
    raw = output.getvalue()
    text = native.replace(f'SIRET : {SIRET_A}', f'SIRET : {SIRET_A}\nSIRET : {SIRET_B}') + f'\nIBAN : {IBAN_B}'
    reading = {'page':0, 'source_sha256':hashlib.sha256(raw).hexdigest(), 'text':text,
               'complete':True, 'warnings':[], 'model':'@cf/google/gemma-4-26b-a4b-it'}
    result = extract_pdf(raw, ocr_pages=[reading])
    assert 'seller_siret' not in result['candidates'] and 'iban' not in result['candidates']
    assert result['candidates']['totals']['net'] == '1000.00'
    assert any('seller.siret' in w and 'payment.iban' in w for w in result['warnings'])
