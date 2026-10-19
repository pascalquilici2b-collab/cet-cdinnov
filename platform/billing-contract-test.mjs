// Explicit integration test against the installed production Python dependencies.
// BILLING_TEST_PYTHON must identify a prepared interpreter; no test installs packages.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {blankDraft,newLine,normalizeDraft,calculateBilling} from './billing-domain.ts';
import {invoiceForFacturX} from './billing-facturx.ts';
const interpreter=process.env.BILLING_TEST_PYTHON;
if(!interpreter)throw new Error('Set BILLING_TEST_PYTHON to a Python with facturx-service/requirements-lock.txt installed.');
function python(program,input){
 const r=spawnSync(interpreter,['-c',program],{input:JSON.stringify(input),encoding:'utf8',env:{...process.env,PYTHONPATH:'facturx-service',PYTHONIOENCODING:'utf-8'},maxBuffer:5*1024*1024});
 assert.equal(r.status,0,r.stderr||r.error?.message);return JSON.parse(r.stdout);
}
function complete(){
 const d=blankDraft('invoice','2026-10-20');d.dueDate='2026-11-19';d.title='Mission de démonstration';
 d.seller={...d.seller,name:'Émetteur fictif',addressLine1:'1 rue du Test',addressLine2:'Bâtiment A',postalCode:'20000',city:'Ajaccio',siren:'732829320',vatId:'FR44732829320',electronicAddress:'732829320',electronicScheme:'0225',legal:'Mentions émetteur de test'};
 d.buyer={...d.buyer,name:'Client fictif',addressLine1:'2 rue du Test',postalCode:'20200',city:'Bastia',siren:'552100554',legal:'Mentions client de test',electronicAddress:'552100554',electronicScheme:'0225'};
 d.paymentMeans='10';d.vatDue='invoice';d.businessProcess='S1';d.paymentTerms='Échéance de test';d.legalNotes={recovery:'Indemnité de test',penalties:'Pénalités de test',discount:'Conditions d’escompte de test'};
 d.lines[0]={...d.lines[0],description:'Accompagnement',quantity:'1,8333',unitPrice:'123,456789',discountPercent:'12,34'};
 d.references={businessCode:'26 AC',marketId:'internal-id',marketReference:'M-26',orderReference:'C-26',project:'Projet test',serviceCode:'SERVICE-26',engagement:'E-26'};
 d.notes='Notes particulières';return d;
}

test('les calculs et le contrat de brouillon sont identiques dans le Worker et le moteur PDF',()=>{
 const documents=[blankDraft('quote'),complete()];
 for(let i=0;i<30;i++){
  const d=complete();d.lines=Array.from({length:1+i%5},(_,j)=>({...newLine(),description:'Prestation '+j,quantity:['1','1.833333','0','0.000001','123456.654321'][i%5],unitPrice:['0.015','0.025','123.456789','9999.999999'][j%4],discountPercent:['0','50','12.34','100'][i%4],vatRate:['5.5','20','10'][j%3]}));documents.push(d);
 }
 const incomplete=complete();incomplete.lines[0].unitPrice='12,';documents.push(incomplete);
 const overflow=complete();overflow.lines[0].quantity='9999999999';overflow.lines[0].unitPrice='9999999999';documents.push(overflow);
 const expected=documents.map(d=>{let totals=null;try{totals=calculateBilling(d);}catch{}return {document:normalizeDraft(d),totals};});
 const result=python(`import json,sys\nfrom cdi_facturx.billing_document import DraftDocument\nvalues=[DraftDocument.model_validate(v) for v in json.load(sys.stdin)]\nprint(json.dumps([{'document':v.model_dump(),'totals':v.draft_totals()} for v in values],ensure_ascii=False))`,documents);
 assert.deepEqual(result,expected);
 const d=complete();const invalid=[{...d,total:'1'},{...d,number:'forged'},{...d,paymentMeans:30},{...d,lines:[d.lines[0],d.lines[0]]},{...d,buyer:{...d.buyer,secret:'x'}}];
 const rejected=python(`import json,sys\nfrom cdi_facturx.billing_document import DraftDocument\nfrom pydantic import ValidationError\nresults=[]\nfor v in json.load(sys.stdin):\n try: DraftDocument.model_validate(v); results.append(False)\n except ValidationError: results.append(True)\nprint(json.dumps(results))`,invalid);
 assert.deepEqual(rejected,invalid.map(()=>true));for(const raw of invalid)assert.throws(()=>normalizeDraft(raw));
});

