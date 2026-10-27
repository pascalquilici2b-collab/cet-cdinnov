"""Bounded image preparation; original PDF pixels are never rewritten."""
import math
from PIL import Image, ImageChops, ImageOps
import pypdfium2 as pdfium


def render_ocr(page):
    # 300 dpi on A4, capped for oversized pages and the isolated worker budget.
    scale=min(300/72, math.sqrt(8_500_000/(page.get_width()*page.get_height())))
    bitmap=page.render(scale=scale,grayscale=True,draw_annots=True)
    try:return bitmap.to_pil().convert('L').copy()
    finally:bitmap.close()


def needs_ocr(page,text,reading):
    if len(text.strip())<40:return True
    fields=reading['fields']
    complete=(fields.get('document_type')=='PAYSLIP' and fields.get('period') and
              (fields.get('employee_ref') or fields.get('employee_name')) and reading['bases'].get('EMPLOYER_COST'))
    complete=complete or (fields.get('document_type')=='INVOICE' and fields.get('invoice_number') and reading['bases'])
    if complete:return False
    # A native header/footer is not evidence that the scanned body was read.
    raster_area=sum(max(0,r-l)*max(0,t-b) for obj in page.get_objects(max_depth=8)
                    if obj.type==pdfium.raw.FPDF_PAGEOBJ_IMAGE for l,b,r,t in [obj.get_bounds()])
    return raster_area>page.get_width()*page.get_height()*.2 or text.count('\ufffd')>max(3,len(text)*.02)


def prepare_ocr(image):
    gray=image.convert('L')
    # Lift gray paper to white without turning pale characters into black noise.
    normalized=ImageOps.autocontrast(gray,cutoff=0,preserve_tone=True);gray.close()
    return normalized


def foreground(image):
    """Ignore uniform light paper, keep dark/faint text and colored artwork.

    Estimate only a dominant *light* background. No erosion or removal of small
    components: a decimal point or a thin rule is still occupied content.
    """
    sample=image.copy();sample.thumbnail((512,512))
    background=[]
    for channel in sample.split():
        histogram=channel.histogram();peak=max(range(220,256),key=lambda n:histogram[n])
        coverage=sum(histogram[max(0,peak-2):min(256,peak+3)])/sum(histogram)
        background.append(peak if coverage>.5 else 255);channel.close()
    sample.close()
    paper=Image.new('RGB',image.size,tuple(background))
    diff=ImageChops.difference(image,paper);paper.close()
    red,green,blue=diff.split();diff.close()
    mask=ImageChops.lighter(ImageChops.lighter(red,green),blue).point(lambda p:255 if p>5 else 0)
    red.close();green.close();blue.close()
    return mask
