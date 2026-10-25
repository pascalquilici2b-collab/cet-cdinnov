"""Non-destructive stamping, conservative geometry and independent visual verification.

No AI/network calls. PDFium is serialised by the API's isolated subprocess.
All coordinates exposed by this module are PDF points from the visible top left.
"""
import base64
from collections import Counter
import hashlib
import hmac
import json
import os
import io
import math
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageChops, ImageDraw
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from .stamping_import import cents, key, month
from .stamping_payroll import employer_cost

VERSION = 'stamping-2.3-20261025'
FONT = 'CDIStamp'
BOLD = 'CDIStampBold'
pdfmetrics.registerFont(TTFont(FONT, str(Path(__file__).parent/'assets/fonts/Montserrat-Regular.ttf')))
pdfmetrics.registerFont(TTFont(BOLD, str(Path(__file__).parent/'assets/fonts/Montserrat-Bold.ttf')))

def digest(raw): return hashlib.sha256(raw).hexdigest()
def money(n): return f'{n//100:,}'.replace(',', ' ') + f',{n%100:02d} €'

class StampError(ValueError):
    def __init__(self, code, message):
        super().__init__(message); self.code = code

def open_source(raw):
    if len(raw)>20*1024*1024 or not raw.startswith(b'%PDF-'):
        raise StampError('INVALID_PDF','PDF invalide ou supérieur à 20 Mo.')
    try:
        reader = PdfReader(io.BytesIO(raw), strict=True)
        if reader.is_encrypted:
            raise StampError('SIGNED_OR_RESTRICTED_PDF','PDF chiffré : utiliser une source non verrouillée.')
        if not 1 <= len(reader.pages) <= 30:
            raise StampError('INVALID_PDF','PDF limité à 30 pages.')
        root=reader.trailer['/Root']
        if root.get('/Perms') or any(v.get('/FT')=='/Sig' for v in (reader.get_fields() or {}).values()):
            raise StampError('SIGNED_OR_RESTRICTED_PDF','PDF signé ou champ de signature : aucune modification automatique.')
        if root.get('/OpenAction') or root.get('/AA') or '/JavaScript' in root.get('/Names',{}):
            raise StampError('ACTIVE_PDF','Actions actives dans le PDF : fournir une copie statique.')
        if (reader.metadata or {}).get('/CDIStampVersion'):
            raise StampError('ALREADY_STAMPED','Cette copie a déjà été tamponnée. Utilisez son original.')
        for page in reader.pages:
            if page.get('/AA') or float(page.get('/UserUnit',1))!=1:
                raise StampError('UNSUPPORTED_PDF','Géométrie ou actions PDF non prises en charge.')
            for ann in page.get('/Annots',[]):
                a=ann.get_object()
                if a.get('/FT')=='/Sig' or a.get('/AA') or a.get('/A',{}).get('/S')=='/JavaScript':
                    raise StampError('SIGNED_OR_RESTRICTED_PDF','Signature ou action active détectée.')
            if max(float(page.mediabox.width),float(page.mediabox.height))>2000:
                raise StampError('INVALID_PDF','Page trop grande pour un contrôle sûr.')
        return reader
    except StampError: raise
    except Exception as exc:
        raise StampError('INVALID_PDF','Le PDF ne peut pas être lu.') from exc

def canonical(reader):
    writer=PdfWriter(clone_from=reader)
    for page in writer.pages:
        if page.rotation: page.transfer_rotation_to_content()
    out=io.BytesIO();writer.write(out)
    return writer,out.getvalue()

def render_page(page,scale=1):
    bitmap=page.render(scale=scale,draw_annots=True)
    try: return bitmap.to_pil().convert('RGB').copy()
    finally: bitmap.close()

def local_ocr(image):
    binary=shutil.which('tesseract')
    if not binary: return '', 'OCR_UNAVAILABLE'
    with tempfile.TemporaryDirectory(prefix='cdi-stamp-') as folder:
        source=Path(folder)/'page.png';image.save(source)
        try:
            done=subprocess.run([binary,str(source),'stdout','-l','fra+eng+ita','--psm','3'],capture_output=True,timeout=25,check=True)
            return done.stdout.decode('utf-8',errors='replace'),''
        except (subprocess.TimeoutExpired,subprocess.CalledProcessError): return '', 'OCR_FAILED'

