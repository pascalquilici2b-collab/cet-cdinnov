import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {invoiceFixture} from './billing-payments-fixture.mjs';
import {normalizeDraft,inspectDraft,calculateBilling,newLine} from './billing-domain.ts';
import {invoiceForFacturX} from './billing-facturx.ts';
import {billingCanonicalJSON,reserveIssuance,createNumberSeries} from './billing-issuance.ts';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
const python=process.env.BILLING_TEST_PYTHON;assert.ok(python,'Prepared Python required');
const execute=(code,input)=>{const result=spawnSync(python,['-c',code],{input:JSON.stringify(input),encoding:'utf8',maxBuffer:5*1024*1024,env:{...process.env,PYTHONPATH:'facturx-service',PYTHONIOENCODING:'utf-8'}});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);};
function credit(){const d=invoiceFixture('Avoir sur mission technique');d.schemaVersion=3;d.issueDate='2026-10-20';d.dueDate='2026-11-19';d.creditNote={invoiceId:randomUUID(),invoiceVersion:1,invoiceNumber:'TEST-F-2020-0042',invoiceDate:'2020-01-01',reason:'Annulation des prestations non réalisées'};return d;}

test('v2 reste identique ; v3 exige une référence de facture et refuse les champs inventés',()=>{
 const old=invoiceFixture(),before=JSON.stringify(old);assert.deepEqual(normalizeDraft(old),old);assert.equal(JSON.stringify(old),before);assert.equal(Object.hasOwn(normalizeDraft(old),'creditNote'),false);
 const valid=credit();assert.deepEqual(normalizeDraft(valid),valid);assert.deepEqual(inspectDraft(valid),[]);
 for(const invalid of [{...valid,schemaVersion:2},{...valid,kind:'quote'},{...valid,creditNote:null},{...valid,creditNote:{...valid.creditNote,invoiceId:'x'}},{...valid,creditNote:{...valid.creditNote,invoiceVersion:1.1}},{...valid,creditNote:{...valid.creditNote,invoiceNumber:''}},{...valid,creditNote:{...valid.creditNote,invoiceDate:'2020-02-30'}},{...valid,creditNote:{...valid.creditNote,amountMinor:'1'}}])assert.throws(()=>normalizeDraft(invalid));
 const unfinished={...valid,creditNote:{...valid.creditNote,reason:''}};assert.equal(normalizeDraft(unfinished).creditNote.reason,'');assert.ok(inspectDraft(unfinished).some(i=>i.path==='creditNote.reason'));
 assert.ok(inspectDraft({...valid,issueDate:'2019-12-31'}).some(i=>i.path==='issueDate'));assert.throws(()=>invoiceForFacturX(unfinished,'TEST-A-1'));
});

test('avoir total/partiel et multi-TVA : calculs, référence et empreintes identiques en TS/Python',()=>{
 const full=credit(),partial=structuredClone(full);partial.lines[0].quantity='1';partial.creditNote.reason='Réduction d’une prestation';
 const mixed=credit();mixed.lines.push({...newLine(),description:'Prestation au taux réduit',quantity:'2.5',unitPrice:'19.99',vatRate:'5.5'});
 const values=[invoiceFixture(),full,partial,mixed].map(raw=>{const document=normalizeDraft(raw);return {document,invoice:invoiceForFacturX(document,'TEST-2026-0043'),totals:calculateBilling(document),hash:createHash('sha256').update(billingCanonicalJSON({schemaVersion:1,document,totals:calculateBilling(document)})).digest('hex')};});
 const result=execute(`import json,sys,tempfile\nfrom pathlib import Path\nfrom lxml import etree\nfrom cdi_facturx.billing_document import DraftDocument\nfrom cdi_facturx.billing_issuance import snapshot_hash,invoice_from_document,validate_document\nfrom cdi_facturx.models import Invoice\nfrom cdi_facturx.xml_invoice import create_xml\nfrom cdi_facturx.validate_worker import validate\nresults=[]\nfor item in json.load(sys.stdin):\n d=DraftDocument.model_validate(item['document']);assert d.model_dump()==item['document'];assert d.calculated()==item['totals'];assert snapshot_hash(d)==item['hash']\n inv=validate_document(d,'TEST-2026-0043');assert inv.model_dump(mode='json')==Invoice.model_validate(item['invoice']).model_dump(mode='json')\n xml=create_xml(inv,'en16931')\n with tempfile.TemporaryDirectory() as tmp:\n  path=Path(tmp)/'invoice.xml';path.write_bytes(xml);report=validate(str(path),'en16931')\n assert not report['errors'],report\n root=etree.fromstring(xml);ns={'rsm':'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100','ram':'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100'}\n results.append({'type':root.xpath('string(rsm:ExchangedDocument/ram:TypeCode)',namespaces=ns),'checks':report['checks'],'refs':root.xpath('//ram:InvoiceReferencedDocument/ram:IssuerAssignedID/text()',namespaces=ns)})\nprint(json.dumps(results))`,values);
 assert.deepEqual(result.map(r=>r.type),['380','381','381','381']);for(const row of result){assert.deepEqual(row.checks,{schematron:true,france:true});}assert.deepEqual(result[0].refs,[]);for(const row of result.slice(1))assert.deepEqual(row.refs,['TEST-F-2020-0042']);
 assert.equal(values[1].invoice.totals.gross,'2700.00');assert.equal(values[2].invoice.totals.gross,'900.00');assert.equal(values[1].invoice.preceding_invoice_date,'2020-01-01');
});

