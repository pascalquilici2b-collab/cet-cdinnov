"""Local, deterministic invoice reading. Return suggestions, never invented identities."""
import re
import unicodedata
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


def plain(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text) if not unicodedata.combining(c)).lower()


def number(value):
    value = re.sub(r'[\s\u00a0\u202f]', '', value)
    if ',' in value:
        value = value.replace('.', '').replace(',', '.')
    elif re.fullmatch(r'\d{1,3}(?:\.\d{3})+', value):
        value = value.replace('.', '')
    return Decimal(value)


def money(value):
    return str(number(value).quantize(Decimal('.01'), rounding=ROUND_HALF_UP))


AMOUNT = r'(\d+(?:(?:[ \u00a0\u202f.]\d{3})+)?(?:[,.]\d{1,6})?)'
MONTHS = 'janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre'.split()
DATE = r'(?:\d{1,2}[./-]\d{1,2}[./-]20\d{2}|20\d{2}-\d{2}-\d{2}|\d{1,2}\s+(?:'+'|'.join(MONTHS)+r')\s+20\d{2})'


def read_date(value):
    value = plain(value)
    match = re.search(DATE, value)
    if not match:
        return None
    try:
        value = match.group()
        if re.fullmatch(r'20\d{2}-\d{2}-\d{2}', value):
            return date.fromisoformat(value).isoformat()
        if re.search('[./-]', value):
            d, m, y = map(int, re.split('[./-]', value))
        else:
            d, m, y = value.split()
            d, m, y = int(d), MONTHS.index(m)+1, int(y)
        return date(y, m, d).isoformat()
    except ValueError:
        return None


def clean(line):
    return re.sub(r'\s+', ' ', line).strip(' \t|;')


