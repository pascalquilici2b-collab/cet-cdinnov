import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {quoteFixtureTools,quoteFixture,samplePDF} from './billing-quote-fixture.mjs';
import {emptyMarket} from '../marches/domain.mjs';

const ok=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
async function setup(){
 const ctx=await testEnvironment();await migrateBilling(ctx.db);
 const token=(await ctx.login(users[0])).token,q=await quoteFixtureTools(ctx,token),f=await quoteFixtureTools(ctx,token,{kind:'invoice',prefix:'AUDIT-FAC-'}),marketId=randomUUID(),projectId=randomUUID(),manualOrderId=randomUUID();
 const market={...emptyMarket(),reference:'M-AUDIT',clientName:'Atelier Horizon',projects:[{id:projectId,name:'Projet audit',orders:[]}],orders:[{id:manualOrderId,reference:'BC-SANS-CHORUS',date:'2026-10-01',amountMinor:1000000,notes:''}]};
 await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(marketId,JSON.stringify(market),new Date().toISOString(),users[0]).run();
 async function quotedOrder(reference='BC-A',service='00123',engagement='ENG-A',sourceReferences={}){
  const data=quoteFixture('Accompagnement '+reference);data.references={...data.references,marketId,marketReference:'M-AUDIT',projectId,project:'Projet audit',...sourceReferences};data.lines[0].unitCode='DAY';
  let quote=await q.create(data);quote=await ok(await q.send(quote),201);
  const upload=await ctx.worker.dispatchFetch('https://local/api/v1/billing/documents/'+quote.id+'/engagement?'+new URLSearchParams({kind:'order',reference,marketId,projectId:data.references.projectId||'',amountMinor:'1000000',engagement,serviceCode:service,otherReference:'REF-'+reference}),{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+token,'If-Match':String(quote.version),'X-Filename':reference+'.pdf','Content-Type':'application/pdf'},body:samplePDF()});
  quote=await ok(upload,201);return {quote,orderId:'engagement:'+quote.id};
 }
 const convert=quote=>q.call('/documents/'+quote.id+'/convert','POST',{id:randomUUID()},{'If-Match':String(quote.version)}).then(r=>ok(r,201));
 const track=(doc,orderId,version=doc.followup?.version||0)=>q.call('/documents/'+doc.id+'/followup','PATCH',{marketId,orderId},{'If-Match':String(version)}).then(ok);
 return {ctx,q,f,marketId,projectId,manualOrderId,quotedOrder,convert,track};
}

test('future invoices retain numeric service (including leading zeroes), order and engagement through issuance',async()=>{
 const t=await setup();try{
  const {quote,orderId}=await t.quotedOrder();let invoice=await t.convert(quote);
  assert.equal(invoice.data.references.serviceCode,'00123');assert.equal(invoice.data.references.engagement,'ENG-A');assert.equal(invoice.data.references.orderId,orderId);
  invoice=await t.f.finalize(invoice);const snapshot=JSON.parse((await t.ctx.db.prepare('SELECT snapshot_json FROM billing_issuances WHERE document_id=?').bind(invoice.id).first()).snapshot_json);
  assert.equal(snapshot.references.serviceCode,'00123');assert.equal(snapshot.references.orderId,orderId);assert.equal(snapshot.references.quoteNumber,quote.issuance.number);
 }finally{await t.ctx.worker.dispose();}
});

test('billing context exposes global orders without a project and keeps every linked reference',async()=>{
 const t=await setup();try{
  const global=await t.quotedOrder('BC-GLOBAL','00123','ENG-GLOBAL',{projectId:'',project:''}),local=await t.quotedOrder('BC-PROJECT','00456','ENG-PROJECT');
  const context=await ok(await t.q.call('/context')),market=context.markets.find(m=>m.id===t.marketId),project=market.projects.find(p=>p.id===t.projectId);
  const refs=o=>({serviceCode:o.serviceCode,engagement:o.engagement,otherReference:o.otherReference});
  assert.deepEqual(refs(market.orders.find(o=>o.id===global.orderId)),{serviceCode:'00123',engagement:'ENG-GLOBAL',otherReference:'REF-BC-GLOBAL'});
  assert.equal(market.orders.some(o=>o.id===local.orderId),false,'Project-specific orders must not appear as global orders');
  assert.deepEqual(refs(project.orders.find(o=>o.id===local.orderId)),{serviceCode:'00456',engagement:'ENG-PROJECT',otherReference:'REF-BC-PROJECT'});
  assert.deepEqual(refs(project.orders.find(o=>o.id===global.orderId)),refs(market.orders.find(o=>o.id===global.orderId)));
  assert.deepEqual(refs(market.orders.find(o=>o.id===t.manualOrderId)),{serviceCode:'',engagement:'',otherReference:''});
 }finally{await t.ctx.worker.dispose();}
});

