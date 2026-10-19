"""The billing editor and CII converter share the same monetary fixtures.

Run with PYTHONPATH=facturx-service python -m pytest
facturx-service/tests/test_line_discounts.py. Node executes the real TS domain.
XSD/Schematrons are the local official files bundled in factur-x 6.8.
"""
from copy import deepcopy
from decimal import Decimal, localcontext
import json
from pathlib import Path
import subprocess

from lxml import etree
import pytest
from pydantic import ValidationError

from cdi_facturx.models import Invoice, Line
from cdi_facturx.xml_invoice import NS, create_xml, to_bt
from cdi_facturx.validate_worker import validate

ROOT = Path(__file__).resolve().parents[2]
FIXTURES_PATH = Path(__file__).parent / 'fixtures' / 'line-discounts.json'
CASES = json.loads(FIXTURES_PATH.read_text(encoding='utf-8'))
FRACTIONAL = next(case for case in CASES if case['name'] == 'fractional_quantity')
# The service accepts six decimals for backwards-compatible calculation. The
# bundled France rules impose four decimals on BT-129 (not on unit price).
# These deliberately non-exportable cases must fail that rule without changing
# or rounding the original quantity. All other cases must pass France as well.
FRANCE_QUANTITY_REJECTIONS = {'free_line', 'six_decimal_quantity_and_price', 'zero_price', 'large_exact_operands'}


def invoice_payload(case):
    expected = case['expected']
    lines = [{'description': 'Prestation de test', 'quantity': line['quantity'],
              'unit_price': line['unitPrice'], 'discount_percent': line['discountPercent'],
              'vat_rate': line['vatRate'], 'vat_category': line['vatCategory']}
             for line in case['lines']]
    amounts = {key: str(Decimal(expected[source]) / 100) for key, source in
               [('net', 'netMinor'), ('vat', 'taxMinor'), ('gross', 'grossMinor'), ('due', 'grossMinor')]}
    return {'number': 'TEST-REMISES-1', 'issue_date': '2026-10-20', 'currency': 'EUR', 'business_process': 'S1',
            'seller': {'name': 'Émetteur fictif', 'street': '1 rue du Test', 'postal_code': '20000',
                       'city': 'Ajaccio', 'country': 'FR', 'siren': '732829320', 'vat_number': 'FR44732829320',
                       'electronic_address': '732829320', 'electronic_scheme': '0225'},
            'buyer': {'name': 'Client fictif', 'street': '2 rue du Test', 'postal_code': '20200',
                      'city': 'Bastia', 'country': 'FR', 'siren': '552100554',
                      'electronic_address': '552100554', 'electronic_scheme': '0225'},
            'lines': lines, 'payment': {'means_code': '10', 'due_date': '2026-11-19', 'vat_due': 'invoice'},
            'totals': amounts, 'notes': {'recovery': 'Indemnité forfaitaire de recouvrement : 40 euros.',
                                       'penalties': 'Pénalités de retard selon les conditions convenues.',
                                       'discount': 'Pas d’escompte pour paiement anticipé.'}}


def test_fixtures_match_real_typescript_domain():
    program = """
import {readFileSync} from 'node:fs';
import {blankDraft,calculateBilling,newLine} from './platform/billing-domain.ts';
const cases=JSON.parse(readFileSync(process.argv[1],'utf8'));
const results=cases.map(test=>{const draft=blankDraft('invoice','2026-10-20');
draft.lines=test.lines.map(line=>({...newLine(),...line}));
const {netMinor,taxMinor,grossMinor,discountMinor}=calculateBilling(draft);
return {name:test.name,expected:{netMinor,taxMinor,grossMinor,discountMinor}};});
process.stdout.write(JSON.stringify(results));
"""
    result = subprocess.run(['node', '--input-type=module', '-e', program, str(FIXTURES_PATH)],
                            cwd=ROOT, check=True, capture_output=True, text=True, encoding='utf-8')
    actual = {case['name']: case['expected'] for case in json.loads(result.stdout)}
    assert actual == {case['name']: case['expected'] for case in CASES}


