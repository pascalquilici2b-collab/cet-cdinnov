// Synthetic market configuration, real Worker/D1; no external services or documents.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {quoteFixtureTools,quoteFixture} from './billing-quote-fixture.mjs';
import {invoiceFixture} from './billing-payments-fixture.mjs';
import {reserveIssuance,billingCanonicalJSON} from './billing-issuance.ts';
import {calculateBilling} from './billing-domain.ts';
import {emptyMarket,validateMarket} from '../marches/domain.mjs';

test('ambiguous order references fail closed while explicit IDs and unique historical references keep their budgets',async()=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).cookie,{call}=await quoteFixtureTools(ctx,token);
  const marketId=randomUUID(),projects=[0,1].map(i=>({id:randomUUID(),name:'Projet fictif '+i,orders:[{id:randomUUID(),reference:'BC-FICTIF-001',amountMinor:100000,date:'2026-01-01'}]}));
  const market=validateMarket({...emptyMarket(),title:'Marché fictif homonymes',clientName:'Client fictif',projects});
  const saveMarket=()=>ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=markets.version+1').bind(marketId,JSON.stringify(market),new Date().toISOString(),users[0]).run();await saveMarket();
  const draft=(price='600',references={})=>{const data={...quoteFixture('Facture fictive homonyme'),kind:'invoice',validUntil:''};data.references={...data.references,marketId,orderReference:'BC-FICTIF-001',...references};data.lines[0].quantity='1';data.lines[0].unitPrice=price;return data;};
  const create=(data)=>call('/documents','POST',{id:randomUUID(),data});
  const ok=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
  const budget=await ok(await call('/order-budget','POST',{id:randomUUID(),data:draft()}));
  assert.equal(budget.linked,true);assert.equal(budget.blocked,true);assert.match(budget.message,/Plusieurs bons de commande.*Choisissez/);
  // Simultaneous writes cannot all disappear from the allocation view under an ambiguous reference.
  const rejected=await Promise.all(Array.from({length:8},()=>create(draft())));for(const r of rejected)assert.match((await ok(r,422)).error,/Choisissez le bon de commande/);
  assert.equal((await ctx.db.prepare("SELECT count(*) n FROM billing_documents WHERE kind='invoice'").first()).n,0);
  const refs=i=>({projectId:projects[i].id,orderId:projects[i].orders[0].id});
  const first=await ok(await create(draft('600',refs(0))),201),second=await ok(await create(draft('600',refs(1))),201);
  assert.equal(first.data.references.orderId,projects[0].orders[0].id);assert.equal(second.data.references.orderId,projects[1].orders[0].id);
  await ok(await create(draft('500',refs(0))),422);
  let allocations=(await ctx.db.prepare('SELECT order_id,amount_minor FROM billing_order_allocations WHERE market_id=? ORDER BY order_id').bind(marketId).all()).results;
  assert.deepEqual(allocations.map(v=>v.amount_minor),[60000,60000]);
  await ok(await call('/documents/'+first.id,'PUT',{data:draft()},{'If-Match':String(first.version)}),422);
  assert.deepEqual((await ok(await call('/documents/'+first.id))).data,first.data);
  // Omitting optional orderId is supported for a unique text reference (and never binds undefined).
  market.projects[1].orders[0].reference='BC-FICTIF-UNIQUE';await saveMarket();
  const unique=draft('300',{orderReference:'BC-FICTIF-UNIQUE'});
  const uniqueBudget=await ok(await call('/order-budget','POST',{id:randomUUID(),data:unique}));assert.equal(uniqueBudget.linked,true);assert.equal(uniqueBudget.blocked,false);assert.equal(uniqueBudget.availableMinor,40000);
  const historical=await ok(await create(unique),201);assert.equal(historical.data.references.orderId,undefined);
  const after=await ok(await call('/order-budget','POST',{id:historical.id,data:unique}));assert.equal(after.availableMinor,40000);
  await ok(await create(draft('200',{orderReference:'BC-FICTIF-UNIQUE'})),422);
  // A reference not present in the market remains an unlinked historical reference, without guessing an ID.
  const unknown=draft('100',{orderReference:'BC-HISTORIQUE-EXTERNE'}),unknownBudget=await ok(await call('/order-budget','POST',{id:randomUUID(),data:unknown}));assert.deepEqual(unknownBudget,{linked:false,blocked:false});
  const unlinked=await ok(await create(unknown),201);assert.equal(unlinked.data.references.orderReference,'BC-HISTORIQUE-EXTERNE');
  const snapshot=await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(historical.id).first();
  // A new homonym between a preview and save must not invalidate the atomic write guard.
  market.projects[0].orders[0].reference='BC-FICTIF-UNIQUE';await saveMarket();
  await ok(await create(unique),422);
  assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(historical.id).first(),snapshot);
  await migrateBilling(ctx.db);assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(historical.id).first(),snapshot);
 }finally{await ctx.worker.dispose();}
});