test('changing a draft commitment must change the issued snapshot as well as tracking/budget',async()=>{
 const t=await setup();try{
  const a=await t.quotedOrder('BC-A','00123','ENG-A'),b=await t.quotedOrder('BC-B','00456','ENG-B');let invoice=await t.convert(a.quote);
  invoice=await t.track(invoice,b.orderId);
  assert.equal(invoice.followup.link.orderId,b.orderId);assert.equal(invoice.followup.link.serviceCode,'00456');
  const allocation=await t.ctx.db.prepare('SELECT order_id FROM billing_order_allocations WHERE document_id=?').bind(invoice.id).first();assert.equal(allocation.order_id,b.orderId);
  invoice=await t.f.finalize(invoice);const snapshot=JSON.parse((await t.ctx.db.prepare('SELECT snapshot_json FROM billing_issuances WHERE document_id=?').bind(invoice.id).first()).snapshot_json);
  assert.deepEqual({orderId:snapshot.references.orderId,service:snapshot.references.serviceCode,engagement:snapshot.references.engagement},{orderId:b.orderId,service:'00456',engagement:'ENG-B'},'The invoice PDF must agree with its visible commitment and budget allocation');
 }finally{await t.ctx.worker.dispose();}
});

test('conversion clears obsolete service/engagement/other reference when replacement order has none',async()=>{
 const t=await setup();try{
  const a=await t.quotedOrder('BC-A','00123','ENG-A',{serviceCode:'00123',engagement:'ENG-A',otherReference:'REF-A'});
  const changed=await t.track(a.quote,t.manualOrderId);
  assert.equal(changed.followup.link.serviceCode,'');assert.equal(changed.followup.link.engagement,'');
  const invoice=await t.convert(changed);
  assert.equal(invoice.data.references.orderId,t.manualOrderId);
  assert.deepEqual({service:invoice.data.references.serviceCode,engagement:invoice.data.references.engagement,other:invoice.data.references.otherReference},{service:'',engagement:'',other:''},'Chorus references from the previous order must not leak onto a different commitment');
 }finally{await t.ctx.worker.dispose();}
});

test('editing a converted draft order keeps its shared quote link and allocation consistent',async()=>{
 const t=await setup();try{
  const a=await t.quotedOrder('BC-A','00123','ENG-A'),b=await t.quotedOrder('BC-B','00456','ENG-B');let invoice=await t.convert(a.quote);
  const updated={...invoice.data,references:{...invoice.data.references,orderId:b.orderId,orderReference:'BC-B',serviceCode:'00456',engagement:'ENG-B'}};
  invoice=await ok(await t.q.call('/documents/'+invoice.id,'PUT',{data:updated},{'If-Match':String(invoice.version)}));
  const quote=await ok(await t.q.call('/documents/'+a.quote.id));
  const allocation=await t.ctx.db.prepare('SELECT order_id FROM billing_order_allocations WHERE document_id=?').bind(invoice.id).first();
  assert.deepEqual({invoiceOrder:invoice.followup.link.orderId,quoteOrder:quote.followup.link.orderId,allocation:allocation.order_id},{invoiceOrder:b.orderId,quoteOrder:b.orderId,allocation:b.orderId},'Editing references cannot leave the visible PDF using a different order from tracking and budget');
 }finally{await t.ctx.worker.dispose();}
});

