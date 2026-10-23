from copy import deepcopy
from pathlib import Path
import pytest
import pymupdf as fitz
from pydantic import ValidationError
from cdi_facturx.billing_document import DraftDocument
from cdi_facturx.document_annotations import validate_annotations
from cdi_facturx.document_pdf import render_document, DocumentPDFError
from tests.test_document_pdf import fixture, extract
from tests.test_billing_issuance import document

def additions():
    return [dict(id='22222222-2222-4222-8222-222222222222',kind='text',page=1,x=1200,y=7800,width=6500,height=700,text='Mention spéciale : validation du chef de file <référence A>.',fontSize=11,color='blue'),
            dict(id='33333333-3333-4333-8333-333333333333',kind='highlight',page=1,x=1200,y=7800,width=6500,height=220,color='yellow')]

def test_legacy_shape_and_annotations_validation():
    d=document()
    assert 'annotations' not in DraftDocument.model_validate(d).model_dump()
    d['annotations']=additions()
    assert DraftDocument.model_validate(d).model_dump()['annotations']==d['annotations']
    for patch in [dict(x=-1),dict(x=9000),dict(page=0),dict(page=101),dict(fontSize=40),dict(width=True),dict(color='javascript:alert(1)'),dict(text=''),dict(extra='unknown')]:
        bad=deepcopy(d);bad['annotations'][0].update(patch)
        with pytest.raises(ValidationError):
            DraftDocument.model_validate(bad)
    with pytest.raises(ValueError):
        validate_annotations([additions()[0],additions()[0]])

def test_additions_flattened_at_same_coordinates_and_highlight_is_translucent():
    d,t=fixture('invoice');d['seller']['siren']='322556580';d['annotations']=additions()
    baseline=render_document({k:v for k,v in d.items() if k!='annotations'},t,number='TEST-001')
    results=[]
    out=Path('../platform/.private/pdf-editor-20261023/pdf');out.mkdir(parents=True,exist_ok=True)
    for issued in [False,True]:
        raw=render_document(d,t,number='TEST-001',issued=issued,editable=not issued)
        assert 'Mention spéciale : validation du chef de file <référence A>.' in extract(raw)
        with fitz.open(stream=raw,filetype='pdf') as pdf:
            found=pdf[0].search_for('Mention spéciale')[0];results.append(tuple(found))
            assert abs(found.x0-(d['annotations'][0]['x']*pdf[0].rect.width/10000+3))<1
            shapes=pdf[0].get_drawings();assert any(.3<(s.get('fill_opacity') or 0)<.34 for s in shapes)
            if issued:assert not any(page.get_links() for page in pdf)
            pdf[0].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(str(out/('issued.png' if issued else 'preview.png')))
        (out/('issued.pdf' if issued else 'preview.pdf')).write_bytes(raw)
    assert results[0]==results[1]
    assert 'Mention spéciale' not in extract(baseline)

def test_page_target_overflow_and_missing_page_are_never_silently_dropped():
    d,t=fixture('invoice');d['annotations']=additions();d['annotations'][0].update(text='un texte long '*100,width=1200,height=100)
    with pytest.raises(DocumentPDFError,match='dépasse'):
        render_document(d,t)
    d['annotations']=[{**additions()[0],'page':99}]
    with pytest.raises(DocumentPDFError,match='page supprimée'):
        render_document(d,t)
    d['lines']=[{**d['lines'][0],'id':f'10000000-0000-4000-8000-{i:012}','description':f'Prestation {i}'} for i in range(45)]
    d['annotations']=[{**additions()[0],'page':2,'text':'MENTION-PAGE-DEUX','y':1000}]
    with fitz.open(stream=render_document(d,None),filetype='pdf') as pdf:
        assert 'MENTION-PAGE-DEUX' not in pdf[0].get_text()
        assert 'MENTION-PAGE-DEUX' in pdf[1].get_text()
