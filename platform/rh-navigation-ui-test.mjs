import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {migrateBilling} from './billing-schema.mjs';
import {migrateRh} from './rh-schema.mjs';
import {migrateStamping} from './stamping-schema.mjs';
import {blankClient} from './billing-directory-domain.ts';
import {testEnvironment,users} from '../marches/test.mjs';
import {dashboardFixture} from './dashboard-fixture.mjs';
import {sessionTestAssets} from './session-test-assets.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright'),root=fileURLToPath(new URL('../',import.meta.url)).replace(/[\\/]$/,'');
const out=process.env.PORTAL_QA;assert.ok(out,'Private PORTAL_QA required');await mkdir(out,{recursive:true});
// Login must exercise the current server implementation, never a stale build.
if(process.env.SESSION_WORKER_ARTIFACT)process.env.MARCHES_TEST_WORKER=resolve(process.env.SESSION_WORKER_ARTIFACT);else delete process.env.MARCHES_TEST_WORKER;
process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const ctx=await testEnvironment();await migrateBilling(ctx.db);await migrateRh(ctx.db);await migrateStamping(ctx.db);
const fixture=dashboardFixture(ctx.accounts,'2026-10-19');fixture.salaries.forEach(s=>{s.photo=null;s.payslip=null;});
fixture.salaries[0].email=users[0];fixture.salaries[0].photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVwQAAAAASUVORK5CYII=';fixture.salaries[1].email=users[1];
Object.assign(fixture,{params:{anneeSuivi:2026,entreprise:'CDInnov test'},types:[{code:'ALIM_TRANSFO_CP',libelle:'Alimentation – Transformation CP en CET',categorie:'Alimentation',signe:1,compteCP:'Non',epargne:'Oui',monetisation:'Oui'}],mouvements:[],codesAffaires:[]});
await ctx.setPortal(JSON.stringify(fixture));const before=await ctx.kv.get('markets-test');
const client=blankClient();client.party.name='Organisme RH fictif';const now=new Date().toISOString();
await ctx.db.prepare("INSERT INTO billing_directory VALUES('clients',?,1,?,?,?,'fixture',?,'fixture')").bind('client-navigation',JSON.stringify(client),'fixture',now,now).run();
await ctx.db.prepare('INSERT INTO rh_documents VALUES(?,?,?,1,?,?,?,?)').bind('doc-navigation','client-navigation','Document de navigation',JSON.stringify({name:'Document de navigation',clientId:'client-navigation',periods:[],payments:[]}),now,now,'fixture').run();
const archivedAgent={id:'11111111-1111-4111-a111-111111111111',name:'Agent de navigation',role:'Fonction fictive',supervisor:'',allocations:[]},archiveBytes=await readFile(join(root,'templates/client-mission-v2.docx'));
await ctx.db.prepare('INSERT INTO client_employee_spaces VALUES(?,1,?,?,?)').bind('client-navigation',JSON.stringify({agents:[archivedAgent],payments:[]}),now,'fixture').run();
await(await ctx.worker.getR2Bucket('CET_FILES')).put('fixture/navigation-letter.docx',archiveBytes);
await ctx.db.prepare('INSERT INTO client_employee_documents VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind('navigation-letter','client-navigation',archivedAgent.id,'mission','Lettre de navigation.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','fixture/navigation-letter.docx','fixture',JSON.stringify({version:1,agents:[archivedAgent]}),now,'fixture').run();
// Keep real UI login, PBKDF2, challenge/HMAC proof and browser-managed HttpOnly cookie; isolate external integrations.
const boot=`state={...freshState(),...${JSON.stringify(fixture)}};cloudEnabled=()=>true;budgetsObserveClients=()=>{};budgetsSyncClients=async()=>[];budgetsApi=()=>location.origin+'/budgets';facturxWarmLogin=()=>{};authSaveCredential=async()=>{};notify=()=>{throw Error('External notifications disabled')};bootAuth();`;
const assetRoot=process.env.FRONTEND_ARTIFACT?resolve(process.env.FRONTEND_ARTIFACT):root;
const frontend=process.env.FRONTEND_ARTIFACT?(await import(pathToFileURL(join(assetRoot,'_worker.js')).href)).default:null;
const assets=frontend?new Map():await sessionTestAssets(root);
const html=(assets.get('/index.html')||await readFile(join(assetRoot,'index.html'),'utf8')).replace(/const CLOUD_ENDPOINT\s*=\s*['"][^'"]+['"]/,'const CLOUD_ENDPOINT=location.origin').replace('\nbootAuth();','\n'+boot);assert.ok(html.includes(boot));
const requests=[],errors=[],blocked=[],mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
let holdVerify=null,verifyReached=null,holdClientFile=null,clientFileReached=null;
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/budgets/')||url.pathname.startsWith('/api/v1/')||url.pathname.startsWith('/sheets/')||url.pathname.startsWith('/files/')||url.pathname.startsWith('/files/')) {
    const chunks=[];for await(const b of req)chunks.push(b);const body=Buffer.concat(chunks);
    const headers={Origin:'https://app.cdinnov.eu'};for(const key of ['authorization','cookie','x-cdinnov-request','sec-fetch-site','content-type','if-match','if-none-match'])if(req.headers[key])headers[key]=req.headers[key];
    const r=await ctx.worker.dispatchFetch('https://test'+url.pathname+url.search,{method:req.method,headers,...(body.length?{body}:{})});
    requests.push({path:url.pathname,method:req.method,status:r.status,bearer:!!req.headers.authorization});
    if(holdVerify&&['/budgets/session','/api/v1/session'].includes(url.pathname)&&req.method==='POST'&&JSON.parse(body.toString()).action==='verify'){verifyReached();await holdVerify;}
    if(holdClientFile&&url.pathname==='/api/v1/billing/client-employees/client-navigation/documents/navigation-letter'){clientFileReached();await holdClientFile;}
    const served=frontend?await frontend.fetch(new Request(base+req.url,{method:req.method,headers,...(body.length?{body}:{})}),{CET_API:{fetch:async()=>r}}):r;
    res.writeHead(served.status,Object.fromEntries(served.headers));res.end(Buffer.from(await served.arrayBuffer()));return;
  }
  let name=url.pathname;if(name.endsWith('/'))name+='index.html';const file=resolve(assetRoot,'.'+decodeURIComponent(name));if(!file.startsWith(assetRoot+sep))throw Error('outside');
  const raw=new Response(name==='/index.html'?html:assets.get(name)||await readFile(file),{headers:{'Content-Type':mime[extname(file)]||'application/octet-stream'}});
  const served=frontend?await frontend.fetch(new Request(base+req.url),{ASSETS:{fetch:async()=>raw}}):raw;
  res.writeHead(served.status,Object.fromEntries(served.headers));res.end(Buffer.from(await served.arrayBuffer()));
}catch{res.writeHead(500);res.end('Local test error');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true});let auditPage;
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'fr-FR'});
 await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
 const page=await context.newPage();auditPage=page;page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 await page.locator('#authEmail').fill(users[0]);await page.locator('#authEmail').press('Enter');await page.locator('#authPw').waitFor({state:'visible'});await page.locator('#authPw').fill(ctx.password);await page.locator('#authPw').press('Enter');
 await page.waitForFunction(()=>AUTH_USER&&document.body.classList.contains('authed'));
 const group=page.locator('#rhNavigation'),toggle=page.locator('#rhNavigationToggle');
 await group.waitFor({state:'visible'});
 assert.equal(await group.isVisible(),true);assert.equal(await group.locator('[data-view]').count(),3);assert.equal(await group.locator('[data-view]>svg').count(),3);
 await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await group.locator('[data-view="missions"]').isVisible(),false);
 await toggle.press('Enter');assert.equal(await toggle.getAttribute('aria-expanded'),'true');
 await group.locator('[data-view="rh"]').click();await page.waitForFunction(()=>!!rhMounted);await page.locator('#rhRoot').getByText('Document de navigation',{exact:true}).waitFor();
 assert.equal(await page.locator('#yearSelect').isVisible(),false);
 await group.locator('[data-view="tamponnage"]').click();await page.waitForFunction(()=>!!stampingMounted);assert.equal(await page.locator('#pageTitle').innerText(),'Tamponnage des pièces');
 await group.locator('[data-view="missions"]').click();await page.waitForFunction(()=>!!missionLettersMounted);assert.equal(await page.locator('#pageTitle').innerText(),'Lettres de mission');
 await page.waitForFunction(()=>document.querySelector('#missionLettersRoot option[value="client-navigation"]')&&!document.querySelector('#missionLettersRoot [data-busy="true"]'));
 await page.screenshot({path:join(out,'rh-navigation-desktop.png'),fullPage:true});
 // Verify the actual shell consults the module guard before switching or logging out.
 await page.evaluate(()=>{window.__missionCanLeave=missionLettersMounted.canLeave;missionLettersMounted.canLeave=()=>false;});
 await group.locator('[data-view="rh"]').click();assert.equal(await page.evaluate(()=>currentView),'missions');
 await page.getByRole('button',{name:'Déconnexion',exact:true}).click();assert.equal(await page.evaluate(()=>!!AUTH_USER),true);assert.equal(await page.evaluate(()=>currentView),'missions');
 await page.evaluate(()=>{missionLettersMounted.canLeave=window.__missionCanLeave;delete window.__missionCanLeave;openRhPaymentDocument('doc-navigation');});
 await page.locator('#rhRoot [aria-current="step"]').filter({hasText:'Document'}).waitFor();assert.equal(await page.evaluate(()=>currentView),'rh');
 // Exercise the actual client/employee dialogs inside billing before the cross-module callback.
 await page.locator('.nav-item[data-view="facturier"]').click();await page.waitForFunction(()=>!!billingMounted);
 await page.locator('#billingRoot').getByRole('button',{name:'Clients',exact:true}).click();await page.locator('.bill-directory-name').filter({hasText:'Organisme RH fictif'}).click();
 await page.getByRole('button',{name:'Espace salariés',exact:true}).click();const employees=page.getByRole('dialog',{name:'Salariés du client',exact:true});await employees.waitFor();
 await page.waitForFunction(()=>document.querySelector('dialog.client-employees fieldset')?.disabled===false);await employees.getByRole('button',{name:'Ajouter un salarié',exact:true}).click();await employees.getByLabel('Nom et prénom',{exact:true}).fill('Saisie locale à conserver');
 let guardMessage='';page.once('dialog',async dialog=>{guardMessage=dialog.message();await dialog.dismiss();});await page.evaluate(()=>setView('rh'));assert.match(guardMessage,/modifications non enregistrées/i);assert.equal(await page.evaluate(()=>currentView),'facturier');assert.equal(await employees.getByLabel('Nom et prénom',{exact:true}).inputValue(),'Saisie locale à conserver');
 await employees.getByRole('button',{name:'Documents',exact:true}).click();await employees.locator('.client-payment-document>summary').filter({hasText:'Document de navigation'}).click();await employees.getByRole('button',{name:'Ouvrir le document RH',exact:true}).click();assert.equal(await page.evaluate(()=>currentView),'facturier');assert.match(await employees.getByRole('alert').innerText(),/Enregistrez les modifications des salariés/);
 page.once('dialog',dialog=>dialog.dismiss());await employees.getByRole('button',{name:'Fermer l’espace salariés',exact:true}).click();assert.equal(await employees.isVisible(),true);
 page.once('dialog',dialog=>dialog.accept());await employees.getByRole('button',{name:'Fermer l’espace salariés',exact:true}).click();await employees.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Espace salariés',exact:true}).click();await employees.waitFor();await page.waitForFunction(()=>document.querySelector('dialog.client-employees fieldset')?.disabled===false);await employees.getByRole('button',{name:'Documents',exact:true}).click();
 let releaseClientFile;holdClientFile=new Promise(resolve=>releaseClientFile=resolve);const fileReached=new Promise(resolve=>clientFileReached=resolve),downloaded=page.waitForEvent('download');await employees.getByRole('button',{name:'Télécharger Lettre de navigation.docx',exact:true}).click();await fileReached;
 let busyDialogs=0;const onBusyDialog=async dialog=>{busyDialogs++;await dialog.dismiss();};page.on('dialog',onBusyDialog);assert.equal(await page.evaluate(()=>billingMounted.canLeave()),false);await page.evaluate(()=>setView('rh'));assert.equal(await page.evaluate(()=>currentView),'facturier');assert.equal(busyDialogs,0);page.off('dialog',onBusyDialog);
 releaseClientFile();holdClientFile=null;const downloadedFile=await downloaded;assert.deepEqual(await readFile(await downloadedFile.path()),archiveBytes);await page.waitForFunction(()=>document.querySelector('dialog.client-employees fieldset')?.disabled===false);assert.equal(await page.evaluate(()=>billingMounted.canLeave()),true);
 await employees.locator('.client-payment-document>summary').filter({hasText:'Document de navigation'}).click();await employees.getByRole('button',{name:'Ouvrir le document RH',exact:true}).click();
 await page.locator('#rhRoot [aria-current="step"]').filter({hasText:'Document'}).waitFor();assert.equal(await page.evaluate(()=>currentView),'rh');assert.equal(await page.getByRole('dialog',{name:'Salariés du client',exact:true}).count(),0);await page.screenshot({path:join(out,'client-archive-to-rh.png'),fullPage:true});
 await group.locator('[data-view="missions"]').click();await page.waitForFunction(()=>!!missionLettersMounted);
 // UI visibility honours the same existing permissions; no account settings are persisted.
 const navAccess=await page.evaluate(()=>{const original=state.auth.accounts[AUTH_USER];try{const access=Object.fromEntries(CDIPlatform.accessModules.map(m=>[m.key,false]));state.auth.accounts[AUTH_USER]={...original,role:'collaborator',access:{...access,tamponnage:true}};applyAccessNavigation();const stampingOnly={group:!document.getElementById('rhNavigation').hidden,rh:!document.querySelector('[data-view="rh"]').hidden,mission:!document.querySelector('.nav-item[data-view="missions"]').hidden,stamp:!document.querySelector('[data-view="tamponnage"]').hidden};state.auth.accounts[AUTH_USER].access=access;applyAccessNavigation();return {stampingOnly,none:document.getElementById('rhNavigation').hidden};}finally{state.auth.accounts[AUTH_USER]=original;applyAccessNavigation();}});
 assert.deepEqual(navAccess,{stampingOnly:{group:true,rh:false,mission:false,stamp:true},none:true});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Menu',exact:true}).click();assert.equal(await group.isVisible(),true);await page.screenshot({path:join(out,'rh-navigation-mobile.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await group.locator('[data-view="rh"]').click();await page.waitForFunction(()=>!!rhMounted);assert.equal(await page.locator('.sidebar').evaluate(e=>e.classList.contains('open')),false);
 assert.equal(await ctx.kv.get('markets-test'),before,'Navigation does not mutate shared business data');assert.deepEqual(errors,[]);
 const businessWrites=requests.filter(r=>r.method!=='GET'&&!['/api/v1/session','/budgets/session'].includes(r.path));assert.deepEqual(businessWrites,[]);
 await writeFile(join(out,'checks.json'),JSON.stringify({checks:11,errors,requests},null,2));console.log('PASS RH navigation: 11 checks, real portal authentication, module switching/guard, client employee dirty and busy protection, archive link, source deep link, permissions, desktop/mobile; no business writes.');
}catch(error){if(auditPage){await auditPage.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(join(out,'failure.json'),JSON.stringify({error:String(error),errors,requests,text:await auditPage.locator('body').innerText().catch(()=> '')},null,2));}throw error;}finally{await browser.close();server.close();await ctx.worker.dispose();}
