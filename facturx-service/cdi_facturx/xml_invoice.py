from copy import deepcopy
from lxml import etree
from facturx import generate_xml, xml_check_xsd
from .models import Invoice, money

NS = {'rsm': 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
      'ram': 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100'}


def to_bt(inv: Invoice) -> dict:
    totals, groups = inv.calculated()
    d = {'BT-1': inv.number, 'BT-2': inv.issue_date, 'BT-3': inv.type_code, 'BT-5': inv.currency,
         'BT-9': inv.payment.due_date, 'BT-20': inv.payment.terms,
         'BT-81': inv.payment.means_code, 'BT-84': inv.payment.iban, 'BT-86': inv.payment.bic,
         'BT-8': inv.payment.vat_due, 'BT-10': inv.buyer_reference,
         'BT-13': inv.order_reference, 'BT-12': inv.contract_reference,
         'BT-23': inv.business_process,
         'BT-106': str(totals['net'] + (inv.allowance.amount if inv.allowance else 0)), 'BT-109': str(totals['net']),
         'BT-110': str(totals['vat']), 'BT-110-1': inv.currency,
         'BT-112': str(totals['gross']), 'BT-113': str(inv.payment.prepaid), 'BT-115': str(totals['due']),
         'BT-114': str(inv.totals.rounding) if inv.totals.rounding else None,
         'BT-43': inv.seller.contact_email,
         'BG-1': [{'BT-21': code, 'BT-22': value} for code, value in (
             ('PMT', inv.notes.recovery), ('PMD', inv.notes.penalties),
             ('AAB', inv.notes.discount), ('AAI', inv.notes.description)) if value],
         'BG-23': [], 'BG-25': []}
    if inv.allowance:
        allowance = inv.allowance
        item = {'BT-92': str(allowance.amount), 'BT-95': allowance.vat_category, 'BT-97': allowance.reason}
        if allowance.vat_category != 'O':
            item['BT-96'] = str(allowance.vat_rate)
        d['BG-20'] = [item]
        d['BT-107'] = str(allowance.amount)
    if inv.preceding_invoice:
        d['BG-3'] = [{'BT-25': inv.preceding_invoice, 'BT-26': inv.preceding_invoice_date}]
    for party, fields in ((inv.seller, [27, 35, 38, 37, 40, 30, 29, 31, 34]),
                          (inv.buyer, [44, 50, 53, 52, 55, 47, 46, 48, 49])):
        for tag, value in zip(fields[:5], [party.name, party.street, party.postal_code, party.city, party.country]):
            d[f'BT-{tag}'] = value
        if party.siren:
            d[f'BT-{fields[5]}'] = party.siren
            d[f'BT-{fields[5]}-1'] = '0002'
        if party.siret:
            d[f'BT-{fields[6]}'] = {'0009': party.siret}
        if party.vat_number:
            d[f'BT-{fields[7]}'] = party.vat_number
        if party.electronic_address:
            d[f'BT-{fields[8]}'] = party.electronic_address
            d[f'BT-{fields[8]}-1'] = party.electronic_scheme
    for (cat, rate), group in groups.items():
        item = {'BT-116': str(group['base']), 'BT-117': str(money(group['base'] * rate / 100)), 'BT-118': cat}
        if cat != 'O':
            item['BT-119'] = str(rate)
        if group['reason']:
            item['BT-120'] = group['reason']
        d['BG-23'].append(item)
    for n, line in enumerate(inv.lines, 1):
        item = {'BT-126': str(n), 'BT-153': line.description, 'BT-129': str(line.quantity),
                'BT-130': line.unit, 'BT-146': str(line.unit_price),
                'BT-131': str(money(line.quantity * line.unit_price)), 'BT-151': line.vat_category}
        if line.vat_category != 'O':
            item['BT-152'] = str(line.vat_rate)
        d['BG-25'].append(item)
    return {k: v for k, v in d.items() if v is not None}


def create_xml(inv: Invoice, profile: str) -> bytes:
    if inv.totals.rounding and profile != 'en16931':
        raise ValueError('Cette facture comporte un arrondi de règlement : sélectionnez le profil EN16931 pour le conserver dans le XML.')
    # The upstream dictionary generator supports BASIC WL and EN16931, not BASIC.
    # Build the common CII subset then validate against the requested profile's XSD.
    d = to_bt(inv)
    xml = generate_xml(deepcopy(d), level='en16931', check_xsd=False, check_schematron=False)
    root = etree.fromstring(xml)
    # lxml.objectify marks a required empty delivery container xsi:nil.
    # CII expects an empty container, and does not allow xsi:nil here.
    for node in root.xpath('//*[@xsi:nil]', namespaces={'xsi': 'http://www.w3.org/2001/XMLSchema-instance'}):
        node.attrib.pop('{http://www.w3.org/2001/XMLSchema-instance}nil')
    if profile != 'en16931':
        root.find('rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID', NS).text = (
            'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic' if profile == 'basic'
            else 'urn:factur-x.eu:1p0:basicwl')
        # BIC is outside the two reduced profiles. IBAN remains available.
        for node in root.xpath('//ram:PayeeSpecifiedCreditorFinancialInstitution', namespaces=NS):
            node.getparent().remove(node)
        # Contact details are outside the reduced profiles; electronic routing remains.
        for node in root.xpath('//ram:DefinedTradeContact', namespaces=NS):
            node.getparent().remove(node)
    if profile == 'basicwl':
        for node in root.xpath('//ram:IncludedSupplyChainTradeLineItem', namespaces=NS):
            node.getparent().remove(node)
    xml = etree.tostring(root, encoding='UTF-8', xml_declaration=True, pretty_print=True)
    if xml_check_xsd(xml, flavor='factur-x', level=profile) is not True:
        raise ValueError('La validation XSD n’a pas confirmé la validité du XML.')
    return xml
