import io
import pytest
from pypdf import PdfReader,PdfWriter
from reportlab.pdfgen import canvas
from cdi_facturx import stamping_pdf as s
from test_stamping import pdf,groups

def with_annex():
    writer=PdfWriter(clone_from=PdfReader(io.BytesIO(pdf())))
    out=io.BytesIO();c=canvas.Canvas(out,pagesize=(595,842))
    c.drawString(30,800,'ANNEXE AU BULLETIN DE SALAIRE')
    c.drawString(30,780,'Matricule : SAL-TEST - Periode : 2026-01')
    c.drawString(30,760,'Detail des calculs - Montant net social')
    c.save();writer.add_page(PdfReader(io.BytesIO(out.getvalue())).pages[0])
    out=io.BytesIO();writer.write(out);return out.getvalue()

def test_last_page_preference_never_uses_annex():
    raw=with_annex();result=s.process(raw,groups(4),{'pagePreference':'last','allowAppendix':True})
    assert result['allowedPages']==[0]
    assert result['pageKinds']==['payslip','annex']
    assert all(b['page']==0 for b in result['blocks'])
    with pytest.raises(s.StampError,match='annexe'):
        s.revise(raw,result,{'placements':[{**result['blocks'][0],'page':1}],'allowOverlap':True})

@pytest.mark.parametrize("manual_reading",[False,True])
def test_old_misplaced_preview_is_redrawn_without_reanalysing_amounts(monkeypatch,manual_reading):
    raw=with_annex();old=s.process(raw,groups(4))
    for page in old['reading']['pages']:page.pop('kind',None)
    if manual_reading:old['reading']['pages']=[]
    old['blocks'][0]['page']=1
    monkeypatch.setattr(s,'extract',lambda *_:pytest.fail('Do not reread corrected amounts'))
    result=s.revise(raw,old,{'allowOverlap':True})
    assert result['blocks'][0]['page']==0
    assert result['allocations']==old['allocations']
    assert result['base_cents']==old['base_cents']

def test_dense_payslip_cannot_create_an_annex():
    with pytest.raises(s.StampError,match='bulletin'):
        s.process(pdf(dense=True),groups(12),{'allowAppendix':True})
