import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {quoteFixtureTools,quoteFixture,samplePDF} from './billing-quote-fixture.mjs';
import {emptyMarket} from '../marches/domain.mjs';

test('global quote engagement and service follow invoice, project selection, tracking and rectification',async()=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).token,q=await quoteFixtureTools(ctx,token),f=await quoteFixtureTools(ctx,token,{kind:'invoice',prefix:'INV-'});
  const marketId=randomUUID(),projectId=randomUUID(),market={...emptyMarket(),reference:'M-TEST',clientName:'Atelier Horizon',projects:[{id:projectId,name:'MARIN AI',orders:[]}]};
  await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(marketId,JSON.stringify(market),new Date().toISOString(),users[0]).run();
  const data=quoteFixture();data.references={...data.references,marketId,marketReference:'M-TEST'};
  let quote=await q.create(data);quote=await(await q.send(quote)).json();
  const upload=await ctx.worker.dispatchFetch('https://local/api/v1/billing/documents/'+quote.id+'/engagement?'+new URLSearchParams({kind:'order',reference:'22500277',marketId,amountMinor:'540250',engagement:'22500277',serviceCode:'PORT DE PLAISANCE TINO ROSSI'}),{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+token,'If-Match':String(quote.version),'X-Filename':'Bon.pdf','Content-Type':'application/pdf'},body:samplePDF()});
  assert.equal(upload.status,201,await upload.clone().text());
  let response=await q.call('/documents/'+quote.id+'/convert','POST',{id:randomUUID()},{'If-Match':String(quote.version)});assert.equal(response.status,201,await response.clone().text());
  let invoice=await response.json(),orderId='engagement:'+quote.id;
  assert.equal(invoice.followup?.link?.orderId,orderId,'The invoice must show the source quote engagement immediately');
  assert.equal(invoice.followup.link.serviceCode,'PORT DE PLAISANCE TINO ROSSI');
  const context=await(await q.call('/context')).json(),project=context.markets.find(m=>m.id===marketId).projects.find(p=>p.id===projectId);
  assert.ok(project.orders.some(o=>o.id===orderId),'A global quote order remains available for every project of its market');
  const {referencesForProject}=await import('./billing-reference-selection.ts');
  const refs=referencesForProject(invoice.data.references,project);
  assert.equal(refs.orderId,orderId);assert.equal(refs.serviceCode,'PORT DE PLAISANCE TINO ROSSI');
  response=await q.call('/documents/'+invoice.id,'PUT',{data:{...invoice.data,references:refs}},{'If-Match':String(invoice.version)});assert.equal(response.status,200,await response.clone().text());invoice=await response.json();
  // A missing raw order reference must not remove the invoice from the budget projection.
  await ctx.db.prepare("UPDATE billing_documents SET data_json=json_set(data_json,'$.references.orderId','','$.references.orderReference',''),version=version+1 WHERE id=?").bind(invoice.id).run();
  invoice=await(await q.call('/documents/'+invoice.id)).json();
  assert.equal((await ctx.db.prepare('SELECT order_id FROM billing_order_allocations WHERE document_id=?').bind(invoice.id).first()).order_id,orderId);
  await assert.rejects(ctx.db.prepare("UPDATE billing_documents SET totals_json=json_set(totals_json,'$.netMinor',600000),version=version+1 WHERE id=?").bind(invoice.id).run(),/BILLING_ORDER_LIMIT/);
  response=await q.call('/documents/'+invoice.id+'/followup','PATCH',{marketId,orderId},{'If-Match':'0'});assert.equal(response.status,200,await response.clone().text());invoice=await response.json();assert.equal(invoice.followup.link.serviceCode,refs.serviceCode);
  // An editor must not erase an inherited commitment while leaving the shared quote/allocation attached.
  const cleared={...invoice.data,references:{...invoice.data.references,orderId:'',orderReference:'',serviceCode:''}};
  response=await q.call('/documents/'+invoice.id,'PUT',{data:cleared},{'If-Match':String(invoice.version)});assert.equal(response.status,422,await response.clone().text());invoice=await f.finalize(invoice);
  const before=(await ctx.db.prepare('SELECT data_json FROM billing_documents WHERE id=?').bind(invoice.id).first()).data_json;
  const list=await(await q.call('/documents?kind=invoice')).json();assert.equal(list.documents.find(d=>d.id===invoice.id).followup.link.orderId,orderId);
  const replacement=await q.call('/documents/'+invoice.id+'/rectify','POST',{id:randomUUID(),notTransmitted:true},{'If-Match':String(invoice.version)});assert.equal(replacement.status,201,await replacement.clone().text());
  const revised=await replacement.json();assert.equal(revised.data.references.orderId,orderId);assert.equal(revised.data.references.serviceCode,refs.serviceCode);assert.equal(revised.data.references.projectId,projectId,'Global order must not erase chosen project');
  assert.equal((await ctx.db.prepare('SELECT data_json FROM billing_documents WHERE id=?').bind(invoice.id).first()).data_json,before);
 }finally{await ctx.worker.dispose();}
});