test('contrat Python strict et invalidation de la liaison en cas de référence modifiée',()=>{
 const d=credit(),bad=[{...d,schemaVersion:2},{...d,kind:'quote'},{...d,creditNote:{...d.creditNote,invoiceVersion:true}},{...d,creditNote:{...d.creditNote,invoiceNumber:'\0'}},{...d,creditNote:{...d.creditNote,invoiceDate:'2020-02-30'}}];
 const result=execute(`import json,sys\nfrom pydantic import ValidationError\nfrom cdi_facturx.billing_document import DraftDocument\nresult=[]\nfor d in json.load(sys.stdin):\n try: DraftDocument.model_validate(d);result.append(False)\n except ValidationError: result.append(True)\nprint(json.dumps(result))`,bad);assert.deepEqual(result,bad.map(()=>true));
 const hash=doc=>createHash('sha256').update(billingCanonicalJSON({schemaVersion:1,document:doc,totals:calculateBilling(doc)})).digest('hex');
 for(const patch of [{invoiceNumber:'OTHER'},{invoiceDate:'2020-01-02'},{invoiceId:randomUUID()},{reason:'Autre motif'},{invoiceVersion:2}])assert.notEqual(hash(d),hash({...d,creditNote:{...d.creditNote,...patch}}));
});

test('le contrat natif n’ouvre aucun contournement de la future allocation contrôlée',async()=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).token,headers={Origin:'https://app.cdinnov.eu','Content-Type':'application/json',Authorization:'Bearer '+token};
  const d=credit(),id=randomUUID();let response=await ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/documents',{method:'POST',headers,body:JSON.stringify({id,data:d})});assert.equal(response.status,409);assert.equal(await ctx.db.prepare('SELECT id FROM billing_documents WHERE id=?').bind(id).first(),null);
  response=await ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/documents',{method:'POST',headers,body:JSON.stringify({id,data:invoiceFixture()})});assert.equal(response.status,201);
  response=await ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/documents/'+id,{method:'PUT',headers:{...headers,'If-Match':'1'},body:JSON.stringify({data:d})});assert.equal(response.status,409);
  // Even a future import or another writer cannot use reserveIssuance before the link checks exist.
  await ctx.db.prepare('UPDATE billing_documents SET version=version+1,data_json=? WHERE id=?').bind(JSON.stringify(d),id).run();
  await assert.rejects(()=>reserveIssuance(ctx.db,{id:randomUUID(),documentId:id,documentVersion:2,seriesId:randomUUID()},users[0]),e=>e.status===409&&e.message.includes('montants déjà crédités'));
  const seriesId=randomUUID();await createNumberSeries(ctx.db,{id:seriesId,issuerSiren:'732829320',kind:'invoice',prefix:'TEST-CREDIT-',width:4,firstValue:1,startDate:'2020-01-01',endDate:'2099-12-31'},users[0]);
  // The SQL boundary also refuses a credit snapshot, including a forged regular-invoice snapshot.
  for(const snapshot of [d,invoiceFixture()])await assert.rejects(()=>ctx.db.prepare(`INSERT INTO billing_issuances(id,document_id,document_version,series_id,issuer_siren,sequence_value,number,issue_date,source_json,snapshot_json,totals_json,snapshot_sha256,created_at,created_by)
   SELECT ?,id,version,?,'732829320',1,'TEST-CREDIT-0001',?,data_json,?,?,?,created_at,created_by FROM billing_documents WHERE id=?`).bind(randomUUID(),seriesId,snapshot.issueDate,JSON.stringify(snapshot),JSON.stringify(calculateBilling(snapshot)),'0'.repeat(64),id).run(),/BILLING_CREDIT_UNAVAILABLE/);
  assert.equal((await ctx.db.prepare('SELECT count(*) AS n FROM billing_issuances').first()).n,0);
  assert.equal((await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(seriesId).first()).next_value,1);
 }finally{await ctx.worker.dispose();}
});
