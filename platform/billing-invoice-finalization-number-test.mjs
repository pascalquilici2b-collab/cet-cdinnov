import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
import {invoiceFixture} from './billing-payments-fixture.mjs';
import {quoteFixture} from './billing-quote-fixture.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {billingMonthlyNumberSchema,billingNumberSQL} from './billing-monthly-number-schema.mjs';
import {billingDraftNumberSchema} from './billing-draft-number-schema.mjs';
import {createNumberSeries,reserveIssuance,billingCanonicalJSON} from './billing-issuance.ts';
import {calculateBilling} from './billing-domain.ts';

test('invoice finalization keeps historical allocations immutable and requires explicit audited retirement',async()=>{
 const ctx=await testEnvironment();const date='2026-11-19',user=users[0];
 try{
  await migrateBilling(ctx.db);
  const admin=await ctx.login(user),headers={Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1','Content-Type':'application/json',Cookie:admin.cookie};
  const call=(path,method='GET',body,version)=>ctx.worker.dispatchFetch('https://local/api/v1/billing'+path,{method,headers:{...headers,...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const ok=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
  const create=async(kind='invoice')=>{const data=kind==='invoice'?invoiceFixture():quoteFixture();data.issueDate=date;if(kind==='invoice')data.dueDate='2026-12-19';return ok(await call('/documents','POST',{id:randomUUID(),data}),201);};
  const read=doc=>call('/documents/'+doc.id).then(ok);
  const fresh=await create();assert.equal(fresh.reservedNumber,null);
  for(let i=0;i<3;i++)assert.equal((await ok(await call('/documents/'+fresh.id+'/number','POST',{},fresh.version))).reservedNumber,null);
  assert.equal((await ctx.db.prepare("SELECT count(*) n FROM billing_number_series WHERE kind='invoice'").first()).n,0);
  const quote=await create('quote'),numberedQuote=await ok(await call('/documents/'+quote.id+'/number','POST',{},quote.version));assert.ok(numberedQuote.reservedNumber.number);

  const series=await createNumberSeries(ctx.db,{id:randomUUID(),issuerSiren:fresh.data.seller.siren,kind:'invoice',prefix:'FAC-AAAAMM',width:3,firstValue:73,startDate:'1970-01-01',endDate:'9999-12-31'},user);
  await ctx.db.prepare('INSERT INTO billing_monthly_series VALUES(?)').bind(series.id).run();
  await ctx.db.prepare('INSERT INTO billing_default_series VALUES(?,?,?)').bind(series.issuer_siren,'invoice',series.id).run();
  const counter=async id=>(await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(id||series.id).first()).next_value;
  // Seed historical records under the actual former guards, then apply the
  // current migration. No production document/service participates in this test.
  await ctx.db.batch(billingMonthlyNumberSchema.filter(sql=>/billing_draft_number_guard|billing_issuance_guard/.test(sql)).map(sql=>ctx.db.prepare(sql)));
  await ctx.db.batch(billingDraftNumberSchema.filter(sql=>/billing_issuance_insert/.test(sql)).map(sql=>ctx.db.prepare(sql)));
  const legacy=[];
  for(let i=0;i<3;i++){
   const d=await create();legacy.push(d);
   await ctx.db.prepare(`INSERT INTO billing_draft_numbers SELECT d.id,s.id,s.issuer_siren,s.next_value,${billingNumberSQL('?')},?,?,? FROM billing_documents d JOIN billing_number_series s ON s.id=? WHERE d.id=?`).bind(date,date,date,new Date().toISOString(),user,series.id,d.id).run();
  }
  const frozenId=randomUUID(),frozen=legacy[2],snapshot=JSON.stringify(frozen.data),totals=JSON.stringify(calculateBilling(frozen.data)),snapshotHash=createHash('sha256').update(billingCanonicalJSON({schemaVersion:1,document:frozen.data,totals:JSON.parse(totals)})).digest('hex');
  await ctx.db.prepare(`INSERT INTO billing_issuances SELECT ?,d.id,d.version,n.series_id,n.issuer_siren,n.sequence_value,n.number,?,d.data_json,?,?,?, ?,? FROM billing_documents d JOIN billing_draft_numbers n ON n.document_id=d.id WHERE d.id=?`).bind(frozenId,date,snapshot,totals,snapshotHash,new Date().toISOString(),user,frozen.id).run();
  const beforeN=(await ctx.db.prepare('SELECT * FROM billing_draft_numbers ORDER BY document_id').all()).results;
  const beforeFrozen=await ctx.db.prepare('SELECT * FROM billing_issuances WHERE id=?').bind(frozenId).first();
  assert.equal(await counter(),76);
  await migrateBilling(ctx.db);await migrateBilling(ctx.db);
  assert.deepEqual((await ctx.db.prepare('SELECT * FROM billing_draft_numbers ORDER BY document_id').all()).results,beforeN);
  assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_issuances WHERE id=?').bind(frozenId).first(),beforeFrozen);
  let d=await read(legacy[0]);assert.equal(d.reservedNumber,null);assert.equal(d.numberingReview,true);assert.equal(d.numberingReviewNumber,'FAC-202611073');
  const issueInput={id:randomUUID(),documentId:d.id,documentVersion:d.version,seriesId:series.id};
  await assert.rejects(()=>reserveIssuance(ctx.db,issueInput,user),error=>error.status===409&&/ancien numéro/.test(error.message));
  const retire={notTransmitted:true,reason:'Ancienne réservation non transmise, PDF vérifiés dans ce test fictif.'};
  assert.equal((await call('/documents/'+d.id+'/retire-draft-number','POST',{...retire,notTransmitted:false},d.version)).status,422);
  assert.equal((await call('/documents/'+d.id+'/retire-draft-number','POST',retire,d.version+1)).status,409);
  assert.equal((await call('/documents/'+frozen.id+'/retire-draft-number','POST',retire,frozen.version)).status,409);
  await ctx.db.prepare(`INSERT INTO billing_email_deliveries VALUES(?,?,?,?,?,?,?,'unknown',NULL,'',?,?,?)`).bind(randomUUID(),legacy[1].id,legacy[1].version,'synthetic','fictitious@example.test','Test','No message was sent',new Date().toISOString(),new Date().toISOString(),user).run();
  assert.equal((await call('/documents/'+legacy[1].id+'/retire-draft-number','POST',retire,legacy[1].version)).status,409);
  d=await ok(await call('/documents/'+d.id+'/retire-draft-number','POST',retire,d.version));
  assert.equal(d.numberingReview,undefined);assert.equal(d.numberingReviewNumber,undefined);assert.equal(d.reservedNumber,null);assert.equal(d.retiredNumber.number,'FAC-202611073');assert.deepEqual(d.data,legacy[0].data);assert.equal(d.version,legacy[0].version);assert.equal(await counter(),76);
  await ok(await call('/documents/'+d.id+'/retire-draft-number','POST',retire,d.version));
  assert.equal((await ctx.db.prepare('SELECT count(*) n FROM billing_invoice_number_retirements').first()).n,1);
  const audit=await ctx.db.prepare('SELECT * FROM billing_invoice_number_retirements WHERE document_id=?').bind(d.id).first();
  assert.equal(JSON.parse(audit.reservation_json).sequenceValue,73);assert.equal(JSON.parse(audit.evidence_json).notTransmitted,true);
  await assert.rejects(()=>ctx.db.prepare('DELETE FROM billing_invoice_number_retirements WHERE document_id=?').bind(d.id).run(),/IMMUTABLE/);
  await assert.rejects(()=>ctx.db.prepare('UPDATE billing_draft_numbers SET number=? WHERE document_id=?').bind('forged',d.id).run(),/IMMUTABLE/);
  const issued=await reserveIssuance(ctx.db,issueInput,user);assert.equal(issued.number,'FAC-202611076');assert.equal(await counter(),77);assert.equal(issued.snapshot.issueDate,date);assert.equal(issued.snapshot.dueDate,'2026-12-19');
  assert.deepEqual(await reserveIssuance(ctx.db,issueInput,user),issued);assert.equal(await counter(),77);
  d=await read(d);assert.equal(d.reservedNumber,null);assert.equal(d.retiredNumber.number,'FAC-202611073');assert.equal(d.issuance.number,issued.number);
  const found=await ok(await call('/documents?kind=invoice&q=FAC-202611073'));assert.equal(found.documents[0].id,d.id);
  assert.deepEqual((await ctx.db.prepare('SELECT * FROM billing_draft_numbers ORDER BY document_id').all()).results,beforeN);
  await ctx.db.prepare('INSERT INTO billing_retired_series VALUES(?,?,?)').bind(series.id,new Date().toISOString(),user).run();
  const collision=await createNumberSeries(ctx.db,{id:randomUUID(),issuerSiren:series.issuer_siren,kind:'invoice',prefix:'FAC-202611',width:3,firstValue:73,startDate:'1970-01-01',endDate:'9999-12-31'},user);
  const collisionDoc=await create();await assert.rejects(()=>reserveIssuance(ctx.db,{id:randomUUID(),documentId:collisionDoc.id,documentVersion:collisionDoc.version,seriesId:collision.id},user),error=>error.status===409);assert.equal(await counter(collision.id),73);
  assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_issuances WHERE id=?').bind(frozenId).first(),beforeFrozen);
 }finally{await ctx.worker.dispose();}
});