def evidence_lines(text):
    # Whitelist short identification/control lines. Addresses, NIR and bank data are omitted.
    result=[]
    for n,line in enumerate(text.splitlines()):
        if re.search(r'\b(?:NIR|IBAN|BIC|sécurité sociale|securite sociale|adresse)\b',line,re.I): continue
        line=re.sub(r'(?<!\d)[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}(?:\s?\d{2})?(?!\d)','[identifiant retiré]',line)
        if re.search(r'\b(?:Madame|Monsieur|Mme|Mlle)\b|nom.*pr[ée]nom|bulletin|paie|période|periode|matricule|salari[ée]|facture|fournisseur|siret|total.*(?:employeur|HT|TTC)|coût employeur|cout employeur|r[ée]f[ée]rence|\bdate\b',line,re.I):
            result.append({'line':n,'text':line[:220]})
    return result[:60]

def extract_fields(text):
    fields={}; proofs={}
    specs={
      # A contribution column called « Part salarié » is not a person's name.
      'employee_name':r"(?:\b(?:Madame|Monsieur|Mme|Mlle)\.?[ \t]+|(?:^|[\r\n])[ \t]*(?:nom et pr[ée]nom|salari[ée])[ \t]*:[ \t]*)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '’\-]{3,100})",
      'employee_ref':r'(?:matricule|référence salarié|reference salarie)\s*[:#]?\s*([\w./-]+)',
      'invoice_number':r'facture\s*(?:n[°ºo.]|numéro|numero|number|#|:)\s*[:.]?\s*([\w./-]+)',
      'supplier_ref':r'(?:référence fournisseur|reference fournisseur|fournisseur|SIRET)\s*:\s*([\w .-]+)',
      'document_ref':r'(?:référence document|reference document|document_ref)\s*:\s*([\w./-]+)',
      'period':r'(?:période|periode|mois)\s*:\s*(\d{4}-(?:0[1-9]|1[0-2]))',
      'invoice_date':r'(?:date facture|date de facture|date)\s*:\s*(\d{4}-\d{2}-\d{2})',
    }
    for field,pattern in specs.items():
        matches=list(re.finditer(pattern,text,re.I))
        values={m[1].strip() for m in matches}
        if len(values)==1: fields[field]=next(iter(values));proofs[field]=matches[0][0]
    periods=[]
    for match in re.finditer(r'(?:période|periode|mois)\s*(?::|du)\s*([^\r\n]+)',text,re.I):
        candidate=match[1].strip()
        try:
            dates=re.findall(r'\b(\d{2})/(\d{2})/(\d{4})\b',candidate)
            if dates:
                from datetime import date
                months={date(int(y),int(m),int(d)).strftime('%Y-%m') for d,m,y in dates}
                value=next(iter(months)) if len(months)==1 else None
            else:value=month(candidate)
            if value:periods.append((value,match[0]))
        except ValueError:pass
    if periods and len({v for v,_ in periods})==1:fields['period']=periods[0][0];proofs['period']=periods[0][1]
    elif periods:fields.pop('period',None);proofs.pop('period',None)
    payroll=bool(re.search(r'bulletin.{0,15}(?:paie|salaire)',text,re.I))
    invoice=bool(re.search(r'\bfacture\b',text,re.I)) and not re.search(r'pro\s*forma|\bdevis\b|\bavoir\b|\brectificatif\b',text,re.I)
    if payroll!=invoice: fields['document_type']='PAYSLIP' if payroll else 'INVOICE'
    bases={}
    for kind,label in [('HT',r'(?:total\s+HT|total hors taxes)'),('TTC',r'(?:total\s+TTC|total toutes taxes comprises)')]:
        found=list(re.finditer(label+r'\s*[:]?\s*(\d[\d \u00a0\u202f]*[,.]\d{2})(?:\s*(?:€|EUR))?',text,re.I))
        vals={cents(m[1]) for m in found}
        if len(vals)==1: bases[kind]={'amount_cents':next(iter(vals)),'evidence':found[0][0]}
    if payroll:
        cost=employer_cost(text)
        if cost:bases['EMPLOYER_COST']=cost
    return {'fields':fields,'proofs':proofs,'bases':bases}

