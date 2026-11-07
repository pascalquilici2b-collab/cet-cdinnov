"""Independent synthetic geometry corpus. No OCR/AI, no production documents.

The collision oracle renders a SEPARATE semantic PDF: noise/paper are omitted,
logos/signatures/annotations occupy their complete known rectangles. It never
calls engine occupancy(), foreground(), safe() or find_space().
"""
import argparse,base64,hashlib,io,json,math,os,random,resource,sys,time,types
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];PRIVATE=Path(os.environ.get('STAMP_PLACEMENT_BENCHMARK_DIR',str(ROOT/'.private/stamp-placement-benchmark'))).resolve()
SERVICE=ROOT/'facturx-service';FIX=PRIVATE/'fixtures';FIX.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(SERVICE));sys.path.insert(0,str(SERVICE/'tests'))

def capture():
    import subprocess,platform,importlib.metadata
    hashes={}
    for name in ['stamping_pdf.py','stamping_vision.py']:
        raw=subprocess.run(['git','show','32ae950:facturx-service/cdi_facturx/'+name],cwd=ROOT,capture_output=True,check=True).stdout
        (PRIVATE/('baseline-'+name)).write_bytes(raw)
    for name in ['stamping_geometry.py','stamping_vision.py','stamping_pdf.py']:
        raw=(SERVICE/'cdi_facturx'/name).read_bytes();(PRIVATE/('candidate-'+name)).write_bytes(raw)
        hashes[name]=hashlib.sha256(raw).hexdigest()
    versions={name:importlib.metadata.version(name) for name in ['pillow','pypdf','pypdfium2','reportlab']}
    (PRIVATE/'candidate-snapshot.json').write_text(json.dumps({'sha256':hashes,'runtime':{'python':platform.python_version(),**versions}},indent=2))

def write_report():
    import statistics
    before=json.loads((PRIVATE/'baseline-results.json').read_text());after=json.loads((PRIVATE/'candidate-results.json').read_text())
    fixture=json.loads((PRIVATE/'manifest.json').read_text());pairs=[]
    assert len(fixture['cases'])==len(before['cases'])==len(after['cases'])
    for case,a,b in zip(fixture['cases'],before['cases'],after['cases']):
        assert case['id']==a['id']==b['id']
        pairs.append({'id':case['id'],'fixture_sha256':case['sha256'],
                      'expectation':{k:case[k] for k in ['expected_success','expected_page','minimum_blocks']},
                      'before':a,'after':b})
    def metrics(report):
        successful=[r for r in report['cases'] if r['status']=='success']
        preferences=[r for c,r in zip(fixture['cases'],report['cases']) if c['expected_page'] is not None and c['id'].startswith('prefer-')]
        return {'expected_placeable_cases':sum(c['expected_success'] for c in fixture['cases']),
                'placements_produced':len(successful),'preference_cases':len(preferences),'preferences_met':sum(r.get('preference_met',False) for r in preferences),
                'expected_no_safe_area_refusal':next(r['passed'] for r in report['cases'] if r['id']=='no-safe-area-refused'),
                'source_collisions':sum(len(r.get('source_collisions',[])) for r in successful),
                'source_pages_with_changed_pixels_outside_stamp':sum(len(r.get('source_pixels_changed_outside_stamp',[])) for r in successful),
                'overlapping_stamps':sum(len(r.get('stamp_collisions',[])) for r in successful),
                'corpus_checks_passed':sum(r['passed'] for r in report['cases']),
                'peak_engine_rss_mib':round(report['peakRssKiB']/1024,2)}
    matched=[p for p in pairs if p['before']['status']==p['after']['status']=='success']
    report={'schema':1,'baseline_commit':'32ae950','candidate':json.loads((PRIVATE/'candidate-snapshot.json').read_text()),
            'reproduce':['python facturx-service/tests/stamping_placement_benchmark.py prepare',
                         'python facturx-service/tests/stamping_placement_benchmark.py baseline',
                         'python facturx-service/tests/stamping_placement_benchmark.py candidate',
                         'python facturx-service/tests/stamping_placement_benchmark.py report'],
            'method':{'data':'18 entirely fictitious generated PDF cases; Helvetica source text, no external fonts or user data.',
                      'oracle':'Separate semantic PDF, with whole logo/annotation/signature rectangles. Collision checks use its rendered pixels, never the production foreground/occupancy/search helpers.',
                      'source_preservation':'Raw original/output PDF renders at2x, exact pixel equality outside stamp rectangle plus4pt. Source clearance7pt; stamp intersections checked separately.',
                      'resources':'Fresh engine child per case, RLIMIT_AS384MiB,95s wall ceiling; oracle runs after child exits and is excluded from engine memory/latency.',
                      'scope':'Trusted synthetic reading supplied to isolate placement. No OCR, AI, network, production document, or end-to-end UI timing.',
                      'timing':'One local run per variant. Observational milliseconds, not a throughput/SLA estimate. Matched successful cases avoid mixing changed refusal/acceptance cases.'},
            'metrics':{'before':metrics(before),'after':metrics(after),
                       'matched_successful_cases':len(matched),
                       'matched_success_median_ms_before':statistics.median(p['before']['elapsedMs'] for p in matched),
                       'matched_success_median_ms_after':statistics.median(p['after']['elapsedMs'] for p in matched)},
            'limitations':['Gradient plus grain remains NO_SAFE_AREA: manual placement or an explicitly authorized appendix is still required.',
                           'Paper-model probes retain all tested ink at contrast>=4/255, but only248–288of480pixels at contrast3/255; no universal faint-handwriting guarantee.',
                           'This finite synthetic corpus demonstrates specific geometry corrections, not universal document quality.'],
            'paper_ink_probe':paper_ink_probe(),'cases':pairs}
    destination=SERVICE/'tests/fixtures/stamping-placement-20261107.json';destination.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'report':str(destination),'metrics':report['metrics']},ensure_ascii=False))