def party(block):
    """Read only the selected company's block, so buyer IDs never become seller IDs."""
    lines = [clean(x) for x in block.splitlines() if x.strip()]
    result = {}
    if not lines:
        return result
    name = re.sub(r'^(?:emetteur|émetteur|vendeur|fournisseur|client|destinataire|factur[eé]\s+[aà]|acheteur)\s*:?\s*', '', lines[0], flags=re.I)
    result['name'] = re.split(r'\s+(?:SCOP[- ]|SARL\b|SAS\b)', name, flags=re.I)[0].strip(' -–—')
    for key, pattern in [('siret',r'\bSIRET\s*[: ]\s*((?:\d[ \t]*){14})(?!\d)'),('siren',r'\bSIREN\s*[: ]\s*((?:\d[ \t]*){9})(?!\d)'),('vat_number',r'(?:TVA(?:\s+intracommunautaire)?|VAT)\s*[: ]\s*([A-Z]{2}[ \t]*[A-Z0-9]{2}[ \t]*(?:\d[ \t]*){9})(?!\d)')]:
        found = re.search(pattern, block, re.I)
        if found:
            result[key] = re.sub(r'\s', '', found.group(1)).upper()
    if result.get('siret'):
        result['siren'] = result['siret'][:9]
    email=re.search(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b',block,re.I)
    if email: result['contact_email']=email.group().lower()
    address = re.search(r'adresse\s+[eé]lectronique\s*:\s*([\w@.+:-]+)\s*\((\d{4})\)', block, re.I)
    if address:
        result.update(electronic_address=address.group(1), electronic_scheme=address.group(2))
    for i, line in enumerate(lines[1:], 1):
        # French addresses: postal code + city, or street, CITY (20 200).
        found = re.search(r'\b(\d{2}[ ]?\d{3})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s\-\']+)', line)
        if found and not re.search(r'siret|siren|rcs|iban|tva', plain(line)):
            result['postal_code'] = found.group(1).replace(' ', '')
            city = re.split(r'\s+-\s+(?:FR|France)\b|\s+(?:Tel|Tél|Fax)\b', found.group(2))[0].strip(' -')
            result['city'] = city
            prefix = line[:found.start()].strip(' -;,')
            if prefix:
                result['street'] = prefix
            elif i > 1:
                result['street'] = lines[i-1]
                # Recipient legal names often wrap before the street line.
                # Keep only name continuations, never IDs, contact or invoice data.
                continuations = lines[1:i-1]
                if continuations and all(re.match(r"^(?:et |de |du |des |d['’]|l['’])", plain(part)) and not re.search(
                        r'\d|@|\b(?:siret|siren|tva|tel|telephone|fax|facture|objet|rcs|iban)\b', plain(part))
                        for part in continuations):
                    result['name'] = clean(' '.join([result['name'], *continuations])).rstrip('.')
            result['country'] = 'FR'
            break
        reverse = re.search(r'^(.+?),\s*([A-ZÀ-Ÿ][A-ZÀ-Ÿ -]+)\s*\((\d{2}\s?\d{3})\)', line)
        if reverse:
            result.update(street=reverse.group(1), city=reverse.group(2).strip(), postal_code=reverse.group(3).replace(' ',''), country='FR')
            break
    return result


def company_blocks(text):
    lines = text.splitlines()
    blocks = {}
    role = None
    for line in lines:
        p = plain(line).strip()
        label = re.match(r'^(emetteur|vendeur|fournisseur|client|destinataire|facture a|acheteur)\s*:',p)
        if label:
            role = 'seller' if label.group(1) in ('emetteur','vendeur','fournisseur') else 'buyer'
            blocks[role] = [line]
        elif role:
            if not p or re.match(r'^(facture\b|avoir\b|date\b|designation\b|description\b|prestation\b|objet\b|montant\b|total\b)', p):
                role = None
            else:
                blocks[role].append(line)
    if 'seller' not in blocks:
        # CDI's footer and other invoices with the issuer's legal block at the bottom.
        for i, line in enumerate(lines):
            if re.search(r'\b(?:SIRET|SIREN|RCS)\b',line,re.I):
                previous = next((j for j in range(i-1,max(-1,i-5),-1) if lines[j].strip()), None)
                if previous is not None and not re.search(r'\d{5}|client|facture|iban',plain(lines[previous])):
                    block = '\n'.join(lines[previous:i+7])
                    if party(block).get('street'):
                        blocks['seller'] = lines[previous:i+7]
                        break
    if 'buyer' not in blocks:
        # A recipient postal block before the invoice title (CDI's original format).
        for i, line in enumerate(lines):
            if re.search(r'\b\d{2}\s?\d{3}\s+[A-ZÀ-Ÿ]',line) and i >= 2:
                previous = [x for x in lines[max(0,i-4):i] if x.strip()]
                if len(previous)>=2 and not re.search(r'siret|siren|iban|\d',plain(previous[-2])):
                    block = previous+[line]
                    if party('\n'.join(block)).get('street') and block != blocks.get('seller'):
                        blocks['buyer'] = block
                        break
    result={key: party('\n'.join(value)) for key,value in blocks.items()}
    budget=re.search(r'\bSIRET\s+BUDGET\s*:?\s*((?:\d[ \t]*){14})(?!\d)',text,re.I)
    if budget and result.get('buyer'):
        siret=re.sub(r'\s','',budget.group(1))
        result['buyer'].update(siret=siret,siren=siret[:9])
    return result


def read_lines(text, vat_rate, net):
    results = []
    p = plain(text)
    # Explicit quantity × unit price; recurring monthly quantities are multiplied.
    expression = re.compile(r'('+r'\d+(?:[,.]\d+)?'+r')\s*(jours?|j|heures?|h|unites?|u|mois)\s*(?:[x×*]|a\b)\s*'+AMOUNT+r'\s*(?:€|eur)(?:\s*(?:ht|h\.t\.?))?(?:\s*[x×*]\s*(\d+(?:[,.]\d+)?)\s*mois)?',re.I)
    for raw in text.splitlines():
        line = clean(raw)
        found = expression.search(plain(line))
        if not found:
            continue
        qty, unit, price, months = found.groups()
        quantity = number(qty) * (number(months) if months else 1)
        description = line[:found.start()].strip(' :=-') or line
        results.append(dict(description=description,quantity=str(quantity),unit_price=str(number(price)),unit={'j':'DAY','jour':'DAY','jours':'DAY','h':'HUR','heure':'HUR','heures':'HUR','mois':'MON'}.get(unit,'C62')))
    # Table rows, with columns separated by multiple spaces, tabs or pipes.
    if not results:
        header = None
        for raw in text.splitlines():
            cells = [clean(c) for c in re.split(r'\s{2,}|\t|\|',raw.strip()) if c.strip()]
            if not cells:
                continue
            normalized = [plain(c) for c in cells]
            if any(re.search(r'designation|description|libelle',c) for c in normalized) and any(re.search(r'qte|quantite|qty',c) for c in normalized):
                header = {}
                for i,c in enumerate(normalized):
                    if re.search(r'designation|description|libelle',c): header['description']=i
                    elif re.search(r'qte|quantite|qty',c): header['quantity']=i
                    elif re.search(r'p\.?\s*u\.?|prix.*unit',c): header['unit_price']=i
                    elif re.search(r'tva|vat',c): header['vat_rate']=i
                if not {'description','quantity','unit_price'} <= header.keys(): header=None
                continue
            if header and re.search(r'^(total|montant|net a payer|tva|sous.total)', plain(raw).strip()):
                header=None
            if header and max(header.values())<len(cells):
                try:
                    row={k:cells[i] for k,i in header.items()}
                    for k in ['quantity','unit_price','vat_rate']:
                        if k in row: row[k]=str(number(re.sub(r'€|EUR|HT|%','',row[k],flags=re.I)))
                    row['unit']='C62'
                    results.append(row)
                except (InvalidOperation,ValueError):
                    continue
    # CDI tables with a wrapped header: "Type de consultants / Nb jours / PU HT".
    if not results and re.search(r'nb\s+jours',p) and re.search(r'pu\s+ht',p):
        in_table=False
        row_pattern=re.compile(r'^(.+?)\s{2,}'+AMOUNT+r'\s{2,}'+AMOUNT+r'\s*(?:€|EUR)?\s{2,}'+AMOUNT+r'\s*(?:€|EUR)?\s*$',re.I)
        for raw in text.splitlines():
            normalized=plain(raw).strip()
            if re.search(r'nb\s+jours',normalized): in_table=True;continue
            if in_table and re.match(r'^(total|montant|tva)\b',normalized): break
            found=row_pattern.match(raw.strip()) if in_table else None
            if not found: continue
            description,qty,price,amount=found.groups()
            if not re.search(r'[A-Za-zÀ-ÿ]',description): continue
            quantity,unit_price=number(qty),number(price)
            if (quantity*unit_price).quantize(Decimal('.01'))!=number(amount): continue
            results.append(dict(description=clean(description),quantity=str(quantity),unit_price=str(unit_price),unit='DAY'))
    # Some CDI invoices print each day's quantity, daily price and subtotal
    # on separate labelled lines. Require their arithmetic to agree.
    if not results:
        block_lines=[clean(line) for line in re.sub(r'\.{2,}', ' ', text.replace('…','...')).splitlines() if line.strip()]
        for i,line in enumerate(block_lines):
            qty=re.fullmatch(r'nombre\s+de\s+jours\s*:\s*'+AMOUNT,plain(line))
            if not qty or i==0 or i+2>=len(block_lines): continue
            price=re.fullmatch(r'tarif\s+journalier\s*:\s*'+AMOUNT+r'\s*(?:€(?:uros?)?|euros?|eur)\s*h\.?\s*t\.?',plain(block_lines[i+1]))
            subtotal=re.fullmatch(r'sous[- ]total(?:\s+\d+)?\s*:\s*'+AMOUNT+r'\s*(?:€(?:uros?)?|euros?|eur)\s*h\.?\s*t\.?',plain(block_lines[i+2]))
            heading=re.fullmatch(r'[-–•]\s*(.+?)\s*[;:]?',block_lines[i-1])
            if not price or not subtotal or not heading: continue
            quantity,unit_price=number(qty.group(1)),number(price.group(1))
            if (quantity*unit_price).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)!=number(subtotal.group(1)): continue
            results.append(dict(description=heading.group(1).strip(' ;:'),quantity=str(quantity),unit_price=str(unit_price),unit='DAY'))
    for row in results:
        if vat_rate is not None and 'vat_rate' not in row:
            row['vat_rate']=vat_rate
        if 'vat_rate' in row:
            row['vat_category']='S' if Decimal(row['vat_rate'])>0 else 'Z'
    warnings=[]
    if results and net is not None:
        total=sum((Decimal(r['quantity'])*Decimal(r['unit_price'])).quantize(Decimal('.01'),rounding=ROUND_HALF_UP) for r in results)
        if total!=Decimal(net):
            warnings.append('Les lignes reconnues ne couvrent pas le total HT : vérifiez les quantités, prix et lignes manquantes.')
    if not results:
        warnings.append('Les lignes de facture n’ont pas pu être reconnues : complétez les prestations affichées sur le PDF.')
    return results,warnings


