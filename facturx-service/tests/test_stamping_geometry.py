"""Synthetic placement cases; occupied rectangles are known before rendering."""
import base64
import io
import random
import math

from PIL import Image, ImageDraw
import pypdfium2 as pdfium
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import pytest

from cdi_facturx import stamping_pdf as s
from test_stamping import groups


def holed_pdf(pages):
    """Black body is occupied; only the specified white holes may be used."""
    stream = io.BytesIO()
    c = canvas.Canvas(stream, pagesize=(595, 842))
    for holes in pages:
        c.setFillColorRGB(0, 0, 0)
        c.rect(0, 0, 595, 842, fill=1, stroke=0)
        # Visible, genuine native invoice evidence in a header too short for a stamp.
        c.setFillColorRGB(1, 1, 1)
        c.rect(0, 792, 595, 50, fill=1, stroke=0)
        c.setFillColorRGB(0, 0, 0)
        c.setFont(s.FONT, 8)
        for y, line in [(830, 'Facture n° F-TEST - DOCUMENT FICTIF'),
                        (817, 'Fournisseur : FOURNISSEUR-TEST'),
                        (804, 'Total HT : 7 177,10 EUR')]:
            c.drawString(20, y, line)
        c.setFillColorRGB(1, 1, 1)
        for x, y, width, height in holes:
            c.rect(x, 842-y-height, width, height, fill=1, stroke=0)
        c.showPage()
    c.save()
    return stream.getvalue()


def assert_inside_holes(result, pages):
    # This oracle does not use the engine's occupancy mask or safe() helper.
    for block in result['blocks']:
        x, y, w, h = (block[k] for k in ('x', 'y', 'width', 'height'))
        assert any(x-7 >= hx and y-7 >= hy and x+w+7 <= hx+hw and y+h+7 <= hy+hh
                   for hx, hy, hw, hh in pages[block['page']])
        assert block['overlap'] is False
        assert block['fontSize'] == 5
    assert all(result['checks'].values())


def test_page_preference_precedes_compact_width_choice():
    narrow, wide = [(40, 200, 166, 114)], [(40, 200, 196, 114)]
    for preference, pages, expected in [('first', [narrow, wide], 0), ('last', [wide, narrow], 1)]:
        result = s.process(holed_pdf(pages), groups(4, 'INVOICE'), {'pagePreference': preference})
        assert len(result['blocks']) == 1
        assert result['blocks'][0]['page'] == expected
        assert result['blocks'][0]['width'] == 150
        assert_inside_holes(result, pages)


def test_split_fits_two_rows_in_separate_narrow_holes():
    pages = [[(40, 200, 166, 80), (350, 400, 166, 80)]]
    result = s.process(holed_pdf(pages), groups(4, 'INVOICE'))
    assert len(result['blocks']) == 2
    assert [len(b['allocationIds']) for b in result['blocks']] == [2, 2]
    assert [b['width'] for b in result['blocks']] == [150, 150]
    assert_inside_holes(result, pages)
    source = PdfReader(io.BytesIO(holed_pdf(pages)))
    output = PdfReader(io.BytesIO(base64.b64decode(result['pdf'])))
    assert len(source.pages) == len(output.pages) == 1
    assert result['total_cents'] == 40000


def test_compact_split_can_fall_back_to_five_point_font():
    pages = [[(40, 200, 196, 95), (350, 400, 196, 95)]]
    result = s.process(holed_pdf(pages), groups(6, 'INVOICE'), {'fontSize': 12, 'compact': True})
    assert len(result['blocks']) == 2
    assert [len(b['allocationIds']) for b in result['blocks']] == [3, 3]
    assert_inside_holes(result, pages)


def test_rectangle_search_matches_independent_exhaustive_oracle():
    rng = random.Random(5619)
    for _ in range(45):
        mask = Image.new('L', (rng.randrange(45, 90), rng.randrange(45, 90)))
        draw = ImageDraw.Draw(mask)
        for _ in range(rng.randrange(1, 12)):
            x, y = rng.randrange(mask.width), rng.randrange(mask.height)
            draw.rectangle((x, y, x+rng.randrange(1, 13), y+rng.randrange(1, 13)), fill=255)
        width, height = rng.randrange(5, 25)+.2, rng.randrange(5, 25)+.6
        expected = None
        # Integer placement, seven-point safety clearance, five-point page rim.
        for y in range(12, mask.height):
            if y+height+7 > mask.height-5:
                break
            for x in range(12, mask.width):
                if x+width+7 > mask.width-5:
                    break
                crop = mask.crop((x-7, y-7, math.ceil(x+width+7), math.ceil(y+height+7)))
                try:
                    if crop.getbbox() is None:
                        expected = (x, y)
                        break
                finally:
                    crop.close()
            if expected:
                break
        assert s.find_space(mask, {'width': width, 'height': height}) == expected
        mask.close()