def paper_ink_probe():
    """Independent known ink deltas, outside the rectangle-search masks."""
    from PIL import Image
    load_engine('candidate')
    vision=sys.modules['cdi_facturx.stamping_vision'];rows=[]
    for orientation in ['vertical','horizontal','diagonal']:
        width,height=600,840;paper=Image.new('RGB',(width,height));pixels=paper.load()
        for y in range(height):
            for x in range(width):
                position=y/(height-1) if orientation=='vertical' else x/(width-1) if orientation=='horizontal' else (x/(width-1)+y/(height-1))/2
                value=230+int(position*24);pixels[x,y]=(value,value,value)
        for delta in [3,4,5,6,12]:
            image=paper.copy();ink=image.load();points=[]
            for x,y in [(100,140),(300,420),(510,720),(101,310),(480,610)]:
                for yy in range(y,y+4):
                    for xx in range(x,x+24):
                        value=pixels[xx,yy][0]-delta;ink[xx,yy]=(value,value,value);points.append((xx,yy))
            mask=vision.foreground(image);retained=sum(mask.getpixel(point)>0 for point in points)
            rows.append({'orientation':orientation,'known_ink_contrast':delta,'known_ink_pixels':len(points),'retained_ink_pixels':retained,'paper_recognized':vision._paper_plane(image) is not None})
            if delta>=4:assert retained==len(points),'Known faint ink lost in paper model'
            mask.close();image.close()
        paper.close()
    return rows

def load_engine(variant):
    import cdi_facturx
    for filename in (['stamping_geometry.py'] if variant=='candidate' else [])+['stamping_vision.py','stamping_pdf.py']:
        module_name='cdi_facturx.'+filename[:-3]
        module=types.ModuleType(module_name);module.__file__=str(SERVICE/'cdi_facturx'/filename);module.__package__='cdi_facturx'
        sys.modules[module_name]=module;setattr(cdi_facturx,filename[:-3],module)
        exec(compile((PRIVATE/(variant+'-'+filename)).read_bytes(),module.__file__,'exec'),module.__dict__)
    return sys.modules['cdi_facturx.stamping_pdf']

