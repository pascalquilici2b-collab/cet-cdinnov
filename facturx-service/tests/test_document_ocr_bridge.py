"""Machine OCR boundaries, source conflicts and isolated real page rendering."""
import base64
import hashlib
import io
import json
import os
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, DictionaryObject, ArrayObject, TextStringObject, NumberObject, NullObject
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from cdi_facturx.api import app
from cdi_facturx import stamping_pdf as stamp
from cdi_facturx.ocr_bridge import validate_ocr_pages, has_visual_annotations
from cdi_facturx.pdf_import import extract_pdf, ocr_page_pdf
from cdi_facturx.stamping_intake import inspect_documents, split_documents, ranges
from test_stamping import pdf, groups

KEY='fictitious-ocr-machine-test-key-0123456789012345'
TEXT='Facture n° : F-TEST\nFournisseur : FOURNISSEUR-TEST\nDate : 2026-01-31\nTotal HT : 7 177,10 EUR\nTotal TTC : 8 612,52 EUR'


def vision(raw, text=TEXT, **extra):
    return {'page':0,'source_sha256':hashlib.sha256(raw).hexdigest(),'text':text,
            'model':'@cf/google/gemma-4-26b-a4b-it','complete':True,'warnings':[],**extra}


def native_invoice():
    out=io.BytesIO();c=canvas.Canvas(out,pagesize=(595,842))
    for i,line in enumerate(TEXT.splitlines()):
        c.drawString(35,800-i*25,line.replace('F-TEST','F-ORIGINAL'))
    c.save();return out.getvalue()


def signed(raw):
    writer=PdfWriter(clone_from=PdfReader(io.BytesIO(raw)))
    field=DictionaryObject({NameObject('/FT'):NameObject('/Sig'),NameObject('/T'):TextStringObject('fictitious-signature')})
    writer._root_object[NameObject('/AcroForm')]=DictionaryObject({NameObject('/Fields'):ArrayObject([writer._add_object(field)])})
    out=io.BytesIO();writer.write(out);return out.getvalue()


def annotated_native(kind,value='',parent=False,hidden=False):
    writer=PdfWriter(clone_from=PdfReader(io.BytesIO(native_invoice())))
    annotation=DictionaryObject({NameObject('/Type'):NameObject('/Annot'),NameObject('/Subtype'):NameObject('/'+kind),
        NameObject('/Rect'):ArrayObject([NumberObject(n) for n in (50,300,160,335)])})
    if hidden:annotation[NameObject('/F')]=NumberObject(2)
    if kind=='Ink':annotation[NameObject('/InkList')]=ArrayObject([ArrayObject([NumberObject(n) for n in (52,310,75,325,95,309)])])
    elif kind=='FreeText':annotation[NameObject('/Contents')]=TextStringObject('Note fictive écrite sur le PDF')
    elif kind=='Widget':
        field=DictionaryObject({NameObject('/FT'):NameObject('/Tx'),NameObject('/T'):TextStringObject('fictitious-reference'),NameObject('/V'):TextStringObject(value)})
        if parent:annotation[NameObject('/Parent')]=writer._add_object(field)
        else:annotation.update(field)
        writer._root_object[NameObject('/AcroForm')]=DictionaryObject({NameObject('/Fields'):ArrayObject([writer._add_object(field if parent else annotation)])})
    writer.pages[0][NameObject('/Annots')]=ArrayObject([writer._add_object(annotation)])
    out=io.BytesIO();writer.write(out);return out.getvalue()


@pytest.mark.parametrize('change',[
    {'source_sha256':'0'*64}, {'page':True}, {'page':-1}, {'page':1},
    {'text':None}, {'text':'x\x00y'}, {'text':'\ud800'}, {'text':'é'*30001}, {'complete':'true'},
    {'warnings':['x'*301]}, {'model':'https://other.invalid/model'}, {'fields':{'HT':1}},
])
def test_ocr_payload_is_bound_to_source_page_utf8_and_closed_shape(change):
    raw=pdf('INVOICE')
    with pytest.raises(ValueError):validate_ocr_pages(raw,1,[vision(raw,**change)])


def test_duplicate_and_oversized_page_lists_are_refused():
    raw=pdf('INVOICE');entry=vision(raw)
    with pytest.raises(ValueError):validate_ocr_pages(raw,2,[entry,entry])
    with pytest.raises(ValueError):validate_ocr_pages(raw,1,{'page':0})


