import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {testEnvironment,users} from '../marches/test.mjs';
import {emptyMarket} from '../marches/domain.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {quoteFixture,quoteFixtureTools,samplePDF} from './billing-quote-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const appRequire=createRequire(new URL('../package.json',import.meta.url));
const runtimeRequire=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium,expect}=runtimeRequire('playwright/test');
const output=resolve(process.env.PORTAL_QA||join(root,'platform/.private/engagement-tracking-qa'));
const read=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};

test('engagement folders retain market identity, commercial links, annual history and accessible actions',async t=>{
 const ctx=await testEnvironment();let browser,server,page;const requests=[],errors=[],captures=[];let failedScenarios=0;
 try{
  await migrateBilling(ctx.db);await mkdir(output,{recursive:true});
  const token=(await ctx.login(users[0])).token,auth={Authorization:'Bearer '+token};
  const q=await quoteFixtureTools(ctx,token),f=await quoteFixtureTools(ctx,token,{kind:'invoice',prefix:'FAC-QA-'});
  const year=Number(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date()).slice(0,4)),today=new Date().toISOString().slice(0,10);
  const ids={a:randomUUID(),b:randomUUID(),c:randomUUID(),project:randomUUID(),a1:randomUUID(),a2:randomUUID(),b1:randomUUID(),c1:randomUUID()};
  const order=(id,reference,amountMinor,date=year+'-01-01',extra={})=>({id,reference,date,amountMinor,documentId:'',notes:'',archived:false,...extra});
  const marketA={...emptyMarket(),title:'Mission Alpha — accompagnement annuel',reference:'MAR-COMMUN',clientName:'Atelier Horizon',notificationDate:(year-1)+'-01-01',periodBasis:'notification',ceilings:[{scope:'annual',basis:'HT',amountMinor:500000}],projects:[{id:ids.project,name:'Projet Équinoxe',orders:[order(ids.a1,'BC-COMMUN',100000)]}],orders:[order(ids.a2,'BC-SANS-MONTANT',null,(year-1)+'-02-10',{historyPending:true,notes:'Historique à rapprocher avec les archives.'})]};
  const marketB={...emptyMarket(),title:'Mission Bêta — autre contrat homonyme',reference:'MAR-COMMUN',clientName:'Atelier Horizon',orders:[order(ids.b1,'BC-COMMUN',150000)]};
  const marketC={...emptyMarket(),title:'Mission Gamma',reference:'MAR-GAMMA',clientName:'Client des Îles',orders:[order(ids.c1,'BC-GAMMA',75000)]};
  for(const [id,m] of [[ids.a,marketA],[ids.b,marketB],[ids.c,marketC]])await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(id,JSON.stringify(m),new Date().toISOString(),users[0]).run();
  const form=new FormData();form.append('file',new Blob([samplePDF()],{type:'application/pdf'}),'bon-marche.pdf');form.append('kind','other');
  const attachment=(await read(await ctx.call('markets/'+ids.a+'/documents',{method:'POST',headers:auth,body:form}),201)).document;
  marketA.orders[0].documentId=attachment.id;await ctx.db.prepare('UPDATE markets SET payload=?,version=version+1 WHERE id=?').bind(JSON.stringify(marketA),ids.a).run();
  function draft(amount,kind='invoice',marketId=ids.a,orderId=ids.a1){const d=quoteFixture('Prestation fictive du suivi');d.kind=kind;d.issueDate=today;d.validUntil=kind==='quote'?'2099-12-31':'';d.lines[0].quantity='1';d.lines[0].unitPrice=String(amount);d.references={...d.references,marketId,marketReference:marketId?'MAR-COMMUN':'',projectId:orderId===ids.a1?ids.project:'',project:orderId===ids.a1?'Projet Équinoxe':'',orderId,orderReference:orderId?'BC-COMMUN':''};return d;}
  const native=await f.create(draft(300)),reserved=await f.create(draft(100),false);
  for(const [date,amount] of [[(year-1)+'-01-01',800],[year+'-01-01',200]]){
   const d=draft(amount,'quote',ids.a,'');d.issueDate=date;const quote=await q.create(d);await read(await q.send(quote,q.input(quote,'accepted','Accord fictif',date)),201);
  }
  const orphanDraft=draft(150,'quote','','');orphanDraft.buyer.name='Client sans marché';let orphan=await q.create(orphanDraft);orphan=await read(await q.send(orphan,q.input(orphan,'accepted','Accord fictif',today)),201);
  await read(await ctx.worker.dispatchFetch('https://local/api/v1/billing/documents/'+orphan.id+'/engagement?'+new URLSearchParams({kind:'signed_quote',reference:'ACCORD-ORPHELIN',marketId:'',projectId:'',amountMinor:'15000',date:today}),{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',...auth,'If-Match':String(orphan.version),'X-Filename':'accord-signe.pdf','Content-Type':'application/pdf'},body:samplePDF()}),201);
  await ctx.setPortal(JSON.stringify({auth:{accounts:ctx.accounts,allowed:users},factures:[{id:'engagement-imported',number:'Facture FAC-IMP-042',client:'Atelier Horizon',dateFacture:today,ht:1200,marketId:ids.b,orderId:ids.b1,orderReference:'BC-COMMUN'}]}));
  const initial=await read(await f.call('/engagements'));
  assert.equal(initial.orders.find(o=>o.id===ids.a1).invoicedMinor,30000);assert.equal(initial.orders.find(o=>o.id===ids.a1).reservedMinor,10000);
  assert.equal(initial.orders.find(o=>o.id===ids.b1).invoicedMinor,120000);assert.equal(initial.orders.find(o=>o.id===ids.a2).amountMinor,null);
  assert.equal(initial.markets.find(m=>m.id===ids.a).consumption.quotedMinor,20000);assert.equal(initial.markets.find(m=>m.id===ids.a).consumption.periods.find(p=>!p.current).quotedMinor,80000);
  const source=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {EngagementTracking} from './platform/client/billing-engagement-tracking';import {createBillingTransport} from './platform/client/billing-api';import './platform/client/billing.css';import './platform/client/billing-apple.css';import './platform/client/billing-polish.css';
   const api=createBillingTransport({baseUrl:location.origin,getToken:async()=>${JSON.stringify(token)},isActive:()=>true}),transport={...api,engagements:async()=>{const data=await api.engagements();if(new URLSearchParams(location.search).get('visual')==='overrun')data.orders=data.orders.map(o=>o.id===${JSON.stringify(ids.b1)}?{...o,amountMinor:100000}:o);return data;}};
   function App(){const [opened,setOpened]=useState('');return <main className="bill-app"><EngagementTracking transport={transport} onOpen={setOpened}/><output id="opened-document" className="bill-sr-only">{opened}</output></main>};createRoot(document.getElementById('root')).render(<App/>);`;
  const bundle=await build({stdin:{contents:source,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',alias:{react:dirname(appRequire.resolve('react/package.json')),'react-dom':dirname(appRequire.resolve('react-dom/package.json'))},external:['/platform/pdf-editor-font.ttf'],outfile:'bundle.js',logLevel:'silent'});
  const assets=new Map(bundle.outputFiles.map(o=>['/'+o.path.split(/[\\/]/).at(-1),o.contents]));
  server=createServer(async(req,res)=>{try{
   const url=new URL(req.url,'http://local');
   if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/budgets/')){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks),headers={Origin:'https://app.cdinnov.eu'};
    for(const key of ['authorization','content-type','if-match','if-none-match'])if(req.headers[key])headers[key]=req.headers[key];
    const response=await ctx.worker.dispatchFetch('https://local'+url.pathname+url.search,{method:req.method,headers,...(bytes.length?{body:bytes}:{})});requests.push({method:req.method,path:url.pathname,status:response.status});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="fr" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><style>body{margin:0;padding:24px;background:#f5f5f7}html[data-theme=dark] body{background:#151517}@media(max-width:500px){body{padding:12px}}</style><div id="root"></div><script type="module" src="/bundle.js"></script></html>');return;}
   if(['/marches/vendor/pdf.mjs','/marches/vendor/pdf.worker.mjs'].includes(url.pathname)){res.setHeader('Content-Type','application/javascript');res.end(await readFile(join(root,url.pathname.slice(1))));return;}
   if(url.pathname==='/platform/pdf-editor-font.ttf'){res.setHeader('Content-Type','font/ttf');res.end(await readFile(join(root,'platform/pdf-editor-font.ttf')));return;}
   const asset=assets.get(url.pathname);res.statusCode=asset?200:404;res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'application/javascript');res.end(asset);
  }catch(error){res.writeHead(500);res.end(String(error));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1400,height:1050},locale:'fr-FR'});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(base+'/')||/^(blob:|data:)/.test(route.request().url())?route.continue():route.abort());await page.goto(base);
  const scenario=(name,fn)=>t.test(name,{timeout:60000},async()=>{try{await fn();}catch(error){failedScenarios++;console.error(name+': '+error.message+'; UI='+(await page.locator('body').innerText()).slice(0,4000));await page.screenshot({path:join(output,'failure-'+name.replace(/[^a-z]+/gi,'-')+'.png')});throw error;}});
  const tracking=page.locator('.bill-engagement-tracking'),search=page.getByRole('textbox',{name:'Rechercher un engagement'}),client=page.getByRole('combobox',{name:'Client des engagements'});
  const groups=page.locator('.bill-engagement-folder');
  const groupFor=title=>groups.filter({hasText:title});
  const orderCard=(group,reference)=>group.locator('.bill-engagement-order').filter({has:page.locator('.bill-engagement-order-identity strong').filter({hasText:reference})});
  async function openOrder(card){const trigger=card.getByRole('button',{name:/^(Voir|Masquer) les factures et pièces du bon /});if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();}
  async function resetFilters(){await search.fill('');await client.selectOption('');}
  async function capture(name,locator=tracking){const path=join(output,name+'.png');await locator.screenshot({path});captures.push(path);}

  await scenario('same labels remain distinct market folders with all their own orders',async()=>{
   await expect(groups).toHaveCount(4);const a=groupFor(marketA.title),b=groupFor(marketB.title);await expect(a).toHaveCount(1);await expect(b).toHaveCount(1);await expect(a).toHaveAttribute('data-market-id',ids.a);await expect(b).toHaveAttribute('data-market-id',ids.b);
   await expect(orderCard(a,'BC-COMMUN')).toHaveCount(1);await expect(orderCard(a,'BC-SANS-MONTANT')).toHaveCount(1);await expect(orderCard(b,'BC-COMMUN')).toHaveCount(1);
   await expect(a).toContainText('Projet Équinoxe');await expect(b).not.toContainText('Projet Équinoxe');await expect(tracking).toContainText('ACCORD-ORPHELIN');
  });
  await scenario('search supports client project market reference and title without merging identities',async()=>{
   await search.fill('equinoxe');await expect(groups).toHaveCount(1);await expect(groupFor(marketA.title)).toBeVisible();await expect(tracking.locator('.bill-engagement-order-identity strong').filter({hasText:'BC-SANS-MONTANT'})).toHaveCount(0);
   await search.fill('MAR-COMMUN');await expect(groups).toHaveCount(2);await search.fill('Bêta');await expect(groups).toHaveCount(1);await expect(groupFor(marketB.title)).toBeVisible();
   await search.fill('Atelier Horizon');await expect(groups).toHaveCount(2);await client.selectOption('Client des Îles');await expect(groups).toHaveCount(0);await expect(tracking).toContainText('Aucun résultat pour ces filtres.');
   await search.fill('');await expect(groups).toHaveCount(1);await expect(tracking).toContainText('BC-GAMMA');await resetFilters();
  });
  await scenario('native and imported invoice links preserve IDs and never duplicate FAC prefix',async()=>{
   const a=groupFor(marketA.title),b=groupFor(marketB.title);
   const nativeOrder=orderCard(a,'BC-COMMUN'),importedOrder=orderCard(b,'BC-COMMUN');
   for(const card of [nativeOrder,importedOrder])await openOrder(card);
   const nativeButton=nativeOrder.getByRole('button',{name:native.issuance.number,exact:true});await expect(nativeButton).toBeVisible();await nativeButton.focus();await page.keyboard.press('Enter');await expect(page.locator('#opened-document')).toHaveText(native.id);
   const importedButton=importedOrder.getByRole('button',{name:'FAC-IMP-042',exact:true});await importedButton.click();await expect(page.locator('#opened-document')).toHaveText('imported:engagement-imported');
   await expect(tracking).not.toContainText('FAC-FAC-');await expect(nativeOrder).not.toContainText(reserved.id);
  });
  await scenario('a trashed issued invoice retains its badge link and counted amount',async()=>{
   await read(await f.call('/documents/'+native.id,'DELETE',undefined,{'If-Match':String(native.version)}));await page.getByRole('button',{name:'Actualiser le suivi'}).click();
   const card=orderCard(groupFor(marketA.title),'BC-COMMUN');await openOrder(card);const button=card.getByRole('button',{name:native.issuance.number+' Corbeille',exact:true});await expect(button).toBeVisible();await button.click();await expect(page.locator('#opened-document')).toHaveText(native.id);
   const projected=(await read(await f.call('/engagements'))).orders.find(o=>o.id===ids.a1);assert.equal(projected.invoicedMinor,30000);assert.equal(projected.invoices[0].trashed,true);
   await read(await f.call('/documents/'+native.id+'/restore','POST',{}, {'If-Match':String(native.version)}));await page.getByRole('button',{name:'Actualiser le suivi'}).click();await expect(card.locator('.bill-engagement-trash')).toHaveCount(0);
  });
  await scenario('unknown ceilings reservations overruns and provisional history stay explicit',async()=>{
   const a=groupFor(marketA.title);
   const unknown=orderCard(a,'BC-SANS-MONTANT');await expect(unknown).toContainText('À renseigner');await expect(unknown).toContainText('Provisoire');await expect(unknown.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow',/.+/);await expect(tracking.locator('.bill-engagement-summary')).toContainText('À compléter');
   await expect(orderCard(a,'BC-COMMUN')).toContainText('en brouillons');
   // The write API correctly refuses allocations over capacity. Only this rendering
   // case lowers an already loaded fixture ceiling; it never changes stored data.
   await page.goto(base+'/?visual=overrun');const over=orderCard(groupFor(marketB.title),'BC-COMMUN');await expect(over).toContainText('Dépassement');await expect(over.locator('.bill-engagement-consumption')).toHaveAttribute('data-tone','over');await expect(over.getByRole('progressbar')).toHaveAttribute('aria-valuenow','100');await page.goto(base);await expect(groups).toHaveCount(4);
  });
  await scenario('private market and signed quote files download exact archived bytes',async()=>{
   const a=groupFor(marketA.title);await openOrder(orderCard(a,'BC-SANS-MONTANT'));await openOrder(orderCard(groups.filter({hasText:'ACCORD-ORPHELIN'}),'ACCORD-ORPHELIN'));
   for(const filename of ['bon-marche.pdf','accord-signe.pdf']){const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Télécharger '+filename,exact:true}).first().click();const download=await pending;assert.equal(download.suggestedFilename(),filename);assert.deepEqual(await readFile(await download.path()),samplePDF());}
   assert.ok(requests.some(r=>r.path.endsWith('/markets/'+ids.a+'/documents/'+attachment.id)&&r.status===200));assert.ok(requests.some(r=>r.path.endsWith('/documents/'+orphan.id+'/engagement')&&r.status===200));
  });
  await scenario('PDF preview renders the private file and closing rejects a late response',async()=>{
   const previewButton=page.getByRole('button',{name:'Aperçu du bon BC-SANS-MONTANT',exact:true}),dialog=page.getByRole('dialog',{name:'Pièce jointe · bon-marche.pdf',exact:true});
   await previewButton.focus();await page.keyboard.press('Enter');await expect(dialog).toBeVisible();await expect(dialog.getByText('Page 1 / 1',{exact:true})).toBeVisible();await expect(dialog.locator('canvas')).toBeVisible();
   assert.ok(await dialog.locator('canvas').evaluate(canvas=>canvas.width>0&&canvas.height>0));await capture('engagement-private-pdf-preview',dialog);await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(previewButton).toBeFocused();
   const path='**/budgets/markets/'+ids.a+'/documents/'+attachment.id;let release;const held=new Promise(resolve=>{release=resolve;});const requested=page.waitForRequest(path);
   await page.route(path,async route=>{const response=await route.fetch();await held;await route.fulfill({response});});
   await previewButton.click();await requested;await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();const response=page.waitForResponse(r=>r.url().endsWith('/markets/'+ids.a+'/documents/'+attachment.id));release();await response;await page.unroute(path);await expect(dialog).not.toBeVisible();await expect(previewButton).toBeFocused();
  });
  await scenario('annual periods show separate quote totals orders and reset dates',async()=>{
   await page.getByRole('tab',{name:'Marchés globaux',exact:true}).click();const market=page.locator('.bill-engagement-market-card').filter({hasText:marketA.title});await expect(market).toHaveCount(1);
   const period=market.getByRole('combobox',{name:'Période du marché MAR-COMMUN'});await expect(market.locator('.bill-market-meter')).toContainText('200,00');await expect(market).toContainText('Réinitialisation le 01/01/'+(year+1));
   await period.selectOption((year-1)+'-01-01');await expect(market.locator('.bill-market-meter')).toContainText('800,00');await expect(market).toContainText('Réinitialisation le 01/01/'+year);
   await market.locator('.bill-engagement-market-orders > summary').click();await expect(market).toContainText('BC-SANS-MONTANT');await expect(market).not.toContainText('BC-COMMUN');await capture('engagement-annual-history',market);
   await period.selectOption('');await expect(market.locator('.bill-market-meter')).toContainText('200,00');await expect(market).toContainText('BC-COMMUN');await expect(market).not.toContainText('BC-SANS-MONTANT');await page.getByRole('tab',{name:'Bons de commande',exact:true}).click();
  });
  await scenario('refresh recovers an API failure without losing displayed market data',async()=>{
   const before=await groups.count();await page.route('**/api/v1/billing/engagements',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Indisponibilité synthétique du suivi'})}));
   await page.getByRole('button',{name:'Actualiser le suivi'}).click();await expect(page.getByRole('alert')).toContainText('Indisponibilité synthétique');await expect(groups).toHaveCount(before);
   await page.unroute('**/api/v1/billing/engagements');await page.getByRole('button',{name:'Actualiser le suivi'}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(groups).toHaveCount(before);
  });
  await scenario('keyboard expansion themes and a 390px viewport retain readable controls',async()=>{
   const backgrounds=[];for(const theme of ['light','dark']){
    await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);await resetFilters();await page.setViewportSize({width:1400,height:1050});
    const ordersTab=page.getByRole('tab',{name:'Bons de commande',exact:true}),marketsTab=page.getByRole('tab',{name:'Marchés globaux',exact:true});await ordersTab.focus();await page.keyboard.press('ArrowRight');await expect(marketsTab).toBeFocused();await expect(marketsTab).toHaveAttribute('aria-selected','true');await page.keyboard.press('Home');await expect(ordersTab).toBeFocused();await expect(ordersTab).toHaveAttribute('aria-selected','true');
    const a=groupFor(marketA.title),toggle=orderCard(a,'BC-COMMUN').getByRole('button',{name:/^(Voir|Masquer) les factures et pièces du bon /});await toggle.focus();const prior=await toggle.getAttribute('aria-expanded');await page.keyboard.press('Enter');assert.notEqual(await toggle.getAttribute('aria-expanded'),prior);await expect(toggle).toBeFocused();await page.keyboard.press('Enter');
    backgrounds.push(await a.evaluate(el=>getComputedStyle(el).backgroundColor));await capture('engagement-folders-'+theme);await capture('engagement-market-alpha-'+theme,a);
    await page.setViewportSize({width:390,height:844});await openOrder(orderCard(a,'BC-COMMUN'));await expect(search).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'the entire tracking view must not overflow the mobile viewport');
    const interactive=await tracking.locator('button,input,select,summary').evaluateAll(elements=>elements.filter(el=>el.getClientRects().length).map(el=>({name:el.getAttribute('aria-label')||el.textContent,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})));assert.deepEqual(interactive.filter(el=>el.left<-.5||el.right>390.5),[],'visible actions fit the screen');await capture('engagement-folders-mobile-'+theme);
   }assert.notEqual(backgrounds[0],backgrounds[1]);
  });
  assert.deepEqual(errors,[]);assert.ok(requests.filter(r=>r.path==='/api/v1/billing/engagements'&&r.status===200).length>=2);
  await writeFile(join(output,'verification.json'),JSON.stringify({passed:failedScenarios===0,failedScenarios,requests,errors,captures,localOnly:true,visualOverrides:['overrun lowers one displayed ceiling only; storage remains valid'],fixture:{marketIds:ids,issuedInvoice:native.id,importedInvoice:'imported:engagement-imported',reservedInvoice:reserved.id}},null,2));
 }finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await ctx.worker.dispose();}
});
