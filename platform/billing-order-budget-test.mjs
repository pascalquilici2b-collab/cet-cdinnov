import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {quoteFixtureTools,quoteFixture,samplePDF} from './billing-quote-fixture.mjs';
import {emptyMarket,validateMarket} from '../marches/domain.mjs';
import {paymentFixtureTools,invoiceFixture} from './billing-payments-fixture.mjs';
import {reserveIssuance,claimIssuanceJob,completeIssuanceJob} from './billing-issuance.ts';

test('order ceiling is atomic across drafts, edits, imports, trash and restoration',async()=>{
 const ctx=await testEnvironment();try{
 await migrateBilling(ctx.db);await ctx.setPortal(JSON.stringify({auth:{accounts:ctx.accounts,allowed:users},factures:[{id:'legacy-capacity',number:'TEST',ht:0}]}));const token=(await ctx.login(users[0])).token,{call}=await quoteFixtureTools(ctx,token),marketId=randomUUID(),orderId=randomUUID(),projectId=randomUUID();
 const m=validateMarket({...emptyMarket(),title:'Marché de test',clientName:'Client fictif',projects:[{id:projectId,name:'Projet',orders:[]}],orders:[{id:orderId,reference:'BC-1000',amountMinor:100000,date:'2026-01-01'}]});
 await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(marketId,JSON.stringify(m),new Date().toISOString(),users[0]).run();
 const draft=(price)=>{const d={...quoteFixture(),kind:'invoice',validUntil:''};d.references={...d.references,marketId,projectId,orderId,orderReference:'BC-1000'};d.lines[0].quantity='1';d.lines[0].unitPrice=price;return d;};
 const create=async price=>{const id=randomUUID();return {id,r:await call('/documents','POST',{id,data:draft(price)})};};
 const first=await create('400');assert.equal(first.r.status,201,await first.r.clone().text());
 const racing=await Promise.all([create('400'),create('400')]);assert.deepEqual(racing.map(x=>x.r.status).sort(),[201,422]);const second=racing.find(x=>x.r.status===201);
 let r=await call('/documents/'+first.id,'PUT',{data:draft('700')},{'If-Match':'1'});assert.equal(r.status,422);assert.equal((await(await call('/documents/'+first.id)).json()).version,1);
 r=await call('/documents/'+first.id,'PUT',{data:draft('600')},{'If-Match':'1'});assert.equal(r.status,200,await r.clone().text());
 let budget=await(await call('/order-budget','POST',{id:first.id,data:draft('600')})).json();assert.equal(budget.blocked,false);assert.equal(budget.availableMinor,60000);
 assert.equal((await call('/documents/'+second.id,'DELETE',undefined,{'If-Match':'1'})).status,200);
 r=await call('/documents/'+first.id,'PUT',{data:draft('1000')},{'If-Match':'2'});assert.equal(r.status,200);
 r=await call('/documents/'+second.id+'/restore','POST',{}, {'If-Match':'1'});assert.equal(r.status,422);assert.equal((await call('/documents/'+second.id)).status,410);
 // The same native capacity also blocks the legacy/imported-invoice path.
 const old=await ctx.db.prepare('SELECT record_key,data_json FROM portal_invoices LIMIT 1').first();assert.ok(old);const imported={...JSON.parse(old.data_json),ht:1,marketId,projectId,orderId,orderReference:'BC-1000'};
 await assert.rejects(ctx.db.prepare('UPDATE portal_invoices SET data_json=? WHERE record_key=?').bind(JSON.stringify(imported),old.record_key).run(),/BILLING_ORDER_LIMIT/);
 const q={...draft('2000'),kind:'quote'};r=await call('/documents','POST',{id:randomUUID(),data:q});assert.equal(r.status,201);
 const tracking=await(await call('/engagements')).json();assert.equal(tracking.orders[0].reservedMinor,100000);assert.equal(tracking.orders[0].invoicedMinor,0);
 }finally{await ctx.worker.dispose();}
});

