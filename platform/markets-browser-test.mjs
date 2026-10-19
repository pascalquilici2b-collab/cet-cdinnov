import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {testEnvironment,users,fixture} from '../marches/test.mjs';
import {dashboardFixture} from './dashboard-fixture.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright'),root=fileURLToPath(new URL('../',import.meta.url)).replace(/[\\/]$/,'');
const out=process.env.PORTAL_QA;assert.ok(out,'Private PORTAL_QA required');await mkdir(out,{recursive:true});
process.env.MARCHES_TEST_WORKER=join(root,'.build/entry.mjs');process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const readingText='Maximum annuel : 300 000 euros HT.\nPaiement sous 30 jours après réception de la facture.';
let modelCalls=0;
const ctx=await testEnvironment({ai:async()=>{modelCalls++;return {response:{facts:[],prices:[],ceilings:[],periods:[],issues:[],conditions:[{category:'payment',label:'Paiement contractuel',value:'30 jours après réception',quote:'Paiement sous 30 jours après réception de la facture.'}]}};}});
const sessions=await Promise.all(users.map(ctx.login)),headers={Authorization:'Bearer '+sessions[0].token};
const f=dashboardFixture(ctx.accounts,'2026-10-19');f.salaries.forEach(s=>{s.photo=null;s.payslip=null});await ctx.kv.put('markets-test',JSON.stringify(f));
const seed={...fixture(),reference:'CCIC-TEST',notes:'Note à conserver',issues:[{id:'issue-1',title:'Reconduction',detail:'Vérifier la clause',blocking:true,status:'open',resolution:'',source:{documentId:'',locator:'',note:''}}]};
let response=await ctx.call('markets',{method:'POST',headers,body:JSON.stringify({id:'ccic-test',market:seed})});assert.equal(response.status,201);
const upload=new FormData();upload.append('file',new Blob([readingText],{type:'text/plain'}),'clauses-fictives.txt');upload.append('kind','clauses');upload.append('text',readingText);
response=await ctx.call('markets/ccic-test/documents',{method:'POST',headers,body:upload});assert.equal(response.status,201);const doc=(await response.json()).document;
response=await ctx.call('markets/ccic-test/reading/'+doc.id,{method:'PUT',headers,body:JSON.stringify({text:readingText,method:'text',complete:true,pages:1,warnings:[]})});assert.equal(response.status,200);
const boot=`state={...freshState(),...${JSON.stringify(f)}};cloudEnabled=()=>false;budgetsObserveClients=()=>{};budgetsSyncClients=async()=>[];budgetsApi=()=>location.origin+'/budgets';budgetsEnsureSession=async()=>AUTH_USER===${JSON.stringify(users[0])}?${JSON.stringify(sessions[0])}:${JSON.stringify(sessions[1])};notify=()=>{throw Error('Notifications disabled in tests')};unlockApp(new URLSearchParams(location.search).has('consultant')?${JSON.stringify(users[1])}:${JSON.stringify(users[0])});setView('marches');`;
const html=(await readFile(join(root,'index.html'),'utf8')).replace('\nbootAuth();','\n'+boot);assert.ok(html.includes(boot));
const requests=[],errors=[],warnings=[],mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'};
let delayReply=null;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/budgets/')||url.pathname.startsWith('/api/v1/')){
  const body=[];for await(const b of req)body.push(b);
  const forwarded={Origin:'https://app.cdinnov.eu'};for(const key of ['authorization','content-type','if-match','if-none-match'])if(req.headers[key])forwarded[key]=req.headers[key];
  const r=await ctx.worker.dispatchFetch('https://test'+url.pathname+url.search,{method:req.method,headers:forwarded,...(body.length?{body:Buffer.concat(body)}:{})});
  const bytes=Buffer.from(await r.arrayBuffer());requests.push({path:url.pathname,method:req.method,status:r.status});
  if(delayReply&&url.pathname==='/budgets/markets/ccic-test')await delayReply;
  res.writeHead(r.status,Object.fromEntries(r.headers));res.end(bytes);return;
 }
 let name=url.pathname;if(name.endsWith('/'))name+='index.html';const file=resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+sep))throw Error('outside');res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(name==='/index.html'?html:await readFile(file));
 }catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'fr-FR',timezoneId:'Europe/Paris'});await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/React|flushSync|unmount/i.test(m.text()))warnings.push(m.text())});page.on('dialog',d=>d.accept());
 await page.goto(base);await page.locator('[data-react-markets] [data-open="ccic-test"]').waitFor();
 const initialRequests=requests.length;await page.locator('#mkSearch').pressSequentially('CCIC',{delay:10});assert.equal(await page.locator('#mkSearch').evaluate(e=>e===document.activeElement),true);assert.equal(requests.length,initialRequests);assert.equal(await page.locator('[data-open="ccic-test"]').count(),1);
 await page.locator('[data-open="ccic-test"]').click();await page.locator('#mkFiles').waitFor();
 await page.locator('[data-tab="prices"]').click();await page.locator('#mk-prices-0-amountMinor').fill('712.50');assert.equal(await page.locator('#mk-prices-0-amountMinor').evaluate(e=>e===document.activeElement),true);
 const writes=requests.filter(r=>r.method==='PUT').length;await page.locator('[data-action="save"]').click();await page.getByText('Fiche enregistrée · version 2',{exact:true}).waitFor();assert.equal(requests.filter(r=>r.method==='PUT').length,writes+1,'One save for one click');
 await page.reload();await page.locator('[data-open="ccic-test"]').click();await page.locator('[data-tab="prices"]').click();assert.equal(await page.locator('#mk-prices-0-amountMinor').inputValue(),'712.50');
 await page.locator('#mk-prices-0-amountMinor').fill('12.345');await page.locator('[data-action="save"]').click();assert.equal(await page.locator('#mk-prices-0-amountMinor').evaluate(e=>e.validity.valid),false);await page.locator('#mk-prices-0-amountMinor').fill('712.50');
 await page.locator('[data-review="prices.0"]').check();await page.locator('[data-action="save"]').click();await page.locator('#marketMessage').getByText(/rattachez sa pièce source/).waitFor();
 await page.locator('#mk-prices-0-source-documentId').selectOption(doc.id);await page.locator('#mk-prices-0-source-locator').fill('Article 1');await page.locator('[data-review="prices.0"]').check();await page.locator('[data-action="save"]').click();await page.getByText('Fiche enregistrée · version 3',{exact:true}).waitFor();assert.equal(await page.locator('[data-review="prices.0"]').isChecked(),true);
 await page.locator('#mk-prices-0-location').fill('Corse et distance');assert.equal(await page.locator('[data-review="prices.0"]').isChecked(),false);
 await page.locator('[data-tab="issues"]').click();await page.locator('[data-resolve="0"]').click();await page.locator('#marketMessage').getByText(/Renseignez la décision/).waitFor();await page.locator('#mk-issues-0-resolution').fill('Reconduction expresse confirmée par le courrier.');await page.locator('[data-resolve="0"]').click();await page.getByText(/Point validé et décision enregistrée/).waitFor();
 const saved=await(await ctx.call('markets/ccic-test',{headers})).json();assert.equal(saved.market.issues[0].status,'resolved');assert.equal(saved.market.notes,seed.notes);assert.equal(saved.market.ceilings[0].amountMinor,seed.ceilings[0].amountMinor);
 await page.locator('[data-tab="periods"]').click();await page.locator('#mk-periods-0-startDate').fill('2026-10-19');await page.locator('#mk-periods-0-endDate').fill('2027-10-18');await page.locator('[data-tab="ceilings"]').click();await page.locator('#mk-ceilings-0-notes').fill('Plafond annuel à rapprocher des engagements.');
 await page.locator('[data-tab="conditions"]').click();await page.locator('[data-add="conditions"]').click();await page.locator('#mk-conditions-0-label').fill('Relevé');await page.locator('#mk-conditions-0-category').selectOption('report');await page.locator('#mk-conditions-0-value').fill('Joindre le relevé d’intervention.');await page.locator('[data-action="save"]').click();await page.getByText('Fiche enregistrée · version 5',{exact:true}).waitFor();
 await page.locator('[data-tab="documents"]').click();await page.locator('[data-analyse]').click();await page.locator('[data-suggestion="0"]').waitFor();assert.match(await page.locator('#mkSuggestions').innerText(),/300/);
 const downloadWait=page.waitForEvent('download');await page.locator('[data-download]').click();const download=await downloadWait;assert.equal(await readFile(await download.path(),'utf8'),readingText);
 await page.locator('#mkFiles').setInputFiles({name:'clauses-fictives.txt',mimeType:'text/plain',buffer:Buffer.from(readingText)});await page.getByText(/1 doublon/).waitFor();assert.equal(await page.locator('[data-download]').count(),1);
 await page.locator('[data-tab="setup"]').click();await page.locator('[data-action="run-analysis"]').click();await page.getByText('Propositions de paramétrage',{exact:true}).waitFor();assert.equal(modelCalls,1);
 await page.locator('[data-action="apply-analysis"]').click();await page.getByText(/Propositions appliquées à la saisie/).waitFor();await page.locator('[data-tab="conditions"]').click();assert.equal(await page.locator('.mk-rule').count(),2);assert.equal(await page.locator('#mk-conditions-0-value').inputValue(),'Joindre le relevé d’intervention.');await page.locator('[data-action="save"]').click();await page.getByText('Fiche enregistrée · version 6',{exact:true}).waitFor();
 await page.locator('[data-tab="setup"]').click();await page.locator('[data-action="apply-analysis"]').click();await page.getByText(/La fiche a été modifiée depuis cette analyse/).waitFor();
 await page.locator('[data-tab="history"]').click();await page.locator('[data-action="history"]').click();await page.locator('.mk-history').first().waitFor();assert.equal(await page.locator('.mk-history').count(),6);
 const exported=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const exportedJson=JSON.parse(await readFile(await(await exported).path(),'utf8'));assert.equal(exportedJson.market.conditions.length,2);assert.equal(exportedJson.market.notes,seed.notes);
 // A concurrent edit must reject the old revision while leaving the local fields exportable.
 const latest=(await(await ctx.call('markets/ccic-test',{headers})).json()).market;response=await ctx.call('markets/ccic-test',{method:'PUT',headers:{...headers,'If-Match':String(latest.version)},body:JSON.stringify({...latest,notes:'Autre fenêtre'})});assert.equal(response.status,200);
 await page.locator('[data-tab="summary"]').click();await page.locator('#mk-notes').fill('Copie locale à conserver');await page.locator('[data-action="save"]').click();await page.locator('#marketMessage [role="alert"]').waitFor();assert.equal(await page.locator('#mk-notes').inputValue(),'Copie locale à conserver');assert.ok(requests.some(r=>r.method==='PUT'&&r.status===409));
 for(const mode of ['light','dark']){await page.evaluate(mode=>CDITheme.set(mode),mode);for(const width of [320,390,768,1440,2560]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if([390,1440].includes(width))await page.screenshot({path:join(out,'markets-'+mode+'-'+width+'.png'),fullPage:true});}}
 // The old render tree and pending callbacks must disappear when leaving or signing out.
 await page.evaluate(()=>{setView('mouvements')});assert.equal(await page.locator('[data-react-markets]').count(),0);await page.evaluate(()=>setView('marches'));await page.locator('[data-react-markets]').waitFor();
 await page.locator('[data-action="back"]').click();await page.locator('[data-action="new"]').click();await page.locator('[data-tab="summary"]').click();await page.locator('#mk-title').fill('Nouveau <img src=x onerror=alert(1)>');await page.locator('#mk-clientName').fill('Client synthétique');await page.locator('[data-action="save"]').click();await page.getByText('Fiche enregistrée · version 1',{exact:true}).waitFor();assert.equal(await page.locator('#marketRoot h1 img').count(),0);
 await page.evaluate(()=>authLogout());await page.locator('#authGate').waitFor({state:'visible'});assert.equal(await page.locator('[data-react-markets]').count(),0);
 for(const mode of ['light','dark']){await page.evaluate(mode=>CDITheme.set(mode),mode);for(const width of [320,390,1440]){await page.setViewportSize({width,height:1000});const logo=await page.locator('.auth-logo').boundingBox(),card=await page.locator('.auth-card').boundingBox();assert.ok(logo.width<=100.1&&Math.abs(logo.height-80)<1);assert.ok(Math.abs(logo.x+logo.width/2-card.x-card.width/2)<1);assert.match(await page.locator('.auth-logo').getAttribute('src'),/cdinnov-symbol\.svg$/);await page.screenshot({path:join(out,'login-'+mode+'-'+width+'.png'),fullPage:true});}}
 const employee=await context.newPage();await employee.goto(base+'/?consultant=1');await employee.getByText('Le paramétrage des marchés est réservé à la direction habilitée.',{exact:true}).waitFor();assert.equal(await employee.locator('[data-react-markets]').count(),0);
 const expired=await context.newPage();expired.on('pageerror',e=>errors.push(e.message));await expired.goto(base);await expired.locator('[data-open="ccic-test"]').waitFor();
 let releaseReply;delayReply=new Promise(resolve=>{releaseReply=resolve});const lateResponse=expired.waitForResponse(r=>r.url().endsWith('/budgets/markets/ccic-test'));await expired.locator('[data-open="ccic-test"]').click();await expired.evaluate(()=>{marchesForget();authLogout();});releaseReply();await lateResponse;delayReply=null;await expired.locator('#authGate').waitFor({state:'visible'});assert.equal(await expired.locator('[data-react-markets]').count(),0);assert.equal(await expired.locator('#content').getByText(seed.title,{exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);await writeFile(join(out,'markets-checks.json'),JSON.stringify({checks:'React market tabs, search/focus, prices/source validation, issues, conditions, files/duplicate/download, assisted analysis/manual preservation/stale results, history/export, revision conflict, responsive themes, triangle-only login, role access and unmount',requests,modelCalls,errors,warnings},null,2));console.log('PASS: React markets, real local Worker, version conflicts, local AI stub, documents, responsive themes and login symbol.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await ctx.worker.dispose();}
