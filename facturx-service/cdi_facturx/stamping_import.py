"""Read-only allocation import. All accounting arithmetic uses integer cents/Decimal."""
import csv
import hashlib
import io
import json
import re
import zipfile
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

FIELDS = ['document_type', 'document_ref', 'period', 'employee_ref', 'invoice_number',
          'invoice_date', 'supplier_ref', 'project_name', 'project_code', 'programme',
          'base_amount', 'base_type', 'allocation_percent', 'allocation_amount', 'currency']
ALIASES = {'type': 'document_type', 'reference': 'document_ref', 'mois': 'period',
           'matricule': 'employee_ref', 'salarie': 'employee_ref', 'fournisseur': 'supplier_ref',
           'numero facture': 'invoice_number', 'date facture': 'invoice_date', 'projet': 'project_name',
           'montant': 'allocation_amount', 'pourcentage': 'allocation_percent', 'taux': 'allocation_percent',
           'cout employeur': 'base_amount', 'assiette': 'base_amount', 'devise': 'currency'}

def key(value):
    import unicodedata
    return re.sub(r'\s+', ' ', ''.join(c for c in unicodedata.normalize('NFKD', str(value or ''))
                                      if not unicodedata.combining(c))).strip().casefold()

def decimal(value):
    text = str(value).strip().replace('\u00a0', '').replace('\u202f', '').replace(' ', '')
    text = re.sub(r'(?:EUR|€|%)$', '', text, flags=re.I).strip()
    if ',' in text:
        if text.count(',') != 1 or ('.' in text and not re.fullmatch(r'-?\d{1,3}(?:\.\d{3})+,\d{1,2}', text)):
            raise ValueError('Nombre ambigu.')
        text = text.replace('.', '').replace(',', '.')
    if not re.fullmatch(r'-?\d+(?:\.\d+)?', text):
        raise ValueError('Nombre invalide.')
    result = Decimal(text)
    if not result.is_finite() or abs(result) > Decimal('1000000000'):
        raise ValueError('Nombre hors limites.')
    return result

def cents(value):
    number = decimal(value) * 100
    if number != number.to_integral_value():
        raise ValueError('Montant avec plus de deux décimales.')
    return int(number)

def percent(value, fmt='', mode='points'):
    number = decimal(value)
    if '%' in fmt or (mode == 'fraction' and '%' not in str(value)):
        number *= 100
    if not 0 <= number <= 100:
        raise ValueError('Pourcentage hors limites.')
    return number

def month(value):
    if isinstance(value, (datetime, date)):
        return value.strftime('%Y-%m')
    value = str(value or '').strip()
    if re.fullmatch(r'\d{4}-(?:0[1-9]|1[0-2])', value):
        return value
    found = re.fullmatch(r'(0?[1-9]|1[0-2])[/.-](\d{4})', value)
    if found:
        return f'{found[2]}-{int(found[1]):02d}'
    names={'janvier':1,'fevrier':2,'mars':3,'avril':4,'mai':5,'juin':6,'juillet':7,'aout':8,'septembre':9,'octobre':10,'novembre':11,'decembre':12,'gennaio':1,'febbraio':2,'marzo':3,'aprile':4,'maggio':5,'giugno':6,'luglio':7,'agosto':8,'settembre':9,'ottobre':10,'novembre':11,'dicembre':12}
    named=re.fullmatch(r'([a-z]+)\s+(\d{4})',key(value))
    if named and named[1] in names:return f'{named[2]}-{names[named[1]]:02d}'
    raise ValueError('Période attendue au format AAAA-MM.')

