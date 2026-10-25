import io
from copy import deepcopy
import pytest
from openpyxl import Workbook
from cdi_facturx.stamping_import import inspect, review_import, combine_inspections
from cdi_facturx.stamping_pdf import process


def services_table(kind='xlsx'):
    rows=[['Fournisseur','N° facture','Date facture','Projet','Montant HT','Montant imputé','Montant éligible projet']]
    rows += [['FOURNISSEUR-TEST','F-TEST','31/01/2026',name,'7177.10',reported,eligible]
             for name,reported,eligible in [('Projet A','3500.00','1234.56'),('Projet B','2000.00','789.10')]]
    output=io.BytesIO()
    if kind=='xlsx':
        book=Workbook()
        for row in rows:book.active.append(row)
        book.save(output)
    else:
        from reportlab.platypus import SimpleDocTemplate,Table,TableStyle
        from reportlab.lib.pagesizes import landscape,A4
        from cdi_facturx.stamping_pdf import FONT
        table=Table(rows,colWidths=[128,80,80,75,80,90,145],rowHeights=35)
        table.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.5,'black'),('FONTNAME',(0,0),(-1,-1),FONT),('FONTSIZE',(0,0),(-1,-1),8)]))
        SimpleDocTemplate(output,pagesize=landscape(A4),leftMargin=20,rightMargin=20).build([table])
    return output.getvalue()


@pytest.mark.parametrize('kind',['xlsx','pdf'])
def test_services_stamp_project_eligible_amount_not_invoice_or_reported_total(kind):
    result=inspect(services_table(kind),'paiement.'+kind,{'category':'SERVICES'})['suggestedImport']
    assert not result['errors'] and len(result['groups'])==1
    group=result['groups'][0]
    assert group['document_type']=='INVOICE' and group['base_type']=='HT'
    assert group['invoice_date']=='2026-01-31'
    assert group['base_amount_cents']==717710
    assert [a['amount_cents'] for a in group['allocations']]==[123456,78910]
    from test_stamping import pdf
    stamped=process(pdf('INVOICE'),result['groups'])
    assert stamped['total_cents']==202366
    assert [a['amount_cents'] for a in stamped['allocations']]==[123456,78910]
    before=deepcopy(result);a=group['allocations'][0]
    reviewed=review_import(result,[{'groupId':group['id'],'allocationId':a['id'],'supplier':'FOURNISSEUR-TEST','invoiceNumber':'F-TEST','project':'Projet rectifié','amount':'1250,00'}])
    assert result==before and reviewed['groups'][0]['period']==''
    assert reviewed['groups'][0]['total_cents']==203910
    assert reviewed['groups'][0]['allocations'][0]['source']==a['source']


def test_empty_pdf_import_returns_actionable_error():
    with pytest.raises(ValueError,match='Aucun tableau reconnu'):
        combine_inspections([{'sheets':[],'sha256':'x'}])


def test_partial_page_headers_preserve_previous_layout_without_swapping_columns():
    from cdi_facturx.stamping_import import complete_layout
    full={'employee_ref':0,'period':1,'base_amount':2,'project_name':3,'allocation_amount':5}
    partial={k:v for k,v in full.items() if k!='base_amount'}
    assert complete_layout(partial,full,12)==full
    assert complete_layout({k:v for k,v in full.items() if k!='period'},partial,12)==full
    changed={**partial,'allocation_amount':6}
    assert complete_layout(changed,full,12)==changed


def test_dense_scan_uses_small_ocr_batches(monkeypatch):
    import pymupdf
    from PIL import Image
    from types import SimpleNamespace
    from cdi_facturx.stamping_tables import scan_grid
    from reportlab.pdfgen import canvas
    output=io.BytesIO();c=canvas.Canvas(output,pagesize=(800,600))
    for x in range(25,776,75):c.line(x,30,x,570)
    for y in range(30,571,12):c.line(25,y,775,y)
    for row in range(44):
        for col in range(10):c.drawString(30+col*75,36+row*12,'Test 1,23')
    c.save();doc=pymupdf.open(stream=output.getvalue(),filetype='pdf');sizes=[]
    monkeypatch.setattr('shutil.which',lambda _: 'tesseract')
    def run(args,**kwargs):
        with Image.open(args[1]) as image:
            sizes.append(image.size)
            assert image.mode=='L' and image.width*image.height<=2400*2160
        return SimpleNamespace(stdout=b'level\tleft\ttop\twidth\theight\ttext\n')
    monkeypatch.setattr('subprocess.run',run)
    assert scan_grid(doc[0]) and len(sizes)>1
