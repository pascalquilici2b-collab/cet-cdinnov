import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {quoteFixtureTools,quoteFixture,samplePDF} from './billing-quote-fixture.mjs';
import {emptyMarket} from '../marches/domain.mjs';
import {readAnnualQuotes,consumptionForMarket} from '../marches/annual-consumption.mjs';

const ok=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
async function setup(run){
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).token,q=await quoteFixtureTools(ctx,token),f=await quoteFixtureTools(ctx,token,{kind:'invoice',prefix:'AUDIT-INV-'});
  const marketA=randomUUID(),marketB=randomUUID(),orderA=randomUUID(),orderB=randomUUID();
  for(const [id,orderId,reference,amount] of [[marketA,orderA,'A',100000],[marketB,orderB,'B',200000]]){
   const m={...emptyMarket(),title:'Marché '+reference,reference:'M-'+reference,clientName:'Atelier Horizon',orders:[{id:orderId,reference:'BC-'+reference,date:'2026-01-01',amountMinor:amount}]};
   await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(id,JSON.stringify(m),new Date().toISOString(),users[0]).run();
  }
  const draft=(amount='300',market=marketA,order=orderA)=>{const d=quoteFixture();d.kind='invoice';d.validUntil='';d.lines[0].quantity='1';d.lines[0].unitPrice=amount;d.references={...d.references,marketId:market,marketReference:market===marketA?'M-A':'M-B',projectId:'',project:'',orderId:order,orderReference:market===marketA?'BC-A':'BC-B'};return d;};
  await run({ctx,token,q,f,marketA,marketB,orderA,orderB,draft});
 }finally{await ctx.worker.dispose();}
}

test('capacity preview uses the corrected engagement rather than the archived raw reference',async()=>setup(async({f,marketB,orderB,draft})=>{
 let invoice=await f.create(draft(),false);
 invoice=await ok(await f.call('/documents/'+invoice.id+'/followup','PATCH',{marketId:marketB,orderId:orderB},{'If-Match':'0'}));
 await f.create(draft('900'),false); // A has only 100 € left; corrected B has 2000 € available for this invoice.
 const data={...invoice.data,lines:invoice.data.lines.map(l=>({...l,unitPrice:'400'}))};
 const budget=await ok(await f.call('/order-budget','POST',{id:invoice.id,data}));
 assert.equal(budget.reference,'BC-B','The editor must inspect the same commitment as billing_order_allocations');
 assert.equal(budget.availableMinor,200000);assert.equal(budget.blocked,false);
}));

test('saving an invoice after relinking does not validate the obsolete order ceiling',async()=>setup(async({ctx,f,marketB,orderB,draft})=>{
 let invoice=await f.create(draft(),false);
 invoice=await ok(await f.call('/documents/'+invoice.id+'/followup','PATCH',{marketId:marketB,orderId:orderB},{'If-Match':'0'}));
 await f.create(draft('900'),false);
 const data={...invoice.data,lines:invoice.data.lines.map(l=>({...l,unitPrice:'400'}))};
 const saved=await ok(await f.call('/documents/'+invoice.id,'PUT',{data},{'If-Match':String(invoice.version)}));
 assert.equal(saved.totals.netMinor,'40000');
 assert.equal((await ctx.db.prepare('SELECT order_id FROM billing_order_allocations WHERE document_id=?').bind(invoice.id).first()).order_id,orderB);
}));

