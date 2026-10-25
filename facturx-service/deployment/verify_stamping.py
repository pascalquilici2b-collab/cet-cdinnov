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