def draw_fixture(kind,holes=(),signature=False,logo=False):
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
    from PIL import Image
    from reportlab.pdfbase import pdfmetrics
    out=io.BytesIO();truth=io.BytesIO();c=canvas.Canvas(out,pagesize=(600,840),invariant=1);t=canvas.Canvas(truth,pagesize=(600,840),invariant=1)
    c.setFont('Helvetica',10)
    for n,line in enumerate(['Facture n° : F-TEST','Fournisseur : FOURNISSEUR-TEST','Date : 2026-01-31','Total HT : 7 177,10 EUR','Données fictives - aucun document comptable réel']):
        y=22+n*17;c.drawString(24,840-y-10,line)
        t.setFont('Helvetica',10);t.drawString(24,840-y-10,line)
    if kind=='dense':
        for y in range(15,827,8):
            intervals=[(14,586)]
            for hx,hy,hw,hh in holes:
                if hy<=y<=hy+hh:
                    intervals=[v for a,b in intervals for v in [(a,min(b,hx)),(max(a,hx+hw),b)] if v[1]>v[0]]
            for a,b in intervals:
                for target in (c,t):target.setLineWidth(.6);target.line(a,840-y,b,840-y)
        for x in range(14,587,16):
            intervals=[(15,827)]
            for hx,hy,hw,hh in holes:
                if hx<=x<=hx+hw:
                    intervals=[v for a,b in intervals for v in [(a,min(b,hy)),(max(a,hy+hh),b)] if v[1]>v[0]]
            for a,b in intervals:
                for target in (c,t):target.setLineWidth(.6);target.line(x,840-a,x,840-b)
    else:
        for n in range(15):
            y=160+n*23;c.setFont('Helvetica',8);c.drawString(35,840-y,'Prestation fictive de maintenance et vérification du matériel de démonstration')
            t.setFont('Helvetica',8);t.drawString(35,840-y,'Prestation fictive de maintenance et vérification du matériel de démonstration')
    if signature:
        c.setStrokeColorRGB(.05,.2,.6);c.setLineWidth(.8)
        p=c.beginPath();p.moveTo(360,102);p.curveTo(420,158,395,45,485,115);p.curveTo(430,65,490,70,548,115);c.drawPath(p)
        c.line(350,78,550,102);t.rect(345,60,215,100,fill=1,stroke=0)
    if logo:
        image=Image.new('RGB',(100,80),'white');from PIL import ImageDraw
        draw=ImageDraw.Draw(image);draw.rectangle((0,0,99,79),outline=(0,80,150),width=4);draw.text((35,30),'F',fill=(0,80,150))
        c.drawImage(ImageReader(image),385,620,90,72);image.close();t.rect(385,620,90,72,fill=1,stroke=0)
    c.save();t.save();return out.getvalue(),truth.getvalue()

def transform(raw,rotation=0,crop=False,annotation=False):
    from pypdf import PdfReader,PdfWriter
    from pypdf.generic import NameObject,DictionaryObject,ArrayObject,NumberObject,TextStringObject
    writer=PdfWriter(clone_from=PdfReader(io.BytesIO(raw)))
    for p in writer.pages:
        if crop:p.cropbox.lower_left=(18,24);p.cropbox.upper_right=(578,816)
        if rotation:p.rotate(rotation)
        if annotation:
            rect=ArrayObject([NumberObject(n) for n in (350,475,565,590)])
            ann=DictionaryObject({NameObject('/Type'):NameObject('/Annot'),NameObject('/Subtype'):NameObject('/Ink'),NameObject('/Rect'):rect,
                NameObject('/InkList'):ArrayObject([ArrayObject([NumberObject(n) for n in (355,480,400,550,550,580)])]),NameObject('/Contents'):TextStringObject('Annotation entièrement fictive')})
            p[NameObject('/Annots')]=ArrayObject([writer._add_object(ann)])
    out=io.BytesIO();writer.write(out);return out.getvalue()

def annotation_truth(raw):
    from pypdf import PdfReader,PdfWriter
    from reportlab.pdfgen import canvas
    w=PdfWriter(clone_from=PdfReader(io.BytesIO(raw)));b=io.BytesIO();c=canvas.Canvas(b,pagesize=(600,840),invariant=1);c.rect(350,475,215,115,fill=1,stroke=0);c.save();w.pages[0].merge_page(PdfReader(b).pages[0]);o=io.BytesIO();w.write(o);return o.getvalue()

def combine(raws):
    from pypdf import PdfReader,PdfWriter
    w=PdfWriter()
    for raw in raws:
        for p in PdfReader(io.BytesIO(raw)).pages:w.add_page(p)
    out=io.BytesIO();w.write(out);return out.getvalue()

def render(raw,page=0,scale=2):
    import pypdfium2 as p
    with p.PdfDocument(raw) as doc:
        selected=doc[page];bitmap=selected.render(scale=scale,draw_annots=True)
        try:return bitmap.to_pil().convert('RGB').copy()
        finally:bitmap.close();selected.close()

def scan(raw,gradient=False,grain=False):
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
    from PIL import Image,ImageChops,ImageDraw
    image=render(raw);w,h=image.size
    paper=Image.linear_gradient('L').resize(image.size).point(lambda v:225+int(v*24/255)).convert('RGB') if gradient else Image.new('RGB',image.size,(239,235,225))
    modified=ImageChops.multiply(image,paper);image.close();paper.close()
    if grain:
        rng=random.Random(71007);noise=Image.frombytes('L',(w,h),bytes(128+rng.randrange(-2,3) for _ in range(w*h))).convert('RGB')
        noisy=ImageChops.add(modified,noise,offset=-128);modified.close();noise.close();modified=noisy
        draw=ImageDraw.Draw(modified)
        for _ in range(700):
            x,y=rng.randrange(w),rng.randrange(h);draw.point((x,y),fill=(150,150,150))
    out=io.BytesIO();c=canvas.Canvas(out,pagesize=(600,840),invariant=1);c.drawImage(ImageReader(modified),0,0,600,840);c.save();modified.close();return out.getvalue()

