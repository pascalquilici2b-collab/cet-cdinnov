import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {jsPDF} from 'jspdf';
import {testEnvironment,users} from '../../marches/test.mjs';
import {seedBusinessDocument} from '../business-migration.mjs';
import {workspace as sheetsFixture} from '../../apps/sheets/test/load-ts.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright'),root=fileURLToPath(new URL('../../',import.meta.url)).replace(/[\\/]$/,'');
delete process.env.MARCHES_TEST_WORKER;process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const ctx=await testEnvironment();
const fixture={params:{anneeSuivi:2026},types:[],salaries:[{matricule:'001',nom:'Admin fictif'}],mouvements:[],conges:[],notesFrais:[],codesAffaires:[],factures:[],auth:{accounts:ctx.accounts,allowed:users}};
await ctx.setPortal(JSON.stringify(fixture));
const budget={demo:false,clients:[{id:'c1',name:'Client CSP fictif',accounts:[]}],projects:[],budgetLines:[],expenses:[],drs:[],imports:[]};
await seedBusinessDocument(ctx.db,'budgets',budget);await seedBusinessDocument(ctx.db,'sheets',sheetsFixture());
const doc=new jsPDF();doc.text('Synthetic CSP PDF page one',20,20);doc.addPage();doc.text('Synthetic CSP PDF page two',20,20);const pdf=Buffer.from(doc.output('arraybuffer')),pdf64=pdf.toString('base64'),sha=createHash('sha256').update(pdf).digest('hex');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const boot=`state={...freshState(),...${JSON.stringify(fixture)}};cloudEnabled=()=>true;budgetsObserveClients=()=>{};budgetsSyncClients=async()=>[];budgetsApi=()=>location.origin+'/budgets';facturxWarmLogin=()=>{};facturxEnsureAuth=async()=>({token:'synthetic-csp-only'});authSaveCredential=async()=>{};notify=()=>{throw Error('No external notifications in CSP test')};bootAuth();`;
const html=(await readFile(resolve(root,'index.html'),'utf8')).replace(/const CLOUD_ENDPOINT\s*=\s*['"][^'"]+['"]/,'const CLOUD_ENDPOINT=location.origin').replace('\nbootAuth();','\n'+boot);
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.wasm':'application/wasm','.json':'application/json','.pdf':'application/pdf'};
async function api(request){const url=new URL(request.url());const response=await ctx.worker.dispatchFetch('https://test'+url.pathname+url.search,{method:request.method(),headers:{...request.headers(),origin:'https://app.cdinnov.eu'},...(request.postDataBuffer()?{body:request.postDataBuffer()}:{})});return {status:response.status,headers:{...Object.fromEntries(response.headers),'access-control-allow-origin':request.headers()['origin']||'*'},body:Buffer.from(await response.arrayBuffer())};}
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');if(/^\/(api\/v1|budgets|sheets|files)\//.test(url.pathname)){
  const chunks=[];for await(const c of req)chunks.push(c);const headers={Origin:'https://app.cdinnov.eu'};for(const key of ['authorization','content-type','if-match','if-none-match'])if(req.headers[key])headers[key]=req.headers[key];
  const response=await ctx.worker.dispatchFetch('https://test'+url.pathname+url.search,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 let name=url.pathname;if(name.endsWith('/'))name+='index.html';const file=resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+sep)||/[/\\](?:\.git|node_modules|\.build|\.private)[/\\]/i.test(file))throw Error('Private path');
 res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(name==='/index.html'?html:await readFile(file));
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const foreignServer=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><iframe src="'+base+'"></iframe>');});
await new Promise(r=>foreignServer.listen(0,'127.0.0.1',r));const foreignBase='http://127.0.0.1:'+foreignServer.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],calls=[],violations=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'fr-FR'});
 await context.addInitScript(()=>{window.__csp=[];addEventListener('securitypolicyviolation',e=>window.__csp.push({directive:e.effectiveDirective,blocked:e.blockedURI}));});
 await context.route('**/*',async route=>{const request=route.request(),u=new URL(request.url());
  if(u.origin===base||u.origin===foreignBase)return route.continue();
  if(u.origin==='https://cet-data.pascalquilici2b.workers.dev')return route.fulfill(await api(request));
  if(u.origin==='https://cdinnov-facturx.onrender.com'){
   calls.push(u.pathname);if(u.pathname==='/api/health')return route.fulfill({json:{ready:true}});
   if(u.pathname==='/api/facturx/import-pdf')return route.fulfill({json:{source_sha256:sha,pages:1,preview_image:png,text:'Synthetic CSP PDF',invoice:{},warnings:[]}});
   throw Error('Unexpected Factur-X request '+u.pathname);
  }
  if(u.origin==='https://graph.microsoft.com'){assert.equal(request.method(),'GET');return route.fulfill({json:{id:'synthetic-owner',mail:users[0],userPrincipalName:users[0]}});}
  if(u.origin==='https://login.microsoftonline.com')return route.fulfill({contentType:'text/html',body:'<p>Microsoft login fixture</p>'});
  if(request.resourceType()==='image')return route.fulfill({contentType:'image/png',body:Buffer.from(png.split(',')[1],'base64')});
  if(u.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
  return route.abort();
 });
 const track=page=>{page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));};
 const collect=async(page,label)=>{for(const frame of page.frames())for(const item of await frame.evaluate(()=>window.__csp||[]).catch(()=>[]))violations.push({surface:label,...item});};
 const page=await context.newPage();track(page);await page.goto(base);
 await page.locator('#authEmail').fill(users[0]);await page.locator('#authEmail').press('Enter');await page.locator('#authPw').fill(ctx.password);await page.locator('#authPw').press('Enter');await page.waitForFunction(()=>!!AUTH_USER&&!!budgetsCurrentSession());
 console.log('PASS CSP: portal login with browser PBKDF2/HMAC and current Worker');
 await page.evaluate(()=>setView('budgetsprojets'));const budgetFrame=page.frameLocator('#cdiBudgetsFrame');await budgetFrame.locator('#root').waitFor();await budgetFrame.getByRole('button',{name:/^Clients/}).click();await budgetFrame.getByText('Client CSP fictif',{exact:true}).first().waitFor();await collect(page,'portal+budgets');
 console.log('PASS CSP: embedded budgets postMessage and authenticated load');
 const sheets=await context.newPage();track(sheets);await sheets.goto(base+'/feuilles/#sheet/s1');try{await sheets.getByText('Feuille de test',{exact:true}).first().waitFor();}catch(e){console.log('SHEETS DIAGNOSTIC',await sheets.locator('body').innerText(),await sheets.evaluate(()=>window.__csp),errors);throw e;}await collect(sheets,'sheets');
 console.log('PASS CSP: Sheets shares authenticated session and loads saved sheet');
 await page.evaluate(async pdf64=>{window.__pdf64=pdf64;const bytes=Uint8Array.from(atob(pdf64),c=>c.charCodeAt(0));window.__pdfText=await pdfTextFromData(bytes);document.querySelector('#content').innerHTML='<div id="psThumb"></div>';await renderPayslipThumb({payslip:'data:application/pdf;base64,'+pdf64});},pdf64);
 assert.match(await page.evaluate(()=>window.__pdfText),/Synthetic CSP PDF page one.*Synthetic CSP PDF page two/s);assert.equal(await page.locator('#psThumb canvas').count(),1);await collect(page,'pdf');
 console.log('PASS CSP: PDF text extraction and canvas preview');
 await page.evaluate(async({sha,pdf64})=>{state.factures.push({id:'csp-invoice',number:'SYNTHETIC-1',dateFacture:'2026-10-28',client:'Client fictif',ht:100,ttc:120,pdfSource:{name:'synthetic.pdf',url:'data:application/pdf;base64,'+pdf64,sha256:sha}});await openFacturX('csp-invoice');},{sha,pdf64});
 const converter=page.frameLocator('#facturxFrame');await converter.locator('#file-label').filter({hasText:'synthetic.pdf'}).waitFor();assert.equal(await converter.locator('#preview').evaluate(e=>!e.hidden),true);assert.ok(calls.includes('/api/facturx/import-pdf'));await collect(page,'facturx');
 console.log('PASS CSP: Factur-X srcdoc bootstrap, same-origin messaging and mocked PDF import');
 const microsoft=await context.newPage();track(microsoft);await microsoft.goto(base+'/platform/outlook-callback.html');await microsoft.waitForLoadState('networkidle');await collect(microsoft,'outlook-callback');
 await page.evaluate(async()=>{const f=document.createElement('iframe');f.id='microsoftFixture';f.src='https://login.microsoftonline.com/mock';document.body.append(f);const r=await fetch('https://graph.microsoft.com/v1.0/me');if(!r.ok)throw Error('Mock Graph not allowed');});await page.frameLocator('#microsoftFixture').getByText('Microsoft login fixture').waitFor();await collect(page,'microsoft-fixtures');
 console.log('PASS CSP: Outlook callback module, Microsoft iframe and Graph mock; no send');
 const unique=[...new Map(violations.map(v=>[JSON.stringify(v),v])).values()];console.log(JSON.stringify({violations:unique,errors},null,2));assert.deepEqual(unique,[]);assert.deepEqual(errors,[]);
 await sheets.evaluate(()=>{const script=document.createElement('script');script.textContent='window.__cspInlineExecuted=true';document.body.append(script);});
 assert.equal(await sheets.evaluate(()=>!!window.__cspInlineExecuted),false);assert.ok(await sheets.evaluate(()=>window.__csp.some(v=>v.directive==='script-src-elem'&&v.blocked==='inline')));
 console.log('PASS CSP: strict Sheets policy rejects newly injected inline script');
 const framed=await context.newPage();await framed.goto(foreignBase);const refused=framed.frameLocator('iframe');await refused.getByRole('link',{name:'Ouvrir CDInnov'}).waitFor();assert.equal(await refused.locator('#authEmail').count(),0);assert.equal(await refused.locator('.app').count(),0);
 console.log('PASS frame guard: unrelated parent cannot display application controls; same-origin budgets already verified');
}finally{await browser.close();server.closeAllConnections();foreignServer.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>foreignServer.close(r))]);await ctx.worker.dispose();}
