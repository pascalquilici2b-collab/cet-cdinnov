"""Per-invoice allocation without a reference table. Never supplies OCR fields."""
from decimal import Decimal,InvalidOperation,ROUND_HALF_UP
from .stamping_pdf import StampError,digest
from .stamping_import import cents

def direct_allocation(raw,reading,config):
    if not isinstance(config,dict) or not isinstance(config.get('project'),str) or not config['project'].strip() or len(config['project'])>300 or config.get('basis') not in ('HT','TTC'):
        raise StampError('INVALID_DIRECT','Projet ou base HT/TTC invalide.')
    try:
        rate=Decimal(str(config['vatRate']).replace(',','.'))
        if not rate.is_finite() or not 0<=rate<=100 or rate.as_tuple().exponent < -2:raise ValueError()
    except (InvalidOperation,ValueError,KeyError):raise StampError('INVALID_DIRECT','Taux de TVA invalide.')
    if reading['fields'].get('document_type')!='INVOICE':raise StampError('REVIEW_REQUIRED','La pièce doit être une facture ; les devis, avoirs et bulletins ne sont pas traités dans ce mode.')
    ht=reading['bases'].get('HT',{}).get('amount_cents');ttc=reading['bases'].get('TTC',{}).get('amount_cents')
    round_amount=lambda n:int(n.quantize(Decimal('1'),rounding=ROUND_HALF_UP))
    multiplier=1+rate/100
    if config.get('manualTotal'):
        if config.get('manualConfirmed') is not True:raise StampError('BASE_REQUIRED','Confirmez le total TTC relu sur la facture.')
        manual=cents(config['manualTotal'])
        if ttc is not None and manual!=ttc:raise StampError('BASE_MISMATCH','Le total TTC saisi contredit le total lu dans la facture.')
        ttc=manual
    if ht is None and ttc is None:raise StampError('BASE_REQUIRED','Total HT/TTC non identifié. Relisez et renseignez le total TTC de la facture.')
    if ht is not None and ttc is not None and abs(round_amount(Decimal(ht)*multiplier)-ttc)>2:
        raise StampError('VAT_MISMATCH','Le taux de TVA choisi ne correspond pas aux totaux HT et TTC. Vérifiez le taux ; une facture à plusieurs taux nécessite une répartition détaillée.')
    if ht is None:ht=round_amount(Decimal(ttc)/multiplier)
    if ttc is None:ttc=round_amount(Decimal(ht)*multiplier)
    base=ht if config['basis']=='HT' else ttc
    if not config.get('amount'):raise StampError('AMOUNT_REQUIRED','Saisissez le montant à imputer pour cette facture.')
    try:amount=cents(config['amount'])
    except (ValueError,TypeError):raise StampError('AMOUNT_REQUIRED','Montant à imputer invalide.')
    if amount<=0:raise StampError('NO_ALLOCATION','Le montant à imputer doit être positif.')
    if amount>base:raise StampError('OVER_ALLOCATION','Le montant à imputer dépasse le total '+config['basis']+' de la facture.')
    identifier='direct-'+digest(raw)
    group={'id':identifier,'document_type':'INVOICE','base_type':config['basis'],'base_amount_cents':base,'errors':[],
           'allocations':[{'id':identifier+'-1','project':config['project'].strip(),'programme':str(config.get('programme','')).strip(),'amount_cents':amount}],
           'rounding_cents':0}
    return group,base,[]