def extract(raw):
    reader=open_source(raw); _,normal=canonical(reader); pages=[];texts=[]; warnings=[]
    with pdfium.PdfDocument(normal) as pdf:
        for i,page in enumerate(pdf):
            textpage=page.get_textpage()
            text=textpage.get_text_range(); textpage.close()
            method='text'
            if len(text.strip())<15:
                image=render_page(page,2)
                text,error=local_ocr(image);image.close();method='ocr'
                if error: warnings.append(f'Page {i+1} : {error}')
            pages.append({'width':page.get_width(),'height':page.get_height(),'method':method})
            texts.append(text);page.close()
    text='\n'.join(texts)
    fields=extract_fields(text)
    if fields['fields'].get('document_type')=='PAYSLIP' and 'EMPLOYER_COST' not in fields['bases']:
        cost=employer_cost(text,normal)
        if cost:fields['bases']['EMPLOYER_COST']=cost
    return {**fields,'pages':pages,'warnings':warnings,'evidence':evidence_lines(text),'source_sha256':digest(raw),'algorithm':VERSION,'ocr':any(p['method']=='ocr' for p in pages)}

def sourced_ai(reading,suggestions):
    fields=dict(reading['fields']);proofs=dict(reading['proofs'])
    # Suggestions are identification only. No allocation, amount or programme is accepted.
    allowed={'employee_ref','employee_name','supplier_ref','invoice_number','document_ref','period','invoice_date'}
    for item in suggestions[:10]:
        if not isinstance(item,dict) or set(item)!={'field','value','quote'}: continue
        f=item['field'];v=item['value'];q=item['quote']
        if f not in allowed or not isinstance(v,str) or not isinstance(q,str) or not 1<=len(v)<=120: continue
        if key(v) not in key(q) or not any(key(q) in key(e['text']) for e in reading['evidence']): continue
        if f=='period':
            try:v=month(v)
            except ValueError:continue
        if f not in fields: fields[f]=v;proofs[f]=q
    return {**reading,'fields':fields,'proofs':proofs}

def same_employee(a,b):
    def tokens(value):return re.findall(r"[a-z]+",key(value))
    left,right=tokens(a),tokens(b)
    return len(left)>=2 and sorted(left)==sorted(right)


def identity_matches(reading,groups):
    fields=reading['fields']; matches=[]
    for g in groups:
        if g['document_type']!=fields.get('document_type'): continue
        required=['employee_ref','period'] if g['document_type']=='PAYSLIP' else ['supplier_ref','invoice_number']
        if all(key(fields.get(f))==key(g.get(f)) and fields.get(f) for f in required): matches.append(g)
        elif g['document_type']=='PAYSLIP' and fields.get('period')==g.get('period') and same_employee(fields.get('employee_name',''),g.get('employee_ref','')):matches.append(g)
    return matches