test('rectification replaces its original allocation; finalization rechecks a changed ceiling',async()=>{
 const ctx=await testEnvironment();try{
 await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).token,f=await paymentFixtureTools(ctx,token),marketId=randomUUID(),projectId=randomUUID(),orderId=randomUUID();
 const m={...emptyMarket(),title:'Marché global',clientName:'Atelier Horizon',projects:[{id:projectId,name:'Projet',orders:[]}],orders:[{id:orderId,reference:'GLOBAL',amountMinor:100000}]};
 await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(marketId,JSON.stringify(m),new Date().toISOString(),users[0]).run();
 const data=amount=>{const d=invoiceFixture();d.references={...d.references,marketId,projectId,orderId,orderReference:'GLOBAL'};d.lines[0].quantity='1';d.lines[0].unitPrice=amount;return d;};
 const original=await f.create(data('400')),other=await f.create(data('500'),false);
 let r=await f.call('/documents/'+original.id+'/rectify','POST',{id:randomUUID(),notTransmitted:true},{'If-Match':String(original.version)});assert.equal(r.status,201,await r.clone().text());const replacement=await r.json();
 assert.equal((await(await f.call('/order-budget','POST',{id:replacement.id,data:replacement.data})).json()).availableMinor,50000);
 r=await f.call('/documents/'+replacement.id,'PUT',{data:{...replacement.data,lines:data('600').lines}},{'If-Match':String(replacement.version)});assert.equal(r.status,422);
 // Cancelling a cheaper replacement restores its original amount and must not overflow.
 r=await f.call('/documents/'+replacement.id,'PUT',{data:{...replacement.data,lines:data('300').lines}},{'If-Match':'1'});assert.equal(r.status,200);
 r=await f.call('/documents/'+other.id,'PUT',{data:data('700')},{'If-Match':'1'});assert.equal(r.status,200);
 r=await f.call('/documents/'+replacement.id,'DELETE',undefined,{'If-Match':'2'});assert.equal(r.status,422);assert.equal((await f.call('/documents/'+replacement.id)).status,200);
 r=await f.call('/documents/'+other.id,'PUT',{data:data('500')},{'If-Match':'2'});assert.equal(r.status,200);other.version=3;
 r=await f.call('/documents/'+replacement.id,'PUT',{data:replacement.data},{'If-Match':'2'});assert.equal(r.status,200);
 // Use the existing fixture series; lowering a ceiling must also guard the final issuance write.
 const existing=await ctx.db.prepare("SELECT id,next_value FROM billing_number_series WHERE kind='invoice'").first();
 m.orders[0].amountMinor=80000;await ctx.db.prepare('UPDATE markets SET payload=?,version=version+1 WHERE id=?').bind(JSON.stringify(m),marketId).run();
 await assert.rejects(()=>reserveIssuance(ctx.db,{id:randomUUID(),documentId:other.id,documentVersion:other.version,seriesId:existing.id},users[0]),/BILLING_ORDER_LIMIT/);
 assert.equal((await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(existing.id).first()).next_value,existing.next_value);
 assert.equal(await ctx.db.prepare('SELECT id FROM billing_issuances WHERE document_id=?').bind(other.id).first(),null);
 m.orders[0].amountMinor=100000;await ctx.db.prepare('UPDATE markets SET payload=?,version=version+1 WHERE id=?').bind(JSON.stringify(m),marketId).run();
 const issue=await reserveIssuance(ctx.db,{id:randomUUID(),documentId:replacement.id,documentVersion:3,seriesId:existing.id},users[0]),lease=randomUUID();assert.ok(await claimIssuanceJob(ctx.db,issue.id,lease,users[0]));
 const bytes=samplePDF(),sha256=createHash('sha256').update(bytes).digest('hex'),artifact={kind:'pdf',key:'billing/'+issue.id+'/pdf/'+sha256,sha256,size:bytes.length,contentType:'application/pdf'};
 await(await ctx.worker.getR2Bucket('CET_FILES')).put(artifact.key,bytes);await completeIssuanceJob(ctx.db,issue.id,lease,{schemaVersion:1,envelopeSha256:issue.envelopeSha256,generatorVersion:'synthetic-budget-test',profile:'invoice-pdf',artifacts:[artifact]},users[0]);
 r=await f.call('/documents/'+replacement.id,'DELETE',undefined,{'If-Match':'3'});assert.equal(r.status,200);
 // Trashing an issued replacement retains its consumption without reviving its original.
 await migrateBilling(ctx.db);
 assert.equal((await ctx.db.prepare('SELECT sum(amount_minor) AS n FROM billing_order_allocations WHERE order_id=?').bind(orderId).first()).n,90000);
 assert.equal(await ctx.db.prepare('SELECT document_id FROM billing_order_allocations WHERE document_id=?').bind(original.id).first(),null);
 }finally{await ctx.worker.dispose();}
});
