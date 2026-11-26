import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {testEnvironment,users} from '../marches/test.mjs';
import {emptyMarket} from '../marches/domain.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {billingRectificationSchema} from './billing-rectification-schema.mjs';
import {billingInvoiceFinalizationNumberSchema} from './billing-invoice-finalization-number-schema.mjs';
import {billingStateSafetySchema} from './billing-state-safety-schema.mjs';
import {billingTrashSchema} from './billing-trash-schema.mjs';
import {quoteFixtureTools,quoteFixture,samplePDF} from './billing-quote-fixture.mjs';
import {invoiceFixture} from './billing-payments-fixture.mjs';
import {reserveIssuance,claimIssuanceJob,failIssuanceJob,completeIssuanceJob} from './billing-issuance.ts';
import {billingToday} from './billing-quote-domain.ts';
import {billingDisplayState} from './billing-display-state.ts';
import {addBillingDays} from './billing-domain.ts';

const ok=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
const email='review@example.invalid';
const bundle=await build({entryPoints:[fileURLToPath(new URL('./billing-payments.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {billingPaymentRoute}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const version=doc=>({'If-Match':String(doc.version)});
const setup=async()=>{
 const ctx=await testEnvironment({outboundService:()=>{throw Error('External services forbidden in this synthetic test');}});
 await migrateBilling(ctx.db);const cookie=(await ctx.login(users[0])).cookie;
 const f=await quoteFixtureTools(ctx,cookie,{kind:'invoice',prefix:'TEST-RECT-'});
 return {ctx,f,get:id=>f.call('/documents/'+id).then(r=>ok(r))};
};
const payment=doc=>({id:randomUUID(),documentVersion:doc.version,kind:'receipt',amount:'1',occurredOn:billingToday(),method:'cash',reference:'Synthetic test',note:''});
const directPayment=(db,doc)=>db.prepare(`INSERT INTO billing_payment_operations(id,document_id,document_version,expected_version,kind,target_id,amount_minor,occurred_on,method,reference,note,reason,correction_date,request_hash,recorded_at,recorded_by)
 VALUES(?,?,?,0,'receipt',NULL,100,?,'cash','','','',?,'synthetic',?,?)`).bind(randomUUID(),doc.id,doc.version,billingToday(),billingToday(),new Date().toISOString(),email).run();
const directDelivery=(db,doc,state)=>db.prepare(`INSERT INTO billing_email_deliveries(id,document_id,document_version,request_hash,recipient,subject,message,state,provider_id,attachment_sha256,created_at,updated_at,created_by)
 VALUES(?,?,?,'synthetic','review@example.invalid','Synthetic','Synthetic',?,NULL,'',?,?,?)`).bind(randomUUID(),doc.id,doc.version,state,new Date().toISOString(),new Date().toISOString(),email).run();
const financialSnapshot=async db=>{
 const tables=['billing_documents','billing_document_versions','billing_issuances','billing_issue_jobs','billing_issue_events','billing_number_series','billing_invoice_rectifications','billing_document_trash','billing_email_deliveries','billing_payment_accounts','billing_payment_operations','billing_payment_entries'];
 return Object.fromEntries(await Promise.all(tables.map(async name=>[name,(await db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()).results])));
};

test('issued replacement in trash keeps original blocked and quote/budget/tracking links intact',async()=>{
 const {ctx,f,get}=await setup();try{
  const q=await quoteFixtureTools(ctx,(await ctx.login(users[0])).cookie);
  const marketId=randomUUID(),orderId=randomUUID(),projectId=randomUUID(),market={...emptyMarket(),title:'Synthetic rectification market',clientName:'Atelier Horizon',projects:[{id:projectId,name:'Synthetic project',orders:[]}],orders:[{id:orderId,reference:'BC-RECT',amountMinor:1000000}]};
  await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(marketId,JSON.stringify(market),new Date().toISOString(),email).run();
  const data={...invoiceFixture('Synthetic linked quote'),kind:'quote',validUntil:'2099-12-31',issueDate:billingToday(),dueDate:''};
  data.references={...data.references,marketId,projectId,orderId,orderReference:'BC-RECT'};
  let quote=await q.create(data);quote=await ok(await q.send(quote,q.input(quote,'accepted','Synthetic agreement',billingToday())),201);
  const id=randomUUID(),invoice={...invoiceFixture('Synthetic original'),issueDate:billingToday(),dueDate:addBillingDays(billingToday(),30),references:data.references};
  // Same immutable source identity as conversion, without invoking any renderer.
  await ctx.db.prepare(`INSERT INTO billing_documents(id,kind,status,version,data_json,totals_json,issues_json,create_hash,source_document_id,source_version,created_at,updated_at,created_by,updated_by)
   SELECT ?,'invoice','draft',1,?,?,?,'synthetic',?,?,created_at,updated_at,created_by,updated_by FROM billing_documents WHERE id=?`).bind(id,JSON.stringify(invoice),JSON.stringify(quote.totals),'[]',quote.id,quote.version,quote.id).run();
  const original=await f.finalize(await get(id)),beforePDF=Buffer.from(await(await f.call('/documents/'+id+'/files/pdf')).arrayBuffer());
  const replacement=await f.finalize(await ok(await f.call('/documents/'+id+'/rectify','POST',{id:randomUUID(),notTransmitted:true},version(original)),201));
  const snapshots=await financialSnapshot(ctx.db);
  await ok(await f.call('/documents/'+replacement.id,'DELETE',undefined,version(replacement)));
  const parent=await get(id);
  assert.equal(parent.rectification.replacementId,replacement.id);assert.equal(parent.rectification.replacementState,'issued');
  assert.equal(parent.settlement,null);assert.equal(billingDisplayState(parent),'replaced');
  assert.deepEqual((await get(quote.id)).quote.invoices.map(i=>i.id),[replacement.id]);
  assert.equal((await f.call('/documents/'+id+'/payments','POST',payment(parent),{'If-Match':'0'})).status,409);
  assert.equal((await f.call('/documents/'+id+'/sent','POST',{sentOn:billingToday(),confirmed:true},version(parent))).status,409);
  assert.equal((await f.call('/documents/'+id+'/outlook-sent','POST',{recipient:'review@example.invalid',subject:'Synthetic',message:'Synthetic'},version(parent))).status,409);
  await assert.rejects(()=>directPayment(ctx.db,parent),/BILLING_RECTIFICATION_CONFLICT/);
  for(const state of ['sending','sent','unknown'])await assert.rejects(()=>directDelivery(ctx.db,parent,state),/BILLING_RECTIFICATION_CONFLICT/);
  const allocations=(await ctx.db.prepare('SELECT document_id,amount_minor,issued FROM billing_order_allocations WHERE order_id=?').bind(orderId).all()).results;
  assert.deepEqual(allocations,[{document_id:replacement.id,amount_minor:225000,issued:1}]);
  const tracked=(await ok(await f.call('/engagements'))).orders.find(o=>o.id===orderId);
  assert.equal(tracked.invoicedMinor,225000);assert.equal(tracked.reservedMinor,0);assert.deepEqual(tracked.invoices.map(i=>[i.id,i.trashed]),[[replacement.id,true]]);
  assert.deepEqual(Buffer.from(await(await f.call('/documents/'+id+'/files/pdf')).arrayBuffer()),beforePDF);
  // A migration replay preserves every financial byte and all audit history.
  const afterTrash=await financialSnapshot(ctx.db);await migrateBilling(ctx.db);await migrateBilling(ctx.db);assert.deepEqual(await financialSnapshot(ctx.db),afterTrash);
  assert.deepEqual(afterTrash.billing_documents,snapshots.billing_documents);assert.deepEqual(afterTrash.billing_issuances,snapshots.billing_issuances);
  await ok(await f.call('/documents/'+replacement.id+'/restore','POST',{},version(replacement)));
  assert.equal((await get(id)).rectification.replacementId,replacement.id);
 }finally{await ctx.worker.dispose();}
});

test('all immutable issuance states remain active, including a historical trash row',async()=>{
 const {ctx,f,get}=await setup();try{
  const original=await f.create({...invoiceFixture(),issueDate:billingToday(),dueDate:''}),replacement=await ok(await f.call('/documents/'+original.id+'/rectify','POST',{id:randomUUID(),notTransmitted:true},version(original)),201);
  const issue=await reserveIssuance(ctx.db,{id:randomUUID(),documentId:replacement.id,documentVersion:replacement.version,seriesId:f.series.id},email);
  assert.equal((await f.call('/documents/'+replacement.id,'DELETE',undefined,version(replacement))).status,409,'Normal API still refuses trash while issuance is incomplete');
  // Historical/adversarial fixture only: bypass this one guard to prove that
  // replacement activity depends on the immutable issuance, never a job state.
  await ctx.db.batch([ctx.db.prepare('DROP TRIGGER billing_trash_guard'),ctx.db.prepare('INSERT INTO billing_document_trash VALUES(?,?,?,?)').bind(replacement.id,replacement.version,new Date().toISOString(),email),ctx.db.prepare(billingTrashSchema.find(sql=>sql.startsWith('CREATE TRIGGER IF NOT EXISTS billing_trash_guard')))]);
  const verify=async state=>{
   assert.equal((await ctx.db.prepare('SELECT state FROM billing_issue_jobs WHERE issuance_id=?').bind(issue.id).first()).state,state);
   const parent=await get(original.id);assert.equal(parent.rectification.replacementId,replacement.id);assert.equal(parent.settlement,null);
   await assert.rejects(()=>directPayment(ctx.db,parent),/BILLING_RECTIFICATION_CONFLICT/);
   await assert.rejects(()=>directDelivery(ctx.db,parent,'sending'),/BILLING_RECTIFICATION_CONFLICT/);
  };
  await verify('pending');const lease=randomUUID();assert.ok(await claimIssuanceJob(ctx.db,issue.id,lease,email));await verify('rendering');
  assert.ok(await failIssuanceJob(ctx.db,issue.id,lease,'render',email));await verify('failed');
  const next=randomUUID();assert.ok(await claimIssuanceJob(ctx.db,issue.id,next,email));
  const bytes=samplePDF(),sha256=createHash('sha256').update(bytes).digest('hex'),artifact={kind:'pdf',key:`billing/${issue.id}/pdf/${sha256}`,sha256,size:bytes.length,contentType:'application/pdf'};
  await(await ctx.worker.getR2Bucket('CET_FILES')).put(artifact.key,bytes,{httpMetadata:{contentType:'application/pdf'}});
  assert.ok(await completeIssuanceJob(ctx.db,issue.id,next,{schemaVersion:1,envelopeSha256:issue.envelopeSha256,generatorVersion:'synthetic-state-test',profile:'invoice-pdf',artifacts:[artifact]},email));await verify('ready');
 }finally{await ctx.worker.dispose();}
});

test('only an unissued trashed replacement reactivates its original',async()=>{
 const {ctx,f,get}=await setup();try{
  const original=await f.create({...invoiceFixture(),issueDate:billingToday(),dueDate:''}),replacement=await ok(await f.call('/documents/'+original.id+'/rectify','POST',{id:randomUUID(),notTransmitted:true},version(original)),201);
  await ok(await f.call('/documents/'+replacement.id,'DELETE',undefined,version(replacement)));
  const parent=await get(original.id);assert.equal(parent.rectification,undefined);assert.equal(parent.settlement.state,'unpaid');
  await ok(await f.call('/documents/'+original.id+'/payments','POST',payment(parent),{'If-Match':'0'}),201);
  assert.equal((await f.call('/documents/'+replacement.id+'/restore','POST',{},version(replacement))).status,409);
  assert.equal((await ctx.db.prepare('SELECT count(*) n FROM billing_invoice_rectifications').first()).n,1);
 }finally{await ctx.worker.dispose();}
});

test('trashing an invoice while its payment body is read cannot append a payment',async()=>{
 const {ctx,f}=await setup();try{
  const doc=await f.create({...invoiceFixture(),issueDate:billingToday(),dueDate:''}),operation=payment(doc);
  let release;const bodyReady=new Promise(resolve=>{release=resolve;});
  const request=new Request('https://synthetic.invalid/payments',{method:'POST',duplex:'half',headers:{'If-Match':'0','Content-Type':'application/json'},body:new ReadableStream({async start(controller){await bodyReady;controller.enqueue(new TextEncoder().encode(JSON.stringify(operation)));controller.close();}})});
  // The outer route has already read this authorized snapshot. Pause exactly
  // at its asynchronous body read, then perform the real concurrent DELETE.
  const pending=billingPaymentRoute(request,ctx.db,doc,email,(status,value)=>Response.json(value,{status}),async()=>doc);
  await ok(await f.call('/documents/'+doc.id,'DELETE',undefined,version(doc)));const before=await financialSnapshot(ctx.db);release();
  await assert.rejects(()=>pending,error=>error.status===409&&/corbeille/.test(error.message));
  assert.deepEqual(await financialSnapshot(ctx.db),before);
  assert.equal((await f.call('/documents/'+doc.id)).status,410);
  await assert.rejects(()=>directPayment(ctx.db,doc),/BILLING_TRASH_CONFLICT/);
 }finally{await ctx.worker.dispose();}
});

test('restrictive guard migration rolls back atomically and is replayable without financial writes',async()=>{
 const {ctx,f}=await setup();try{
  await f.create({...invoiceFixture(),issueDate:billingToday(),dueDate:''});
  const old=[billingRectificationSchema.find(sql=>sql.startsWith('CREATE TRIGGER IF NOT EXISTS billing_payment_rectification_guard')),billingInvoiceFinalizationNumberSchema.find(sql=>sql.startsWith('CREATE TRIGGER IF NOT EXISTS billing_rectified_invoice_delivery_guard'))];
  await ctx.db.batch([ctx.db.prepare('DROP TRIGGER billing_payment_rectification_guard'),ctx.db.prepare(old[0]),ctx.db.prepare('DROP TRIGGER billing_rectified_invoice_delivery_guard'),ctx.db.prepare(old[1]),ctx.db.prepare('DROP TRIGGER billing_trashed_payment_guard')]);
  const definitions=async()=> (await ctx.db.prepare("SELECT name,sql FROM sqlite_master WHERE name IN ('billing_payment_rectification_guard','billing_rectified_invoice_delivery_guard','billing_trashed_payment_guard') ORDER BY name").all()).results;
  const before=await financialSnapshot(ctx.db),guards=await definitions();
  await assert.rejects(()=>ctx.db.batch([...billingStateSafetySchema,'INSERT INTO missing_migration_table VALUES(1)'].map(sql=>ctx.db.prepare(sql))),/missing_migration_table/);
  assert.deepEqual(await definitions(),guards);assert.deepEqual(await financialSnapshot(ctx.db),before);
  await ctx.db.batch(billingStateSafetySchema.map(sql=>ctx.db.prepare(sql)));const migrated=await definitions();assert.notDeepEqual(migrated,guards);
  await ctx.db.batch(billingStateSafetySchema.map(sql=>ctx.db.prepare(sql)));assert.deepEqual(await definitions(),migrated);assert.deepEqual(await financialSnapshot(ctx.db),before);
 }finally{await ctx.worker.dispose();}
});