def select_group(reading,groups,choice=None):
    fields=reading['fields'];matches=identity_matches(reading,groups)
    selected=next((g for g in groups if g['id']==choice.get('groupId')),None) if choice else (matches[0] if len(matches)==1 else None)
    if choice and (not choice.get('identityConfirmed') or len(choice.get('reason','').strip())<5):
        raise StampError('REVIEW_REQUIRED','Confirmez l’identité de la pièce et justifiez le rapprochement manuel.')
    if selected is None: raise StampError('REVIEW_REQUIRED','Aucun rapprochement unique. Choisissez le groupe après vérification de l’identité.')
    conflicts=[f for f in ['period','employee_ref','supplier_ref','invoice_number','invoice_date','document_type'] if fields.get(f) and selected.get(f) and key(fields[f])!=key(selected[f])]
    if 'employee_ref' in conflicts and same_employee(fields.get('employee_name',''),selected.get('employee_ref','')):conflicts.remove('employee_ref')
    if conflicts and not choice: raise StampError('REVIEW_REQUIRED','Divergence : '+', '.join(conflicts))
    if selected['errors']: raise StampError('INVALID_ALLOCATION','; '.join(selected['errors']))
    total=sum(a['amount_cents'] for a in selected['allocations'])
    base=reading['bases'].get(selected['base_type'],{}).get('amount_cents')
    if selected['base_type']=='ELIGIBLE_BASE': base=None
    if choice and choice.get('baseConfirmed'):
        verified=cents(choice.get('baseAmount',''))
        if base is not None and base!=verified: raise StampError('BASE_MISMATCH','La base saisie contredit le montant extrait du PDF.')
        base=verified
    if base is None: raise StampError('BASE_REQUIRED','Salaire brut chargé à vérifier : total versé par l’employeur ou salaire brut + charges patronales du mois.' if selected['base_type']=='EMPLOYER_COST' else 'Assiette du document à vérifier et confirmer manuellement.')
    if selected['base_amount_cents'] is not None and selected['base_amount_cents']!=base:
        raise StampError('BASE_MISMATCH','L’assiette du tableau diffère du PDF.')
    if total>base: raise StampError('OVER_ALLOCATION','Les imputations dépassent l’assiette vérifiée.')
    return selected,base,conflicts

def wrap(text,width,size,font=FONT):
    lines=[];line=''
    for word in str(text).replace('\n',' ').split():
        candidate=(line+' '+word).strip()
        if pdfmetrics.stringWidth(candidate,font,size)<=width:line=candidate;continue
        if line:lines.append(line);line=''
        for char in word:
            if line and pdfmetrics.stringWidth(line+char,font,size)>width:lines.append(line);line=''
            line+=char
    if line:lines.append(line)
    return lines or ['']


def layout(allocations,width=180,size=5,header='Dépense imputée aux projets suivants',show_total=False):
    if not 5<=size<=12 or not 150<=width<=500: raise StampError('INVALID_LAYOUT','Largeur 150–500 points ; police 5–12 points.')
    title_size=5.6 if size==5 else size+.6
    title=wrap(header,width-16,title_size,BOLD);top=9+len(title)*(title_size+2)+4
    rows=[]
    # Keep projects and amounts in adjacent columns, even when a wider box is chosen.
    columns=1;stacked=False;padding=8;gap=8
    amount_width=max(pdfmetrics.stringWidth('Montant : '+money(a['amount_cents']),FONT,size) for a in allocations)
    project_width=min(max(pdfmetrics.stringWidth(f'Projet {n+1} : '+a['project'],FONT,size) for n,a in enumerate(allocations)),width-2*padding-gap-amount_width)
    content_width=project_width+gap+amount_width
    left=(width-content_width)/2
    for n,a in enumerate(allocations):
        prefix=f'Projet {n+1} : '
        amount='Montant : '+money(a['amount_cents'])
        text=wrap(prefix+a['project'],project_width,size)
        h=max(1,len(text))*(size+3)+6
        rows.append({'allocation':a,'lines':text,'amounts':[amount],'y':top,'height':h,'column':0})
        top+=h
    height=top+6
    return {'width':width,'height':height,'size':size,'title_size':title_size,'title':title,'rows':rows,'total':sum(a['amount_cents'] for a in allocations),'show_total':False,'columns':columns,'stacked':stacked,'left':left,'amount_right':left+content_width,'column_gap':gap}

def rect_overlap(a,b,margin=0):
    return a[0]<b[2]+margin and a[2]>b[0]-margin and a[1]<b[3]+margin and a[3]>b[1]-margin

