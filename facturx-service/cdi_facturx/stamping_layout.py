"""Semantic layout proposals reference cells; only the original workbook supplies values."""
from datetime import date, datetime
import re

FIELDS = ['employee_ref', 'period', 'project_name', 'project_code', 'base_amount',
          'allocation_amount', 'supplier_ref', 'invoice_number', 'invoice_date']


def layout_sample(name, rows):
    cells = []
    for r, row in enumerate(rows[:80]):
        for c, cell in enumerate(row[:60]):
            value = cell.get('value')
            if value is None or not str(value).strip():
                continue
            if isinstance(value, (datetime, date)):
                kind, text = 'date', value.isoformat()[:10]
            elif isinstance(value, (int, float)):
                kind, text = 'number', '[nombre]'
            else:
                text = str(value).strip()
                kind = 'number' if re.fullmatch(r'(?:EUR\s*)?[\d\s.,€%+-]+(?:\s*EUR)?', text, re.I) else 'text'
                text = '[nombre]' if kind == 'number' else text[:220]
            cells.append({'cell':cell['cell'], 'row':r, 'column':c, 'kind':kind, 'text':text})
            if len(cells) >= 700:
                break
        if len(cells) >= 700:
            break
    return {'sheet':name, 'rows':len(rows), 'columns':max(map(len, rows), default=0), 'cells':cells}


def apply_layout(raw, filename, book, plan, category='RH'):
    from .stamping_import import normalize, key, identify_header
    if not isinstance(plan, dict) or set(plan)-{'sheet','orientation','header','headerRows','mapping','fixed','projects','carry'}:
        raise ValueError('Organisation de tableau invalide.')
    sheet = plan.get('sheet')
    if sheet not in book:
        raise ValueError('Feuille inconnue.')
    original = book[sheet]
    by_cell = {c['cell']:c for row in original for c in row}
    empty = {'value':None,'raw':'','cell':'','format':''}
    def reference(ref):
        if not isinstance(ref, dict) or set(ref) != {'cell','quote'}:
            raise ValueError('Référence de cellule invalide.')
        cell = by_cell.get(ref['cell'])
        quote = ref['quote']
        if not cell or not isinstance(quote,str) or not 1 <= len(quote) <= 300 or quote not in str(cell['value']):
            raise ValueError('Valeur absente de la cellule citée.')
        if cell.get('invalid') or cell.get('formula'):
            raise ValueError('Identifiant issu d’une cellule non textuelle.')
        return {**cell,'value':quote}
    orientation = plan.get('orientation')
    if orientation not in ['rows','columns']:
        raise ValueError('Orientation du tableau inconnue.')
    width = max(map(len,original),default=0)
    matrix = original if orientation == 'rows' else [[row[c] if c<len(row) else empty for row in original] for c in range(width)]
    header, depth = plan.get('header'), plan.get('headerRows',1)
    if type(header) is not int or type(depth) is not int or not 0<=header<100 or not 1<=depth<=3 or header+depth>=len(matrix):
        raise ValueError('En-tête de tableau invalide.')
    mapping, fixed, projects, carry = plan.get('mapping',{}),plan.get('fixed',{}),plan.get('projects',[]),plan.get('carry',[])
    if not isinstance(mapping,dict) or set(mapping)-set(FIELDS) or len(set(mapping.values()))!=len(mapping):
        raise ValueError('Correspondance de champs invalide ou ambiguë.')
    if any(type(c) is not int or not 0<=c<max(map(len,matrix),default=0) for c in mapping.values()):
        raise ValueError('Colonne inexistante.')
    if not isinstance(fixed,dict) or set(fixed)-{'employee_ref','period','project_name','project_code','supplier_ref','invoice_number'} or set(fixed)&set(mapping):
        raise ValueError('Contexte de tableau ambigu.')
    constants = {f:reference(ref) for f,ref in fixed.items()}
    if not isinstance(projects,list) or len(projects)>30 or (projects and ('project_name' in mapping or 'project_name' in fixed or 'allocation_amount' in mapping)):
        raise ValueError('Colonnes projet ambiguës.')
    if not isinstance(carry,list) or len(set(carry))!=len(carry) or set(carry)-{'employee_ref','period','project_name'} or set(carry)-set(mapping):
        raise ValueError('Regroupement invalide.')
    variants=[]
    for project in projects:
        if not isinstance(project,dict) or set(project)!={'source','amountColumn'} or type(project['amountColumn']) is not int:
            raise ValueError('Colonne projet invalide.')
        c=project['amountColumn']
        if not 0<=c<max(map(len,matrix),default=0) or c in mapping.values():
            raise ValueError('Colonne projet inexistante ou déjà utilisée.')
        variants.append((reference(project['source']), c))
    required = ['supplier_ref','invoice_number','project_name','allocation_amount'] if category=='SERVICES' else ['employee_ref','period','project_name','base_amount','allocation_amount']
    available=set(mapping)|set(constants)|({'project_name','allocation_amount'} if variants else set())
    if set(required)-available:
        raise ValueError('Agent, mois, projet, coût employeur et montant rendu compte doivent être identifiés.')
    def heading(column):
        return ' '.join(str(matrix[r][column]['value'] or '') for r in range(header,header+depth) if column<len(matrix[r]))
    money_columns=[mapping[f] for f in ['base_amount','allocation_amount'] if f in mapping]+[c for _,c in variants]
    if len(set(money_columns))!=len(money_columns) or any(not heading(c).strip() for c in money_columns):
        raise ValueError('Colonnes monétaires sans intitulé ou dupliquées.')
    for c in money_columns:
        label=heading(c);role,_=identify_header(label)
        expected='base_amount' if mapping.get('base_amount')==c else 'allocation_amount'
        plain=key(label)
        incomplete_cost=('brut' in plain and 'charg' not in plain and 'employeur' not in plain) or ('patronal' in plain and 'brut' not in plain and 'total' not in plain)
        if incomplete_cost or re.search(r'taxe|abattement|compensation|\bnet\b|%',plain) or (role and role!=expected):
            raise ValueError('Le coût employeur et le montant rendu compte ne doivent pas être confondus avec les taxes, les pourcentages ou le net payé.')
    canonical=[[{'value':f,'raw':f,'cell':'','format':''} for f in FIELDS]]
    previous={}
    for row in matrix[header+depth:]:
        if not any(c.get('value') not in [None,''] for c in row):
            previous={};continue
        def at(c):return row[c] if c<len(row) else empty
        data={f:at(c) for f,c in mapping.items()}
        # Ignore charges-only ledgers; never manufacture allocations from a rate.
        amounts=[at(c).get('value') for c in money_columns]
        if all(v in [None,''] for v in amounts):
            # A labelled month/agent heading may introduce the following block.
            for f in carry:
                if data[f].get('value') not in [None,'']:previous[f]=data[f]
            continue
        identities=[key(data.get(f,empty)['value']) for f in ['employee_ref','period','project_name','supplier_ref','invoice_number']]
        if any(re.match(r'^(?:sous[ -]?)?total\b',v) for v in identities):
            previous={};continue
        if all(key(at(c).get('value'))==key(heading(c)) for c in mapping.values()):
            previous={};continue
        # Month changes end a prior employee block; names never spill into a new month.
        if data.get('period',empty)['value'] not in [None,''] and data['period']['value']!=previous.get('period',empty)['value']:
            previous.pop('employee_ref',None)
        for f in carry:
            if data[f].get('value') not in [None,'']:previous[f]=data[f]
            elif f in previous:data[f]=previous[f]
        for project,c in variants or [(None,None)]:
            record={**data,**constants}
            if project:
                if at(c).get('value') in [None,'']:continue
                record.update(project_name=project,allocation_amount=at(c))
            canonical.append([record.get(f,empty) for f in FIELDS])
    if len(canonical)<2:
        raise ValueError('Aucune répartition complète reconnue.')
    config={'sheet':sheet,'header':0,'mapping':{f:i for i,f in enumerate(FIELDS)},'documentType':'INVOICE' if category=='SERVICES' else 'PAYSLIP','baseType':'ELIGIBLE_BASE' if category=='SERVICES' else 'EMPLOYER_COST','currency':'EUR','automatic':True,'keepIncomplete':True,'semanticLayout':plan}
    result=normalize(raw,filename,config,{sheet:canonical})
    if not result['groups']:
        raise ValueError('Aucune répartition reconnue.')
    return result