test('moving a quote/invoice engagement to another market moves quote consumption in all market projections',async()=>setup(async({ctx,token,q,marketA,marketB,orderA,orderB,draft})=>{
 const data={...draft(),kind:'quote',validUntil:'2099-12-31'};
 let quote=await q.create(data);quote=await ok(await q.send(quote),201);
 const originalSnapshot=await ctx.db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(quote.id).first();
 const upload=await ctx.worker.dispatchFetch('https://local/api/v1/billing/documents/'+quote.id+'/engagement?'+new URLSearchParams({kind:'order',reference:'BC-A',marketId:marketA,amountMinor:'100000'}),{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+token,'If-Match':String(quote.version),'X-Filename':'Bon-A.pdf','Content-Type':'application/pdf'},body:samplePDF()});
 await ok(upload,201);
 const invoice=await ok(await q.call('/documents/'+quote.id+'/convert','POST',{id:randomUUID()},{'If-Match':String(quote.version)}),201);
 await ok(await q.call('/documents/'+invoice.id+'/followup','PATCH',{marketId:marketB,orderId:orderB},{'If-Match':'0'}));
 const actualQuote=await ok(await q.call('/documents/'+quote.id));assert.equal(actualQuote.followup.link.marketId,marketB);
 assert.equal((await ctx.db.prepare('SELECT order_id FROM billing_order_allocations WHERE document_id=?').bind(invoice.id).first()).order_id,orderB);
 const tracking=await ok(await q.call('/engagements'));
 assert.equal(tracking.markets.find(m=>m.id===marketA).quotedMinor,0,'Old market must not retain the moved quote consumption');
 assert.equal(tracking.markets.find(m=>m.id===marketB).quotedMinor,30000);
 const context=await ok(await q.call('/context'));
 assert.equal(context.markets.find(m=>m.id===marketB).consumption.quotedMinor,30000,'Editor market bar agrees with engagement tracking');
 assert.equal(actualQuote.data.references.marketId,marketA,'Issued document fields remain immutable');
 assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(quote.id).first(),originalSnapshot);
}));

test('annual quote consumption resolves tracking, archived engagement and original market in that order',async()=>setup(async({ctx,token,q,marketA,marketB,orderA,draft})=>{
 let quote=await q.create({...draft(),kind:'quote',validUntil:'2099-12-31'});
 const market=async()=>(await readAnnualQuotes(ctx.db)).find(row=>row.id===quote.id).marketId;
 assert.equal(await market(),marketA);
 quote=await ok(await q.call('/documents/'+quote.id+'/followup','PATCH',{title:'Libellé corrigé'},{'If-Match':'0'}));
 assert.equal(await market(),marketA,'A title-only correction must preserve the original reference fallback');
 quote=await ok(await q.send(quote),201);
 await ok(await ctx.worker.dispatchFetch('https://local/api/v1/billing/documents/'+quote.id+'/engagement?'+new URLSearchParams({kind:'order',reference:'BC-B',marketId:marketB,amountMinor:'200000'}),{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+token,'If-Match':String(quote.version),'X-Filename':'Bon-B.pdf','Content-Type':'application/pdf'},body:samplePDF()}),201);
 assert.equal(await market(),marketB,'An archived engagement can correct the market before a followup link exists');
 quote=await ok(await q.call('/documents/'+quote.id+'/followup','PATCH',{marketId:marketA,orderId:orderA},{'If-Match':'1'}));
 assert.equal(await market(),marketA,'A later commercial correction overrides archived engagement metadata');
 assert.equal(quote.data.references.marketId,marketA);
}));