def read_table(raw, filename):
    if len(raw) > 5 * 1024 * 1024:
        raise ValueError('Tableau limité à 5 Mo.')
    if filename.lower().endswith('.csv'):
        text = raw.decode('utf-8-sig', errors='strict')
        delimiter = ';' if text.partition('\n')[0].count(';') >= text.partition('\n')[0].count(',') else ','
        data = list(csv.reader(io.StringIO(text), delimiter=delimiter))
        if len(data) > 5001 or any(len(r) > 100 for r in data):
            raise ValueError('Limite : 5 000 lignes et 100 colonnes.')
        return {'CSV': [[{'value': v, 'raw': v, 'format': '', 'cell': f'{column(i+1)}{j+1}'} for i, v in enumerate(r)] for j, r in enumerate(data)]}
    if not filename.lower().endswith('.xlsx') or raw[:2] != b'PK':
        raise ValueError('Utilisez un fichier XLSX ou CSV UTF-8.')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        if len(entries) > 1500 or sum(e.file_size for e in entries) > 30 * 1024 * 1024:
            raise ValueError('Classeur décompressé trop volumineux.')
        if any('vbaproject' in e.filename.lower() or e.flag_bits & 1 for e in entries):
            raise ValueError('Macros et archives chiffrées refusées.')
    from openpyxl import load_workbook
    values = load_workbook(io.BytesIO(raw), read_only=False, data_only=True, keep_links=False)
    formulas = load_workbook(io.BytesIO(raw), read_only=False, data_only=False, keep_links=False)
    out = {}
    if len(values.worksheets) > 25:
        raise ValueError('Maximum 25 feuilles.')
    for sheet in values:
        if sheet.max_row > 5001 or sheet.max_column > 100:
            raise ValueError('Limite : 5 000 lignes et 100 colonnes par feuille.')
        rows = []
        for row in sheet:
            cells = []
            for cell in row:
                formula = formulas[sheet.title][cell.coordinate]
                cells.append({'value': cell.value, 'raw': str(formula.value or ''), 'format': cell.number_format,
                              'cell': cell.coordinate, 'formula': formula.data_type == 'f',
                              'invalid': cell.data_type == 'e' or (formula.data_type == 'f' and cell.value is None)})
            rows.append(cells)
        # A merged value belongs only to its explicit merge, never to a neighbouring block.
        for merged in sheet.merged_cells.ranges:
            if merged.min_col == merged.max_col:
                source = rows[merged.min_row-1][merged.min_col-1]
                for r in range(merged.min_row, merged.max_row):
                    rows[r][merged.min_col-1] = {**source, 'inherited': True}
        out[sheet.title] = rows
    values.close(); formulas.close()
    return out

def column(n):
    out = ''
    while n:
        n, k = divmod(n-1, 26); out = chr(65+k) + out
    return out

def inspect(raw, filename):
    book = read_table(raw, filename)
    sheets = []
    for name, rows in book.items():
        best = max(range(min(20, len(rows))), key=lambda n: sum(key(c['value']) in FIELDS or key(c['value']) in ALIASES for c in rows[n]), default=0)
        mapping = {}
        for n, c in enumerate(rows[best] if rows else []):
            field = ALIASES.get(key(c['value']), key(c['value']))
            if field in FIELDS: mapping[field] = n
        sheets.append({'name': name, 'rows': len(rows), 'header': best, 'mapping': mapping,
                       'preview': [[str(c['value'] if c['value'] is not None else '')[:220] for c in r] for r in rows[:30]]})
    return {'sheets': sheets, 'fields': FIELDS, 'sha256': hashlib.sha256(raw).hexdigest()}

