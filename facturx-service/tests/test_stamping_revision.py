import base64
from copy import deepcopy
from uuid import uuid4
import pytest
from cdi_facturx import stamping_pdf as s
from cdi_facturx.stamping_import import review_import
from test_stamping import pdf, groups

def test_revision_never_reads_again_and_keeps_previous_changes(monkeypatch):
    raw=pdf();first=s.process(raw,groups(4),{'allowOverlap':True})
    monkeypatch.setattr(s,'extract',lambda *args:pytest.fail('A revision must not extract text, run OCR or AI'))
    first_id=first['allocations'][0]['id']
    correction={'allocationId':first_id,'amount':'125.50','reason':'Relecture du document','confirmed':True}
    changed=s.revise(raw,first,{'allowOverlap':True},[correction],[{'id':'manual-'+str(uuid4()),'project':'PROJET OUBLIÉ','amount':'55,50'}])
    assert changed['total_cents']==48100
    assert changed['allocations'][-1]['manual']
    b=changed['blocks'][0];p={**b,'x':80,'y':270,'scale':.7}
    moved=s.revise(raw,changed,{'placements':[p],'allowOverlap':True})
    assert moved['total_cents']==48100 and moved['allocations']==changed['allocations']
    assert moved['blocks'][0]['width']==pytest.approx(b['layoutWidth']*.7)
    assert moved['blocks'][0]['x']==80 and moved['blocks'][0]['fontSize']==3.5
    assert all(moved['checks'].values())
    assert base64.b64decode(moved['blocks'][0]['image']).startswith(b'\x89PNG')

def test_revision_overrun_invalid_placement_and_unchanged_source():
    raw=pdf();first=s.process(raw,groups(4))
    with pytest.raises(s.StampError,match='dépasse'):
        s.revise(raw,first,additions=[{'id':'manual-'+str(uuid4()),'project':'EXTRA','amount':'9999'}])
    with pytest.raises(s.StampError):s.revise(pdf('INVOICE'),first)
    for p in [{**first['blocks'][0],'x':-1},{**first['blocks'][0],'scale':float('nan')},{**first['blocks'][0],'scale':4},{**first['blocks'][0],'allocationIds':[]}]:
        with pytest.raises(s.StampError):s.revise(raw,first,{'placements':[p],'allowOverlap':True})
    assert first['total_cents']==40000

def test_revision_preserves_appendix_and_split_blocks():
    raw=pdf('INVOICE',dense=True);first=s.process(raw,groups(12,'INVOICE'),{'allowAppendix':True})
    assert len(first['blocks'])>1
    positions=[{**b,'x':35,'scale':.8} for b in first['blocks']]
    moved=s.revise(raw,first,{'allowAppendix':True,'placements':positions})
    assert moved['total_cents']==120000
    assert len(moved['blocks'])==len(first['blocks'])
    assert all(b['page']>=1 for b in moved['blocks'])

def test_add_project_to_payment_review():
    original={'groups':groups(4),'errors':[]};g=original['groups'][0]
    new={'added':True,'groupId':g['id'],'allocationId':'manual-'+str(uuid4()),'project':'OUBLIÉ','amount':'25,50'}
    result=review_import(original,[new])
    assert result['groups'][0]['total_cents']==42550
    assert len(original['groups'][0]['allocations'])==4
    assert result['groups'][0]['allocations'][-1]['source']['rule']=='MANUAL'
    with pytest.raises(ValueError):review_import(original,[new,new])
    bad=review_import(original,[{**new,'amount':'99999'}]);assert bad['groups'][0]['errors']