@pytest.mark.parametrize('exporter',[ocr_page_pdf,stamp.ocr_page])
def test_real_page_export_is_bounded_colour_and_preserves_original(exporter):
    raw=pdf('INVOICE',scan=True);before=hashlib.sha256(raw).hexdigest()
    result=exporter(raw,0)
    assert result['source_sha256']==before and result['page']==0 and result['pages']==1
    assert result['needsOCR'] and result['nativeText']==''
    content=base64.b64decode(result['image'].split(',',1)[1],validate=True)
    with Image.open(io.BytesIO(content)) as image:
        assert image.mode=='RGB' and image.size==(result['width'],result['height'])
        assert image.width*image.height<=4_000_000 and max(image.size)<=2560
    assert len(content)<=3*1024*1024 and hashlib.sha256(raw).hexdigest()==before


@pytest.mark.parametrize('exporter',[ocr_page_pdf,stamp.ocr_page])
def test_ocr_export_preserves_digital_signature_refusal(exporter):
    with pytest.raises(ValueError):exporter(signed(pdf('INVOICE')),0)


@pytest.mark.parametrize('exporter',[ocr_page_pdf,stamp.ocr_page])
@pytest.mark.parametrize('kind,value,parent',[
    ('Ink','',False),('FreeText','',False),('Widget','BC-FICT-042',False),('Widget','BC-FICT-042',True),
])
def test_small_visual_annotation_triggers_vision_despite_complete_native_text(exporter,kind,value,parent):
    raw=annotated_native(kind,value,parent)
    result=exporter(raw)
    assert len(result['nativeText'])>40 and result['needsOCR'] is True


@pytest.mark.parametrize('exporter',[ocr_page_pdf,stamp.ocr_page])
@pytest.mark.parametrize('value',['',' ','Off','/Off'])
def test_empty_or_off_widget_keeps_complete_native_page_local(exporter,value):
    assert exporter(annotated_native('Widget',value))['needsOCR'] is False


@pytest.mark.parametrize('exporter',[ocr_page_pdf,stamp.ocr_page])
def test_small_logo_and_hidden_annotation_do_not_force_vision(exporter):
    out=io.BytesIO();c=canvas.Canvas(out,pagesize=(595,842))
    for i,line in enumerate(TEXT.splitlines()):c.drawString(35,800-i*25,line)
    logo=Image.new('RGB',(30,30),(30,80,150));c.drawImage(ImageReader(logo),500,790,20,20);c.save();logo.close()
    assert exporter(out.getvalue())['needsOCR'] is False
    assert exporter(annotated_native('Ink',hidden=True))['needsOCR'] is False


def test_visual_annotation_inspection_is_bounded_and_rejects_parent_cycles():
    with pytest.raises(ValueError):has_visual_annotations({'/Annots':[{}]*2049})
    node={'/Subtype':'/Widget','/FT':'/Tx'};node['/Parent']=node
    with pytest.raises(ValueError):has_visual_annotations({'/Annots':[node]})
    assert not has_visual_annotations({'/Annots':[{'/Subtype':'/Widget','/FT':'/Tx','/V':NullObject()}]})


def test_stamping_vision_replaces_local_ocr_not_native_evidence(monkeypatch):
    raw=pdf('INVOICE',scan=True)
    monkeypatch.setattr(stamp,'local_ocr',lambda image:pytest.fail('vision supplied: no Tesseract pass'))
    reading=stamp.extract(raw,[vision(raw)])
    assert reading['fields']['invoice_number']=='F-TEST'
    assert reading['bases']['HT']['amount_cents']==717710 and reading['ocr_complete']
    assert reading['ocr_fingerprint'] and reading['ocr_pages'][0]['model'].startswith('@cf/')
    native=native_invoice()
    conflict=stamp.extract(native,[vision(native,text=TEXT.replace('7 177,10','7 177,70'))])
    assert 'invoice_number' not in conflict['fields'] and 'HT' not in conflict['bases']


def test_partial_vision_requires_manual_review_and_keeps_warnings():
    raw=pdf('INVOICE',scan=True)
    reading=stamp.extract(raw,[vision(raw,complete=False,warnings=['Chiffres partiellement illisibles.'])])
    assert not reading['ocr_complete'] and any('illisibles' in w for w in reading['warnings'])
    with pytest.raises(stamp.StampError) as error:stamp.process(raw,groups(kind='INVOICE'),reading=reading)
    assert error.value.code=='REVIEW_REQUIRED'
    result=stamp.analyze(raw,groups(kind='INVOICE'),ocr_pages=[vision(raw,complete=False)])
    assert result['needsAI'] is False and result['error']['code']=='REVIEW_REQUIRED'
    descriptor=inspect_documents(raw,0,[vision(raw,complete=False)])['pages'][0]
    assert descriptor['complete'] is False and 'incomplète' in descriptor['warning']


