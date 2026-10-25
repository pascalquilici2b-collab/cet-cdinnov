"""Monthly employer cost: a printed total, otherwise gross + employer contributions.

Only labelled monthly figures are used. Employee deductions, taxable/net wages,
annual accumulations and individual contribution bases are never summed.
"""
import re
from .stamping_import import cents, key

AMOUNT = r'(?<![\w.,])(-?(?:\d{1,3}(?:[ .\u00a0\u202f]\d{3})+|\d+)[,.]\d{2})(?![\d.,%])'
ANNUAL = r'\b(?:cumul\w*|annuel\w*|annee|year|ytd|depuis janvier)\b'
MONTH = r'\b(?:mensuel\w*|mois|periode|month)\b'
TOTAL = r'(?:montant\s+)?(?:total\s+|mensuel\s+)?verse\s+par\s+l[’\x27 ]?employeur|(?:cout|couts)\s+(?:(?:total|global|mensuel)\s+)?(?:(?:pour|de)\s+l[’\x27 ]?)?employeur|(?:salaire|brut)\s+(?:brut\s+)?charge'
GROSS = r'(?:(?:total|montant|salaire)\s+(?:du\s+)?brut|remuneration\s+brute|brut\s+(?:mensuel|du\s+mois)|salaire\s+brut)'
EMPLOYER = r'(?:(?:total|montant)\s+(?:des\s+)?)?(?:(?:charges|cotisations)(?:\s+et\s+contributions)?\s+patronales|(?:charges|cotisations)(?:\s+et\s+contributions)?\s+(?:de\s+l[’\x27 ]?)?employeur|part\s+(?:patronale|employeur))'


def amounts(text):
    return [(m, cents(m[1])) for m in re.finditer(AMOUNT, text) if not re.match(r'\s*%',text[m.end():])]


def labelled(text, pattern):
    """Unambiguous labels with one amount on the same/next line only."""
    lines=text.splitlines();found=[];annual_section=False
    for i,line in enumerate(lines):
        normalized=key(line)
        if re.search(ANNUAL,normalized) and not amounts(normalized) and not re.search(MONTH,normalized):annual_section=True
        elif re.search(MONTH,normalized) and not re.search(ANNUAL,normalized):annual_section=False
        match=re.search(r'\b(?:'+pattern+r')\b',normalized)
        if not match or annual_section or re.search(ANNUAL,normalized):continue
        # A base/rate/employee-deduction line is not an employer-cost total.
        if re.search(r'\b(?:base|taux|imposable|net|salariales|salariale)\b',normalized[:match.start()]):continue
        tail=normalized[match.end():]
        if re.search(r'\b(?:base|taux|imposable|net|salariales|salariale)\b',tail):continue
        values=amounts(tail);evidence=line.strip()
        if not values and not re.search(r'\d',tail) and i+1<len(lines):
            next_line=key(lines[i+1])
            if re.fullmatch(r'[\d\s.,€eur:+-]+',next_line) and not re.search(ANNUAL,next_line):
                values=amounts(next_line);evidence+=' / '+lines[i+1].strip()
        if len(values)!=1:continue
        m,value=values[0]
        # Reject bare numbers after an unexplained label/column, rather than guessing.
        if re.sub(r'\b(?:du|mois|mensuel|mensuelle|total|totales|montant|en|eur)\b|[\s:;=€()\-]','',tail[:m.start()]):continue
        if value>=0:found.append({'amount_cents':value,'evidence':evidence})
    return found


def column_totals(text):
    """Read a monthly summary row when its columns are explicitly labelled."""
    lines=text.splitlines();result={'gross':[],'employer':[]}
    # Includes the other common columns so the count/position must match exactly.
    headers=r'(?P<gross>'+GROSS+r'|brut)|(?P<employer>'+EMPLOYER+r')|(?P<other>cotisations salariales|part salarie|charges salariales|net imposable|net fiscal|net a payer|plafond(?: securite sociale)?|heures(?: travaillees)?)'
    for i,line in enumerate(lines):
        normalized=key(line);matches=list(re.finditer(headers,normalized))
        if len(matches)<2 or amounts(normalized):continue
        if not any(m.lastgroup in result for m in matches):continue
        for raw in lines[i+1:i+4]:
            row=key(raw)
            if re.search(ANNUAL,row):continue
            if not re.search(MONTH,row):continue
            values=amounts(row)
            if len(values)!=len(matches):continue
            for m,(_,value) in zip(matches,values):
                if m.lastgroup in result and value>=0:result[m.lastgroup].append({'amount_cents':value,'evidence':line.strip()+' / '+raw.strip()})
    return result


