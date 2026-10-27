"""Container-build smoke test: real local OCR and deterministic stamping, fictional data only."""
import io
import json
import base64
import subprocess
import sys
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import pypdfium2
from cdi_facturx.stamping_pdf import FONT,process,extract
from cdi_facturx.stamping_import import inspect,normalize

def verify():
    raw=io.BytesIO();c=canvas.Canvas(raw,pagesize=(595,842));c.setFont(FONT,14)
    for n,line in enumerate(['Bulletin de paie','Matricule : DEMO-001','Période : 2026-01']):c.drawString(32,800-25*n,line)
    c.drawString(32,70,'Total versé par l’employeur : 7 177,10 EUR');c.save()
    text_pdf=raw.getvalue()
    with pypdfium2.PdfDocument(text_pdf) as pdf:
        bitmap=pdf[0].render(scale=2);image=bitmap.to_pil().copy();bitmap.close()
    raw=io.BytesIO();c=canvas.Canvas(raw,pagesize=(595,842));c.drawImage(ImageReader(image),0,0,595,842);c.save();image.close()
    scan=raw.getvalue();reading=extract(scan)
    assert not reading['warnings'],reading['warnings']
    assert reading['fields']['employee_ref']=='DEMO-001'
    assert reading['bases']['EMPLOYER_COST']['amount_cents']==717710
    table=b'document_type;employee_ref;period;project_name;base_amount;allocation_amount;currency\nPAYSLIP;DEMO-001;2026-01;Projet fictif;7177,10;100,00;EUR'
    mapping=inspect(table,'demo.csv')['sheets'][0]['mapping'];groups=normalize(table,'demo.csv',{'mapping':mapping})['groups']
    result=process(scan,groups)
    assert result['total_cents']==10000 and all(result['checks'].values())
    print(json.dumps({'stamping':'passed','ocr':'real local Tesseract','scan_identification':True,'source_preserved':True}))
    from pypdf import PdfReader,PdfWriter
    from cdi_facturx.stamping_intake import inspect_documents,split_documents
    combined=PdfWriter();original=PdfReader(io.BytesIO(scan))
    combined.add_page(original.pages[0]);combined.add_page(original.pages[0])
    extra=io.BytesIO();c=canvas.Canvas(extra,pagesize=(595,842));c.setFont(FONT,14)
    for n,line in enumerate(['Bulletin de paie','Matricule : DEMO-002','Période : 2026-02']):c.drawString(32,800-25*n,line)
    c.save();combined.add_page(PdfReader(extra).pages[0]);out=io.BytesIO();combined.write(out);bundle=out.getvalue()
    pages=inspect_documents(bundle)['pages']
    request={'action':'document-page','page':[0,1],'file':base64.b64encode(bundle).decode()}
    child=subprocess.run([sys.executable,'-m','cdi_facturx.stamping_job'],input=json.dumps(request).encode(),capture_output=True,timeout=95,check=True)
    scanned=json.loads(child.stdout);assert scanned['ok'],scanned
    pages[:2]=scanned['result']['pages'];parts=split_documents(bundle,pages)['parts']
    assert [(p['start'],p['end']) for p in parts]==[(0,1),(2,2)]
    print(json.dumps({'multipage_scan':'passed','documents':2,'first_document_pages':2,'bounded_subprocess':True}))
    # Real OCR on a gray scan with a native footer: the footer used to prevent
    # OCR entirely. Exercise the same 384 MiB subprocess as production.
    with pypdfium2.PdfDocument(text_pdf) as pdf:
        bitmap=pdf[0].render(scale=2);gray=bitmap.to_pil().convert('L');bitmap.close()
    faded=gray.point(lambda p:25+int(p*.82));gray.close()
    out=io.BytesIO();c=canvas.Canvas(out,pagesize=(595,842))
    c.drawImage(ImageReader(faded),0,0,595,842);faded.close()
    c.setFont(FONT,8);c.drawString(20,15,'Archive entreprise - Copie pour consultation interne uniquement');c.save()
    partial=out.getvalue()
    assert inspect_documents(partial)['pages'][0]['needsOCR']
    request={'action':'process','file':base64.b64encode(partial).decode(),'groups':normalize(table,'demo.csv',{'mapping':mapping})['groups']}
    child=subprocess.run([sys.executable,'-m','cdi_facturx.stamping_job'],input=json.dumps(request).encode(),capture_output=True,timeout=95,check=True)
    enhanced=json.loads(child.stdout);assert enhanced['ok'],enhanced
    assert enhanced['result']['base_cents']==717710 and all(enhanced['result']['checks'].values())
    assert not any(b.get('overlap') for b in enhanced['result']['blocks'])
    print(json.dumps({'partial_gray_scan':'passed','ocr_300_dpi':True,'bounded_subprocess':True,'source_preserved':True}))
    # Exercise a dense scanned payment table through the same bounded child
    # process as production, including real Tesseract and the 384 MiB limit.
    from reportlab.platypus import SimpleDocTemplate,Table,TableStyle
    from reportlab.lib.pagesizes import landscape,A4
    rows=[['Agent','Mois','Coût employeur','Projet','Montant éligible projet','Mandat','Paiement']]
    rows += [['DEMO TEST','2026-01','7177,10',f'Projet {i+1}','100,00','1234','01/02/2026'] for i in range(28)]
    table=Table(rows,colWidths=[95,70,105,90,150,70,90],rowHeights=16)
    table.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.5,'black'),('FONTNAME',(0,0),(-1,-1),FONT),('FONTSIZE',(0,0),(-1,-1),8)]))
    out=io.BytesIO();SimpleDocTemplate(out,pagesize=landscape(A4),topMargin=35,bottomMargin=35).build([table])
    with pypdfium2.PdfDocument(out.getvalue()) as pdf:
        bitmap=pdf[0].render(scale=2);image=bitmap.to_pil().copy();bitmap.close()
    out=io.BytesIO();c=canvas.Canvas(out,pagesize=landscape(A4));c.drawImage(ImageReader(image),0,0,*landscape(A4));c.save();image.close()
    request={'action':'inspect','name':'paiement-fictif.pdf','file':base64.b64encode(out.getvalue()).decode(),'options':{'page':0}}
    child=subprocess.run([sys.executable,'-m','cdi_facturx.stamping_job'],input=json.dumps(request).encode(),capture_output=True,timeout=95,check=True)
    read=json.loads(child.stdout);assert read['ok'],read
    groups=read['result']['suggestedImport']['groups'];assert len(groups)==1,groups
    assert len(groups[0]['allocations'])==28 and groups[0]['total_cents']==280000,groups
    assert not groups[0]['errors'],groups[0]['errors']
    print(json.dumps({'payment_scan':'passed','rows':28,'bounded_subprocess':True,'eligible_amounts':True}))

if __name__=='__main__':verify()
