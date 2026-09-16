"""Build-time Linux smoke test using only a fictional invoice, without network or secrets."""
import base64
import hashlib
import json
from copy import deepcopy
import pymupdf
from cdi_facturx.models import GenerationRequest
from cdi_facturx.service import generate, health
from cdi_facturx.pdf_import import extract_pdf

PDF = 'JVBERi0xLjcKJcK1wrYKJSBXcml0dGVuIGJ5IE11UERGIDEuMjguMgoKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvSW5mbzw8L1Byb2R1Y2VyKE11UERGIDEuMjguMik+Pj4+CmVuZG9iagoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1s0IDAgUl0+PgplbmRvYmoKCjMgMCBvYmoKPDwvRm9udDw8L2hlbHYgNiAwIFI+Pj4+CmVuZG9iagoKNCAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDU5NSA4NDJdL1JvdGF0ZSAwL1Jlc291cmNlcyAzIDAgUi9QYXJlbnQgMiAwIFIvQ29udGVudHNbNSAwIFIgNyAwIFIgOCAwIFIgOSAwIFJdPj4KZW5kb2JqCgo1IDAgb2JqCjw8L0xlbmd0aCA0MT4+CnN0cmVhbQoKcQowIDcxMiA1OTUgMTMwIHJlCmgKLjA0IC4xOSAuMjUgcmcgZgpRCgplbmRzdHJlYW0KZW5kb2JqCgo2IDAgb2JqCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYS9FbmNvZGluZy9XaW5BbnNpRW5jb2Rpbmc+PgplbmRvYmoKCjcgMCBvYmoKPDwvTGVuZ3RoIDkzL0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp42uMq5HIK4TJUMABCQwUTIwVzCyOFkFwu/YzUnDIFIxOFkDSgOAgGuUMZRekK0TYmhqYmJqYmySaWJqamRkYGJmYmhibGpkAOkJdiamEXG+LF5RrCFcgFAARYFSgKZW5kc3RyZWFtCmVuZG9iagoKOCAwIG9iago8PC9MZW5ndGggMTIzL0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp42kWLsQoCQQxE+3xFvuDczc4oB2IhiGCnbCdW7p0WWmjh9zuLhSSEN5kZe9m2WvakyY7wFZPXpy3u0+PjWTz7QB/Gvqf9n983P68BzCgkGoiJiKQPI1GXpetoUgVZbhEtRVd5ZChb1G69yxCPP29zqQfbVTvaF1L6Ik8KZW5kc3RyZWFtCmVuZG9iagoKOSAwIG9iago8PC9MZW5ndGggODM5L0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp42p1Wzc7TMBC89ynyBMX27tqxhDggceGG1Bvi8JGm4sB34MLzM2Mn6Y/9QYqiRonr7s7OzK57+HX4eDr4weHyg4YhJj0GG06vw7sf88/fg3fD6TJ8fa9RvYqpmQW14HT+7nBXNT3rJZwliMMn4snh8h++nT7fxbV0tDH1Imv0SSNiygs+HjEuiJBxX2I2sdQdcw9kszGgmNgth7AN5SgrslCTq8U5aQoA63DPSQgr6nqP53jBDil7CDrzvcnq0jG2KcUHBE22BkvChGlk2OTiVFfCGVCSWGUxOHPqwXi25TtieUxoGXxIj1sT/BJ66byxG0QEQkpEllFQeJqQBZWrX0hABuzzb+1VHytFstBjxB4rKaADtPla5VsZw1h0DWIhN7XQf2mHtgZDRd/VVnTSzKJNl5IEEHMs6j6vp9FunTyFkOcEDTsFpW/HXYJmUAodEF9BcxD9L5E6Uf4qEh2+pwGVzuzuNLfA0yvx/5Zmgcs9L/GSDPSDxjRiLZLgMJW7W5taR9MGExwmO6DTX0ifOwar2IC8GopZFmRAU4R+QNIEp6UQuxN8a8VwDRJWneKO0PCO9PviAXaZfnIDfE90Kt+LPUNM9haHHO4J3ZbCc7GFZhn39L5QwtCnD8lLq5/Xdi9w2KoRpg+337D9ooAUtOuVlrKKVolsZKxFeeZsEtoG507PNhna+LVzlzGrVWlcWhKUTzERJ4atduJRgCl6rjOksNmmVt9JCiiryOYMUSE6UhvfRl5NGBqoe5pgjC5jZevUiBX2qLVdakLQZLPX6+zbGoMDCn0Mdch0kgYPLbfHFSH7o/NvUA8d61Th6FuxX4CLFeSifq6VwS9lsnAHq+LfgA1rKM7g9/HeS8UfejN7mmMk0LTwbA/e3alRgyWacEb6qQK+B1GoDLF0XOIa342DsFh25myP0/qL6ilMkRYU7TomHfudVJNCHOPpsHXKHUup6bjaSUXPzDI6aRVSQalxh6q0Ixqqs1WXIxaZtObGE31U8l8JK74irgeaN+etk8KuB+NtNZXYKkKNy+cyIbb9WG2rpHMh+Nifl8toWmAWQqVOzbj+77yguW6hFAn4voB9bMHVojztp434T6fDl8MfSFymwAplbmRzdHJlYW0KZW5kb2JqCgp4cmVmCjAgMTAKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDQyIDAwMDAwIG4gCjAwMDAwMDAxMjAgMDAwMDAgbiAKMDAwMDAwMDE3MiAwMDAwMCBuIAowMDAwMDAwMjEzIDAwMDAwIG4gCjAwMDAwMDAzMzggMDAwMDAgbiAKMDAwMDAwMDQyOCAwMDAwMCBuIAowMDAwMDAwNTE3IDAwMDAwIG4gCjAwMDAwMDA2NzggMDAwMDAgbiAKMDAwMDAwMDg3MCAwMDAwMCBuIAoKdHJhaWxlcgo8PC9TaXplIDEwL1Jvb3QgMSAwIFIvSURbPDY4MzJDMjk0NTM2QUMyODRDMjkzQzI5MEMzQjQ2NjEyPjxGRDczRDI1NzZDQ0JEM0RGRjRBRkE0NTZCRDdCNzVDMD5dPj4Kc3RhcnR4cmVmCjE3NzgKJSVFT0YK'
INVOICE = {'number': 'DEMO-2026-001', 'issue_date': '2026-09-16', 'type_code': '380', 'currency': 'EUR', 'seller': {'name': 'Entreprise de démonstration', 'street': '1 rue des Exemples', 'postal_code': '75001', 'city': 'PARIS', 'country': 'FR', 'siren': '123456782', 'siret': None, 'vat_number': 'FR11123456782', 'electronic_address': '123456782', 'electronic_scheme': '0225'}, 'buyer': {'name': 'Client de démonstration', 'street': '2 rue des Exemples', 'postal_code': '75002', 'city': 'PARIS', 'country': 'FR', 'siren': '987654324', 'siret': None, 'vat_number': None, 'electronic_address': '987654324', 'electronic_scheme': '0225'}, 'lines': [{'description': 'Prestation de démonstration - 5 jours', 'quantity': '5', 'unit_price': '600.00', 'unit': 'DAY', 'vat_category': 'S', 'vat_rate': '20.00', 'exemption_reason': None}], 'payment': {'means_code': '30', 'due_date': '2026-09-16', 'terms': 'Comptant', 'iban': 'FR1420041010050500013M02606', 'bic': 'PSSTFRPPXXX', 'prepaid': '0.00', 'vat_due': None}, 'totals': {'net': '3000.00', 'vat': '600.00', 'gross': '3600.00', 'due': '3600.00'}, 'notes': {'recovery': 'Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 €.', 'penalties': 'Exemple : pénalités de retard au taux annuel de 10 %.', 'discount': "Nos conditions de vente ne prévoient pas d'escompte pour paiement anticipé.", 'description': 'DOCUMENT DE TEST - SANS VALEUR COMMERCIALE. Identifiants utilisés pour validation technique uniquement.'}, 'buyer_reference': None, 'order_reference': None, 'contract_reference': None, 'preceding_invoice': None, 'business_process': 'S1'}