def resolve_layouts(raw,filename,plans,options=None):
    from .stamping_import import inspect, read_table, combine_inspections
    options=options or {}
    if not isinstance(plans,list) or not 1<=len(plans)<=8:
        raise ValueError('Propositions de lecture invalides.')
    if filename.lower().endswith('.pdf') and isinstance(options.get('page'),int):
        from .stamping_tables import pdf_tables
        book=pdf_tables(raw,options['page'])
    else:book=read_table(raw,filename)
    original=inspect(raw,filename,options,book)
    unresolved={c['sheet'] for c in original.get('layoutCandidates',[])}
    seen=set();parts=[];errors=[]
    for plan in plans:
        sheet=plan.get('sheet') if isinstance(plan,dict) else None
        if sheet not in unresolved or sheet in seen:
            raise ValueError('Feuille déjà reconnue ou proposition dupliquée.')
        seen.add(sheet)
        try:
            imported=apply_layout(raw,filename,book,plan,options.get('category','RH'))
            parts.append({**original,'sheets':[],'suggestedImport':imported})
        except (ValueError,TypeError,KeyError) as exc:
            errors.append({'sheet':sheet,'row':0,'message':str(exc)})
    resolved=seen-{e['sheet'] for e in errors}
    if original.get('suggestedImport'):
        original['suggestedImport']['errors']=[e for e in original['suggestedImport']['errors'] if e.get('sheet') not in resolved]
    errors.extend({'sheet':s,'row':0,'message':'Organisation à préciser pour cette feuille.'} for s in unresolved-seen)
    combined=combine_inspections([original,*parts])
    if combined['suggestedImport']:
        combined['suggestedImport']['errors'].extend(errors)
        combined['suggestedImport']['mapping']={'automatic':True,'semantic':True}
    combined['layoutIssues']=errors
    return combined