test('annual quote consumption keeps historical revisions independent from a corrected commercial link',async()=>setup(async({ctx,q,marketA,marketB,orderB,draft})=>{
 let source=await q.create({...draft(),kind:'quote',issueDate:'2025-01-01',validUntil:'2099-12-31'});
 source=await ok(await q.send(source,q.input(source,'accepted','Accord reçu','2025-01-02')),201);
 source=await ok(await q.call('/documents/'+source.id+'/followup','PATCH',{marketId:marketB,orderId:orderB},{'If-Match':'0'}));
 let revision=await ok(await q.call('/documents/'+source.id+'/revise','POST',{id:randomUUID(),familyVersion:source.quote.revision.familyVersion,reason:'Périmètre annuel'},{'If-Match':String(source.version)}),201);
 revision=await ok(await q.call('/documents/'+revision.id,'PUT',{data:{...revision.data,validUntil:'2099-12-31'}},{'If-Match':String(revision.version)}));
 revision=await q.finalize(revision);
 revision=await ok(await q.send(revision,q.input(revision,'accepted','Nouvel accord reçu',revision.data.issueDate)),201);
 const quotes=await readAnnualQuotes(ctx.db);
 assert.equal(quotes.find(row=>row.id===source.id).marketId,marketB);
 assert.equal(quotes.find(row=>row.id===revision.id).marketId,marketA,'A previous revision followup must not override the revised document market');
 const m=id=>({...emptyMarket(),id,periodBasis:'notification',notificationDate:'2025-01-01',ceilings:[{scope:'annual',basis:'HT',amountMinor:200000}]});
 const current=consumptionForMarket(m(marketA),quotes,revision.data.issueDate),historical=consumptionForMarket(m(marketB),quotes,revision.data.issueDate);
 assert.equal(current.quotedMinor,30000);assert.equal(historical.quotedMinor,0);assert.equal(historical.periods.find(p=>p.startDate==='2025-01-01').quotedMinor,30000);
}));

test('shared relinking remains atomic and rectification occupies only one order allocation',async()=>setup(async({ctx,f,marketA,marketB,orderB,draft})=>{
 let invoice=await f.create(draft('600'),false);
 invoice=await ok(await f.call('/documents/'+invoice.id+'/followup','PATCH',{marketId:marketB,orderId:orderB},{'If-Match':'0'}));
 invoice=await f.finalize(invoice);
 const replacement=await ok(await f.call('/documents/'+invoice.id+'/rectify','POST',{id:randomUUID(),notTransmitted:true},{'If-Match':String(invoice.version)}),201);
 const allocations=(await ctx.db.prepare('SELECT document_id,order_id,amount_minor FROM billing_order_allocations WHERE order_id=?').bind(orderB).all()).results;
 assert.deepEqual(allocations,[{document_id:replacement.id,order_id:orderB,amount_minor:60000}]);
 await f.create(draft('500'),false);
 const impossible=await f.call('/documents/'+replacement.id+'/followup','PATCH',{marketId:marketA,orderId:draft().references.orderId},{'If-Match':'1'});
 assert.equal(impossible.status,422,await impossible.clone().text());
 assert.equal((await ctx.db.prepare('SELECT order_id FROM billing_order_allocations WHERE document_id=?').bind(replacement.id).first()).order_id,orderB);
 const allocated=(await ctx.db.prepare('SELECT sum(amount_minor) total FROM billing_order_allocations').first()).total;assert.equal(allocated,110000);
}));

