"""Container-build smoke test: real local OCR and deterministic stamping, fictional data only."""
import io
import json
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

if __name__=='__main__':verify()
