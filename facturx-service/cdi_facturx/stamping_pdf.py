"""Non-destructive stamping, conservative geometry and independent visual verification.

No AI/network calls. PDFium is serialised by the API's isolated subprocess.
All coordinates exposed by this module are PDF points from the visible top left.
"""
import base64
from collections import Counter
import hashlib
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

VERSION = 'stamping-1.0-20261023'
FONT = 'CDIStamp'
pdfmetrics.registerFont(TTFont(FONT, str(Path(__file__).parent/'assets/fonts/DejaVuSans.ttf')))

def digest(raw): return hashlib.sha256(raw).hexdigest()
def money(n): return f'{n//100:,}'.replace(',', ' ') + f',{n%100:02d} EUR'

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
        if re.search(r'bulletin|paie|période|periode|matricule|salari[ée]|facture|fournisseur|siret|total.*(?:employeur|HT|TTC)|coût employeur|cout employeur|r[ée]f[ée]rence|\bdate\b',line,re.I):
            result.append({'line':n,'text':line[:220]})
    return result[:60]

def extract_fields(text):
    fields={}; proofs={}
    specs={
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
    for kind,label in [('EMPLOYER_COST',r'(?:total versé par l.employeur|total verse par l.employeur|coût employeur|cout employeur)'),('HT',r'(?:total\s+HT|total hors taxes)'),('TTC',r'(?:total\s+TTC|total toutes taxes comprises)')]:
        found=list(re.finditer(label+r'\s*[:]?\s*(\d[\d \u00a0\u202f]*[,.]\d{2})(?:\s*(?:€|EUR))?',text,re.I))
        vals={cents(m[1]) for m in found}
        if len(vals)==1: bases[kind]={'amount_cents':next(iter(vals)),'evidence':found[0][0]}
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
    return {**extract_fields(text),'pages':pages,'warnings':warnings,'evidence':evidence_lines(text),'source_sha256':digest(raw),'algorithm':VERSION,'ocr':any(p['method']=='ocr' for p in pages)}

def sourced_ai(reading,suggestions):
    fields=dict(reading['fields']);proofs=dict(reading['proofs'])
    # Suggestions are identification only. No allocation, amount or programme is accepted.
    allowed={'employee_ref','supplier_ref','invoice_number','document_ref','period','invoice_date'}
    for item in suggestions[:10]:
        if not isinstance(item,dict) or set(item)!={'field','value','quote'}: continue
        f=item['field'];v=item['value'];q=item['quote']
        if f not in allowed or not isinstance(v,str) or not isinstance(q,str) or not 1<=len(v)<=120: continue
        if key(v) not in key(q) or not any(key(q) in key(e['text']) for e in reading['evidence']): continue
        if f=='period' and not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])',v): continue
        if f not in fields: fields[f]=v;proofs[f]=q
    return {**reading,'fields':fields,'proofs':proofs}

