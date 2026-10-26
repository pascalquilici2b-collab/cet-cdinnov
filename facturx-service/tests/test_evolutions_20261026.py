import io
import base64
from copy import deepcopy
import pytest
from reportlab.pdfgen import canvas
from cdi_facturx.stamping_pdf import analyze,extract,StampError,FONT
from cdi_facturx.stamping_direct import direct_allocation
from cdi_facturx.billing_document import DraftDocument
from cdi_facturx.document_pdf import render_document
from tests.test_document_pdf import fixture,extract as pdf_text

def invoice(ht='100,00',ttc='120,00'):
    out=io.BytesIO();c=canvas.Canvas(out);c.setFont(FONT,11)
    for i,line in enumerate(['Facture n° FACT-TEST','Date : 2026-10-26',*(['Total HT : '+ht+' EUR'] if ht else []),*(['Total TTC : '+ttc+' EUR'] if ttc else [])]):c.drawString(30,800-i*25,line)
    c.save();return out.getvalue()

def test_direct_ht_ttc_rate_and_complete_pdf():
    raw=invoice();config={'project':'Projet fictif','programme':'Interreg Italie-France Maritime','basis':'HT','vatRate':'20','amount':'100'}
    result=analyze(raw,[],{'allowAppendix':True},direct=config)
    assert 'error' not in result,result
    assert result['total_cents']==10000 and result['base_cents']==10000 and all(result['checks'].values())
    assert '100,00' in pdf_text(base64.b64decode(result['pdf']))
    ttc=analyze(raw,[],{'allowAppendix':True},direct={**config,'basis':'TTC','amount':'120'})
    assert ttc['total_cents']==12000
    assert analyze(raw,[],direct={**config,'vatRate':'10'})['error']['code']=='VAT_MISMATCH'
    assert direct_allocation(invoice(ht=''),extract(invoice(ht='')),{**config,'vatRate':'20'})[1]==10000

def test_manual_total_requires_confirmation_and_never_overwrites_read_amount():
    raw=invoice();reading=extract(raw);base={'project':'Test','programme':'Maritime','basis':'HT','vatRate':'20','manualTotal':'130','amount':'50'}
    with pytest.raises(StampError):direct_allocation(raw,reading,base)
    with pytest.raises(StampError):direct_allocation(raw,reading,{**base,'manualConfirmed':True})
    empty=invoice(ht='',ttc='');reading=extract(empty)
    assert direct_allocation(empty,reading,{**base,'manualConfirmed':True})[1]==10833

def test_partial_entered_amount_is_stamped_without_calculating_the_allocation():
    raw=invoice();config={'project':'Projet fictif','programme':'Maritime','basis':'HT','vatRate':'20','amount':'29,15'}
    result=analyze(raw,[],{'allowAppendix':True},direct=config)
    assert 'error' not in result,result
    assert result['total_cents']==2915 and result['base_cents']==10000
    assert result['allocations'][0]['amount_cents']==2915
    assert '29,15' in pdf_text(base64.b64decode(result['pdf']))
    for amount,code in [('', 'AMOUNT_REQUIRED'),('100.01','OVER_ALLOCATION'),('0','NO_ALLOCATION'),('-1','NO_ALLOCATION')]:
        assert analyze(raw,[],direct={**config,'amount':amount})['error']['code']==code
    assert analyze(raw,[],direct={**config,'basis':'TTC','amount':'110'})['total_cents']==11000

def test_custom_period_quote_object_order_forfait_and_invoice_no_return_email():
    for kind in ('invoice','quote'):
        d,t=fixture(kind);d['details']={'marketObject':'','period':'','periods':[],'customPeriod':'Janvier à juin 2026','personInCharge':'','fundingProgramme':'','validityMonths':'3','returnEmail':'retour@example.test','interventions':[]}
        d['lines'][0]['unitCode']='LS';d['references']['otherReference']='Dossier complémentaire';d['references']['orderReference']='BC-TEST'
        validated=DraftDocument.model_validate(d).model_dump();text=pdf_text(render_document(validated,t,number='TEST-001',issued=True))
        assert 'Janvier à juin 2026' in text and 'Dossier complémentaire' in text
        if kind=='quote':
            assert text.index('DESTINATAIRE')<text.index(d['title'])<text.index('Période concernée')
            assert 'retour@example.test' in text
        else:
            assert d['title'] not in text and 'retour@example.test' not in text
            assert 'N° : BC-TEST' in text
    # No references other than the quote subject: no zero-row ReportLab table.
    d,t=fixture('quote');d['references']={k:'' for k in d['references']};assert d['title'] in pdf_text(render_document(d,t))
