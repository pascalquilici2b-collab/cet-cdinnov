"""Regression cases: damaged bookmarks, partial text layers and placement gaps."""
import io
import pytest
from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, IndirectObject
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import pypdfium2 as pdfium
from cdi_facturx import stamping_pdf as engine
from cdi_facturx.stamping_intake import inspect_documents
from cdi_facturx.stamping_vision import foreground, render_ocr
from test_stamping import pdf, groups


def dangling_bookmark(raw):
    w=PdfWriter(clone_from=PdfReader(io.BytesIO(raw)))
    w._root_object[NameObject('/Outlines')]=IndirectObject(9999,0,w)
    out=io.BytesIO();w.write(out);return out.getvalue()


def test_damaged_bookmarks_do_not_block_reading_or_stamping():
    raw=dangling_bookmark(pdf())
    reading=engine.extract(raw)
    assert reading['fields']['employee_ref']=='SAL-TEST'
    result=engine.process(raw,groups(1),reading=reading)
    assert all(result['checks'].values())
    assert result['source_sha256']==engine.digest(raw)


def partial_scan():
    with pdfium.PdfDocument(pdf()) as doc:
        bitmap=doc[0].render(scale=2);image=bitmap.to_pil().copy();bitmap.close()
    out=io.BytesIO();c=canvas.Canvas(out,pagesize=(595,842))
    c.drawImage(ImageReader(image),0,0,595,842);image.close()
    c.drawString(20,20,'Archive entreprise - Copie pour consultation interne uniquement')
    c.save();return out.getvalue()


def test_partial_text_layer_is_not_mistaken_for_complete_reading(monkeypatch):
    raw=partial_scan()
    assert inspect_documents(raw)['pages'][0]['needsOCR']
    def ocr(image):
        assert image.mode=='L'
        assert 8_000_000<image.width*image.height<8_600_000
        return 'Bulletin de paie\nMatricule : SAL-TEST\nPériode : 2026-01\nTotal versé par l’employeur : 7 177,10 EUR',''
    monkeypatch.setattr(engine,'local_ocr',ocr)
    read=engine.extract(raw)
    assert read['ocr'] and read['bases']['EMPLOYER_COST']['amount_cents']==717710


def test_native_pdf_is_not_sent_through_ocr(monkeypatch):
    monkeypatch.setattr(engine,'local_ocr',lambda image:pytest.fail('native document needs no OCR'))
    assert not engine.extract(pdf())['ocr']
    assert not inspect_documents(pdf())['pages'][0]['needsOCR']


def test_conflicting_native_and_ocr_amounts_remain_unconfirmed(monkeypatch):
    raw=partial_scan()
    w=PdfWriter(clone_from=PdfReader(io.BytesIO(raw)))
    overlay=io.BytesIO();c=canvas.Canvas(overlay,pagesize=(595,842))
    c.setFont(engine.FONT,8);c.drawString(20,35,'Total versé par l’employeur : 7 177,10 EUR');c.save()
    w.pages[0].merge_page(PdfReader(overlay).pages[0]);out=io.BytesIO();w.write(out)
    monkeypatch.setattr(engine,'local_ocr',lambda image:('Bulletin de paie\nTotal versé par l’employeur : 7 177,70 EUR',''))
    assert 'EMPLOYER_COST' not in engine.extract(out.getvalue())['bases']


@pytest.mark.parametrize('color',[(255,255,255),(230,230,230),(246,241,228)])
def test_light_paper_and_faint_ink(color):
    image=Image.new('RGB',(595,842),color);draw=ImageDraw.Draw(image)
    draw.line((50,50,300,50),fill=tuple(c-12 for c in color),width=1)
    draw.rectangle((400,400,410,410),fill=(10,120,230))
    mask=foreground(image)
    assert engine.safe(mask,100,150,180,80)
    assert not engine.safe(mask,70,40,180,40)
    assert not engine.safe(mask,350,350,100,100)


def test_outline_interiors_are_available_but_text_and_borders_are_protected():
    out=io.BytesIO();c=canvas.Canvas(out,pagesize=(595,842))
    c.rect(20,20,555,802);c.drawString(50,790,'Content to preserve');c.save()
    raw=out.getvalue();reader=PdfReader(io.BytesIO(raw))
    with pdfium.PdfDocument(raw) as doc:
        image=engine.render_page(doc[0],2)
        mask,_=engine.occupancy(doc[0],reader.pages[0],image)
    assert engine.safe(mask,100,200,180,100)
    assert not engine.safe(mask,18,200,180,100)
    assert not engine.safe(mask,50,40,180,20)


def test_search_finds_one_point_gap_between_lattice_positions():
    mask=Image.new('L',(300,300),255)
    # Exactly 180x80 plus safety margins; origin 103,103 is off the old grid.
    ImageDraw.Draw(mask).rectangle((96,96,289,189),fill=0)
    point=engine.find_space(mask,{'width':180,'height':80})
    assert point==(103,103)
    assert engine.safe(mask,*point,180,80)


def test_ocr_render_is_bounded_on_oversized_page():
    out=io.BytesIO();c=canvas.Canvas(out,pagesize=(1900,1900));c.drawString(20,20,'test');c.save()
    with pdfium.PdfDocument(out.getvalue()) as doc:
        image=render_ocr(doc[0])
        assert image.mode=='L' and image.width*image.height<8_510_000
        image.close()


def test_broken_page_content_is_not_discarded():
    w=PdfWriter(clone_from=PdfReader(io.BytesIO(pdf())))
    w.pages[0][NameObject('/Contents')]=IndirectObject(9998,0,w)
    w._root_object[NameObject('/Outlines')]=IndirectObject(9999,0,w)
    out=io.BytesIO();w.write(out)
    with pytest.raises(Exception):engine.extract(out.getvalue())