test('rectification preserves an already saved intervention report without changing original',async()=>{
 const t=await setup();try{
  const a=await t.quotedOrder();let invoice=await t.f.finalize(await t.convert(a.quote));
  const report={date:'2026-10-01',title:'Rapport de mission',periods:['S3','S4'],customPeriod:'Mission du 1 au 3 octobre',rows:[{id:randomUUID(),priceId:'',label:'Animation',description:'Atelier et compte-rendu validé',days:'3'}]};
  await ok(await t.q.call('/documents/'+invoice.id+'/intervention-report','PUT',report,{'If-Match':'0'}));
  const original=await t.ctx.db.prepare('SELECT data_json FROM billing_intervention_reports WHERE document_key=?').bind(invoice.id).first();
  let replacement=await ok(await t.q.call('/documents/'+invoice.id+'/rectify','POST',{id:randomUUID(),notTransmitted:true},{'If-Match':String(invoice.version)}),201);
  replacement=await t.f.finalize(replacement);
  const recovered=await ok(await t.q.call('/documents/'+replacement.id+'/intervention-report'));
  assert.deepEqual(await t.ctx.db.prepare('SELECT data_json FROM billing_intervention_reports WHERE document_key=?').bind(invoice.id).first(),original);
  assert.equal(recovered.version,1);
  assert.deepEqual({date:recovered.date,title:recovered.title,periods:recovered.periods,customPeriod:recovered.customPeriod,rows:recovered.rows.map(({id,...r})=>r)},{...report,rows:report.rows.map(({id,...r})=>r)},'Replacement invoice should retain the completed report rather than blank work descriptions');
  const updated={...report,title:'Relevé corrigé',rows:report.rows.map(r=>({...r,description:'Travail complété après rectification'}))};
  await ok(await t.q.call('/documents/'+replacement.id+'/intervention-report','PUT',updated,{'If-Match':'1'}));
  const retried=await ok(await t.q.call('/documents/'+invoice.id+'/rectify','POST',{id:randomUUID(),notTransmitted:true},{'If-Match':String(invoice.version)}));
  assert.equal(retried.id,replacement.id);
  const afterRetry=await ok(await t.q.call('/documents/'+replacement.id+'/intervention-report'));
  assert.equal(afterRetry.version,2);assert.equal(afterRetry.title,updated.title);assert.equal(afterRetry.rows[0].description,updated.rows[0].description);
  assert.deepEqual(await t.ctx.db.prepare('SELECT data_json FROM billing_intervention_reports WHERE document_key=?').bind(invoice.id).first(),original,'Changes to the replacement report must not change the original report');
  const history=await t.ctx.db.prepare('SELECT version FROM billing_intervention_report_versions WHERE document_key=? ORDER BY version').bind(replacement.id).all();
  assert.deepEqual(history.results.map(r=>r.version),[1,2]);
 }finally{await t.ctx.worker.dispose();}
});

test('rectification after moving to a global order in another market remains editable',async()=>{
 const t=await setup();try{
  const a=await t.quotedOrder(),invoice=await t.f.finalize(await t.convert(a.quote)),marketId=randomUUID(),orderId=randomUUID();
  const market={...emptyMarket(),reference:'M-OTHER',clientName:'Atelier Horizon',projects:[],orders:[{id:orderId,reference:'BC-GLOBAL-OTHER',date:'2026-10-01',amountMinor:1000000,notes:''}]};
  await t.ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(marketId,JSON.stringify(market),new Date().toISOString(),users[0]).run();
  const changed=await ok(await t.q.call('/documents/'+invoice.id+'/followup','PATCH',{marketId,orderId},{'If-Match':String(invoice.followup.version)}));
  assert.equal(changed.followup.link.projectId,'');
  const replacement=await ok(await t.q.call('/documents/'+invoice.id+'/rectify','POST',{id:randomUUID(),notTransmitted:true},{'If-Match':String(changed.version)}),201);
  const saved=await t.q.call('/documents/'+replacement.id,'PUT',{data:{...replacement.data,notes:'Rectification éditable'}},{'If-Match':String(replacement.version)});
  assert.equal(saved.status,200,'A replacement must not retain an incompatible project and become impossible to save: '+await saved.text());
 }finally{await t.ctx.worker.dispose();}
});