@pytest.mark.parametrize('case', CASES, ids=lambda case: case['name'])
def test_model_and_bt_keep_exact_discounted_amounts(case):
    invoice = Invoice.model_validate(invoice_payload(case))
    totals, groups = invoice.calculated()
    assert totals['net'] * 100 == Decimal(case['expected']['netMinor'])
    assert totals['vat'] * 100 == Decimal(case['expected']['taxMinor'])
    assert totals['gross'] * 100 == Decimal(case['expected']['grossMinor'])
    assert sum((line.amounts()['discount'] for line in invoice.lines), Decimal(0)) * 100 == Decimal(case['expected']['discountMinor'])
    bt = to_bt(invoice)
    assert Decimal(bt['BT-106']) == totals['net']
    assert Decimal(bt['BT-109']) == totals['net']
    assert Decimal(bt['BT-112']) == totals['gross']
    for line, xml_line in zip(invoice.lines, bt['BG-25']):
        assert Decimal(xml_line['BT-146']) == line.unit_price
        assert Decimal(xml_line['BT-131']) == line.amounts()['net']
        if line.discount_percent:
            allowance = xml_line['BG-27'][0]
            assert Decimal(allowance['BT-136']) == line.amounts()['discount']
            assert Decimal(allowance['BT-137']) == line.amounts()['base']
            assert Decimal(allowance['BT-138']) == line.discount_percent
            assert allowance['BT-139']
        else:
            assert 'BG-27' not in xml_line
    assert sum(group['base'] for group in groups.values()) == totals['net']


@pytest.mark.parametrize('profile', ['en16931', 'basic'])
@pytest.mark.parametrize('case', CASES, ids=lambda case: case['name'])
def test_xsd_schematron_and_france_with_real_library(case, profile, tmp_path):
    invoice = Invoice.model_validate(invoice_payload(case))
    xml = create_xml(invoice, profile)  # Includes the real XSD check.
    path = tmp_path / 'factur-x.xml'
    path.write_bytes(xml)
    report = validate(str(path), profile)
    if case['name'] in FRANCE_QUANTITY_REJECTIONS:
        assert report['checks'] == {'schematron': True, 'france': False}, report
        assert [error['code'] for error in report['errors']] == ['BR-FR-DEC-02_BT-129'], report
    else:
        assert report['checks'] == {'schematron': True, 'france': True}, report
        assert report['errors'] == []
    root = etree.fromstring(xml)
    xml_lines = root.xpath('//ram:IncludedSupplyChainTradeLineItem', namespaces=NS)
    assert len(xml_lines) == len(invoice.lines)
    for line, xml_line in zip(invoice.lines, xml_lines):
        assert Decimal(xml_line.find('ram:SpecifiedLineTradeAgreement/ram:NetPriceProductTradePrice/ram:ChargeAmount', NS).text) == line.unit_price
        allowance = xml_line.find('ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeAllowanceCharge', NS)
        if line.discount_percent:
            assert allowance is not None
            assert allowance.find('ram:ChargeIndicator/*', NS).text == 'false'
            assert Decimal(allowance.find('ram:ActualAmount', NS).text) == line.amounts()['discount']
            assert Decimal(allowance.find('ram:CalculationPercent', NS).text) == line.discount_percent
        else:
            assert allowance is None


def test_old_payload_is_unchanged_without_discount():
    payload = invoice_payload(CASES[0])
    explicit = Invoice.model_validate(payload)
    del payload['lines'][0]['discount_percent']
    legacy = Invoice.model_validate(payload)
    assert legacy.lines[0].discount_percent == 0
    assert legacy.calculated() == explicit.calculated()
    assert to_bt(legacy) == to_bt(explicit)
    assert create_xml(legacy, 'en16931') == create_xml(explicit, 'en16931')
    assert create_xml(legacy, 'basicwl')