def extract_fields(text):
    lines = [clean(x) for x in text.splitlines() if x.strip()]
    # Printed dot leaders must not be confused with thousands separators in amounts.
    p = re.sub(r'\.{2,}', ' ', plain(text).replace('…','...'))
    inv={'currency':'EUR','type_code':'381' if re.search(r'^\s*avoir\s+(?:n|numero|\d)',p,re.M) else '380'}
    warnings=[]
    found=re.search(r'\b(?:facture|avoir)\s*(?:num[eé]ro|n[°ºo]?|#)\s*[:.\-]?\s*([^\r\n]+)',text,re.I)
    if found: inv['number']=clean(re.split(r'\s{3,}|\s+Date\s*:',found.group(1),flags=re.I)[0])
    dated=[]
    for line in lines:
        l=plain(line)
        if re.search(r'date\s*(?:de\s*)?(?:facture|emission|emission)?\s*:|\b(?:fait\s+a|le)\s+'+DATE,l):
            if not re.search(r'echeance|reglement|paiement|penalit|corrigee',l): dated.append(line)
    if not dated:
        dated=[line for line in lines if re.search(DATE,plain(line)) and not re.search(r'echeance|reglement|paiement|penalit|corrigee',plain(line))]
    if dated and read_date(dated[0]): inv['issue_date']=read_date(dated[0])
    inv.update(company_blocks(text))
    totals={}
    labels={'net':r'(?:montant\s+(?:(?:total|global)\s+)?|total\s*)(?:h\.?\s*t\.?|hors\s*taxes)(?:\s+de\s+la\s+situation)?', 'gross':r'(?:montant\s+(?:total\s+)?|total\s*)(?:t\.?\s*t\.?\s*c\.?|toutes\s*taxes)', 'due':r'(?:net\s*[aà]\s*payer|reste\s*[aà]\s*payer|solde\s*(?:[aà]\s*payer)?)'}
    for key,label in labels.items():
        found=re.search(label+r'\s*:?\s*'+AMOUNT,p)
        if found: totals[key]=money(found.group(1))
    rates=[]
    taxes=[]
    for found in re.finditer(r't\.?\s*v\.?\s*a\.?\s*\(?\s*('+r'\d+(?:[,.]\d+)?'+r')\s*%\s*\)?\s*:?\s*'+AMOUNT,p):
        rates.append(str(number(found.group(1))));taxes.append(number(found.group(2)))
    if taxes: totals['vat']=str(sum(taxes).quantize(Decimal('.01')))
    else:
        found=re.search(r'(?:total\s+)?t\.?v\.?a\.?\s*:\s*'+AMOUNT,p)
        if found: totals['vat']=money(found.group(1))
    vat_rate=rates[0] if len(set(rates))==1 else None
    if vat_rate is not None and 'net' in totals and 'vat' in totals:
        expected=(Decimal(totals['net'])*Decimal(vat_rate)/100).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)
        if expected!=Decimal(totals['vat']):
            warnings.append('TVA incohérente dans le PDF : '+totals['vat'].replace('.',',')+' € imprimés, contre '+str(expected).replace('.',',')+' € calculés à '+vat_rate.replace('.',',')+' % sur le HT. Vérifiez cet écart avant la conversion. Les montants retenus seront contrôlés.')
    inv['totals']=totals
    payment={}
    iban=re.search(r'\bIBAN\s*:?\s*([A-Z]{2}\d{2}[A-Z0-9 \t]+)',text,re.I)
    if iban: payment['iban']=re.sub(r'\s','',iban.group(1)).upper()
    bic=re.search(r'\bBIC\s*:?\s*([A-Z0-9]{8}(?:[A-Z0-9]{3})?)\b',text,re.I)
    if bic: payment['bic']=bic.group(1).upper()
    if payment.get('iban') or 'virement' in p: payment['means_code']='30'
    elif 'especes' in p: payment['means_code']='10'
    elif 'carte bancaire' in p: payment['means_code']='48'
    for line in lines:
        l=plain(line)
        if re.search(r'(?:conditions|date|delai|mode)\s*(?:de\s*)?(?:paiement|reglement)|paiement\s+par',l):
            payment['terms']=line.split(':',1)[-1].strip()
        if 'echeance' in l:
            value=read_date(l[l.index('echeance'):])
            if value: payment['due_date']=value
    if 'comptant' in p:
        payment['terms']='Comptant'
        if not payment.get('due_date') and inv.get('issue_date'): payment['due_date']=inv['issue_date']
    prepaid=re.search(r'(?:acompte\s*(?:verse|paye|recu)|deja\s*(?:paye|regle))\s*:?\s*'+AMOUNT,p)
    if prepaid: payment['prepaid']=money(prepaid.group(1))
    rounded=re.search(r'\barrondi\s+a\s*:?\s*'+AMOUNT,p)
    if rounded and 'gross' in totals:
        totals['rounding']=str(number(rounded.group(1))-Decimal(totals['gross']))
        if 'due' not in totals:
            totals['due']=str(number(rounded.group(1))-Decimal(payment.get('prepaid','0')))
    if 'gross' in totals and 'due' in totals:
        delta=Decimal(totals['gross'])+Decimal(totals.get('rounding','0'))-Decimal(totals['due'])
        if 'prepaid' not in payment:
            payment['prepaid']='0'
            if delta>0:
                warnings.append('Le montant à payer est inférieur au TTC. Aucun acompte n’est indiqué ; vérifiez la remise ou l’arrondi.')
    elif 'gross' in totals:
        totals['due']=str(Decimal(totals['gross'])-Decimal(payment.get('prepaid','0')))
        warnings.append('Le reste à payer est proposé à partir du TTC et des acomptes reconnus ; vérifiez les règlements déjà reçus.')
    inv['payment']=payment
    notes={}
    for line in lines:
        l=plain(line)
        if 'recouvrement' in l: notes['recovery']=line
        if 'penalit' in l: notes['penalties']=line
        if 'escompte' in l: notes['discount']=line
    obj=re.search(r'\bObjet\s*:\s*(.+?)(?:\n\s*\n|$)',text,re.S|re.I)
    if obj: notes['description']=clean(obj.group(1))
    inv['notes']=notes
    found=re.search(r'cadre\s+de\s+facturation\s*:\s*([SBM]1)\b',text,re.I)
    if found: inv['business_process']=found.group(1).upper()
    inv['lines'],line_warnings=read_lines(text,vat_rate,totals.get('net'))
    if len(inv['lines'])==1 and inv['lines'][0]['description'].lower() in ('prestation de','prestation','prestations de') and notes.get('description'):
        inv['lines'][0]['description']=notes['description']
    warnings.extend(line_warnings)
    if not inv.get('business_process') and inv['lines'] and all(r['unit'] in ('DAY','HUR','MON') for r in inv['lines']):
        inv['business_process']='S1'
        warnings.append('Le cadre « Prestations de services » est proposé à partir des unités reconnues ; confirmez-le.')
    code=re.search(r'(?:code\s+affaire|aff\.)\s*:\s*([^\r\n)]+)',text,re.I)
    references={'buyer_reference':r'reference\s+client','order_reference':r'(?:bon\s+de\s+commande|commande\s+n[°o]?)','contract_reference':r'(?:contrat|marche)\s*(?:n[°o]?)?'}
    for key,label in references.items():
        match=re.search(label+r'\s*:\s*([^\r\n]+)',text,re.I)
        if match: inv[key]=clean(match.group(1))
    order=re.search(r'\bbon\s+de\s+commande\s+n[°ºo]?\s*:?\s*([^\r\n]+)',text,re.I)
    if order: inv['order_reference']=clean(order.group(1))
    return inv,clean(code.group(1)) if code else None,vat_rate,warnings
