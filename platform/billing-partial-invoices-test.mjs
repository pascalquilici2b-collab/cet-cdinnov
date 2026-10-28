import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixtureTools,samplePDF} from './billing-quote-fixture.mjs';
import {invoiceFixture} from './billing-payments-fixture.mjs';
import {blankDocumentDetails} from './billing-domain.ts';
import {emptyMarket} from '../marches/domain.mjs';
import {migrateBilling} from './billing-schema.mjs';
const p=await billingPreview(),db=p.ctx.db,token=p.sessions[0].token;
const ok=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
try{
 const q=await quoteFixtureTools(p.ctx,token),f=await quoteFixtureTools(p.ctx,token,{kind:'invoice',prefix:'TEST-FAC-'}),call=q.call;
 const marketId=randomUUID(),projectId=randomUUID(),orderId=randomUUID(),market={...emptyMarket(),reference:'M-DEVELOP',title:'Accompagnement',clientName:'Client test',projects:[{id:projectId,name:'DEVELOP',orders:[{id:orderId,reference:'BC-56',date:'2026-10-01',amountMinor:1500000,notes:''}]}]};
 await db.prepare('INSERT INTO markets(id,payload,version,updated_at,updated_by) VALUES(?,?,1,?,?)').bind(marketId,JSON.stringify(market),new Date().toISOString(),'test').run();
 const data={...invoiceFixture(),kind:'quote',validUntil:'2099-12-31',dueDate:''};data.details={...blankDocumentDetails(),...data.details,periods:['S5','S6'],period:''};data.lines[0].quantity='20';data.references={...data.references,marketId,projectId,project:'DEVELOP'};
 let quote=await q.create(data);quote=await ok(await q.send(quote),201);
 await ok(await p.ctx.worker.dispatchFetch('https://local/api/v1/billing/documents/'+quote.id+'/engagement?'+new URLSearchParams({kind:'order',reference:'BC-56',marketId,projectId,amountMinor:'1500000'}),{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+token,'If-Match':String(quote.version),'X-Filename':'Bon.pdf','Content-Type':'application/pdf'},body:samplePDF()}),201);
 const before=await db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(quote.id).first();
 const selection=(quantity,period)=>({periods:[period],customPeriod:'',quantities:[{id:data.lines[0].id,quantity}]});
 const firstId=randomUUID(),convert=(id,s)=>call('/documents/'+quote.id+'/convert','POST',{id,selection:s},{'If-Match':String(quote.version)});
 let first=await ok(await convert(firstId,selection('10','S5')),201);
 assert.equal(first.sourceDocumentId,quote.id);assert.equal(first.data.references.orderId,orderId);assert.equal(first.data.references.quoteNumber,quote.issuance.number);assert.deepEqual(first.data.details.periods,['S5']);assert.equal(first.totals.netMinor,'750000');
 assert.equal((await ok(await convert(firstId,selection('10','S5')))).id,firstId);
 await ok(await convert(firstId,selection('9','S5')),409);
 first=await ok(await call('/documents/'+first.id,'PUT',{data:{...first.data,paymentMeans:'10',legalNotes:data.legalNotes}},{'If-Match':String(first.version)}));first=await f.finalize(first);
 const replacement=await ok(await call('/documents/'+first.id+'/rectify','POST',{id:randomUUID(),notTransmitted:true},{'If-Match':String(first.version)}),201);
 // The original and its rectification occupy one share, leaving half the order.
 const results=await Promise.all([convert(randomUUID(),selection('10','S6')),convert(randomUUID(),selection('10','S6'))]);assert.deepEqual(results.map(r=>r.status).sort(),[201,422]);
 const second=await results.find(r=>r.status===201).json();assert.deepEqual(second.data.details.periods,['S6']);assert.equal(second.totals.netMinor,'750000');assert.equal(second.data.references.orderId,orderId);
 let updated=await ok(await call('/documents/'+quote.id));assert.equal(updated.quote.invoices.length,2);assert.deepEqual(updated.quote.invoices.map(i=>i.id).sort(),[replacement.id,second.id].sort());assert.ok(!updated.quote.invoices.some(i=>i.id===first.id));
 await ok(await convert(randomUUID(),selection('1','S6')),422);
 await ok(await convert(randomUUID(),{...selection('1','S6'),quantities:[{id:randomUUID(),quantity:'1'}]}),400);
 await ok(await convert(randomUUID(),selection('0','S6')),400);
 const total=await db.prepare('SELECT sum(amount_minor) amount FROM billing_order_allocations WHERE order_id=?').bind(orderId).first();assert.equal(total.amount,1500000);
 assert.deepEqual(await db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(quote.id).first(),before);
 await migrateBilling(db);updated=await ok(await call('/documents/'+quote.id));assert.equal(updated.quote.invoices.length,2);assert.equal((await db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='billing_one_full_conversion'").first()).n,0);
 console.log('OK Multiple partial invoices, periods and references, current rectifications, idempotency, atomic cumulative order limit, immutable quote and repeatable migration.');
}finally{await p.close();}