def occupancy(page,source_page,image):
    w,h=image.size
    # Any pixel that is not nearly white is occupied. Includes scans, logos and hairlines.
    mask=ImageChops.difference(image,Image.new('RGB',(w,h),'white')).convert('L').point(lambda p:255 if p>5 else 0)
    draw=ImageDraw.Draw(mask);left=float(source_page.cropbox.left);top=float(source_page.cropbox.top)
    bounds=[]
    for obj in page.get_objects(max_depth=8):
        l,b,r,t=obj.get_bounds();rect=(l-left,top-t,r-left,top-b)
        # A scan covering the page is segmented by its visible pixels; smaller images are protected as a whole.
        fullimage=obj.type==pdfium.raw.FPDF_PAGEOBJ_IMAGE and (r-l)*(t-b)>page.get_width()*page.get_height()*.8
        if not fullimage and r>l and t>b:
            bounds.append(rect);draw.rectangle(rect,fill=255)
    for ann in source_page.get('/Annots',[]):
        a=ann.get_object();r=a.get('/Rect')
        if r:bounds.append((float(r[0])-left,top-float(r[3]),float(r[2])-left,top-float(r[1])))
    for r in bounds:draw.rectangle(r,fill=255)
    return mask,bounds

def safe(mask,x,y,width,height,margin=7):
    if any(not math.isfinite(v) for v in [x,y,width,height]):return False
    box=(math.floor(x-margin),math.floor(y-margin),math.ceil(x+width+margin),math.ceil(y+height+margin))
    if box[0]<0 or box[1]<0 or box[2]>mask.width or box[3]>mask.height:return False
    return mask.crop(box).getbbox() is None

def find_space(mask,l):
    # A 6 pt lattice is conservative; failure is a review, never permission to overlap.
    for y in range(12,max(12,int(mask.height-l['height']-10)),6):
        for x in range(12,max(12,int(mask.width-l['width']-10)),6):
            if safe(mask,x,y,l['width'],l['height']): return x,y
    return None


def inside(mask,x,y,width,height,margin=7):
    return all(math.isfinite(v) for v in [x,y,width,height]) and x>=margin and y>=margin and x+width<=mask.width-margin and y+height<=mask.height-margin


def least_occupied(mask,l):
    # Integral image: score every candidate in constant time, prefer the footer
    # on ties. This fallback is only used with explicit overlap authorisation.
    small=mask.resize((math.ceil(mask.width/4),math.ceil(mask.height/4)),Image.Resampling.BOX)
    pixels=list(small.getdata());sw,sh=small.size;stride=sw+1;integral=[0]*((sh+1)*stride)
    for y in range(sh):
        row=0
        for x in range(sw):
            row+=pixels[y*sw+x];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row
    best=None
    for y in range(int(mask.height-l['height']-12),11,-6):
        for x in range(12,int(mask.width-l['width']-10),6):
            a,b=int(x/4),int(y/4);c,d=math.ceil((x+l['width'])/4),math.ceil((y+l['height'])/4)
            score=integral[d*stride+c]-integral[b*stride+c]-integral[d*stride+a]+integral[b*stride+a]
            if best is None or score<best[0]:best=(score,x,y)
    small.close()
    return best

def draw_stamp(c,block,page):
    l=block['layout'];x=float(page.cropbox.left)+block['x'];top=float(page.cropbox.top)-block['y'];w=l['width'];h=l['height'];size=l['size']
    c.setStrokeColorRGB(0,.45,1);c.setFillColorRGB(0,0,.48);c.setLineWidth(.8);c.rect(x,top-h,w,h,stroke=1,fill=0)
    c.setFont(BOLD,l['title_size'])
    for n,line in enumerate(l['title']):c.drawCentredString(x+w/2,top-10-n*(l['title_size']+2),line)
    c.setFont(FONT,size)
    if l['columns']==2:
        c.setLineWidth(.3);c.line(x+w/2,top-l['rows'][0]['y']+3,x+w/2,top-h+10)
    for i,row in enumerate(l['rows']):
        y=top-row['y'];left=x+l['left']
        for n,line in enumerate(row['lines']):c.drawString(left,y-size-n*(size+3),line)
        amount='Montant : '+money(row['allocation']['amount_cents'])
        if l['stacked']:
            for n,line in enumerate(row['amounts']):c.drawString(left,y-(len(row['lines'])+n)*(size+3)-size-8,line)
        else:
            c.drawRightString(x+l['amount_right'],y-size,amount)
            if i<len(l['rows'])-1:
                c.setLineWidth(.3);c.line(x+6,y-row['height']+6,x+w-6,y-row['height']+6)