def geometry_contributions(raw):
    """Resolve total contribution rows by the labelled employer column (native PDFs)."""
    import pymupdf
    found=[]
    with pymupdf.open(stream=raw,filetype='pdf') as doc:
        for page in doc:
            rows=[]
            for w in sorted(page.get_text('words'),key=lambda w:(round(w[3]/3),w[0])):
                row=next((r for r in reversed(rows[-4:]) if abs(r['y']-w[3])<3),None)
                if row is None:row={'y':w[3],'words':[]};rows.append(row)
                row['words'].append(w)
            header=None;annual_section=False
            for row in sorted(rows,key=lambda r:r['y']):
                words=sorted(row['words'],key=lambda w:w[0]);text=' '.join(w[4] for w in words);label=key(text)
                if re.search(ANNUAL,label) and not amounts(text) and not re.search(MONTH,label):annual_section=True
                elif re.search(MONTH,label) and not re.search(ANNUAL,label):annual_section=False
                if re.search(r'\b(?:part|cotisations|charges)\b',label) and not amounts(text):
                    employer=[w for w in words if re.fullmatch(r'employeur|patronal(?:es|e)?',key(w[4]))]
                    employee=[w for w in words if re.fullmatch(r'salarie|salarial(?:es|e)?',key(w[4]))]
                    if len(employer)==1 and employee:header={'y':row['y'],'x':(employer[0][0]+employer[0][2])/2,'left':(employee[-1][0]+employee[-1][2])/2}
                if not header or annual_section or row['y']-header['y']>480 or re.search(ANNUAL,label):continue
                if not re.search(r'\btotal\s+(?:des\s+)?(?:cotisations|charges)(?:\s+et\s+contributions)?\b',label):continue
                # Join number tokens separated by a narrow space, preserving their positions.
                cells=[]
                for w in words:
                    if cells and w[0]-cells[-1]['right']<7 and re.fullmatch(r'-?[\d .,:]+',cells[-1]['text']+' '+w[4]):
                        cells[-1]['text']+=' '+w[4];cells[-1]['right']=w[2]
                    else:cells.append({'text':w[4],'left':w[0],'right':w[2]})
                values=[]
                for cell in cells:
                    parsed=amounts(cell['text']);x=(cell['left']+cell['right'])/2
                    if len(parsed)==1 and abs(x-header['x'])<65 and abs(x-header['x'])<abs(x-header['left']):values.append(parsed[0][1])
                if len(values)==1 and values[0]>=0:found.append({'amount_cents':values[0],'evidence':text,'page':page.number+1})
    return found


def employer_cost(text, raw=None):
    printed=labelled(text,TOTAL)
    if printed:
        if len({v['amount_cents'] for v in printed})==1:return {**printed[0],'method':'printed_total'}
        return None
    # An explicit total with an ambiguous amount must be reviewed, not replaced
    # by a calculation which would conceal the ambiguity.
    if any(re.search(TOTAL,key(line)) and not re.search(ANNUAL,key(line)) for line in text.splitlines()):return None
    gross=labelled(text,GROSS);employer=labelled(text,EMPLOYER);columns=column_totals(text)
    gross+=columns['gross'];employer+=columns['employer']
    if raw and not employer:employer=geometry_contributions(raw)
    if len({v['amount_cents'] for v in gross})!=1 or len({v['amount_cents'] for v in employer})!=1:return None
    g,e=gross[0],employer[0]
    return {'amount_cents':g['amount_cents']+e['amount_cents'],'method':'gross_plus_employer',
            'components':{'gross_cents':g['amount_cents'],'employer_contributions_cents':e['amount_cents']},
            'evidence':g['evidence']+' + '+e['evidence']}
