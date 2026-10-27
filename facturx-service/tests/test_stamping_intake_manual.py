import base64
import io
from unittest.mock import patch
import pytest
from reportlab.pdfgen import canvas
from pypdf import PdfReader
from cdi_facturx.stamping_pdf import FONT, StampError
from cdi_facturx.stamping_intake import inspect_documents, split_documents, descriptor, ranges
from cdi_facturx.stamping_manual import confirm
from test_stamping import pdf, groups


def bundle():
    out=io.BytesIO(); c=canvas.Canvas(out,pagesize=(595,842))
    for employee,period,page in [('SAL-TEST','2026-01',1),('SAL-TEST','2026-01',2),('SAL-TEST','2026-02',1),('AUTRE','2026-02',1)]:
        c.setFont(FONT,11)
        for i,text in enumerate(['Bulletin de paie - FICTIF',f'Matricule : {employee}',f'Période : {period}',f'Page {page} / {2 if period=="2026-01" else 1}', 'Total versé par l’employeur : 7 177,10 EUR']):
            c.drawString(32,810-i*20,text)
        c.showPage()
    c.save();return out.getvalue()


def test_separate_people_months_keep_continuation_and_bytes():
    raw=bundle(); info=inspect_documents(raw); result=split_documents(raw,info['pages'])
    assert [(p['start'],p['end']) for p in result['parts']]==[(0,1),(2,2),(3,3)]
    assert [len(PdfReader(io.BytesIO(base64.b64decode(p['pdf']))).pages) for p in result['parts']]==[2,1,1]
    assert '2026-02' in PdfReader(io.BytesIO(base64.b64decode(result['parts'][1]['pdf']))).pages[0].extract_text()
    single=pdf();assert split_documents(single,inspect_documents(single)['pages'])['parts'][0]['original']


def test_invoices_and_unreadable_scan_are_separate():
    pages=[descriptor('Facture n° A\nPage 1 / 2',0),descriptor('Facture n° A\nPage 2 / 2',1),descriptor('Facture n° B\nPage 1 / 1',2)]
    assert [(p['start'],p['end']) for p in ranges(pages)]==[(0,1),(2,2)]
    pages=[descriptor('Bulletin de paie\nMatricule : A\nPériode : 2026-01',0),descriptor('',1,'ocr','OCR_FAILED'),descriptor('Bulletin de paie\nMatricule : B\nPériode : 2026-01',2)]
    assert len(ranges(pages))==3


def test_scanned_page_ocr_is_bounded_and_partitions():
    raw=pdf(scan=True)
    assert inspect_documents(raw)['pages'][0]['needsOCR']
    with patch('cdi_facturx.stamping_intake.local_ocr',return_value=('Bulletin de paie\nMatricule : SAL-TEST\nPériode : 2026-01','')) as ocr:
        page=inspect_documents(raw,0)['pages'][0]
        assert page['fields']['employee_ref']=='SAL-TEST';assert ocr.call_count==1


def test_manual_confirm_never_extracts_or_requires_old_ocr_to_agree():
    g=groups(1)
    choice={'groupId':g[0]['id'],'identityConfirmed':True,'baseConfirmed':True,'baseAmount':'7500','reason':'Correction humaine vérifiée'}
    with patch('cdi_facturx.stamping_pdf.extract',side_effect=AssertionError('Unexpected extraction')):
        result=confirm(pdf(),g,choice,options={'allowOverlap':True})
    assert result['base_cents']==750000
    assert result['total_cents']==10000
    assert result['manualConfirmation']['withoutAnalysis']
    assert all(result['checks'].values())


def test_manual_confirm_still_checks_overallocation_and_confirmation():
    g=groups(1);choice={'groupId':g[0]['id'],'identityConfirmed':True,'baseConfirmed':True,'baseAmount':'99','reason':'Correction vérifiée'}
    with pytest.raises(StampError,match='dépasse'):confirm(pdf(),g,choice)
    choice['baseAmount']='150';choice['baseConfirmed']=False
    with pytest.raises(StampError,match='Confirmez'):confirm(pdf(),g,choice)
    choice['baseConfirmed']=True
    with pytest.raises(StampError):confirm(b'not a pdf',g,choice)


def test_direct_manual_total_is_authoritative_without_ocr():
    with patch('cdi_facturx.stamping_pdf.extract',side_effect=AssertionError('Unexpected extraction')):
        result=confirm(pdf('INVOICE'),[],direct={'project':'Projet test','basis':'HT','vatRate':'20','amount':'100','manualTotal':'240','manualConfirmed':True},options={'allowOverlap':True})
    assert result['base_cents']==20000 and result['total_cents']==10000