def process(raw,groups,options=None,choice=None,suggestions=None,overrides=None,reading=None):
    options=options or {};reading=sourced_ai(reading if reading is not None else extract(raw),suggestions or [])
    if reading.get('source_sha256')!=digest(raw) or reading.get('algorithm')!=VERSION:raise StampError('INVALID_READING','La lecture ne correspond pas à cet original.')
    selected,base,conflicts=select_group(reading,groups,choice)
    if overrides:
        from copy import deepcopy
        selected=deepcopy(selected)
        if len(overrides)>200:raise StampError('INVALID_OVERRIDE','Trop de corrections.')
        seen=set()
        for override in overrides:
            if not isinstance(override,dict) or set(override)!={'allocationId','amount','reason','confirmed'} or override['confirmed'] is not True or len(str(override['reason']).strip())<5:
                raise StampError('INVALID_OVERRIDE','Chaque correction de montant exige une confirmation et une justification.')
            a=next((a for a in selected['allocations'] if a['id']==override['allocationId']),None)
            if a is None or a['id'] in seen:raise StampError('INVALID_OVERRIDE','Imputation de correction inconnue ou répétée.')
            seen.add(a['id']);amount=cents(override['amount'])
            if amount<0:raise StampError('INVALID_OVERRIDE','Montant négatif refusé.')
            a['override']={'before_cents':a['amount_cents'],'after_cents':amount,'reason':override['reason'],'status':'OVERRIDE'};a['amount_cents']=amount
        if sum(a['amount_cents'] for a in selected['allocations'])>base:raise StampError('OVER_ALLOCATION','Les montants corrigés dépassent l’assiette.')
    allocations=[a for a in selected['allocations'] if a['amount_cents']>0]
    if not allocations:raise StampError('NO_ALLOCATION','Aucune imputation non nulle.')
    if len(allocations)>200:raise StampError('INVALID_ALLOCATION','Maximum 200 imputations par pièce.')
    header='Dépense imputée aux projets suivants'
    if options.get('header')=='programme' and options.get('programme')!='generic':
        programme=options.get('programme','')
        if not programme or any(key(a['programme'])!=key(programme) for a in allocations):
            raise StampError('PROGRAMME_MISMATCH','Le programme du modèle ne correspond pas à toutes les imputations.')
    known={a.get('programme','').strip() for a in allocations if a.get('programme','').strip()}
    if options.get('programme')!='generic':
        if not known or all('maritime' in key(p) or 'marittimo' in key(p) for p in known):header='Dépense soutenue avec les fonds du PC Italie-France Maritime 2021-2027'
        elif len(known)==1 and all(a.get('programme','').strip() for a in allocations):header='Dépense soutenue avec les fonds du programme '+next(iter(known))
    source=open_source(raw);writer,normal=canonical(source);blocks=[];occupied=[]
    with pdfium.PdfDocument(normal) as doc:
        for i,page in enumerate(doc):
            image=render_page(page);mask,bounds=occupancy(page,writer.pages[i],image);image.close();page.close()
            occupied.append((mask,bounds))
        widths=[float(options.get('width',180))];sizes=[float(options.get('fontSize',5))]
        if options.get('compact',True):widths+= [150,200,240];sizes += [5] if sizes[0]!=5 else []
        order=list(range(len(doc)))
        if options.get('pagePreference')=='last':order.reverse()
        manual=options.get('placement')
        if manual:
            i=manual.get('page');x=manual.get('x');y=manual.get('y')
            l=layout(allocations,widths[0],sizes[0],header)
            if not isinstance(i,int) or not 0<=i<len(doc) or not isinstance(x,(int,float)) or not isinstance(y,(int,float)) or not inside(occupied[i][0],x,y,l['width'],l['height']) or (not options.get('allowOverlap') and not safe(occupied[i][0],x,y,l['width'],l['height'])):
                raise StampError('COLLISION','Le tampon dépasse la page ou recouvre du contenu.')
            blocks=[{'page':i,'x':x,'y':y,'layout':l,'overlap':not safe(occupied[i][0],x,y,l['width'],l['height'])}]
        else:
            for size in sizes:
                for width in widths:
                    l=layout(allocations,width,size,header)
                    for i in order:
                        point=find_space(occupied[i][0],l)
                        if point:blocks=[{'page':i,'x':point[0],'y':point[1],'layout':l}];break
                    if blocks:break
                if blocks:break
            if not blocks and options.get('split',True):
                # Retry smaller groups on copies of the maps, preserving source order and every line once.
                masks=[p[0].copy() for p in occupied]
                for start in range(0,len(allocations),3):
                    l=layout(allocations[start:start+3],180,5,header)
                    for i in order:
                        point=find_space(masks[i],l)
                        if point:
                            x,y=point;blocks.append({'page':i,'x':x,'y':y,'layout':l});ImageDraw.Draw(masks[i]).rectangle((x,y,x+l['width'],y+l['height']),fill=255);break
                    else:blocks=[];break
                for m in masks:m.close()
        if not blocks and options.get('allowAppendix'):
            writer.add_blank_page(width=595,height=842)
            i=len(writer.pages)-1;y=24
            for start in range(0,len(allocations),8):
                l=layout(allocations[start:start+8],widths[0],sizes[0],header)
                if y+l['height']>810:
                    writer.add_blank_page(width=595,height=842);i+=1;y=24
                blocks.append({'page':i,'x':24,'y':y,'layout':l});y+=l['height']+20
        if not blocks and options.get('allowOverlap'):
            candidates=[]
            for i in reversed(order):
                for width in dict.fromkeys(widths):
                    l=layout(allocations,width,5,header);point=least_occupied(occupied[i][0],l)
                    if point:candidates.append((point[0],{'page':i,'x':point[1],'y':point[2],'layout':l,'overlap':True}))
            if candidates:blocks=[min(candidates,key=lambda c:c[0])[1]]
        if not blocks:raise StampError('NO_SAFE_AREA','Aucune zone libre. Choisissez une autre disposition ou autorisez une annexe.')
        for i,page in enumerate(writer.pages):
            selected_blocks=[b for b in blocks if b['page']==i]
            if not selected_blocks:continue
            buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=(float(page.mediabox.right),float(page.mediabox.top)),pageCompression=1)
            for block in selected_blocks:draw_stamp(c,block,page)
            c.save();page.merge_page(PdfReader(io.BytesIO(buf.getvalue())).pages[0])
        writer.add_metadata({'/CDIStampVersion':VERSION,'/CDIStampSourceSHA256':digest(raw)})
        output=io.BytesIO();writer.write(output);result=output.getvalue()
        check=PdfReader(io.BytesIO(result));output_text='\n'.join(p.extract_text() or '' for p in check.pages)
        if len(check.pages)!=len(writer.pages):raise StampError('VERIFY_FAILED','Nombre de pages modifié.')
        for i,page in enumerate(source.pages):
            original=Counter((page.extract_text() or '').split());after=Counter((check.pages[i].extract_text() or '').split())
            if original-after:raise StampError('VERIFY_FAILED','Le texte source a changé.')
            if len(page.get('/Annots',[]))!=len(check.pages[i].get('/Annots',[])):raise StampError('VERIFY_FAILED','Annotations perdues.')
        printed=[r['allocation']['id'] for b in blocks for r in b['layout']['rows']]
        if Counter(printed)!=Counter(a['id'] for a in allocations):raise StampError('VERIFY_FAILED','Imputations manquantes ou dupliquées.')
        for b in blocks:
            for row in b['layout']['rows']:
                if money(row['allocation']['amount_cents']).replace(' ','') not in re.sub(r'\s+','',output_text):raise StampError('VERIFY_FAILED','Montant absent du résultat.')
                if any(line not in output_text for line in row['lines']):raise StampError('VERIFY_FAILED','Libellé absent du résultat.')
        with pdfium.PdfDocument(result) as final:
            for i in range(len(doc)):
                before=render_page(doc[i]);after=render_page(final[i]);diff=ImageChops.difference(before,after)
                if before.size!=after.size:raise StampError('VERIFY_FAILED','Géométrie visible modifiée.')
                paint=ImageDraw.Draw(diff)
                for b in blocks:
                    if b['page']==i:
                        l=b['layout']
                        valid=inside(occupied[i][0],b['x'],b['y'],l['width'],l['height']) if b.get('overlap') and options.get('allowOverlap') else safe(occupied[i][0],b['x'],b['y'],l['width'],l['height'])
                        if not valid:raise StampError('COLLISION','Collision au contrôle final.')
                        paint.rectangle((math.floor(b['x']-2),math.floor(b['y']-2),math.ceil(b['x']+l['width']+2),math.ceil(b['y']+l['height']+2)),fill=(0,0,0))
                if diff.getbbox():raise StampError('VERIFY_FAILED','Le visuel source a changé hors du tampon.')
                before.close();after.close();diff.close()
        for mask,_ in occupied:mask.close()
    total=sum(a['amount_cents'] for a in allocations)
    return {'reading':reading,'groupId':selected['id'],'base_cents':base,'total_cents':total,'remainder_cents':base-total,'rounding_cents':None if overrides else selected.get('rounding_cents'),
            'allocations':selected['allocations'],'manual':bool(choice),'conflicts':conflicts,'blocks':[{'page':b['page'],'x':b['x'],'y':b['y'],'width':b['layout']['width'],'height':b['layout']['height'],'fontSize':b['layout']['size'],'overlap':bool(b.get('overlap'))} for b in blocks],
            'source_sha256':digest(raw),'output_sha256':digest(result),'algorithm':VERSION,'overridden':bool(overrides),'checks':{'geometry':True,'source_text':True,'source_visual':True,'allocations':True,'annotations':True},'pdf':base64.b64encode(result).decode()}