def test_search_includes_last_position_and_preserves_single_faint_pixel():
    with Image.new('L', (100, 100), 255) as mask:
        ImageDraw.Draw(mask).rectangle((60, 50, 94, 94), fill=0)
        assert s.find_space(mask, {'width': 21, 'height': 31}) == (67, 57)
        assert s.find_space(mask, {'width': 21.2, 'height': 31}) is None
        mask.putpixel((70, 60), 1)
        assert s.find_space(mask, {'width': 21, 'height': 31}) is None


def test_dense_document_can_use_separate_safe_header_and_footer_spaces():
    from test_stamping import pdf
    result = s.process(pdf(dense=True), groups())
    assert len(result['blocks']) == 3
    assert [len(b['allocationIds']) for b in result['blocks']] == [2, 2, 2]
    assert all(b['overlap'] is False and b['fontSize'] == 5 for b in result['blocks'])
    assert all(result['checks'].values())


@pytest.mark.parametrize('nested,rotation,crop', [(False, 0, False), (True, 0, False),
                                                (True, 90, True), (True, 270, True)])
def test_transformed_form_images_protect_the_real_logo(nested, rotation, crop):
    stream = io.BytesIO()
    c = canvas.Canvas(stream, pagesize=(595, 842))
    logo = Image.new('RGB', (100, 100), 'white')
    ImageDraw.Draw(logo).rectangle((5, 5, 12, 12), fill='black')
    c.beginForm('logo', 0, 0, 100, 100)
    c.drawImage(ImageReader(logo), 0, 0, 100, 100)
    c.endForm()
    if nested:
        c.beginForm('outer', 0, 0, 300, 200)
        c.saveState(); c.translate(10, 10); c.scale(2, 1.5); c.doForm('logo'); c.restoreState()
        c.endForm()
    c.saveState(); c.translate(200, 400)
    if not nested:
        c.scale(2, 1.5)
    c.doForm('outer' if nested else 'logo'); c.restoreState()
    c.save(); logo.close()
    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(stream.getvalue())))
    if crop:
        writer.pages[0].cropbox.lower_left = (20, 30)
        writer.pages[0].cropbox.upper_right = (575, 820)
    if rotation:
        writer.pages[0].rotate(rotation)
    source = io.BytesIO(); writer.write(source)
    canonical, normal = s.canonical(s.open_source(source.getvalue()))
    with pdfium.PdfDocument(normal) as document:
        page = document[0]
        with s.render_page(page, 2) as image:
            mask, bounds = s.occupancy(page, canonical.pages[0], image)
        try:
            # A Form's own bounds already include descendants' transforms, so
            # top-level bounds give an independent reference for this artwork.
            outer = next(page.get_objects(max_depth=1))
            left, bottom, right, top = outer.get_bounds()
            center = ((left+right)/2-float(canonical.pages[0].cropbox.left),
                      float(canonical.pages[0].cropbox.top)-(bottom+top)/2)
            assert mask.getpixel(tuple(round(v) for v in center)) == 255
            assert any(rect[0] <= center[0] <= rect[2] and rect[1] <= center[1] <= rect[3]
                       for rect in bounds)
            assert not s.safe(mask, center[0]-10, center[1]-10, 20, 20)
        finally:
            mask.close(); page.close()


def test_placement_version_does_not_invalidate_reading_cache():
    from test_stamping import pdf
    raw = pdf('INVOICE')
    reading = s.extract(raw)
    result = s.process(raw, groups(1, 'INVOICE'), reading=reading)
    assert result['algorithm'] == reading['algorithm'] == s.VERSION
    assert result['placementVersion'] == s.PLACEMENT_VERSION
    metadata = PdfReader(io.BytesIO(base64.b64decode(result['pdf']))).metadata
    assert metadata['/CDIStampPlacementVersion'] == result['placementVersion']


def test_exhausted_search_budget_requests_manual_placement_or_authorized_appendix(monkeypatch):
    pages = [[(40, 200, 166, 114)]]
    monkeypatch.setattr(s, 'MAX_PLACEMENT_SEARCHES', 1)
    calls = []
    real_layout = s.layout
    def counted(*args, **kwargs):
        calls.append(1)
        return real_layout(*args, **kwargs)
    monkeypatch.setattr(s, 'layout', counted)
    with pytest.raises(s.StampError, match='placement manuel') as error:
        s.process(holed_pdf(pages), groups(4, 'INVOICE'))
    assert error.value.code == 'NO_SAFE_AREA'
    assert len(calls) == 1  # Stop layout loops too, not only pixel searches.
    result = s.process(holed_pdf(pages), groups(4, 'INVOICE'), {'allowAppendix': True})
    assert result['blocks'][0]['page'] == 1
    assert result['blocks'][0]['overlap'] is False


def test_forbidden_payroll_annex_never_builds_a_placement_mask(monkeypatch):
    from test_stamping_page_roles import with_annex
    real = s.occupancy
    calls = []
    def counted(page, source, image):
        calls.append(page)
        return real(page, source, image)
    monkeypatch.setattr(s, 'occupancy', counted)
    result = s.process(with_annex(), groups(4), {'pagePreference': 'last'})
    assert len(calls) == 1
    assert result['blocks'][0]['page'] == 0