test('issuance rejects an ambiguous or concurrently archived draft without consuming a number',async()=>{
 let onPreflight=async()=>{};
 const ctx=await testEnvironment({bindings:{BILLING_PDF_SERVICE_URL:'https://billing-fixture.invalid',BILLING_PDF_SERVICE_KEY:'synthetic-billing-fixture-key-0123456789'},outboundService:async req=>{
  const {document}=await req.json();await onPreflight();return Response.json({valid:true,snapshotSha256:createHash('sha256').update(billingCanonicalJSON({schemaVersion:1,document,totals:calculateBilling(document)})).digest('hex'),checks:{render:true,amounts:true,xsd:true,schematron:true,france:true}});
 }});try{
  await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).cookie,f=await quoteFixtureTools(ctx,token,{kind:'invoice',prefix:'TEST-FAC-'}),marketId=randomUUID();
  const project={id:randomUUID(),name:'Projet fictif',orders:[{id:randomUUID(),reference:'BC-ORIGINAL-FICTIF',amountMinor:1000000,date:'2026-01-01'}]},market=validateMarket({...emptyMarket(),title:'Marché fictif évolution',clientName:'Client fictif',projects:[project]});
  const saveMarket=()=>ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=markets.version+1').bind(marketId,JSON.stringify(market),new Date().toISOString(),users[0]).run();await saveMarket();
  const data=invoiceFixture();data.references={...data.references,marketId,orderReference:project.orders[0].reference};data.lines[0].quantity='1';data.lines[0].unitPrice='100';
  const issued=await f.create(data),historical=await f.create(data,false),racing=await f.create(data,false);
  const frozenIssue=await ctx.db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(issued.id).first(),frozenDraft=await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(historical.id).first(),counter=(await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(f.series.id).first()).next_value;
  const homonym={id:randomUUID(),name:'Deuxième projet fictif',orders:[{id:randomUUID(),reference:project.orders[0].reference,amountMinor:1000000,date:'2026-01-01'}]};
  market.projects.push(homonym);await saveMarket();await migrateBilling(ctx.db);await migrateBilling(ctx.db);
  const reserve=doc=>reserveIssuance(ctx.db,{id:randomUUID(),documentId:doc.id,documentVersion:doc.version,seriesId:f.series.id},users[0]);
  const attempts=await Promise.allSettled(Array.from({length:8},()=>reserve(historical)));
  for(const result of attempts){assert.equal(result.status,'rejected');assert.equal(result.reason.status,422);assert.match(result.reason.message,/Choisissez le bon de commande/);}
  market.projects.pop();await saveMarket();assert.equal((await(await f.call('/order-budget','POST',{id:racing.id,data:racing.data})).json()).blocked,false);
  // The PDF preflight is an asynchronous gap: a fresh homonym must be caught by the SQL insertion itself.
  onPreflight=async()=>{market.projects.push(homonym);await saveMarket();};
  const response=await f.call('/documents/'+racing.id+'/issue','POST',{id:randomUUID(),seriesId:f.series.id},{'If-Match':String(racing.version)});assert.equal(response.status,422,await response.clone().text());assert.match((await response.json()).error,/Choisissez le bon de commande/);
  assert.equal((await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(f.series.id).first()).next_value,counter);
  assert.equal((await ctx.db.prepare('SELECT count(*) n FROM billing_issuances').first()).n,1);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM billing_issue_jobs').first()).n,1);
  assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(historical.id).first(),frozenDraft);
  assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(issued.id).first(),frozenIssue);
  const replay=await reserveIssuance(ctx.db,{id:frozenIssue.id,documentId:issued.id,documentVersion:issued.version,seriesId:f.series.id},users[0]);assert.equal(replay.number,issued.issuance.number);
  const archived=await f.create(invoiceFixture('Brouillon fictif archivé pendant préparation'),false);
  onPreflight=async()=>{const removed=await f.call('/documents/'+archived.id,'DELETE',undefined,{'If-Match':String(archived.version)});assert.equal(removed.status,200);};
  const archivedResponse=await f.call('/documents/'+archived.id+'/issue','POST',{id:randomUUID(),seriesId:f.series.id},{'If-Match':String(archived.version)});assert.equal(archivedResponse.status,409,await archivedResponse.clone().text());assert.match((await archivedResponse.json()).error,/corbeille.*restaurez/);
  assert.equal((await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(f.series.id).first()).next_value,counter);
  assert.equal(await ctx.db.prepare('SELECT id FROM billing_issuances WHERE document_id=?').bind(archived.id).first(),null);
  assert.equal((await f.call('/documents/'+archived.id)).status,410);
 }finally{await ctx.worker.dispose();}
});

