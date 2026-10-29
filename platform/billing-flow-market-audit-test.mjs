import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {testEnvironment,users} from '../marches/test.mjs';
import {emptyMarket} from '../marches/domain.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {seedBusinessDocument} from './business-migration.mjs';
import {blankClient} from './billing-directory-domain.ts';
import {blankDraft} from './billing-domain.ts';
import {bpuPrices} from './billing-bpu-fixture.mjs';
import {quoteFixtureTools,quoteFixture,samplePDF} from './billing-quote-fixture.mjs';

// API/SQLite integration only: every identity, contract and document below is fictitious.
// No browser, external service, production database or actual email is used.
const bundled=await build({entryPoints:[fileURLToPath(new URL('./billing-market-prices.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false});
const {clientMarkets,applicablePrices,bpuLine}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));

await test('Flux locaux Clients → Marchés → Projets → BDC → BPU',async t=>{
 const ctx=await testEnvironment();
 try{
  await migrateBilling(ctx.db);
  await seedBusinessDocument(ctx.db,'budgets',{clients:[{id:'client-a',name:'Client Alpha'},{id:'client-b',name:'Client Bêta'},{id:'client-c',name:'Client Gamma'}]},2);
  const {token}=await ctx.login(users[0]);
  const api=(path,method='GET',body,headers={})=>ctx.worker.dispatchFetch('https://test'+path,{method,headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const json=async(path,method='GET',body,headers={},status=200)=>{
   const response=await api(path,method,body,headers);
   assert.equal(response.status,status,await response.clone().text());return response.json();
  };
  const localOrder={id:'order-alpha',reference:'BC-ALPHA',date:'2026-10-01',amountMinor:200000,documentId:'',notes:'',archived:false};
  const globalOrder={...localOrder,id:'order-global-beta',reference:'BC-GLOBAL-BETA',amountMinor:500000};
  const project={id:'project-shared',name:'Projet commun',code:'PC',notes:'Note fictive',archived:false,orders:[localOrder]};
  for(const [id,clientId,clientName,projects,prices,orders] of [
   ['market-a','client-a','Client Alpha',[project],bpuPrices(),[]],
   ['market-b','client-b','Client Bêta',[],[{...bpuPrices()[0],id:'price-beta',amountMinor:99000}],[globalOrder]],
  ])await json('/budgets/markets','POST',{id,market:{...emptyMarket(),title:'Accompagnement '+clientName,reference:id,clientId,clientName,projects,prices,orders}},{},201);
  const projectInput={id:project.id,name:project.name,code:project.code,notes:project.notes,archived:false,marketId:'market-a',marketVersion:1,marketIds:['market-a','market-b'],clientIds:['client-c']};
  await json('/api/v1/projects','PUT',projectInput);

  await t.test('un client créé dans Clients est proposé dans Marchés et dans le contexte documentaire',async()=>{
   const id=randomUUID(),data=blankClient();data.party.name='Client uniquement créé dans Facturation';
   await json('/api/v1/billing/clients','POST',{id,data},{},201);
   const projects=await json('/api/v1/projects');
   assert.ok(projects.clients.some(c=>c.id===id),'Le répertoire Projets voit déjà le nouveau client');
   const [markets,context]=await Promise.all([json('/budgets/markets'),json('/api/v1/billing/context')]);
   const missing=[!markets.clients.some(c=>c.id===id)&&'Marchés',!context.clients.some(c=>c.id===id)&&'Contexte devis/factures'].filter(Boolean);
   assert.deepEqual(missing,[],'Le client créé doit être réutilisable sous la même identité dans tous les sélecteurs');
  });

  await t.test('renommer la fiche client actualise les sélecteurs sans réécrire la base Budget',async()=>{
   const initial=await json('/api/v1/billing/clients/client-a');
   await json('/api/v1/billing/clients/client-a','PUT',{data:{...initial.data,party:{...initial.data.party,name:'Client Alpha renommé'}}},{'If-Match':String(initial.version)},201);
   const projects=await json('/api/v1/projects');assert.equal(projects.clients.find(c=>c.id==='client-a').name,'Client Alpha renommé');
   const originals=await ctx.db.prepare('SELECT data_json FROM budget_clients').all();
   const original=originals.results.map(r=>JSON.parse(r.data_json)).find(c=>c.id==='client-a');
   assert.equal(original.name,'Client Alpha','Le budget et les instantanés historiques doivent rester indépendants');
   const markets=await json('/budgets/markets');
   assert.equal(markets.clients.find(c=>c.id==='client-a').name,'Client Alpha renommé','Le menu Marchés doit utiliser le nom courant du répertoire partagé');
  });

  await t.test('le projet partagé conserve une seule identité et ne mélange pas les BDC de ses marchés',async()=>{
   const directory=await json('/api/v1/projects');
   assert.equal(directory.projects.length,1);
   assert.deepEqual(new Set(directory.projects[0].marketIds),new Set(['market-a','market-b']));
   assert.ok(directory.projects[0].clientNames.includes('Client Gamma'));
   const context=await json('/api/v1/billing/context');
   const a=context.markets.find(m=>m.id==='market-a'),b=context.markets.find(m=>m.id==='market-b');
   assert.equal(a.projects[0].id,b.projects[0].id);
   assert.deepEqual(a.projects[0].orders.map(o=>o.id),['order-alpha']);
   assert.deepEqual(b.projects[0].orders.map(o=>o.id),['order-global-beta']);
   assert.equal((await ctx.db.prepare('SELECT COUNT(*) AS n FROM commercial_projects').first()).n,1);
  });

  await t.test('Projets liés du second marché expose aussi les projets rattachés via le répertoire Projets',async()=>{
   const detail=await json('/budgets/markets/market-b');
   const visible=[...(detail.market.projects||[]),...(detail.market.linkedProjects||[])];
   assert.ok(visible.some(p=>p.id===project.id),'Le projet visible dans Projets et dans l’éditeur doit aussi être visible dans Marchés → Projets liés');
   assert.equal(detail.market.projects.length,0,'Un projet partagé ne devient pas propriété du deuxième marché');
   assert.equal(detail.market.linkedProjects[0].ownerMarketId,'market-a');
   assert.equal(detail.market.linkedProjects[0].orders,undefined,'Les commandes du marché propriétaire ne sont pas copiées');
   const list=await json('/budgets/markets');assert.equal(list.markets.find(m=>m.id==='market-b').linkedProjects[0].id,project.id);
   const echoed=structuredClone(detail.market);echoed.linkedProjects[0].name='Tentative de modification hors du propriétaire';
   const saved=await json('/budgets/markets/market-b','PUT',echoed,{'If-Match':String(detail.market.version)});
   assert.equal(saved.market.linkedProjects[0].name,project.name,'La projection est en lecture seule, même si elle revient dans le corps PUT');
   const row=await ctx.db.prepare("SELECT payload FROM markets WHERE id='market-b'").first();
   const persisted=JSON.parse(row.payload);assert.equal(persisted.linkedProjects,undefined);assert.deepEqual(persisted.projects,[]);
   assert.equal((await ctx.db.prepare('SELECT COUNT(*) AS n FROM commercial_projects').first()).n,1);
  });

  await t.test('le BPU du marché sélectionné prend la priorité et conserve prix HT, taux et unité',async()=>{
   const context=await json('/api/v1/billing/context'),draft=blankDraft('quote');
   draft.clientId='client-a';draft.buyer.name='Client Alpha';draft.references.marketId='market-b';
   const markets=clientMarkets(context,draft);assert.deepEqual(markets.map(m=>m.id),['market-b']);
   const prices=applicablePrices(markets[0],'2026-10-29');assert.equal(prices.length,1);
   const line=bpuLine(prices[0]);assert.equal(line.unitPrice,'990.00');assert.equal(line.vatRate,'20');assert.equal(line.unitCode,'DAY');
   draft.references.marketId='';assert.deepEqual(clientMarkets(context,draft).map(m=>m.id),['market-a']);
  });

  await t.test('modifier un projet puis sauver un ancien onglet Marché conserve rattachements et commandes',async()=>{
   let market=(await json('/budgets/markets/market-a')).market;
   for(const key of ['marketIds','clientIds','logoData'])delete market.projects[0][key];
   await json('/budgets/markets/market-a','PUT',market,{'If-Match':String(market.version)});
   let directory=await json('/api/v1/projects'),saved=directory.projects[0];
   assert.deepEqual(saved.marketIds,['market-a','market-b']);assert.deepEqual(saved.clientIds,['client-c']);
   await json('/api/v1/projects','PUT',{...projectInput,marketVersion:saved.marketVersion,name:'Projet commun renommé'});
   const context=await json('/api/v1/billing/context');
   for(const id of ['market-a','market-b'])assert.equal(context.markets.find(m=>m.id===id).projects[0].name,'Projet commun renommé');
   assert.equal(context.markets.find(m=>m.id==='market-a').projects[0].orders[0].id,'order-alpha');
   assert.equal((await ctx.db.prepare('SELECT COUNT(*) AS n FROM commercial_projects').first()).n,1);
  });

  await t.test('retirer un rattachement secondaire ne supprime ni le projet source ni ses commandes',async()=>{
   const before=await json('/api/v1/projects');
   await json('/api/v1/projects','PUT',{...projectInput,marketVersion:before.projects[0].marketVersion,marketIds:['market-a']});
   const context=await json('/api/v1/billing/context');
   assert.equal(context.markets.find(m=>m.id==='market-b').projects.length,0);
   assert.equal(context.markets.find(m=>m.id==='market-a').projects[0].orders[0].id,'order-alpha');
   assert.equal((await ctx.db.prepare('SELECT COUNT(*) AS n FROM commercial_projects').first()).n,1);
  });
 }finally{await ctx.worker.dispose();}
});

await test('Corbeille → changement d’engagement familial → restauration atomique',async t=>{
 const ctx=await testEnvironment();
 try{
  await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).token,q=await quoteFixtureTools(ctx,token);
  const ok=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
  for(const id of ['restore-a','restore-b']){
   const market={...emptyMarket(),title:'Marché de restauration '+id,reference:id,clientName:'Client fictif',orders:[{id:id+'-order',reference:id+'-BDC',date:'2026-01-01',amountMinor:100000}]};
   await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(id,JSON.stringify(market),new Date().toISOString(),users[0]).run();
  }
  const data=quoteFixture('Devis fictif de restauration');data.lines[0].quantity='3';data.lines[0].unitPrice='100';data.references.marketId='restore-a';
  let quote=await q.create(data);quote=await ok(await q.send(quote),201);
  const upload=await ctx.worker.dispatchFetch('https://test/api/v1/billing/documents/'+quote.id+'/engagement?'+new URLSearchParams({kind:'order',reference:'restore-a-BDC',marketId:'restore-a',amountMinor:'100000'}),{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+token,'If-Match':String(quote.version),'X-Filename':'Commande-fictive.pdf','Content-Type':'application/pdf'},body:samplePDF()});
  await ok(upload,201);
  const convert=async()=>ok(await q.call('/documents/'+quote.id+'/convert','POST',{id:randomUUID()},{'If-Match':String(quote.version)}),201);
  let active=await convert(),deleted=await convert();
  await ok(await q.call('/documents/'+deleted.id,'DELETE',undefined,{'If-Match':String(deleted.version)}));
  const deletedSnapshot=await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(deleted.id).first();

  await t.test('une facture supprimée ne bloque pas le changement du BDC et reste intacte',async()=>{
   active=await ok(await q.call('/documents/'+active.id+'/followup','PATCH',{marketId:'restore-b',orderId:'restore-b-order'},{'If-Match':'0'}));
   active=await ok(await q.call('/documents/'+active.id,'PUT',{data:{...active.data,references:{...active.data.references,serviceCode:'SERVICE-B-42',engagement:'CHORUS-B'}}},{'If-Match':String(active.version)}));
   assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(deleted.id).first(),deletedSnapshot);
  });

  await t.test('restaurer le brouillon répercute le BDC, le service et les références courantes',async()=>{
   deleted=await ok(await q.call('/documents/'+deleted.id+'/restore','POST',{}, {'If-Match':String(deleted.version)}));
   assert.equal(deleted.data.references.marketId,'restore-b');assert.equal(deleted.data.references.orderId,'restore-b-order');
   assert.equal(deleted.data.references.serviceCode,'SERVICE-B-42');assert.equal(deleted.data.references.engagement,'CHORUS-B');
   assert.ok(deleted.version>deletedSnapshot.version);assert.equal(deleted.totals.netMinor,'30000');
   assert.equal(await ctx.db.prepare('SELECT document_id FROM billing_document_trash WHERE document_id=?').bind(deleted.id).first(),null);
   assert.equal((await ctx.db.prepare('SELECT order_id FROM billing_order_allocations WHERE document_id=?').bind(deleted.id).first()).order_id,'restore-b-order');
  });

  await t.test('restaurer un document émis conserve exactement son instantané et sa version',async()=>{
   const original=await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(quote.id).first();
   await ok(await q.call('/documents/'+quote.id,'DELETE',undefined,{'If-Match':String(quote.version)}));
   const restored=await ok(await q.call('/documents/'+quote.id+'/restore','POST',{}, {'If-Match':String(quote.version)}));
   assert.equal(restored.version,quote.version);assert.equal(restored.data.references.marketId,'restore-a');assert.equal(restored.followup.link.marketId,'restore-b');
   assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(quote.id).first(),original);
  });

  await t.test('un dépassement de plafond annule toute la restauration',async()=>{
   await ok(await q.call('/documents/'+deleted.id,'DELETE',undefined,{'If-Match':String(deleted.version)}));
   const row=await ctx.db.prepare("SELECT payload FROM markets WHERE id='restore-b'").first(),market=JSON.parse(row.payload);market.orders[0].amountMinor=50000;
   await ctx.db.prepare("UPDATE markets SET payload=?,version=version+1 WHERE id='restore-b'").bind(JSON.stringify(market)).run();
   const original=await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(deleted.id).first();
   const response=await q.call('/documents/'+deleted.id+'/restore','POST',{}, {'If-Match':String(deleted.version)});
   assert.equal(response.status,422,await response.clone().text());
   assert.ok(await ctx.db.prepare('SELECT document_id FROM billing_document_trash WHERE document_id=?').bind(deleted.id).first());
   assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(deleted.id).first(),original);
   assert.equal((await ctx.db.prepare('SELECT count(*) AS n FROM billing_link_writes').first()).n,0);
  });
 }finally{await ctx.worker.dispose();}
});
