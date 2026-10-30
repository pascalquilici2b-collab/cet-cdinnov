"""Only synthetic workbook data; no external model/network is used."""
from io import BytesIO

from openpyxl import Workbook

from cdi_facturx.stamping_import import inspect
from cdi_facturx.stamping_layout import layout_sample


def test_currency_text_is_masked_like_numeric_cells_without_losing_layout():
    values = [2345.67, '2 345,67 EUR', 'EUR 2 345,67', '2\u202f345,67 eur', '2 345,67 €', 'Projet ALPHA', 'Facture FA-2026-42']
    sample = layout_sample('Feuille de test', [[{'cell': f'{chr(65+i)}1', 'value': value} for i, value in enumerate(values)]])
    assert [cell['text'] for cell in sample['cells'][:5]] == ['[nombre]'] * 5
    assert [cell['kind'] for cell in sample['cells'][:5]] == ['number'] * 5
    assert sample['cells'][5]['text'] == 'Projet ALPHA'
    assert sample['cells'][6]['text'] == 'Facture FA-2026-42'
    assert sample['cells'][1]['cell'] == 'B1'


def test_real_xlsx_unknown_layout_keeps_source_identity_for_local_resolution_only():
    book = Workbook()
    sheet = book.active
    # Valid Excel name, synthetic account: the Worker must pseudonymize this
    # metadata before model egress; Python needs the original to locate the sheet.
    sheet.title = 'FR7600000000000000000000000'
    sheet.append(['Organisation inconnue', 'Projet ALPHA', '2 345,67 EUR'])
    sheet.append(['Agent démonstration', '2 500,00 eur', 'EUR 3 400,00'])
    raw = BytesIO()
    book.save(raw)
    result = inspect(raw.getvalue(), 'fictif.xlsx', {'category': 'RH'})
    candidates = result['layoutCandidates']
    assert len(candidates) == 1
    assert candidates[0]['sheet'] == sheet.title
    amounts = [cell for cell in candidates[0]['cells'] if cell['cell'] in ('C1', 'B2', 'C2')]
    assert len(amounts) == 3
    assert all(cell['kind'] == 'number' and cell['text'] == '[nombre]' for cell in amounts)