test('portal invoice imports reject ambiguous references atomically while preserving old metadata and explicit or unique links',async()=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);
  await ctx.setPortal(JSON.stringify({auth:{accounts:ctx.accounts,allowed:users},params:{},salaries:[],types:[],mouvements:[],conges:[],notesFrais:[],codesAffaires:[],factures:[]}));
  const cookie=(await ctx.login(users[0])).cookie,marketId=randomUUID(),market=validateMarket({...emptyMarket(),title:'Marché import fictif',clientName:'Client fictif',projects:[0,1].map(i=>({id:randomUUID(),name:'Projet fictif '+i,orders:[{id:randomUUID(),reference:'BC-IMPORT-'+i,amountMinor:100000,date:'2026-01-01'}]}))});
  const saveMarket=()=>ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=markets.version+1').bind(marketId,JSON.stringify(market),new Date().toISOString(),users[0]).run();await saveMarket();
  const call=(method='GET',body,version)=>ctx.worker.dispatchFetch('https://synthetic.invalid/api/v1/portal',{method,headers:{Cookie:cookie,Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1','Content-Type':'application/json',...(version===undefined?{}:{'If-Match':String(version)})},...(body?{body:JSON.stringify(body)}:{})});
  const ok=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
  const invoice=(id,ht,refs={})=>({id,number:'FICTIF-'+id,ht,marketId,orderReference:'BC-IMPORT-0',...refs});
  let saved=await ok(await call()),next=structuredClone(saved.workspace);
  next.factures.push(invoice('IMPORT-HISTORIQUE',100));await ok(await call('PUT',next,saved.version));
  // A valid old import becomes ambiguous after another project adds a homonym.
  market.projects[1].orders[0].reference='BC-IMPORT-0';await saveMarket();await migrateBilling(ctx.db);await migrateBilling(ctx.db);
  saved=await ok(await call());const historical=structuredClone(saved.workspace.factures[0]);next=structuredClone(saved.workspace);
  next.factures[0].note='Cette modification doit également être annulée avec le lot.';next.factures.push(invoice('IMPORT-SANS-BC',50,{orderReference:''}),invoice('IMPORT-AMBIGU',900));
  assert.match((await ok(await call('PUT',next,saved.version),422)).error,/Choisissez le bon de commande/);
  assert.deepEqual(await ok(await call()),saved,'All imported rows, portal metadata and global version roll back together');
  next=structuredClone(saved.workspace);next.factures[0].note='Note historique fictive conservée';await ok(await call('PUT',next,saved.version));
  saved=await ok(await call());assert.deepEqual({...saved.workspace.factures[0],note:undefined},{...historical,note:undefined});
  assert.equal(saved.workspace.factures[0].note,'Note historique fictive conservée');
  next=structuredClone(saved.workspace);next.factures[0].ht=101;await ok(await call('PUT',next,saved.version),422);assert.deepEqual(await ok(await call()),saved);
  next=structuredClone(saved.workspace);for(let i=0;i<2;i++)next.factures.push(invoice('IMPORT-ID-'+i,600,{orderId:market.projects[i].orders[0].id,projectId:market.projects[i].id}));await ok(await call('PUT',next,saved.version));
  saved=await ok(await call());next=structuredClone(saved.workspace);next.factures.push(invoice('IMPORT-DEPASSE',500,{orderId:market.projects[0].orders[0].id,projectId:market.projects[0].id}));await ok(await call('PUT',next,saved.version),422);assert.deepEqual(await ok(await call()),saved);
  market.projects[1].orders[0].reference='BC-IMPORT-UNIQUE';await saveMarket();
  next=structuredClone(saved.workspace);next.factures.push(invoice('IMPORT-UNIQUE',300,{orderReference:'BC-IMPORT-UNIQUE'}));await ok(await call('PUT',next,saved.version));
  const rows=(await ctx.db.prepare('SELECT document_id,order_id,amount_minor FROM billing_order_allocations WHERE market_id=? ORDER BY document_id').bind(marketId).all()).results;
  assert.deepEqual(rows.map(r=>r.amount_minor),[10000,60000,60000,30000]);assert.equal(rows.find(r=>r.document_id==='IMPORT-UNIQUE').order_id,market.projects[1].orders[0].id);
  saved=await ok(await call());await migrateBilling(ctx.db);assert.deepEqual(await ok(await call()),saved);
 }finally{await ctx.worker.dispose();}
});
