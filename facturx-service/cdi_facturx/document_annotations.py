"""Validated, flattened additions to the visual PDF. They never replace invoice amounts."""
from typing import Annotated, Literal
from xml.sax.saxutils import escape
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator, model_validator
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph

class AnnotationBox(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: Annotated[str, Field(strict=True, pattern=r'(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')]
    page: Annotated[int, Field(strict=True, ge=1, le=100)]
    x: Annotated[int, Field(strict=True, ge=0, le=10000)]
    y: Annotated[int, Field(strict=True, ge=0, le=10000)]
    width: Annotated[int, Field(strict=True, ge=100, le=10000)]
    height: Annotated[int, Field(strict=True, ge=80, le=10000)]

    @field_validator('id')
    @classmethod
    def lowercase_id(cls, value):
        return value.lower()

    @model_validator(mode='after')
    def inside_page(self):
        if self.x + self.width > 10000 or self.y + self.height > 10000:
            raise ValueError('L’ajout doit rester dans la page.')
        return self

class TextAnnotation(AnnotationBox):
    kind: Literal['text']
    text: Annotated[str, Field(strict=True, min_length=1, max_length=2000)]
    fontSize: Annotated[int, Field(strict=True, ge=8, le=24)]
    color: Literal['ink', 'blue', 'red']

    @field_validator('text')
    @classmethod
    def not_empty(cls, value):
        if not value.strip():
            raise ValueError('Le texte est vide.')
        return value

class HighlightAnnotation(AnnotationBox):
    kind: Literal['highlight']
    color: Literal['yellow', 'blue', 'green']

DocumentAnnotation = Annotated[TextAnnotation | HighlightAnnotation, Field(discriminator='kind')]
_adapter = TypeAdapter(Annotated[list[DocumentAnnotation], Field(max_length=80)])

def validate_annotations(value):
    annotations = _adapter.validate_python(value)
    if len({a.id for a in annotations}) != len(annotations):
        raise ValueError('Identifiant d’ajout en double.')
    if sum(len(a.text) for a in annotations if a.kind == 'text') > 20000:
        raise ValueError('Les ajouts dépassent 20 000 caractères.')
    return annotations

def paint_annotations(canvas, annotations, page_count, font_name):
    if any(a.page > page_count for a in annotations):
        raise ValueError('Un ajout est rattaché à une page supprimée. Déplacez-le ou supprimez-le dans la barre d’édition.')
    for a in annotations:
        if a.page != canvas._pageNumber:
            continue
        x, top, width, height = a.x*A4[0]/10000, a.y*A4[1]/10000, a.width*A4[0]/10000, a.height*A4[1]/10000
        canvas.saveState()
        if a.kind == 'highlight':
            canvas.setFillColor(colors.HexColor({'yellow':'#facc15','blue':'#60a5fa','green':'#4ade80'}[a.color]))
            canvas.setFillAlpha(.32)
            canvas.setBlendMode('Multiply')
            canvas.rect(x, A4[1]-top-height, width, height, fill=1, stroke=0)
        else:
            style = ParagraphStyle('addition', fontName=font_name, fontSize=a.fontSize, leading=a.fontSize*1.25,
                                   textColor=colors.HexColor({'ink':'#183643','blue':'#0066cc','red':'#b42318'}[a.color]), spaceBefore=0, spaceAfter=0)
            markup = escape(a.text).replace('\r\n','\n').replace('\r','\n').replace('\t','    ').replace('\n','<br/>')
            paragraph = Paragraph(markup, style)
            _, needed = paragraph.wrap(max(1,width-6), 100000)
            if width <= 6 or needed > height-6:
                raise ValueError('Le texte dépasse son encart. Agrandissez l’encart ou réduisez la taille du texte.')
            paragraph.drawOn(canvas, x+3, A4[1]-top-3-needed)
        canvas.restoreState()