test('editor commitment change checks the entire invoice family, rolls back failures and synchronizes only drafts',async()=>setup(async({ctx,token,q,f,marketA,marketB,orderA,orderB,draft})=>{
 const smallOrder=randomUUID(),marketRow=await ctx.db.prepare('SELECT payload FROM markets WHERE id=?').bind(marketB).first(),market=JSON.parse(marketRow.payload);
 market.orders=[{...market.orders[0],amountMinor:100000},{id:smallOrder,reference:'BC-TROP-PETIT',date:'2026-01-01',amountMinor:90000}];
 await ctx.db.prepare('UPDATE markets SET payload=?,version=version+1 WHERE id=?').bind(JSON.stringify(market),marketB).run();
 const data={...draft('100'),kind:'quote',validUntil:'2099-12-31'};data.lines[0].quantity='10';
 let quote=await q.create(data);quote=await ok(await q.send(quote),201);
 await ok(await ctx.worker.dispatchFetch('https://local/api/v1/billing/documents/'+quote.id+'/engagement?'+new URLSearchParams({kind:'order',reference:'BC-A',marketId:marketA,amountMinor:'100000'}),{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+token,'If-Match':String(quote.version),'X-Filename':'Bon-A.pdf','Content-Type':'application/pdf'},body:samplePDF()}),201);
 const convert=async quantity=>ok(await q.call('/documents/'+quote.id+'/convert','POST',{id:randomUUID(),selection:{periods:[],customPeriod:'',quantities:[{id:data.lines[0].id,quantity}]}},{'If-Match':String(quote.version)}),201);
 let issued=await convert('4');issued=await f.finalize(issued);const first=await convert('3'),second=await convert('3');
 const inspect=async()=>{
  const result={};
  for(const table of ['billing_documents','billing_document_versions','billing_document_followup','billing_document_followup_history','billing_issuances','billing_order_allocations']){
   result[table]=(await ctx.db.prepare('SELECT * FROM '+table).all()).results.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return result;
 };
 const before=await inspect(),selectOrder=(orderId,reference)=>({...first.data,notes:'Saisie à conserver',references:{...first.data.references,marketId:marketB,marketReference:'M-B',orderId,orderReference:reference}});
 const rejected=await q.call('/documents/'+first.id,'PUT',{data:selectOrder(smallOrder,'BC-TROP-PETIT')},{'If-Match':String(first.version)});
 assert.equal(rejected.status,422,await rejected.clone().text());
 assert.deepEqual(await inspect(),before,'An over-capacity family move rolls back document fields, versions, shared links, audit history and allocations');
 const saved=await ok(await q.call('/documents/'+first.id,'PUT',{data:selectOrder(orderB,'BC-B')},{'If-Match':String(first.version)}));
 assert.equal(saved.data.notes,'Saisie à conserver','The explicit editor save preserves non-reference edits');
 const documents=await Promise.all([quote,issued,first,second].map(doc=>q.call('/documents/'+doc.id).then(ok)));
 for(const doc of documents)assert.equal(doc.followup.link.orderId,orderB,'Every linked document resolves the corrected commitment');
 for(const [old,updated] of [[first,documents[2]],[second,documents[3]]]){
  assert.equal(updated.data.references.marketId,marketB);assert.equal(updated.data.references.orderId,orderB);
  assert.ok(updated.version>old.version,'A reference synchronization invalidates stale editor versions');
 }
 for(const [old,updated] of [[quote,documents[0]],[issued,documents[1]]]){
  assert.deepEqual(updated.data,old.data,'Finalized documents retain their original fields');assert.equal(updated.version,old.version);
 }
 const after=await inspect();assert.deepEqual(after.billing_issuances,before.billing_issuances,'Issued snapshot envelopes are immutable');
 assert.equal(after.billing_order_allocations.length,3);assert.ok(after.billing_order_allocations.every(a=>a.order_id===orderB));
 assert.equal(after.billing_order_allocations.reduce((sum,a)=>sum+a.amount_minor,0),100000,'Partial invoice allocations are counted once each');
 const stale=await q.call('/documents/'+second.id,'PUT',{data:{...second.data,notes:'Ancien onglet toujours ouvert'}},{'If-Match':String(second.version)});
 assert.equal(stale.status,409,await stale.clone().text());
 assert.deepEqual(await inspect(),after,'A stale save cannot restore the previous BDC or consume an extra version');
}));

test('a stale draft save conflicts after an independent shared followup correction',async()=>setup(async({ctx,f,marketB,orderB,draft})=>{
 const original=await f.create(draft(),false);
 const corrected=await ok(await f.call('/documents/'+original.id+'/followup','PATCH',{marketId:marketB,orderId:orderB},{'If-Match':'0'}));
 assert.ok(corrected.version>original.version);
 const snapshot=await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(original.id).first();
 const stale=await f.call('/documents/'+original.id,'PUT',{data:{...original.data,notes:'Modification depuis un autre onglet'}},{'If-Match':String(original.version)});
 assert.equal(stale.status,409,await stale.clone().text());
 assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(original.id).first(),snapshot);
 const current=await ok(await f.call('/documents/'+original.id));assert.equal(current.followup.link.orderId,orderB);assert.equal(current.data.references.orderId,orderB);
}));