def reading_receipt(reading):
    secret=os.getenv('FACTURX_API_KEY','')
    if len(secret)<32:return None
    return hmac.new(secret.encode(),json.dumps(reading,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode(),hashlib.sha256).hexdigest()


def analyze(raw,groups,options=None,choice=None,suggestions=None,overrides=None,cached=None):
    # Only the authenticated service can attest to a cached extraction. Never
    # accept client-authored fields, or reuse a reading from a different PDF.
    reading=None
    if isinstance(cached,dict) and isinstance(cached.get('reading'),dict):
        candidate=cached['reading'];expected=reading_receipt(candidate)
        if expected and hmac.compare_digest(expected,str(cached.get('receipt',''))) and candidate.get('source_sha256')==digest(raw) and candidate.get('algorithm')==VERSION:reading=candidate
    if reading is None:reading=extract(raw)
    receipt=reading_receipt(reading)
    try:
        result=process(raw,groups,options,choice,suggestions,overrides,reading=reading)
    except StampError as error:
        resolved=sourced_ai(reading,suggestions or []);matches=identity_matches(resolved,groups)
        result={'reading':resolved,'needsAI':error.code=='REVIEW_REQUIRED' and not choice,'error':{'code':error.code,'message':str(error)},'proposedGroupId':matches[0]['id'] if len(matches)==1 else None}
    # Retain the original extraction as the signed cache; suggestions have their
    # own quoted evidence and never become trusted extraction data.
    result['cachedReading']={'reading':reading,'receipt':receipt} if receipt else None
    return result


def preview(raw,page=0):
    # Source previews also go through structural/security checks.
    reader=PdfReader(io.BytesIO(raw))
    if not 0<=page<len(reader.pages):raise ValueError('Page inexistante.')
    with pdfium.PdfDocument(raw) as doc:
        image=render_page(doc[page],1.4);out=io.BytesIO();image.save(out,'PNG');image.close()
    return out.getvalue()
