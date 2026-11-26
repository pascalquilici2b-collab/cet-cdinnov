import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
import {invoiceFixture} from './billing-payments-fixture.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {billingMonthlyNumberSchema,billingNumberSQL} from './billing-monthly-number-schema.mjs';
import {createNumberSeries,reserveIssuance} from './billing-issuance.ts';
import {automaticNumberSeries} from './billing-numbering.ts';

test('provided historical reference uses an isolated opaque prefix, exact saved consent and immutable audit',async()=>{
 const ctx=await testEnvironment(),user=users[0],date='2026-11-19',clientId=randomUUID();
 try{
  await migrateBilling(ctx.db);const admin=await ctx.login(user);
  const call=(path,method='GET',body,version)=>ctx.worker.dispatchFetch('https://local/api/v1/billing'+path,{method,headers:{Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1','Content-Type':'application/json',Cookie:admin.cookie,...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const ok=async response=>{assert.ok(response.ok,await response.clone().text());return response.json();},read=doc=>call('/documents/'+doc.id).then(ok);
  const series={};for(const kind of ['quote','invoice']){
   series[kind]=await createNumberSeries(ctx.db,{id:randomUUID(),issuerSiren:'732829320',kind,prefix:kind==='quote'?'DEV-AAAAMM':'FAC-AAAAMM',width:3,firstValue:kind==='quote'?78:88,startDate:'1970-01-01',endDate:'9999-12-31'},user);
   await ctx.db.prepare('INSERT INTO billing_monthly_series VALUES(?)').bind(series[kind].id).run();await ctx.db.prepare('INSERT INTO billing_default_series VALUES(?,?,?)').bind('732829320',kind,series[kind].id).run();
  }
  const create=async(reference='',kind='invoice')=>{const data={...invoiceFixture(),kind,clientId,issueDate:date,dueDate:'2026-12-19',validUntil:kind==='quote'?'2026-12-31':''};data.references={...data.references,quoteNumber:reference};return ok(await call('/documents','POST',{id:randomUUID(),data}));};
  const historical=async doc=>{await ctx.db.batch(billingMonthlyNumberSchema.filter(sql=>/billing_draft_number_guard/.test(sql)).map(sql=>ctx.db.prepare(sql)));await ctx.db.prepare(`INSERT INTO billing_draft_numbers SELECT d.id,s.id,s.issuer_siren,s.next_value,${billingNumberSQL('?')},?,?,? FROM billing_documents d JOIN billing_number_series s ON s.id=? WHERE d.id=?`).bind(date,date,date,new Date().toISOString(),user,series.invoice.id,doc.id).run();await migrateBilling(ctx.db);return read(doc);};
  const legacy=await historical(await create('260318004')),counter=await ctx.db.prepare('SELECT * FROM billing_number_series WHERE id=?').bind(series.invoice.id).first();
  const get=doc=>call('/documents/'+doc.id+'/regularization-reference','GET',undefined,doc.version).then(ok);
  const post=(doc,extra={})=>call('/documents/'+doc.id+'/regularize-invoice-reference','POST',{quoteNumber:doc.data.references.quoteNumber,referenceConfirmed:true,...extra},doc.version);
  const before=await read(legacy),preview=await get(legacy);assert.equal(preview.invoiceNumber,'FAC-260318004');assert.equal(preview.blockedReason,undefined);
  assert.equal((await ctx.db.prepare('SELECT count(*) n FROM billing_external_number_series').first()).n,0);assert.deepEqual(await read(legacy),before);
  assert.equal((await post(legacy,{referenceConfirmed:false})).status,400);assert.equal((await post(legacy,{quoteNumber:'260318005'})).status,409);
  assert.equal((await call('/documents/'+legacy.id+'/regularization-reference','GET',undefined,legacy.version+1)).status,409);
  const responses=await Promise.all([post(legacy),post(legacy)]),linked=await ok(responses[0]);assert.deepEqual(await ok(responses[1]),linked);
  assert.equal(linked.version,legacy.version+1);assert.equal(linked.regularization.source,'provided');assert.equal(linked.regularization.quoteId,null);assert.equal(linked.sourceDocumentId,null);assert.equal(linked.regularization.invoiceNumber,'FAC-260318004');assert.deepEqual(linked.data,before.data);assert.deepEqual(linked.totals,before.totals);
  assert.equal(linked.retiredNumber.number,'FAC-202611088');assert.equal(linked.numberingReview,undefined);
  const marker=await ctx.db.prepare('SELECT * FROM billing_external_number_series').first(),external=await ctx.db.prepare('SELECT * FROM billing_number_series WHERE id=?').bind(marker.series_id).first();assert.equal(external.prefix,'FAC-260318');assert.equal(external.first_value,4);assert.equal(external.next_value,4);assert.equal(external.last_issue_date,null);
  assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_number_series WHERE id=?').bind(series.invoice.id).first(),counter);
  assert.equal((await ok(await call('/number-series'))).some(s=>s.id===external.id),false);
  assert.equal(await automaticNumberSeries(ctx.db,legacy.data,user),series.invoice.id);
  await assert.rejects(()=>ctx.db.prepare('UPDATE billing_default_series SET series_id=? WHERE kind=?').bind(external.id,'invoice').run(),/RESTRICTED/);
  await assert.rejects(()=>ctx.db.prepare('INSERT INTO billing_default_series VALUES(?,?,?)').bind('123456789','invoice',external.id).run(),/RESTRICTED|INVALID/);
  await assert.rejects(()=>createNumberSeries(ctx.db,{id:external.id,issuerSiren:external.issuer_siren,kind:'invoice',prefix:external.prefix,width:3,firstValue:4,startDate:external.start_date,endDate:external.end_date},user),/réservée/);
  const ordinary=await create();await assert.rejects(()=>reserveIssuance(ctx.db,{id:randomUUID(),documentId:ordinary.id,documentVersion:ordinary.version,seriesId:external.id},user),/réservée/);
  await assert.rejects(()=>ctx.db.prepare(`INSERT INTO billing_issuances(id,document_id,document_version,series_id,issuer_siren,sequence_value,number,issue_date,source_json,snapshot_json,totals_json,snapshot_sha256,created_at,created_by) SELECT ?,id,version,?,'732829320',4,'FAC-260318004',?,data_json,data_json,totals_json,?,?,? FROM billing_documents WHERE id=?`).bind(randomUUID(),external.id,date,'0'.repeat(64),new Date().toISOString(),user,ordinary.id).run(),/BILLING_RESERVATION_CONFLICT/);
  const attempt={id:randomUUID(),documentId:legacy.id,documentVersion:linked.version,seriesId:external.id},issued=await reserveIssuance(ctx.db,attempt,user);assert.equal(issued.number,'FAC-260318004');assert.equal(issued.sequenceValue,4);assert.equal((await reserveIssuance(ctx.db,attempt,user)).number,issued.number);
  assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_number_series WHERE id=?').bind(series.invoice.id).first(),counter);assert.equal((await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(external.id).first()).next_value,5);
  // The namespace cannot skip missing ranks or duplicate another exact invoice.
  const gap=await historical(await create('260318009')),gapBefore=await read(gap);assert.match((await get(gap)).blockedReason,/saut/);assert.equal((await post(gap)).status,409);assert.deepEqual(await read(gap),gapBefore);
  const collision=await historical(await create('260318004'));assert.match((await get(collision)).blockedReason,/déjà utilisé/);assert.equal((await post(collision)).status,409);
  // A current-prefix own reservation retains the existing tuple and counter.
  const current=await historical(await create('DEV-202611091'));assert.equal(current.numberingReviewNumber,'FAC-202611091');assert.equal((await get(current)).reservationAction,'preserve');
  const preserved=await ok(await post(current));assert.equal(preserved.regularization.reservationAction,'preserve');assert.equal(preserved.retiredNumber,undefined);
  const cBefore=await ctx.db.prepare('SELECT * FROM billing_number_series WHERE id=?').bind(series.invoice.id).first();const pIssued=await reserveIssuance(ctx.db,{id:randomUUID(),documentId:current.id,documentVersion:preserved.version,seriesId:series.invoice.id},user);assert.equal(pIssued.number,'FAC-202611091');assert.equal((await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(series.invoice.id).first()).next_value,cBefore.next_value);
  const empty=await historical(await create());assert.match((await get(empty)).blockedReason,/Renseignez/);assert.equal((await post(empty)).status,409);
  let quote=await create('','quote');quote=await ok(await call('/documents/'+quote.id+'/number','POST',{},quote.version));const known=await historical(await create(quote.reservedNumber.number.slice(4)));assert.match((await get(known)).blockedReason,/existe déjà/);assert.equal((await post(known)).status,409);
  const next=await historical(await create('260318005')),ready=await ok(await post(next));assert.equal(ready.regularization.invoiceNumber,'FAC-260318005');
  assert.equal((await call('/documents/'+next.id,'PUT',{data:{...ready.data,references:{...ready.data.references,quoteNumber:'260318006'}}},ready.version)).status,409);
  assert.equal((await call('/documents/'+next.id,'PUT',{data:{...ready.data,clientId:randomUUID()}},ready.version)).status,409);
  await assert.rejects(()=>ctx.db.prepare('DELETE FROM billing_invoice_reference_regularizations WHERE document_id=?').bind(next.id).run(),/IMMUTABLE/);
  await assert.rejects(()=>ctx.db.prepare('UPDATE billing_external_number_series SET prefix=? WHERE series_id=?').bind('FAC-000000',external.id).run(),/IMMUTABLE/);
  assert.equal((await ctx.db.prepare('SELECT count(*) n FROM billing_invoice_number_retirements').first()).n,0);assert.equal((await ctx.db.prepare("SELECT count(*) n FROM billing_documents WHERE kind='quote'").first()).n,1);
  const normalCounter=await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(series.invoice.id).first();
  const normal=await reserveIssuance(ctx.db,{id:randomUUID(),documentId:ordinary.id,documentVersion:ordinary.version,seriesId:await automaticNumberSeries(ctx.db,ordinary.data,user)},user);assert.equal(normal.number,'FAC-202611'+String(normalCounter.next_value).padStart(3,'0'));assert.equal(normal.seriesId,series.invoice.id);
 }finally{await ctx.worker.dispose();}
});

test('an exact own historical reservation retains its original series and full numeric sequence',async()=>{
 const ctx=await testEnvironment(),user=users[0],date='2026-11-19';
 try{
  await migrateBilling(ctx.db);const admin=await ctx.login(user);
  const call=(path,method='GET',body,version)=>ctx.worker.dispatchFetch('https://local/api/v1/billing'+path,{method,headers:{Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1','Content-Type':'application/json',Cookie:admin.cookie,...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const ok=async r=>{assert.ok(r.ok,await r.clone().text());return r.json();};
  const series=await createNumberSeries(ctx.db,{id:randomUUID(),issuerSiren:'732829320',kind:'invoice',prefix:'FAC-',width:3,firstValue:260318004,startDate:'1970-01-01',endDate:'9999-12-31'},user);await ctx.db.prepare('INSERT INTO billing_default_series VALUES(?,?,?)').bind('732829320','invoice',series.id).run();
  const data={...invoiceFixture(),issueDate:date,dueDate:'2026-12-19'};data.references={...data.references,quoteNumber:'260318004'};const draft=await ok(await call('/documents','POST',{id:randomUUID(),data}));
  await ctx.db.batch(billingMonthlyNumberSchema.filter(sql=>/billing_draft_number_guard/.test(sql)).map(sql=>ctx.db.prepare(sql)));await ctx.db.prepare(`INSERT INTO billing_draft_numbers SELECT d.id,s.id,s.issuer_siren,s.next_value,${billingNumberSQL('?')},?,?,? FROM billing_documents d JOIN billing_number_series s ON s.id=? WHERE d.id=?`).bind(date,date,date,new Date().toISOString(),user,series.id,draft.id).run();await migrateBilling(ctx.db);
  const preview=await ok(await call('/documents/'+draft.id+'/regularization-reference','GET',undefined,draft.version));assert.equal(preview.invoiceNumber,'FAC-260318004');assert.equal(preview.reservationAction,'preserve');assert.equal(preview.blockedReason,undefined);
  const regularized=await ok(await call('/documents/'+draft.id+'/regularize-invoice-reference','POST',{quoteNumber:'260318004',referenceConfirmed:true},draft.version));assert.equal(regularized.retiredNumber,undefined);
  const issued=await reserveIssuance(ctx.db,{id:randomUUID(),documentId:draft.id,documentVersion:regularized.version,seriesId:series.id},user);assert.equal(issued.sequenceValue,260318004);assert.equal(issued.number,'FAC-260318004');assert.equal((await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(series.id).first()).next_value,260318005);
  assert.equal((await ctx.db.prepare('SELECT count(*) n FROM billing_external_number_series').first()).n,0);
 }finally{await ctx.worker.dispose();}
});
