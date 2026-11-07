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


def _paper_plane(image):
    """Recognise only a well-supported, light, nearly neutral paper gradient.

    Sparse, original pixels avoid averaging faint ink into the paper estimate.
    A failed fit keeps the existing conservative occupancy mask. No components
    are removed and this never changes the source image or the OCR pixels.
    """
    width,height=image.size
    if min(width,height)<64:return None
    points=set()
    for i in range(32):
        along=(i+.5)/32
        for edge in (.02,.04,.96,.98):
            points.add((round(along*(width-1)),round(edge*(height-1))))
            points.add((round(edge*(width-1)),round(along*(height-1))))
    samples=[]
    for x,y in sorted(points):
        color=image.getpixel((x,y))
        if min(color)>=220 and max(color)-min(color)<=24:
            samples.append((x/(width-1),y/(height-1),*color))
    if len(samples)<len(points)*.8:return None

    def fit(rows):
        # Three normal-equation unknowns: constant, horizontal and vertical.
        matrix=[[sum((1,r[0],r[1])[i]*(1,r[0],r[1])[j] for r in rows) for j in range(3)]
                +[sum((1,r[0],r[1])[i]*r[c] for r in rows) for c in (2,3,4)] for i in range(3)]
        for i in range(3):
            pivot=max(range(i,3),key=lambda j:abs(matrix[j][i]))
            if abs(matrix[pivot][i])<1e-9:return None
            matrix[i],matrix[pivot]=matrix[pivot],matrix[i]
            divisor=matrix[i][i];matrix[i]=[v/divisor for v in matrix[i]]
            for j in range(3):
                if j!=i:
                    factor=matrix[j][i];matrix[j]=[v-factor*u for v,u in zip(matrix[j],matrix[i])]
        return [tuple(matrix[i][c] for i in range(3)) for c in (3,4,5)]

    rows=samples
    for _ in range(3):
        model=fit(rows)
        if model is None:return None
        rows=[r for r in samples if max(abs(r[c+2]-(p[0]+p[1]*r[0]+p[2]*r[1])) for c,p in enumerate(model))<=1.5]
        if len(rows)<len(points)*.75:return None
    model=fit(rows)
    if model is None or max(abs(p[1])+abs(p[2]) for p in model)<4:return None
    corners=[tuple(p[0]+p[1]*x+p[2]*y for p in model) for x,y in ((0,0),(1,0),(0,1),(1,1))]
    if any(min(c)<220 or max(c)>256 or max(c)-min(c)>24 for c in corners):return None
    if any(abs(p[1])+abs(p[2])>32 for p in model):return None
    # Confirm the same paper throughout the page, not merely around its border.
    support=0
    for y in range(32):
        fy=(y+.5)/32
        for x in range(32):
            fx=(x+.5)/32;color=image.getpixel((round(fx*(width-1)),round(fy*(height-1))))
            support+=max(abs(color[c]-(p[0]+p[1]*fx+p[2]*fy)) for c,p in enumerate(model))<=1.5
    return model if support>=32*32*.75 else None


def foreground(image):
    """Ignore uniform light paper, keep dark/faint text and colored artwork.

    Estimate only a dominant *light* background. No erosion or removal of small
    components: a decimal point or a thin rule is still occupied content.
    """
    plane=_paper_plane(image)
    if plane is not None:
        mask=Image.new('L',image.size)
        # A stricter threshold than the flat-paper path protects very faint ink.
        # Native Pillow interpolation bounds memory and avoids per-pixel Python.
        for channel,model in enumerate(plane):
            constant,horizontal,vertical=model
            tile=Image.new('F',(2,2))
            tile.putdata([constant,constant+horizontal,constant+vertical,constant+horizontal+vertical])
            interpolated=tile.transform(image.size,Image.Transform.AFFINE,
                (1/(image.width-1),0,.5,0,1/(image.height-1),.5),Image.Resampling.BILINEAR)
            surface=interpolated.convert('L');interpolated.close();tile.close();source=image.getchannel(channel)
            difference=ImageChops.difference(source,surface);source.close();surface.close()
            occupied=difference.point(lambda p:255 if p>2 else 0);difference.close()
            merged=ImageChops.lighter(mask,occupied);mask.close();occupied.close();mask=merged
        return mask
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
