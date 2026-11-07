"""Scanner paper gradients must not consume blank space or erase original ink."""
import io

import pytest
from PIL import Image, ImageDraw

from cdi_facturx.stamping_vision import foreground, _paper_plane
from cdi_facturx.stamping_pdf import find_space, safe


def paper(width=595,height=842,tint=(0,0,0),reverse=False):
    image=Image.new('RGB',(width,height))
    for y in range(height):
        row=[]
        for x in range(width):
            value=round(234+12*x/(width-1)+8*y/(height-1))
            if reverse:value=488-value
            row.append(tuple(value-offset for offset in tint))
        line=Image.new('RGB',(width,1));line.putdata(row);image.paste(line,(0,y));line.close()
    return image


@pytest.mark.parametrize('tint,reverse',[((0,0,0),False),((0,2,7),False),((0,0,0),True)])
def test_gently_shaded_paper_has_real_free_space_and_keeps_every_mark(tint,reverse):
    image=paper(tint=tint,reverse=reverse);draw=ImageDraw.Draw(image)
    draw.text((35,35),'Synthetic invoice information',fill=(30,30,30))
    marks=[(x,100+n*30) for n,x in enumerate((50,150,250,350,450))]
    for x,y in marks:
        original=image.getpixel((x,y));draw.point((x,y),fill=tuple(c-6 for c in original))
    draw.line((340,650,515,695),fill=(110,70,160),width=1)
    draw.rectangle((400,730,500,760),fill=(225,230,235))
    assert _paper_plane(image) is not None
    mask=foreground(image)
    for point in marks+[(340,650),(515,695),(450,745)]:assert mask.getpixel(point)==255
    assert safe(mask,50,400,180,95)
    assert not safe(mask,340,640,180,80)
    point=find_space(mask,{'width':180,'height':95});assert point is not None
    image.close();mask.close()


def test_jpeg_paper_gradient_keeps_small_print_and_signature():
    image=paper();draw=ImageDraw.Draw(image)
    draw.text((35,35),'Invoice 123 - 45.67 EUR',fill=(20,20,20))
    draw.line((350,660,510,690),fill=(110,85,160),width=2)
    output=io.BytesIO();image.save(output,format='JPEG',quality=90);image.close()
    with Image.open(io.BytesIO(output.getvalue())) as jpeg:
        decoded=jpeg.convert('RGB');mask=foreground(decoded)
    assert _paper_plane(decoded) is not None
    assert safe(mask,50,400,180,95)
    assert not safe(mask,350,650,180,80)
    decoded.close();mask.close()


@pytest.mark.parametrize('background',[(120,120,120),(225,235,253)])
def test_dark_or_colored_full_page_artwork_is_not_classified_as_gradient_paper(background):
    image=Image.new('RGB',(595,842),background)
    draw=ImageDraw.Draw(image);draw.rectangle((150,150,450,650),fill=(200,210,240))
    assert _paper_plane(image) is None
    mask=foreground(image);assert not safe(mask,150,200,180,95)
    image.close();mask.close()


def test_strong_non_linear_shadow_stays_occupied():
    image=paper();draw=ImageDraw.Draw(image)
    draw.rectangle((200,250,500,500),fill=(200,200,200))
    mask=foreground(image)
    assert not safe(mask,220,300,180,95)
    image.close();mask.close()


def test_paper_detection_does_not_modify_any_source_pixel():
    image=paper(180,200);before=image.tobytes()
    mask=foreground(image)
    assert image.tobytes()==before
    image.close();mask.close()