def test_missing_other_scan_with_failed_local_ocr_stays_incomplete(monkeypatch):
    raw=pdf('INVOICE',scan=True);writer=PdfWriter()
    for _ in range(2):writer.add_page(PdfReader(io.BytesIO(raw)).pages[0])
    output=io.BytesIO();writer.write(output);raw=output.getvalue()
    monkeypatch.setattr(stamp,'local_ocr',lambda image:('','OCR_FAILED'))
    reading=stamp.extract(raw,[vision(raw)])
    assert reading['pages'][0]['complete'] and not reading['pages'][1]['complete']
    assert not reading['ocr_complete']


def test_new_ocr_invalidates_signed_cache_and_is_re_attested(monkeypatch):
    monkeypatch.setenv('FACTURX_API_KEY',KEY)
    raw=native_invoice()
    first=stamp.analyze(raw,[])
    cached=first['cachedReading']
    changed=stamp.analyze(raw,[],cached=cached,ocr_pages=[vision(raw,text=TEXT.replace('7 177,10','7 177,70'))])
    reading=changed['cachedReading']['reading']
    assert reading['ocr_fingerprint'] and 'HT' not in reading['bases']
    assert changed['cachedReading']['receipt']!=cached['receipt']
    assert stamp.reading_receipt(reading)==changed['cachedReading']['receipt']
    assert changed.get('pdf') is None


def test_split_remaps_vision_to_exact_part_bytes_and_attests_cache(monkeypatch):
    monkeypatch.setenv('FACTURX_API_KEY',KEY)
    writer=PdfWriter()
    for _ in range(2):writer.add_page(PdfReader(io.BytesIO(pdf('INVOICE',scan=True))).pages[0])
    output=io.BytesIO();writer.write(output);raw=output.getvalue()
    entries=[vision(raw,text=TEXT.replace('F-TEST',f'F-PIECE-{n}'),page=n) for n in range(2)]
    descriptors=inspect_documents(raw,[0,1],entries)['pages']
    parts=split_documents(raw,descriptors,entries)['parts']
    assert len(parts)==2
    for n,part in enumerate(parts):
        content=base64.b64decode(part['pdf']);cached=part['cachedReading'];reading=cached['reading']
        assert reading['source_sha256']==hashlib.sha256(content).hexdigest()!=hashlib.sha256(raw).hexdigest()
        assert reading['fields']['invoice_number']==f'F-PIECE-{n}' and reading['ocr_pages'][0]['page']==0
        assert stamp.reading_receipt(reading)==cached['receipt'] and reading['ocr_fingerprint']
        assert 'text' not in reading and all('text' not in p for p in reading['ocr_pages'])
        monkeypatch.setattr(stamp,'extract',lambda *_:pytest.fail('signed part cache must avoid OCR'))
        analyzed=stamp.analyze(content,[],cached=cached)
        assert analyzed['cachedReading']==cached
    with pytest.raises(ValueError):split_documents(raw,descriptors,[{**entries[0],'source_sha256':'0'*64}])


def test_signature_notice_does_not_split_readable_continuation_pages():
    first={'page':0,'fields':{'invoice_number':'F-TEST','document_type':'INVOICE'},'hasText':True,'complete':True,'warning':'Signature manuscrite présente.','pageNumber':1}
    second={**first,'page':1,'pageNumber':2}
    assert len(ranges([first,second]))==1
    assert len(ranges([first,{**second,'warning':'Chiffres illisibles.'}]))==2


def test_facturx_scans_gain_candidates_but_conflicting_fields_are_removed():
    raw=pdf('INVOICE',scan=True)
    result=extract_pdf(raw,ocr_pages=[vision(raw)])
    assert result['candidates']['number']=='F-TEST'
    assert result['candidates']['totals']=={'net':'7177.10','gross':'8612.52'}
    assert result['ocr_complete'] and result['requires_review']
    native=native_invoice()
    conflict=extract_pdf(native,ocr_pages=[vision(native,text=TEXT.replace('7 177,10','7 177,70'))])
    assert 'number' not in conflict['candidates'] and 'net' not in conflict['candidates']['totals']
    assert any('contradictoires' in w for w in conflict['warnings'])


def test_facturx_ocr_cannot_replace_native_parties_or_payment():
    native_text=TEXT+'\nClient : CLIENT NATIF\nFournisseur : SOCIETE NATIVE\nIBAN : FR7600000000000000000000000'
    out=io.BytesIO();c=canvas.Canvas(out,pagesize=(595,842))
    for i,line in enumerate(native_text.splitlines()):c.drawString(35,800-i*25,line)
    c.save();raw=out.getvalue()
    changed=native_text.replace('CLIENT NATIF','CLIENT VISION').replace('SOCIETE NATIVE','SOCIETE VISION').replace('FR7600000000000000000000000','FR7611111111111111111111111')
    result=extract_pdf(raw,ocr_pages=[vision(raw,text=changed)])
    assert 'name' not in result['invoice'].get('seller',{})
    assert 'name' not in result['invoice'].get('buyer',{})
    assert 'client' not in result['candidates'] and 'iban' not in result['candidates']
    assert any('seller.name' in w and 'buyer.name' in w and 'payment.iban' in w for w in result['warnings'])


