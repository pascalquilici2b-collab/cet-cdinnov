import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep,join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/[\\/]$/,'');
const output=process.env.PORTAL_QA;if(!output)throw new Error('PORTAL_QA must point to a private output directory');
await mkdir(output,{recursive:true});
const records=['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-11-02','2026-11-03'].flatMap(date=>['AM','PM'].map(half=>({id:date+half,matricule:'QA',date,half,type:'Congés payés',statut:'Validé',req:'qa-period'})));
// Only the loopback server receives this fixture boot. No test account enters deployed files.
const boot=`
state=freshState();state.salaries=[{matricule:'QA',nom:'Exemple',prenom:'Camille',email:'admin@example.invalid'}];
state.mouvements=[];state.conges=${JSON.stringify(records)};
AUTH_ADMINS.push('admin@example.invalid');
state.auth={accounts:{'admin@example.invalid':{name:'Camille Exemple'}},allowed:['admin@example.invalid']};
cloudEnabled=()=>false;budgetsObserveClients=()=>{};budgetsSyncClients=async()=>{};
budgetsEnsureSession=async()=>({token:'loopback-fixture-only'});budgetsApi=()=>location.origin+'/api/budgets';agendaEnter=()=>{};
agendaState.loaded=true;agendaState.month=new Date('2026-10-01T12:00:00');agendaState.mode='month';
unlockApp(new URLSearchParams(location.search).has('consultant')?'consultant@example.invalid':'admin@example.invalid');
`;
const host=(await readFile(join(root,'index.html'),'utf8')).replace('\nbootAuth();','\n'+boot);
assert.ok(host.includes('loopback-fixture-only'));
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');let name=url.pathname;
  if(name==='/api/budgets/markets'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({markets:[],clients:[]}));return;}
  if(name.endsWith('/'))name+='index.html';
  const file=resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+sep))throw Error('Outside root');
  res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');
  res.end(name==='/index.html'?host:await readFile(file));
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'msedge'});
const errors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/?view=marches');await page.locator('[data-action="new"]:enabled').waitFor();
 assert.equal(await page.locator('.sidebar [data-view="marches"]').count(),0);
 assert.equal((await page.locator('.sidebar [data-view="facturier"]').innerText()).replace(/\s+/g,' '),'Logiciel de facturation Bêta');
 assert.match(await page.locator('.sidebar [data-view="facturier"]').getAttribute('class'),/active/);
 assert.equal((await page.locator('#cdiSheetsLink').innerText()).replace(/\s+/g,' '),'SmartSheet Bêta');
 assert.equal(await page.locator('.billing-nav [aria-current="page"]').innerText(),'Marchés et contrats');
 await page.locator('.billing-nav').getByRole('button',{name:'Factures',exact:true}).click();
 await page.getByRole('heading',{name:'Factures',exact:true}).waitFor();
 await page.locator('.billing-nav').getByRole('button',{name:'Codes affaires',exact:true}).click();
 await page.getByRole('heading',{name:'Codes affaires',exact:true}).waitFor();
 await page.locator('.billing-nav').getByRole('button',{name:'Marchés et contrats',exact:true}).click();
 await page.locator('[data-action="new"]').click();await page.locator('[data-tab="summary"]').click();await page.locator('#mk-title').fill('Contrat de test local');
 page.once('dialog',d=>d.dismiss());
 await page.locator('.billing-nav').getByRole('button',{name:'Factures',exact:true}).click();
 assert.equal(await page.locator('#mk-title').inputValue(),'Contrat de test local');
 page.once('dialog',d=>d.accept());
 await page.locator('.billing-nav').getByRole('button',{name:'Factures',exact:true}).click();
 assert.equal(await page.locator('.billing-nav [aria-current="page"]').innerText(),'Factures');
 await page.screenshot({path:join(output,'facturation-desktop.png'),fullPage:true});
 for(const width of [390,320]){
  await page.setViewportSize({width,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'billing overflow '+width);
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>setView('agenda'));await page.locator('[data-react-agenda]').waitFor();
 const bars=page.locator('.agenda-calendar [data-ag-leave-period]');
 assert.equal(await bars.count(),1);
 assert.equal(await bars.first().evaluate(e=>e.style.gridColumn),'1 / 8');
 assert.match(await bars.first().getAttribute('class'),/continues/);
 assert.equal(await page.evaluate(()=>agendaLeaves()[0].days),8);
 await page.screenshot({path:join(output,'conges-frise-octobre.png'),fullPage:true});
 await page.locator('#agendaNext').click();
 assert.equal(await bars.count(),2);
 assert.match(await bars.last().getAttribute('class'),/continued/);
 assert.equal(await bars.last().evaluate(e=>e.style.gridColumn),'1 / 3');
 await bars.last().click();
 assert.equal(await page.locator('.agenda-leave-details button').count(),8);
 await page.locator('[data-ag-leave="2026-11-03"]').click();
 assert.match(await page.locator('#overlay').innerText(),/3 novembre 2026|03\/11\/2026/);
 await page.evaluate(()=>{closeModal();});
 await page.locator('[data-ag-mode="list"]').click();
 assert.equal(await page.locator('.agenda-list-row').count(),1);
 assert.equal(await page.evaluate(()=>JSON.stringify(state.conges)),JSON.stringify(records));
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:join(output,'conges-liste-mobile.png'),fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const consultant=await context.newPage();await consultant.goto(base+'/?consultant=1');
 assert.equal(await consultant.locator('.sidebar [data-view="facturier"]').isVisible(),false);
 await consultant.evaluate(()=>setView('marches'));
 await consultant.getByText('Le paramétrage des marchés est réservé à la direction habilitée.',{exact:true}).waitFor();
 assert.equal(await consultant.locator('.billing-nav').count(),0);
 await page.goto(base+'/feuilles/');await page.locator('.cloud-login input[type=email]').waitFor();
 assert.equal(await page.title(),'Bêta · Smartsheet · CDInnov');
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});
  assert.equal(await page.locator('.cdi-app-home').innerText(),'Bêta\nSmartsheet');
  assert.ok(await page.evaluate(()=>document.querySelector('.cdi-app-home').getBoundingClientRect().right<=innerWidth && document.documentElement.scrollWidth<=innerWidth+1),'Smartsheet overflow '+width);
 }
 await page.screenshot({path:join(output,'smartsheet-mobile.png'),fullPage:true});
 await page.locator('.cdi-portal-button').click();await page.waitForURL(base+'/');
 assert.deepEqual(errors,[]);
 console.log('PASS: billing sections/deep link/dirty guard/admin rights, leave bars over month boundaries/detail/unchanged records, responsive layouts and Smartsheet navigation.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
