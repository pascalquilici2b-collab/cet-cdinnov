import json
import pytest
from fastapi.testclient import TestClient
from cdi_facturx.api import app

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('FACTURX_API_KEY','s'*40)
    monkeypatch.delenv('FACTURX_DEPLOYMENT',raising=False)
    with TestClient(app) as client:yield client

def test_private_process_requires_machine_key(client):
    r=client.post('/api/stamping/process',files={'file':('x.csv',b'a;b')},data={'payload':json.dumps({'action':'inspect','name':'x.csv'})})
    assert r.status_code==401
    r=client.post('/api/stamping/process',headers={'X-API-Key':'s'*40},files={'file':('x.csv',b'project_name;allocation_amount\nFictif;10,00')},data={'payload':json.dumps({'action':'inspect','name':'x.csv'})})
    assert r.status_code==200 and r.json()['ok'] and r.json()['result']['sheets'][0]['mapping']['allocation_amount']==1
    assert r.headers['cache-control']=='no-store'

def test_process_isolates_bad_files(client):
    r=client.post('/api/stamping/process',headers={'X-API-Key':'s'*40},files={'file':('x.pdf',b'not a PDF')},data={'payload':json.dumps({'action':'extract'})})
    assert r.status_code==200 and r.json()['code']=='INVALID_PDF'

def test_filename_does_not_control_subprocess(client):
    r=client.post('/api/stamping/process',headers={'X-API-Key':'s'*40},files={'file':('../../command.py',b'one;two')},data={'payload':json.dumps({'action':'shell','name':'../../command.py'})})
    assert r.status_code==200 and r.json()['code']=='INVALID_INPUT'