@pytest.mark.parametrize('value', ['-0.01', '100.01', '0.001', 'NaN', 'Infinity', None])
def test_discount_range_and_precision_are_enforced(value):
    line = invoice_payload(CASES[0])['lines'][0]
    with pytest.raises(ValidationError):
        Line.model_validate({**line, 'discount_percent': value})


def test_discount_does_not_allow_stale_totals():
    payload = invoice_payload(CASES[0])
    payload['lines'][0]['discount_percent'] = '10'
    with pytest.raises(ValidationError, match='incohérent'):
        Invoice.model_validate(payload)


def test_basicwl_does_not_silently_remove_structured_line_discounts():
    with pytest.raises(ValueError, match='remises de ligne'):
        create_xml(Invoice.model_validate(invoice_payload(FRACTIONAL)), 'basicwl')


def test_amount_calculation_is_independent_of_ambient_decimal_precision():
    line = Line(description='Test', quantity='9999999999.999999', unit_price='99.999999', discount_percent='99.99')
    expected = line.amounts()
    with localcontext() as context:
        context.prec = 8
        assert line.amounts() == expected


def test_global_allowance_and_line_discount_remain_separate():
    payload = invoice_payload(FRACTIONAL)
    payload['allowance'] = {'amount': '10', 'reason': 'Remise globale de test', 'vat_category': 'S', 'vat_rate': '20'}
    payload['totals'] = {'net': '755.63', 'vat': '151.13', 'gross': '906.76', 'due': '906.76'}
    invoice = Invoice.model_validate(payload)
    bt = to_bt(invoice)
    assert Decimal(bt['BT-106']) == Decimal('765.63')
    assert Decimal(bt['BT-107']) == Decimal('10')
    assert Decimal(bt['BT-109']) == Decimal('755.63')
    assert Decimal(bt['BG-25'][0]['BG-27'][0]['BT-136']) == Decimal('109.37')
    assert Decimal(bt['BG-20'][0]['BT-92']) == Decimal('10')
    # Mutating the discount must never mutate the caller's nested payload.
    original = deepcopy(payload)
    invoice.lines[0].discount_percent = Decimal('20')
    assert payload == original


def test_long_editor_content_is_preserved_in_the_xml(tmp_path):
    payload = invoice_payload(FRACTIONAL)
    payload['lines'][0]['description'] = 'É' * 4000
    payload['payment']['terms'] = 'T' * 4000
    payload['notes']['description'] = 'N' * 20000
    invoice = Invoice.model_validate(payload)
    xml = create_xml(invoice, 'en16931')
    root = etree.fromstring(xml)
    assert root.find('.//ram:SpecifiedTradeProduct/ram:Name', NS).text == payload['lines'][0]['description']
    assert root.find('.//ram:SpecifiedTradePaymentTerms/ram:Description', NS).text == payload['payment']['terms']
    assert root.xpath('//ram:IncludedNote[ram:SubjectCode="AAI"]/ram:Content/text()', namespaces=NS) == [payload['notes']['description']]
    path = tmp_path / 'long-content.xml'
    path.write_bytes(xml)
    report = validate(str(path), 'en16931')
    assert report['checks'] == {'schematron': True, 'france': True}, report


@pytest.mark.parametrize('section,field,limit', [('lines', 'description', 4000), ('payment', 'terms', 4000),
                                              ('notes', 'description', 20000), ('notes', 'penalties', 2000)])
def test_text_limits_reject_overflow_instead_of_truncating(section, field, limit):
    payload = invoice_payload(FRACTIONAL)
    target = payload[section][0] if section == 'lines' else payload[section]
    target[field] = 'a' * (limit + 1)
    with pytest.raises(ValidationError, match='string_too_long'):
        Invoice.model_validate(payload)