def normalize(raw, filename, config):
    book = read_table(raw, filename)
    sheet = config.get('sheet', next(iter(book)))
    if sheet not in book: raise ValueError('Feuille introuvable.')
    rows = book[sheet]; mapping = config.get('mapping', {})
    header = config.get('header', 0)
    if not isinstance(header, int) or not 0 <= header < len(rows): raise ValueError('En-tête invalide.')
    if any(k not in FIELDS or not isinstance(v, int) or not 0 <= v < 100 for k,v in mapping.items()):
        raise ValueError('Correspondance invalide.')
    groups = {}; errors = []; warnings = []; prior = {}; prior_cells = {}; source_hash = hashlib.sha256(raw).hexdigest()
    excluded = config.get('excludedRows', [])
    if excluded and not str(config.get('exclusionReason', '')).strip(): raise ValueError('Justifiez les lignes exclues.')
    wide = config.get('projects', [])
    if len(wide) > 60: raise ValueError('Maximum 60 colonnes projet.')
    for index, cells in enumerate(rows[header+1:], header+2):
        if index in excluded: continue
        if not any(c['value'] is not None and str(c['value']).strip() for c in cells):
            prior = {}; prior_cells = {}; continue
        def cell(field):
            n = mapping.get(field)
            return cells[n] if n is not None and n < len(cells) else {'value': None, 'format': '', 'cell': '', 'raw': ''}
        def present(value):
            return None if isinstance(value,str) and not value.strip() else value
        data = {f: present(cell(f)['value']) for f in FIELDS}
        source_cells = {f:cell(f) for f in mapping}
        if config.get('grouped'):
            identity_fields = ['document_type','document_ref','period','employee_ref','invoice_number','invoice_date','supplier_ref','base_amount','base_type','currency']
            # Any new identifier starts a block. No inheritance across an empty separator.
            changed = any(data[f] is not None and data[f] != prior.get(f) for f in ['document_ref','period','employee_ref','invoice_number','supplier_ref'])
            if changed: prior = {}; prior_cells = {}
            for f in identity_fields:
                if data[f] is not None: prior[f] = data[f]; prior_cells[f] = cell(f)
                else:
                    data[f] = prior.get(f)
                    if f in prior_cells: source_cells[f] = prior_cells[f]
        variants = wide or [None]
        for project in variants:
            try:
                current = dict(data); amount_cell = cell('allocation_amount'); rate_cell = cell('allocation_percent')
                if project:
                    current['project_name'] = project['name']
                    n = project.get('amountColumn'); p = project.get('percentColumn')
                    amount_cell = cells[n] if isinstance(n,int) and 0 <= n < len(cells) else {'value':None,'cell':'','raw':''}
                    rate_cell = cells[p] if isinstance(p,int) and 0 <= p < len(cells) else {'value':None,'cell':'','raw':'','format':''}
                    current['allocation_amount'] = present(amount_cell['value']); current['allocation_percent'] = present(rate_cell['value'])
                    if current['allocation_amount'] is None and current['allocation_percent'] is None: continue
                # Group title rows are not allocations. They may establish the explicitly selected block.
                if not current['project_name'] and config.get('grouped') and current['allocation_amount'] is None: continue
                used = list(source_cells.values()) + [amount_cell, rate_cell]
                if any(c.get('invalid') for c in used): raise ValueError('Cellule en erreur ou formule sans valeur enregistrée.')
                if any(c.get('formula') for c in used): warnings.append('Formules : valeurs enregistrées utilisées, à confirmer dans Excel.')
                dtype = str(current['document_type'] or config.get('documentType') or '').upper()
                dtype = {'PAIE':'PAYSLIP','BULLETIN':'PAYSLIP','FACTURE':'INVOICE'}.get(dtype, dtype)
                if dtype not in ['PAYSLIP','INVOICE']: raise ValueError('Type de pièce requis.')
                period = month(current['period']) if current['period'] else ''
                if dtype == 'PAYSLIP' and not period: raise ValueError('Mois de paie requis.')
                name = str(current['project_name'] or '').strip()
                if not name or len(name) > 300: raise ValueError('Nom de projet requis (300 caractères maximum).')
                currency = str(current['currency'] or config.get('currency') or '').upper()
                if currency != 'EUR': raise ValueError('Devise EUR à confirmer. Autres devises non prises en charge.')
                base = cents(current['base_amount']) if current['base_amount'] is not None and current['base_amount'] != '' else None
                base_type = str(current['base_type'] or ('EMPLOYER_COST' if dtype=='PAYSLIP' else config.get('baseType',''))).upper()
                if base_type not in ['EMPLOYER_COST','HT','TTC','ELIGIBLE_BASE']: raise ValueError('Assiette à préciser (HT, TTC, coût employeur, éligible).')
                if dtype=='PAYSLIP' and base_type!='EMPLOYER_COST': raise ValueError('La paie doit utiliser le coût employeur.')
                rate = percent(current['allocation_percent'],rate_cell.get('format',''),config.get('percentMode','points')) if current['allocation_percent'] not in [None,''] else None
                calculated = current['allocation_amount'] in [None,'']
                if calculated:
                    if not config.get('allowCalculation') or rate is None or base is None: raise ValueError('Montant absent : calcul au pourcentage non autorisé ou base absente.')
                    amount = int((Decimal(base)*rate/100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
                else: amount = cents(current['allocation_amount'])
                if amount < 0 or (base is not None and base <= 0): raise ValueError('Montants négatifs et assiettes nulles non autorisés.')
                identity = {f:str(current[f] or '').strip() for f in ['document_ref','employee_ref','invoice_number','supplier_ref','invoice_date']}
                if isinstance(current['invoice_date'],(datetime,date)): identity['invoice_date']=current['invoice_date'].strftime('%Y-%m-%d')
                if identity['invoice_date']: date.fromisoformat(identity['invoice_date'])
                if dtype=='PAYSLIP' and not identity['employee_ref']: raise ValueError('Matricule ou référence salarié requis.')
                if dtype=='INVOICE' and (not identity['invoice_number'] or not identity['supplier_ref']): raise ValueError('Numéro facture et référence fournisseur requis.')
                gid = hashlib.sha256(json.dumps([dtype,period,identity],sort_keys=True).encode()).hexdigest()[:24]
                g = groups.setdefault(gid, {'id':gid, 'document_type':dtype,'period':period,**identity,'currency':currency,'base_amount_cents':base,'base_type':base_type,'allocations':[],'errors':[]})
                if g['base_amount_cents']!=base or g['base_type']!=base_type: g['errors'].append('Assiettes différentes dans un même groupe.')
                if any(key(a['project'])==key(name) for a in g['allocations']): g['errors'].append('Projet présent plusieurs fois : vérifier les doublons.')
                g['allocations'].append({'id':f'{index}-{len(g["allocations"])}','project':name,'code':str(current['project_code'] or ''),'programme':str(current['programme'] or ''),'amount_cents':amount,'percent':str(rate) if rate is not None else None,'calculated':calculated,
                  'source':{'file':filename,'sha256':source_hash,'sheet':sheet,'row':index,'cell':amount_cell['cell'] if not calculated else rate_cell['cell'],'raw':str(amount_cell.get('raw','')),'rule':'ROUND_HALF_UP' if calculated else 'EXACT','fields':{f:{'cell':c['cell'],'raw':str(c['raw'])} for f,c in source_cells.items()}}})
            except (ValueError,InvalidOperation,KeyError,TypeError) as exc:
                errors.append({'row':index,'message':str(exc) or 'Ligne invalide.'})
    for group in groups.values():
        group['total_cents'] = sum(a['amount_cents'] for a in group['allocations'])
        group['remainder_cents'] = None if group['base_amount_cents'] is None else group['base_amount_cents']-group['total_cents']
        if group['remainder_cents'] is not None and group['remainder_cents']<0: group['errors'].append('Total supérieur à l’assiette.')
        rates=[a['percent'] for a in group['allocations']]
        group['rounding_cents']=None
        if all(r is not None for r in rates) and group['base_amount_cents'] is not None:
            rate=sum(Decimal(r) for r in rates)
            if rate>100: group['errors'].append('Pourcentages supérieurs à 100 %.')
            group['rounding_cents']=group['total_cents']-int((Decimal(group['base_amount_cents'])*rate/100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
    return {'groups':list(groups.values()),'errors':errors,'warnings':list(dict.fromkeys(warnings)), 'source_sha256':source_hash,'mapping':config}
