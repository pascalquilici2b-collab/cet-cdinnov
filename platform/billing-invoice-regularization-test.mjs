import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
import {invoiceFixture} from './billing-payments-fixture.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {billingMonthlyNumberSchema,billingNumberSQL} from './billing-monthly-number-schema.mjs';
import {createNumberSeries,reserveIssuance} from './billing-issuance.ts';

test('administrative regularization preserves history, links quotes and uses only an explicitly selected free quote suffix',async()=>{
 const ctx=await testEnvironment(),user=users[0],date='2026-11-19',clientId=randomUUID();
 try{
  await migrateBilling(ctx.db);
  const admin=await ctx.login(user),headers={Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1','Content-Type':'application/json',Cookie:admin.cookie};
  const call=(path,method='GET',body,version)=>ctx.worker.dispatchFetch('https://local/api/v1/billing'+path,{method,headers:{...headers,...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const ok=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
  const create=async(kind='invoice',patch={})=>{const data={...invoiceFixture(),kind,clientId,issueDate:date,dueDate:kind==='invoice'?'2026-12-19':'',validUntil:kind==='quote'?'2026-12-31':'',...patch};const doc=await ok(await call('/documents','POST',{id:randomUUID(),data}),201);return kind==='quote'?ok(await call('/documents/'+doc.id+'/number','POST',{},doc.version)):doc;};
  const read=doc=>call('/documents/'+doc.id).then(ok),count=async sql=>(await ctx.db.prepare(sql).first()).n;
  const series={};
  for(const kind of ['quote','invoice']){
   series[kind]=await createNumberSeries(ctx.db,{id:randomUUID(),issuerSiren:'732829320',kind,prefix:kind==='quote'?'DEV-AAAAMM':'FAC-AAAAMM',width:3,firstValue:kind==='quote'?78:88,startDate:'1970-01-01',endDate:'9999-12-31'},user);
   await ctx.db.prepare('INSERT INTO billing_monthly_series VALUES(?)').bind(series[kind].id).run();
   await ctx.db.prepare('INSERT INTO billing_default_series VALUES(?,?,?)').bind('732829320',kind,series[kind].id).run();
  }
  const legacy=await create(),other=await create(),q=await create('quote');
  const historical=async doc=>{
   await ctx.db.batch(billingMonthlyNumberSchema.filter(sql=>/billing_draft_number_guard/.test(sql)).map(sql=>ctx.db.prepare(sql)));
   await ctx.db.prepare(`INSERT INTO billing_draft_numbers SELECT d.id,s.id,s.issuer_siren,s.next_value,${billingNumberSQL('?')},?,?,? FROM billing_documents d JOIN billing_number_series s ON s.id=? WHERE d.id=?`).bind(date,date,date,new Date().toISOString(),user,series.invoice.id,doc.id).run();await migrateBilling(ctx.db);return doc;
  };
  await ctx.db.batch(billingMonthlyNumberSchema.filter(sql=>/billing_draft_number_guard/.test(sql)).map(sql=>ctx.db.prepare(sql)));
  await ctx.db.prepare(`INSERT INTO billing_draft_numbers SELECT d.id,s.id,s.issuer_siren,s.next_value,${billingNumberSQL('?')},?,?,? FROM billing_documents d JOIN billing_number_series s ON s.id=? WHERE d.id=?`).bind(date,date,date,new Date().toISOString(),user,series.invoice.id,legacy.id).run();
  await migrateBilling(ctx.db);await migrateBilling(ctx.db);
  const old=(await ctx.db.prepare('SELECT * FROM billing_draft_numbers WHERE document_id=?').bind(legacy.id).first()),before=await read(legacy);
  assert.equal(before.numberingReview,true);assert.equal(old.number,'FAC-202611088');
  // Choice, search and preview are read-only. Wrong clients, trash and stale versions cannot be linked.
  const wrong=await create('quote',{clientId:randomUUID(),buyer:{...q.data.buyer,name:q.data.buyer.name,siren:'356000000'}}),trash=await create('quote');await ok(await call('/documents/'+trash.id,'DELETE',undefined,trash.version));
  let list=await ok(await call('/documents/'+legacy.id+'/regularization-quotes'));
  assert.deepEqual(list.items.map(x=>x.id),[q.id]);assert.equal(list.items[0].invoiceNumber,'FAC-202611078');assert.equal(list.items[0].blockedReason,undefined);
  assert.equal((await ok(await call('/documents/'+legacy.id+'/regularization-quotes?q=absent'))).items.length,0);
  assert.deepEqual(await read(legacy),before);
  const body={quoteId:q.id,quoteVersion:q.version};
  assert.equal((await call('/documents/'+other.id+'/regularize-invoice','POST',body,other.version)).status,409);
  assert.equal((await call('/documents/'+legacy.id+'/regularize-invoice','POST',body,legacy.version+1)).status,409);
  assert.equal((await call('/documents/'+legacy.id+'/regularize-invoice','POST',{...body,quoteVersion:q.version+1},legacy.version)).status,409);
  assert.equal((await call('/documents/'+legacy.id+'/regularize-invoice','POST',{quoteId:wrong.id,quoteVersion:wrong.version},legacy.version)).status,422);
  assert.equal((await call('/documents/'+legacy.id+'/regularize-invoice','POST',{quoteId:trash.id,quoteVersion:trash.version},legacy.version)).status,422);
  const counterBefore=await count("SELECT next_value n FROM billing_number_series WHERE kind='invoice'");
  const concurrent=await Promise.all([call('/documents/'+legacy.id+'/regularize-invoice','POST',body,legacy.version),call('/documents/'+legacy.id+'/regularize-invoice','POST',body,legacy.version)]);
  const linked=await ok(concurrent[0]);assert.deepEqual(await ok(concurrent[1]),linked);
  assert.equal(linked.version,legacy.version+1);assert.equal(linked.numberingReview,undefined);assert.equal(linked.sourceDocumentId,q.id);assert.equal(linked.regularization.invoiceNumber,'FAC-202611078');
  assert.deepEqual(linked.data,{...legacy.data,references:{...legacy.data.references,quoteNumber:q.reservedNumber.number}});assert.deepEqual(linked.totals,legacy.totals);
  assert.equal(linked.retiredNumber.number,old.number);assert.equal(linked.issuance,null);assert.equal(linked.reservedNumber,null);
  assert.equal((await ctx.db.prepare('SELECT source_document_id FROM billing_documents WHERE id=?').bind(legacy.id).first()).source_document_id,null);
  assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_draft_numbers WHERE document_id=?').bind(legacy.id).first(),old);
  assert.equal(await count('SELECT count(*) n FROM billing_invoice_number_retirements'),0);
  assert.equal(await count("SELECT next_value n FROM billing_number_series WHERE kind='invoice'"),counterBefore);
  assert.deepEqual(await ok(await call('/documents/'+legacy.id+'/regularize-invoice','POST',body,legacy.version)),linked);
  assert.equal(await count('SELECT count(*) n FROM billing_invoice_regularizations'),1);
  assert.equal((await read(q)).quote.invoices[0].id,legacy.id);
  assert.equal((await ctx.db.prepare('SELECT root_id FROM billing_link_roots WHERE id=?').bind(legacy.id).first()).root_id,q.id);
  assert.equal((await call('/documents/'+legacy.id,'PUT',{data:{...linked.data,references:{...linked.data.references,quoteNumber:'OTHER'}}},linked.version)).status,409);
  assert.equal((await call('/documents/'+legacy.id,'PUT',{data:{...linked.data,clientId:randomUUID()}},linked.version)).status,409);
  await assert.rejects(()=>ctx.db.prepare('DELETE FROM billing_invoice_regularizations WHERE document_id=?').bind(legacy.id).run(),/IMMUTABLE/);
  // Unrelated invoices keep the established FAC counter; only explicit regularizations use DEV suffixes.
  const attempt={id:randomUUID(),documentId:legacy.id,documentVersion:linked.version,seriesId:series.invoice.id};
  const issued=await reserveIssuance(ctx.db,attempt,user);assert.equal(issued.number,'FAC-202611078');
  assert.equal(await count("SELECT next_value n FROM billing_number_series WHERE kind='invoice'"),counterBefore);
  assert.equal((await reserveIssuance(ctx.db,attempt,user)).number,issued.number);
  const ordinary=await reserveIssuance(ctx.db,{id:randomUUID(),documentId:other.id,documentVersion:other.version,seriesId:series.invoice.id},user);assert.equal(ordinary.number,'FAC-202611089');
  // Multiple invoices may reference a quote, but the same FAC number is never issued twice.
  const duplicate=await historical(await create());const blocked=(await ok(await call('/documents/'+duplicate.id+'/regularization-quotes'))).items.find(x=>x.id===q.id);
  assert.match(blocked.blockedReason,/déjà utilisé|réservé/);
  assert.equal((await call('/documents/'+duplicate.id+'/regularize-invoice','POST',body,duplicate.version)).status,409);
  assert.equal(await count('SELECT count(*) n FROM billing_invoice_regularizations'),1);
  // Legacy collisions stay reserved even after retirement; no invented alternate suffix.
  let collision;
  for(let i=0;i<8;i++){const candidate=await create('quote');if(candidate.reservedNumber.number==='DEV-202611088')collision=candidate;}
  assert.ok(collision);const collisionList=await ok(await call('/documents/'+duplicate.id+'/regularization-quotes?q=202611088'));
  assert.equal(collisionList.items[0].invoiceNumber,old.number);assert.match(collisionList.items[0].blockedReason,/historique/);
  assert.equal((await call('/documents/'+duplicate.id+'/regularize-invoice','POST',{quoteId:collision.id,quoteVersion:collision.version},duplicate.version)).status,409);
  // A later date with a lower suffix remains blocked by chronological checks.
  const later=await historical(await create('invoice',{issueDate:'2026-11-20'}));const lower=(await ok(await call('/documents/'+later.id+'/regularization-quotes'))).items.find(x=>x.number==='DEV-202611081');
  assert.match(lower.blockedReason,/ordre des factures/);
  let gap;for(let i=0;i<5;i++)gap=await create('quote');
  const gapChoice=(await ok(await call('/documents/'+later.id+'/regularization-quotes?q='+gap.reservedNumber.number))).items[0];
  assert.match(gapChoice.blockedReason,/saut dans la numérotation/);
  assert.equal((await call('/documents/'+later.id+'/regularize-invoice','POST',{quoteId:gap.id,quoteVersion:gap.version},later.version)).status,409);
  // Preserve an already correct ACTIVE reservation of this exact invoice.
  const preserve=await historical(await create()),preserveBefore=await read(preserve);
  const own=(await ok(await call('/documents/'+preserve.id+'/regularization-quotes?q=202611092'))).items[0];
  assert.equal(own.invoiceNumber,'FAC-202611092');assert.equal(own.reservationAction,'preserve');assert.equal(own.blockedReason,undefined);
  const ownRow=await ctx.db.prepare('SELECT * FROM billing_draft_numbers WHERE document_id=?').bind(preserve.id).first(),ownCounter=await count("SELECT next_value n FROM billing_number_series WHERE kind='invoice'");
  const preserved=await ok(await call('/documents/'+preserve.id+'/regularize-invoice','POST',{quoteId:own.id,quoteVersion:own.version},preserve.version));
  assert.equal(preserved.regularization.reservationAction,'preserve');assert.equal(preserved.retiredNumber,undefined);assert.equal(preserved.numberingReview,undefined);
  assert.equal((await call('/documents/'+preserve.id+'/retire-draft-number','POST',{notTransmitted:true,reason:'This test must not reverse the audited preservation.'},preserved.version)).status,409);
  const preservedIssue=await reserveIssuance(ctx.db,{id:randomUUID(),documentId:preserve.id,documentVersion:preserved.version,seriesId:series.invoice.id},user);
  assert.equal(preservedIssue.number,ownRow.number);assert.equal(await count("SELECT next_value n FROM billing_number_series WHERE kind='invoice'"),ownCounter);
  assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_draft_numbers WHERE document_id=?').bind(preserve.id).first(),ownRow);
  assert.equal(await count('SELECT count(*) n FROM billing_invoice_number_retirements'),0);assert.deepEqual(preserved.data.lines,preserveBefore.data.lines);
  // A prior explicit retirement remains immutable and cannot become preservation.
  const retired=await historical(await create()),retireInput={notTransmitted:true,reason:'Synthetic prior withdrawal, retained as historical evidence.'};
  await ok(await call('/documents/'+retired.id+'/retire-draft-number','POST',retireInput,retired.version));
  const priorAudit=await ctx.db.prepare('SELECT * FROM billing_invoice_number_retirements WHERE document_id=?').bind(retired.id).first();
  const withdrawn=(await ok(await call('/documents/'+retired.id+'/regularization-quotes?q=202611093'))).items[0];
  assert.match(withdrawn.blockedReason,/retirée/);
  assert.equal((await call('/documents/'+retired.id+'/regularize-invoice','POST',{quoteId:withdrawn.id,quoteVersion:withdrawn.version},retired.version)).status,409);
  assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_invoice_number_retirements WHERE document_id=?').bind(retired.id).first(),priorAudit);
 }finally{await ctx.worker.dispose();}
});

test('a regularized number is checked atomically when a higher invoice is finalized after its preview',async()=>{
 const ctx=await testEnvironment(),user=users[0],clientId=randomUUID(),date='2026-11-19';
 try{
  await migrateBilling(ctx.db);const session=await ctx.login(user);
  const call=(path,method='GET',body,version)=>ctx.worker.dispatchFetch('https://local/api/v1/billing'+path,{method,headers:{Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1','Content-Type':'application/json',Cookie:session.cookie,...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const ok=async response=>{assert.ok(response.ok,await response.clone().text());return response.json();};
  const create=async(kind,date)=>ok(await call('/documents','POST',{id:randomUUID(),data:{...invoiceFixture(),kind,clientId,issueDate:date,dueDate:'2026-12-20',validUntil:kind==='quote'?'2026-12-31':''}}));
  const series={};for(const kind of ['quote','invoice']){
   series[kind]=await createNumberSeries(ctx.db,{id:randomUUID(),issuerSiren:'732829320',kind,prefix:kind==='quote'?'DEV-AAAAMM':'FAC-AAAAMM',width:3,firstValue:kind==='quote'?1:10,startDate:'1970-01-01',endDate:'9999-12-31'},user);
   await ctx.db.prepare('INSERT INTO billing_monthly_series VALUES(?)').bind(series[kind].id).run();await ctx.db.prepare('INSERT INTO billing_default_series VALUES(?,?,?)').bind('732829320',kind,series[kind].id).run();
  }
  const legacy=await create('invoice','2026-11-20'),ordinary=await create('invoice',date);let quote=await create('quote',date);quote=await ok(await call('/documents/'+quote.id+'/number','POST',{},quote.version));
  await ctx.db.batch(billingMonthlyNumberSchema.filter(sql=>/billing_draft_number_guard/.test(sql)).map(sql=>ctx.db.prepare(sql)));
  await ctx.db.prepare(`INSERT INTO billing_draft_numbers SELECT d.id,s.id,s.issuer_siren,s.next_value,${billingNumberSQL('?')},?,?,? FROM billing_documents d JOIN billing_number_series s ON s.id=? WHERE d.id=?`).bind(date,date,date,new Date().toISOString(),user,series.invoice.id,legacy.id).run();await migrateBilling(ctx.db);
  const linked=await ok(await call('/documents/'+legacy.id+'/regularize-invoice','POST',{quoteId:quote.id,quoteVersion:quote.version},legacy.version));assert.equal(linked.regularization.invoiceNumber,'FAC-202611001');
  const newer=await reserveIssuance(ctx.db,{id:randomUUID(),documentId:ordinary.id,documentVersion:ordinary.version,seriesId:series.invoice.id},user);assert.equal(newer.number,'FAC-202611011');
  await assert.rejects(()=>reserveIssuance(ctx.db,{id:randomUUID(),documentId:legacy.id,documentVersion:linked.version,seriesId:series.invoice.id},user),error=>error.status===409&&/ordre des factures/.test(error.message));
  // This direct SQL insertion represents an issuance whose JS precheck ran before
  // the competing invoice. The database must independently reject it.
  await assert.rejects(()=>ctx.db.prepare(`INSERT INTO billing_issuances(id,document_id,document_version,series_id,issuer_siren,sequence_value,number,issue_date,source_json,snapshot_json,totals_json,snapshot_sha256,created_at,created_by)
   SELECT ?,d.id,d.version,s.id,s.issuer_siren,1,'FAC-202611001','2026-11-20',d.data_json,d.data_json,d.totals_json,?,?,? FROM billing_documents d JOIN billing_number_series s ON s.id=? WHERE d.id=?`).bind(randomUUID(),'0'.repeat(64),new Date().toISOString(),user,series.invoice.id,legacy.id).run(),/BILLING_RESERVATION_CONFLICT/);
  assert.equal(await ctx.db.prepare('SELECT 1 FROM billing_issuances WHERE document_id=?').bind(legacy.id).first(),null);
  assert.equal((await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(series.invoice.id).first()).next_value,12);
 }finally{await ctx.worker.dispose();}
});