def test_ocr_corrections_with_two_final_amounts_or_numbers_require_review():
    raw=pdf('INVOICE',scan=True)
    ambiguous=TEXT+'\nFacture n° : F-AUTRE\nTotal HT : 7 177,70 EUR'
    result=extract_pdf(raw,ocr_pages=[vision(raw,text=ambiguous)])
    assert 'number' not in result['candidates'] and 'net' not in result['candidates']['totals']
    assert any('contradictoires' in w for w in result['warnings'])
    discounted=TEXT+'\nTotal HT net : 6 000,00 EUR'
    result=extract_pdf(raw,ocr_pages=[vision(raw,text=discounted)])
    assert result['candidates']['totals']['net']=='6000.00'
    raw=native_invoice()
    corrected=TEXT.replace('F-TEST','F-ORIGINAL')+'\nTotal HT : 7 177,70 EUR\nDate : 2026-02-01'
    result=extract_pdf(raw,ocr_pages=[vision(raw,text=corrected)])
    assert 'net' not in result['candidates']['totals'] and 'issue_date' not in result['candidates']
    result=extract_pdf(raw,ocr_pages=[vision(raw,text=TEXT+'\nTotal TTC : 9 000,00 EUR')])
    assert 'gross' not in result['invoice']['totals'] and 'due' not in result['invoice']['totals']


def test_native_and_ocr_vat_rows_are_not_added_twice():
    original=TEXT+'\nTVA 20 % : 1 435,42 EUR'
    out=io.BytesIO();c=canvas.Canvas(out,pagesize=(595,842))
    for i,line in enumerate(original.splitlines()):c.drawString(35,800-i*25,line)
    c.save();raw=out.getvalue()
    result=extract_pdf(raw,ocr_pages=[vision(raw,text=original.replace('TVA 20 % :','TVA 20%:'))])
    assert result['candidates']['totals']['vat']=='1435.42'
    assert not any('TVA incohérente' in w for w in result['warnings'])


def test_real_stamping_subprocess_exports_and_attests_machine_ocr(monkeypatch):
    raw=pdf('INVOICE',scan=True);encoded=base64.b64encode(raw).decode()
    env={**os.environ,'FACTURX_API_KEY':KEY}
    def call(payload):
        done=subprocess.run([sys.executable,'-m','cdi_facturx.stamping_job'],
                            input=json.dumps({'file':encoded,**payload}).encode(),
                            capture_output=True,timeout=30,env=env,check=True)
        result=json.loads(done.stdout)
        assert done.stderr==b'' and result['ok'],result
        return result['result']
    rendered=call({'action':'ocr-page','page':0})
    assert rendered['source_sha256']==hashlib.sha256(raw).hexdigest() and rendered['width']*rendered['height']<=4_000_000
    analyzed=call({'action':'analyze','groups':[],'ocrPages':[vision(raw)]})
    assert analyzed['cachedReading']['reading']['fields']['invoice_number']=='F-TEST'
    monkeypatch.setenv('FACTURX_API_KEY',KEY)
    assert stamp.reading_receipt(analyzed['cachedReading']['reading'])==analyzed['cachedReading']['receipt']


def test_ocr_api_requires_machine_auth_even_for_local_deployment(monkeypatch):
    monkeypatch.setenv('FACTURX_API_KEY',KEY)
    raw=pdf('INVOICE',scan=True)
    files={'pdf':('fictitious.pdf',raw,'application/pdf')}
    with TestClient(app) as client:
        assert client.post('/api/invoices/ocr-page',files=files).status_code==401
        assert client.post('/api/invoices/read-pdf',files=files,data={'ocrPages':json.dumps([vision(raw)])}).status_code==401
        headers={'X-API-Key':KEY}
        rendered=client.post('/api/invoices/ocr-page',headers=headers,files=files,data={'page':'0'})
        assert rendered.status_code==200,rendered.text
        assert rendered.json()['source_sha256']==hashlib.sha256(raw).hexdigest()
        read=client.post('/api/invoices/read-pdf',headers=headers,files=files,data={'ocrPages':json.dumps([vision(raw)])})
        assert read.status_code==200,read.text
        assert read.json()['candidates']['number']=='F-TEST'
        assert client.post('/api/invoices/read-pdf',headers=headers,files=files,data={'ocrPages':'{'}).status_code==422
        monkeypatch.delenv('FACTURX_API_KEY')
        assert client.post('/api/invoices/ocr-page',files=files).status_code==401
        assert client.post('/api/invoices/read-pdf',files=files,data={'ocrPages':'[]'}).status_code==401