def select_group(reading,groups,choice=None):
    fields=reading['fields']; matches=[]
    for g in groups:
        if g['document_type']!=fields.get('document_type'): continue
        required=['employee_ref','period'] if g['document_type']=='PAYSLIP' else ['supplier_ref','invoice_number']
        if all(key(fields.get(f))==key(g.get(f)) and fields.get(f) for f in required): matches.append(g)
    selected=next((g for g in groups if g['id']==choice.get('groupId')),None) if choice else (matches[0] if len(matches)==1 else None)
    if choice and (not choice.get('identityConfirmed') or len(choice.get('reason','').strip())<5):
        raise StampError('REVIEW_REQUIRED','Confirmez l’identité de la pièce et justifiez le rapprochement manuel.')
    if selected is None: raise StampError('REVIEW_REQUIRED','Aucun rapprochement unique. Choisissez le groupe après vérification de l’identité.')
    conflicts=[f for f in ['period','employee_ref','supplier_ref','invoice_number','invoice_date','document_type'] if fields.get(f) and selected.get(f) and key(fields[f])!=key(selected[f])]
    if conflicts and not choice: raise StampError('REVIEW_REQUIRED','Divergence : '+', '.join(conflicts))
    if selected['errors']: raise StampError('INVALID_ALLOCATION','; '.join(selected['errors']))
    total=sum(a['amount_cents'] for a in selected['allocations'])
    base=reading['bases'].get(selected['base_type'],{}).get('amount_cents')
    if selected['base_type']=='ELIGIBLE_BASE': base=None
    if choice and choice.get('baseConfirmed'):
        verified=cents(choice.get('baseAmount',''))
        if base is not None and base!=verified: raise StampError('BASE_MISMATCH','La base saisie contredit le montant extrait du PDF.')
        base=verified
    if base is None: raise StampError('BASE_REQUIRED','Assiette du document à vérifier et confirmer manuellement.')
    if selected['base_amount_cents'] is not None and selected['base_amount_cents']!=base:
        raise StampError('BASE_MISMATCH','L’assiette du tableau diffère du PDF.')
    if total>base: raise StampError('OVER_ALLOCATION','Les imputations dépassent l’assiette vérifiée.')
    return selected,base,conflicts

def wrap(text,width,size):
    lines=[];line=''
    for char in str(text).replace('\n',' '):
        if pdfmetrics.stringWidth(line+char,FONT,size)>width:
            lines.append(line.rstrip());line=char.lstrip()
        else: line+=char
    if line:lines.append(line.rstrip())
    return lines or ['']

def layout(allocations,width=290,size=9,header='Dépense imputée aux projets suivants',show_total=True):
    if not 8<=size<=12 or not 210<=width<=500: raise StampError('INVALID_LAYOUT','Largeur 210–500 points ; police 8–12 points.')
    title=wrap(header,width-20,size+1);top=12+len(title)*(size+4)+6
    rows=[]
    for a in allocations:
        text=wrap(a['project'],width-110,size)
        h=max(1,len(text))*(size+3)+8
        rows.append({'allocation':a,'lines':text,'y':top,'height':h});top+=h
    height=top+(size+20 if show_total else 8)
    return {'width':width,'height':height,'size':size,'title':title,'rows':rows,'total':sum(a['amount_cents'] for a in allocations),'show_total':show_total}

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

def draw_stamp(c,block,page):
    l=block['layout'];x=float(page.cropbox.left)+block['x'];top=float(page.cropbox.top)-block['y'];w=l['width'];h=l['height'];size=l['size']
    c.setStrokeColorRGB(.08,.32,.64);c.setFillColorRGB(.06,.21,.43);c.setLineWidth(.8);c.rect(x,top-h,w,h,stroke=1,fill=0)
    c.setFont(FONT,size+1)
    for n,line in enumerate(l['title']):c.drawString(x+10,top-12-(n+1)*(size+4)+size+2,line)
    c.setFont(FONT,size)
    for row in l['rows']:
        y=top-row['y'];c.setLineWidth(.3);c.line(x+8,y,x+w-8,y)
        for n,line in enumerate(row['lines']):c.drawString(x+10,y-12-n*(size+3),line)
        c.drawRightString(x+w-10,y-12,money(row['allocation']['amount_cents']))
    if l['show_total']:c.drawRightString(x+w-10,top-h+10,'Total : '+money(l['total']))