def make():
    cases=[]
    def add(name,pair,options=None,expected=True,page=None,minimum_blocks=1):
        raw,truth=pair;(FIX/(name+'.pdf')).write_bytes(raw);(FIX/(name+'-truth.pdf')).write_bytes(truth)
        cases.append({'id':name,'source':str(FIX/(name+'.pdf')),'oracle':str(FIX/(name+'-truth.pdf')),'sha256':hashlib.sha256(raw).hexdigest(),'options':options or {},'expected_success':expected,'expected_page':page,'minimum_blocks':minimum_blocks})
    clean=draw_fixture('clean');dense=draw_fixture('dense')
    add('native-clean',clean)
    add('dense-real-hole',draw_fixture('dense',[(205,560,230,190)]))
    add('signature-footer',draw_fixture('dense',[(30,645,540,165)],signature=True))
    annotated=draw_fixture('dense',[(30,220,540,200)]);add('annotation-box',(transform(annotated[0],annotation=True),annotation_truth(annotated[1])))
    add('small-logo',draw_fixture('dense',[(350,130,230,290)],logo=True))
    add('beige-scan',(scan(clean[0]),clean[1]))
    add('gradient-clean-scan',(scan(clean[0],gradient=True),clean[1]))
    add('gradient-grain-scan',(scan(clean[0],gradient=True,grain=True),clean[1]))
    for rotation in [90,270]:add('crop-rotation-'+str(rotation),(transform(clean[0],rotation,True),transform(clean[1],rotation,True)))
    add('prefer-first',(combine([clean[0],clean[0]]),combine([clean[1],clean[1]])),{'pagePreference':'first'},page=0)
    add('prefer-last',(combine([clean[0],clean[0]]),combine([clean[1],clean[1]])),{'pagePreference':'last'},page=1)
    narrow=draw_fixture('dense',[(205,555,169,190)])
    add('prefer-first-narrow',(combine([narrow[0],clean[0]]),combine([narrow[1],clean[1]])),{'pagePreference':'first'},page=0)
    add('prefer-last-narrow',(combine([clean[0],narrow[0]]),combine([clean[1],narrow[1]])),{'pagePreference':'last'},page=1)
    add('two-independent-stamps',draw_fixture('dense',[(30,530,210,110),(350,690,210,110)]),{'compact':False,'split':True},minimum_blocks=2)
    add('compact-font-fallback-split',draw_fixture('dense',[(30,530,210,110),(350,690,210,110)]),{'fontSize':12,'compact':True,'split':True},minimum_blocks=2)
    add('no-safe-area-refused',dense,{'allowAppendix':False,'allowOverlap':False},expected=False)
    add('appendix-when-authorized',dense,{'allowAppendix':True},page=1)
    (PRIVATE/'manifest.json').write_text(json.dumps({'baseline':'32ae950','fictitious':True,'oracle':'Separate semantic PDF; no production data, OCR or AI. Source pixel comparison at2x outside stamp boxes.','cases':cases},indent=2))
    print(json.dumps({'fixtures':len(cases),'manifest':str(PRIVATE/'manifest.json')}))

def check(case,result,raw):
    from PIL import ImageChops,ImageDraw
    import pypdfium2 as p
    output=base64.b64decode(result['pdf']);collisions=[];changed=[];pair_collisions=[];boxes=result['blocks']
    with p.PdfDocument(raw) as d:pages=len(d)
    for page in range(pages):
        oracle=render(Path(case['oracle']).read_bytes(),page).convert('L').point(lambda x:255 if x<230 else 0)
        before=render(raw,page);after=render(output,page)
        if before.size!=after.size:changed.append({'page':page,'geometry':True});continue
        diff=ImageChops.difference(before,after);paint=ImageDraw.Draw(diff)
        for b in boxes:
            if b['page']!=page:continue
            x,y,w,h=[b[k] for k in ['x','y','width','height']]
            if oracle.crop((math.floor((x-7)*2),math.floor((y-7)*2),math.ceil((x+w+7)*2),math.ceil((y+h+7)*2))).getbbox():collisions.append({'page':page,'x':x,'y':y})
            paint.rectangle((math.floor((x-4)*2),math.floor((y-4)*2),math.ceil((x+w+4)*2),math.ceil((y+h+4)*2)),fill=(0,0,0))
        if diff.getbbox():changed.append({'page':page,'bbox':diff.getbbox()})
        oracle.close();before.close();after.close();diff.close()
    for n,a in enumerate(boxes):
        for b in boxes[n+1:]:
            if a['page']==b['page'] and a['x']<b['x']+b['width'] and a['x']+a['width']>b['x'] and a['y']<b['y']+b['height'] and a['y']+a['height']>b['y']:pair_collisions.append([n,n+1])
    preference=case['expected_page'] is None or all(b['page']==case['expected_page'] for b in boxes)
    return {'source_collisions':collisions,'source_pixels_changed_outside_stamp':changed,'stamp_collisions':pair_collisions,'preference_met':preference,'block_count':len(boxes),'minimum_blocks_met':len(boxes)>=case['minimum_blocks'],'blocks':[{k:b[k] for k in ['page','x','y','width','height','overlap']} for b in boxes]}