def main():
    pdf = base64.b64decode(PDF)
    assert health()['ready'], 'Conversion tools missing'
    assert extract_pdf(pdf)['candidates']['number'] == 'DEMO-2026-001'
    request = GenerationRequest.model_validate({'invoice': INVOICE, 'profile': 'en16931',
        'reviewed': True, 'source_sha256': hashlib.sha256(pdf).hexdigest()})
    result = generate(pdf, request)
    assert result['report']['valid'] and all(result['report']['checks'].values())
    print('SYNTHETIC CONVERSION PASSED: ' + json.dumps(result['report']['checks']))

    # Also exercise the retained-PDF discount path with an explicit, audited acknowledgment.
    with pymupdf.open(stream=pdf, filetype='pdf') as document:
        text = document[0].get_text()
    text = text.replace('5 jours x 600,00', '4.17 jours x 600,00')
    text = text.replace('Montant HT : 3 000,00', 'Montant HT : 2 502,00')
    text = text.replace('TVA 20,00 % : 600,00', 'TVA 20,00 % : 500,04')
    text = text.replace('Montant TTC : 3 600,00', 'Montant TTC : 3 002,04')
    text = text.replace('Net a payer : 3 600,00', 'Net a payer : 3 000,00')
    with pymupdf.open() as document:
        page = document.new_page()
        assert page.insert_textbox(pymupdf.Rect(36, 36, 559, 800), text, fontsize=10) >= 0
        pdf = document.tobytes()
    invoice = deepcopy(INVOICE)
    invoice['lines'][0].update(quantity='4.17', description='Prestation de demonstration')
    invoice['allowance'] = {'amount':'2.00', 'reason':'Remise commerciale', 'vat_category':'S', 'vat_rate':'20'}
    invoice['totals'] = {'net':'2500.00', 'vat':'500.00', 'gross':'3000.00', 'due':'3000.00', 'rounding':'0.00'}
    request = GenerationRequest.model_validate({'invoice':invoice, 'profile':'en16931', 'reviewed':True,
        'source_sha256':hashlib.sha256(pdf).hexdigest(), 'pdf_differences_acknowledged':True,
        'source_corrections':['totals.net','totals.vat','totals.gross','totals.rounding']})
    result = generate(pdf, request)
    assert result['report']['valid'] and all(result['report']['checks'].values())
    assert result['report']['visual_consistency'] == 'pdf_xml_differences_acknowledged'
    print('DISCOUNT CONVERSION PASSED: 2.00 HT allowance, 3000.00 TTC; original PDF preserved; differences reported.')


if __name__ == '__main__':
    main()