def process(raw,groups,options=None,choice=None,suggestions=None,overrides=None):
    options=options or {};reading=sourced_ai(extract(raw),suggestions or [])
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
    header=options.get('header','Dépense imputée aux projets suivants')
    if header!='Dépense imputée aux projets suivants':
        programme=options.get('programme','')
        if not programme or any(key(a['programme'])!=key(programme) for a in allocations):
            raise StampError('PROGRAMME_MISMATCH','Le programme du modèle ne correspond pas à toutes les imputations.')
        header='Dépense imputée - '+programme
    source=open_source(raw);writer,normal=canonical(source);blocks=[];occupied=[]
    with pdfium.PdfDocument(normal) as doc:
        for i,page in enumerate(doc):
            image=render_page(page);mask,bounds=occupancy(page,writer.pages[i],image);image.close();page.close()
            occupied.append((mask,bounds))
        widths=[float(options.get('width',290))];sizes=[float(options.get('fontSize',9))]
        if options.get('compact',True):widths+= [240,340];sizes += [8]
        order=list(range(len(doc)))
        if options.get('pagePreference')=='last':order.reverse()
        manual=options.get('placement')
        if manual:
            i=manual.get('page');x=manual.get('x');y=manual.get('y')
            l=layout(allocations,widths[0],sizes[0],header)
            if not isinstance(i,int) or not 0<=i<len(doc) or not isinstance(x,(int,float)) or not isinstance(y,(int,float)) or not safe(occupied[i][0],x,y,l['width'],l['height']):
                raise StampError('COLLISION','Le tampon dépasse la page ou recouvre du contenu.')
            blocks=[{'page':i,'x':x,'y':y,'layout':l}]
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
                    l=layout(allocations[start:start+3],240,8,header)
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
                l=layout(allocations[start:start+8],500,9,header)
                if y+l['height']>810:
                    writer.add_blank_page(width=595,height=842);i+=1;y=24
                blocks.append({'page':i,'x':24,'y':y,'layout':l});y+=l['height']+20
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
                if money(row['allocation']['amount_cents']) not in output_text:raise StampError('VERIFY_FAILED','Montant absent du résultat.')
                if any(line not in output_text for line in row['lines']):raise StampError('VERIFY_FAILED','Libellé absent du résultat.')
        with pdfium.PdfDocument(result) as final:
            for i in range(len(doc)):
                before=render_page(doc[i]);after=render_page(final[i]);diff=ImageChops.difference(before,after)
                if before.size!=after.size:raise StampError('VERIFY_FAILED','Géométrie visible modifiée.')
                paint=ImageDraw.Draw(diff)
                for b in blocks:
                    if b['page']==i:
                        l=b['layout']
                        if not safe(occupied[i][0],b['x'],b['y'],l['width'],l['height']):raise StampError('COLLISION','Collision au contrôle final.')
                        paint.rectangle((math.floor(b['x']-2),math.floor(b['y']-2),math.ceil(b['x']+l['width']+2),math.ceil(b['y']+l['height']+2)),fill=(0,0,0))
                if diff.getbbox():raise StampError('VERIFY_FAILED','Le visuel source a changé hors du tampon.')
                before.close();after.close();diff.close()
        for mask,_ in occupied:mask.close()
    total=sum(a['amount_cents'] for a in allocations)
    return {'reading':reading,'groupId':selected['id'],'base_cents':base,'total_cents':total,'remainder_cents':base-total,'rounding_cents':None if overrides else selected.get('rounding_cents'),
            'allocations':selected['allocations'],'manual':bool(choice),'conflicts':conflicts,'blocks':[{'page':b['page'],'x':b['x'],'y':b['y'],'width':b['layout']['width'],'height':b['layout']['height'],'fontSize':b['layout']['size']} for b in blocks],
            'source_sha256':digest(raw),'output_sha256':digest(result),'algorithm':VERSION,'overridden':bool(overrides),'checks':{'geometry':True,'source_text':True,'source_visual':True,'allocations':True,'annotations':True},'pdf':base64.b64encode(result).decode()}

def preview(raw,page=0):
    # Source previews also go through structural/security checks.
    reader=PdfReader(io.BytesIO(raw))
    if not 0<=page<len(reader.pages):raise ValueError('Page inexistante.')
    with pdfium.PdfDocument(raw) as doc:
        image=render_page(doc[page],1.4);out=io.BytesIO();image.save(out,'PNG');image.close()
    return out.getvalue()
