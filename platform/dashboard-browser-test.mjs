import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {testEnvironment,users} from '../marches/test.mjs';
import {dashboardFixture,insertDashboardTrips} from './dashboard-fixture.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
process.env.MARCHES_TEST_WORKER=fileURLToPath(new URL('../.build/entry.mjs',import.meta.url));
process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const ctx=await testEnvironment();
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fixture=dashboardFixture(ctx.accounts,today);fixture.salaries[0].photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';fixture.notesFrais[0].signature=null;await ctx.setPortal(JSON.stringify(fixture));
await insertDashboardTrips(ctx.db,today,users[0],users[1]);
const sessions=await Promise.all(users.map(email=>ctx.login(email)));
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/[\\/]$/,'');
const out=process.env.PORTAL_QA;assert.ok(out,'Private QA output is required');await mkdir(out,{recursive:true});
const boot=`state={...freshState(),...${JSON.stringify(fixture)}};cloudEnabled=()=>false;budgetsObserveClients=()=>{};budgetsSyncClients=async()=>[];budgetsApi=()=>location.origin+'/budgets';budgetsEnsureSession=async()=>AUTH_USER===${JSON.stringify(users[0])}?${JSON.stringify(sessions[0])}:${JSON.stringify(sessions[1])};notify=()=>{throw Error('No notifications allowed in tests')};unlockApp(new URLSearchParams(location.search).has('consultant')?${JSON.stringify(users[1])}:${JSON.stringify(users[0])});`;
const html=(await readFile(join(root,'index.html'),'utf8')).replace('\nbootAuth();','\n'+boot);
assert.ok(html.includes(boot));
const requests=[];
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/budgets/')||url.pathname.startsWith('/api/v1/')){
   const body=[];for await(const b of req)body.push(b);
   const headers={Origin:'https://app.cdinnov.eu'};for(const name of ['authorization','content-type','if-match','if-none-match'])if(req.headers[name])headers[name]=req.headers[name];
   const r=await ctx.worker.dispatchFetch('https://test'+url.pathname+url.search,{method:req.method,headers,...(body.length?{body:Buffer.concat(body)}:{})});
   const b=Buffer.from(await r.arrayBuffer());requests.push({path:url.pathname,method:req.method,status:r.status,bytes:b.length});
   res.writeHead(r.status,Object.fromEntries(r.headers));res.end(b);return;
  }
  let name=url.pathname;if(name.endsWith('/'))name+='index.html';const file=resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+sep))throw Error('outside');
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(name==='/index.html'?html:await readFile(file));
 }catch(error){console.error('Local test adapter:',error.name,error.message);res.writeHead(500);res.end('Local test error');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'msedge'}),errors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'fr-FR',timezoneId:'Europe/Paris'});
 await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 await page.getByRole('heading',{name:'Dernières factures',exact:true}).waitFor();
 assert.equal(await page.locator('#pageTitle').innerText(),'Tableau de bord');
 assert.equal(await page.locator('.year-pick').isVisible(),false);assert.equal(await page.locator('#topAction').isVisible(),false);
 assert.equal(await page.locator('.db-person-row').count(),3);assert.equal(await page.locator('.db-request').count(),1);
 assert.equal(await page.locator('.db-person-row').nth(1).locator('.db-event.is-pending').count(),1);
 assert.equal(await page.locator('.db-invoice .db-document').count(),2);assert.equal(await page.locator('.db-expense .db-document').count(),2);
 const badges=await page.locator('.cdi-application>.cdi-beta').evaluateAll(nodes=>nodes.map(n=>({right:n.getBoundingClientRect().right,text:n.textContent})));
 assert.equal(badges.length,3);assert.ok(badges.every(b=>b.text==='Bêta'&&Math.abs(b.right-badges[0].right)<1));
 const colors=await page.locator('.cdi-application svg').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).stroke));assert.equal(new Set(colors).size,3);
 assert.equal(await page.locator('.applications-label').innerText(),'APPLICATIONS');
 assert.match(await page.locator('#cdiSheetsLink').innerText(),/CDInnovSheets/);
 await page.getByRole('group',{name:'Événements du planning'}).getByRole('button',{name:'Déplacements',exact:true}).click();
 assert.equal(await page.locator('.db-event.is-leave,.db-event.is-pending').count(),0);assert.ok(await page.locator('.db-event.is-trip').count()>0);
 await page.getByRole('group',{name:'Événements du planning'}).getByRole('button',{name:'Congés',exact:true}).click();assert.equal(await page.locator('.db-event.is-trip').count(),0);
 await page.getByRole('group',{name:'Événements du planning'}).getByRole('button',{name:'Tout',exact:true}).click();
 await page.screenshot({path:join(out,'tableau-de-bord-desktop.png'),fullPage:true});
 assert.equal(await page.locator('.db-person-row').first().locator('.db-avatar img').count(),1);
 await page.waitForFunction(()=>document.querySelector('.db-person-row .db-avatar img')?.naturalWidth===1);
 await page.locator('[data-theme-toggle]').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 assert.equal(await page.locator('[data-theme-toggle]').getAttribute('aria-pressed'),'true');
 await page.screenshot({path:join(out,'dashboard-dark-1440.png'),fullPage:true});
 for(const view of ['salaries','mouvements','notesfrais','facturier','parametres']){
  await page.evaluate(view=>setView(view),view);await page.waitForTimeout(300);
  await page.screenshot({path:join(out,view+'-dark-1440.png'),fullPage:true});
 }
 await page.evaluate(()=>setView('dashboard'));await page.getByRole('heading',{name:'Dernières factures',exact:true}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'Dernières factures',exact:true}).waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Activer le mode clair',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await page.getByRole('button',{name:'Fermer le menu',exact:true}).click();
 await page.setViewportSize({width:1440,height:1100});
 const firstRequests=requests.filter(r=>r.path==='/api/v1/dashboard').length;await page.evaluate(()=>render());
 assert.equal(requests.filter(r=>r.path==='/api/v1/dashboard').length,firstRequests,'Generic repaint must not trigger a summary refetch');
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow '+width);
  await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);
  if(width===390)await page.screenshot({path:join(out,'tableau-de-bord-mobile.png'),fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1100});
 await page.getByRole('button',{name:'Semaine suivante',exact:true}).click();
 await page.getByRole('button',{name:'Actualiser',exact:true}).waitFor();
 await page.getByRole('button',{name:'Aujourd’hui',exact:true}).click();
 await page.getByRole('button',{name:'Actualiser',exact:true}).waitFor();
 await page.locator('.db-invoice .db-document').first().click();
 await page.locator('#fvNum').waitFor();assert.equal(await page.locator('#fvNum').inputValue(),'F-2026-001');
 assert.equal(await page.locator('#dashboardRoot').count(),0);await page.evaluate(()=>{closeModal();setView('dashboard')});
 await page.locator('.db-expense .db-document').first().click();await page.locator('#overlay.show').waitFor();
 assert.equal(await page.locator('#nfObjet').inputValue(),'Réunion de projet');await page.evaluate(()=>{closeModal();setView('dashboard')});
 await page.getByRole('button',{name:'Examiner',exact:true}).click();
 await page.getByRole('heading',{name:'Soldes et gestion des congés',exact:true}).waitFor();
 await page.evaluate(()=>setView('mouvements'));await page.getByRole('button',{name:'Synthèse CET',exact:true}).click();
 assert.equal(await page.locator('#pageTitle').innerText(),'Synthèse CET');
 await page.getByRole('button',{name:'Retour aux mouvements CET',exact:false}).click();
 await page.evaluate(()=>setView('dashboard'));await page.getByRole('heading',{name:'Dernières factures',exact:true}).waitFor();
 // A failed refresh retains explicitly stale data, then supports retry.
 await page.route('**/api/v1/dashboard?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Test indisponibilité'})}));
 await page.getByRole('button',{name:'Actualiser',exact:true}).click();await page.getByRole('alert').filter({hasText:'Test indisponibilité'}).waitFor();
 assert.equal(await page.locator('.db-invoice .db-document').count(),2);await page.unroute('**/api/v1/dashboard?*');
 await page.getByRole('button',{name:'Réessayer',exact:true}).click();await page.getByRole('button',{name:'Actualiser',exact:true}).waitFor();
 assert.equal(await page.getByRole('alert').count(),0);
 // A late response from an old session cannot remount private information.
 let release,intercept;const held=new Promise(r=>{intercept=r});
 await page.route('**/api/v1/dashboard?*',async route=>{intercept();await new Promise(r=>release=r);await route.fulfill({status:200,contentType:'application/json',body:'{}'}).catch(()=>{});});
 await page.getByRole('button',{name:'Actualiser',exact:true}).click();await held;await page.evaluate(()=>authLogout());release();
 assert.equal(await page.locator('#dashboardRoot').count(),0);assert.equal(await page.locator('body.authed').count(),0);
 const employee=await context.newPage();employee.on('pageerror',e=>errors.push(e.message));await employee.goto(base+'/?consultant=1');
 await employee.getByRole('heading',{name:'Dernières notes de frais',exact:true}).waitFor();
 assert.equal(await employee.getByRole('heading',{name:'Dernières factures',exact:true}).count(),0);
 assert.equal(await employee.locator('.db-expense .db-document').count(),1);
 assert.equal(await employee.locator('.sidebar [data-view="facturier"]').isVisible(),false);
 assert.equal(await employee.locator('.db-request').count(),1);
 await employee.getByRole('button',{name:'Consulter',exact:false}).click();await employee.locator('.agenda-leave-details').waitFor();
 assert.equal(await employee.locator('.agenda-leave-details button').count(),2);
 assert.deepEqual(JSON.parse(await ctx.kv.get('markets-test')),fixture,'Browsing did not change stored records');
 assert.deepEqual(errors,[]);assert.ok(requests.filter(r=>r.path==='/api/v1/dashboard').every(r=>r.bytes<15000));
 console.log(JSON.stringify({checks:'Desktop/mobile, badges, grouping, navigation, CET, roles, refresh failure and logout isolation',requests,errors}));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await ctx.worker.dispose();}