def run(variant,case_id):
    # Same disposable address-space limit as the document engine; CPU wall time
    # is measured per case. Avoid importing numpy/ML runtimes in this harness.
    resource.setrlimit(resource.RLIMIT_AS,(384*1024*1024,384*1024*1024))
    engine=load_engine(variant)
    from test_stamping import groups
    results=[]
    for case in json.loads((PRIVATE/'manifest.json').read_text())['cases']:
        if case['id']!=case_id:continue
        raw=Path(case['source']).read_bytes();group=groups(6,'INVOICE')
        reading={**engine.extract_fields('Facture n° : F-TEST\nFournisseur : FOURNISSEUR-TEST\nDate : 2026-01-31\nTotal HT : 7 177,10 EUR'),'source_sha256':hashlib.sha256(raw).hexdigest(),'algorithm':engine.VERSION,'pages':[],'warnings':[],'evidence':[],'ocr':False}
        started=time.perf_counter();entry={'id':case['id']}
        try:
            result=engine.process(raw,group,case['options'],reading=reading)
            elapsed=round((time.perf_counter()-started)*1000)
            entry.update(status='success',elapsedMs=elapsed)
            (PRIVATE/(variant+'-'+case['id']+'-engine.json')).write_text(json.dumps(result))
            (PRIVATE/(variant+'-'+case['id']+'-output.pdf')).write_bytes(base64.b64decode(result['pdf']))
        except engine.StampError as e:
            entry.update(status='refused',code=e.code,elapsedMs=round((time.perf_counter()-started)*1000),passed=not case['expected_success'] and e.code=='NO_SAFE_AREA')
        except Exception as e:entry.update(status='error',error=type(e).__name__+': '+str(e),elapsedMs=round((time.perf_counter()-started)*1000),passed=False)
        entry['peakRssKiB']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        results.append(entry);print(json.dumps(entry),flush=True)

def orchestrate(variant):
    # A fresh isolated process per piece mirrors the service. The independent
    # visual oracle runs AFTER that process exits, outside its memory budget.
    import subprocess
    results=[]
    for case in json.loads((PRIVATE/'manifest.json').read_text())['cases']:
        done=subprocess.run([sys.executable,__file__,variant,'--case',case['id']],capture_output=True,timeout=95)
        try:entry=json.loads(done.stdout.decode().strip().splitlines()[-1])
        except Exception:entry={'id':case['id'],'status':'crashed','passed':False,'error':done.stderr.decode(errors='replace')[:500]}
        if entry['status']=='success':
            result=json.loads((PRIVATE/(variant+'-'+case['id']+'-engine.json')).read_text())
            entry.update(check(case,result,Path(case['source']).read_bytes()))
            entry['passed']=case['expected_success'] and not entry['source_collisions'] and not entry['source_pixels_changed_outside_stamp'] and not entry['stamp_collisions'] and entry['preference_met'] and entry['minimum_blocks_met']
        results.append(entry);print(json.dumps(entry),flush=True)
    report={'variant':variant,'source_commit':'32ae950' if variant=='baseline' else 'working tree snapshot','cases':results,'passed':sum(r['passed'] for r in results),'total':len(results),'peakRssKiB':max(r.get('peakRssKiB',0) for r in results)}
    (PRIVATE/(variant+'-results.json')).write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='cases'}))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['prepare','make','baseline','candidate','report']);parser.add_argument('--case');args=parser.parse_args()
    if args.action=='prepare':capture();make()
    elif args.action=='make':make()
    elif args.action=='report':write_report()
    elif args.case:run(args.action,args.case)
    else:orchestrate(args.action)