test('l’adaptateur Factur-X préserve prix, remises, références et notes sans modifier le document',()=>{
 const d=complete(),before=JSON.stringify(d),invoice=invoiceForFacturX(d,'TEST-2026-001');
 assert.equal(JSON.stringify(d),before);assert.equal(invoice.lines[0].unit_price,'123.456789');assert.equal(invoice.lines[0].discount_percent,'12.34');assert.equal(invoice.seller.street,'1 rue du Test\nBâtiment A');
 assert.equal(invoice.buyer_reference,'SERVICE-26');assert.equal(invoice.order_reference,'C-26');assert.equal(invoice.contract_reference,'M-26');
 for(const v of ['Mentions émetteur','Mentions client','Projet test','Notes particulières','E-26','26 AC'])assert.ok(invoice.notes.description.includes(v));
 assert.throws(()=>invoiceForFacturX({...d,kind:'quote'},'Q-1'));assert.throws(()=>invoiceForFacturX(d,''));assert.throws(()=>invoiceForFacturX({...d,legalNotes:{...d.legalNotes,discount:''}},'F-1'));
 assert.throws(()=>invoiceForFacturX({...d,businessProcess:''},'F-1'));
 assert.throws(()=>invoiceForFacturX({...d,buyer:{...d.buyer,electronicAddress:'',electronicScheme:''}},'F-1'));
 assert.throws(()=>invoiceForFacturX({...d,lines:[{...d.lines[0],quantity:'1.833333'}]},'F-1'),error=>error.issues.some(i=>i.path==='lines.0.quantity'));
 assert.equal(invoiceForFacturX({...d,lines:[{...d.lines[0],quantity:'1.833300'}]},'F-1').lines[0].quantity,'1.8333');
 const result=python(`import json,sys,tempfile\nfrom pathlib import Path\nfrom cdi_facturx.models import Invoice\nfrom cdi_facturx.xml_invoice import create_xml\nfrom cdi_facturx.validate_worker import validate\nv=Invoice.model_validate(json.load(sys.stdin))\nxml=create_xml(v,'en16931')\nwith tempfile.TemporaryDirectory() as folder:\n path=Path(folder)/'factur-x.xml';path.write_bytes(xml);report=validate(str(path),'en16931')\nprint(json.dumps({'totals':{k:str(v) for k,v in v.calculated()[0].items()},'checks':report['checks'],'errors':report['errors'],'price':str(v.lines[0].unit_price),'discount':str(v.lines[0].discount_percent)}))`,invoice);
 assert.deepEqual(result.checks,{schematron:true,france:true});assert.deepEqual(result.errors,[]);assert.equal(result.price,'123.456789');assert.equal(result.discount,'12.34');assert.deepEqual(result.totals,{net:invoice.totals.net,vat:invoice.totals.vat,gross:invoice.totals.gross,due:invoice.totals.due});
});

test('le service authentifié produit un vrai PDF sans accepter de numéro ni de total imposé',()=>{
 const result=python(`import json,sys,os,io,copy
os.environ['FACTURX_DEPLOYMENT']='server'
os.environ['FACTURX_API_KEY']='synthetic-test-key-01234567890123456789'
from fastapi.testclient import TestClient
from pypdf import PdfReader
from cdi_facturx.api import app
d=json.load(sys.stdin)
client=TestClient(app)
headers={'x-api-key':os.environ['FACTURX_API_KEY']}
path='/api/billing/preview-pdf'
assert client.post(path,json={'document':d}).status_code==401
assert client.post(path,json={'document':d},headers={**headers,'Origin':'https://evil.test'}).status_code==403
for payload in [{'document':d,'number':'FORGED'},{'document':d,'totals':{'grossMinor':'1'}},{'document':{**d,'number':'FORGED'}}]:
 assert client.post(path,json=payload,headers=headers).status_code==422
assert client.post(path,content='x'*300001,headers={**headers,'content-type':'application/json'}).status_code==413
r=client.post(path,json={'document':d},headers=headers)
assert r.status_code==200, r.text
assert r.headers['content-type']=='application/pdf'
assert r.headers['cache-control']=='no-store'
reader=PdfReader(io.BytesIO(r.content))
content='\\n'.join(page.extract_text() for page in reader.pages)
assert 'BROUILLON' in content.upper()
assert 'Accompagnement' in content
assert 'Mission de démonstration' in content
bad=copy.deepcopy(d);bad['title']='Unsupported \\U0001f680'
assert client.post(path,json={'document':bad},headers=headers).status_code==422
draft=copy.deepcopy(d);draft['lines'][0]['unitPrice']=''
unfinished=client.post(path,json={'document':draft},headers=headers)
assert unfinished.status_code==200, unfinished.text
assert client.post(path,json={'document':d},headers=headers).status_code==200
print(json.dumps({'pages':len(reader.pages),'bytes':len(r.content),'draft':True}))`,complete());
 assert.ok(result.pages>=1);assert.ok(result.bytes>5000);assert.equal(result.draft,true);
});
