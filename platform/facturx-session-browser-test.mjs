import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {testEnvironment,users} from '../marches/test.mjs';
import {dashboardFixture} from './dashboard-fixture.mjs';
import {sessionTestAssets} from './session-test-assets.mjs';
const root=process.cwd(),out=join(root,'platform/security-audit-20261105/facturx-embed');await mkdir(out,{recursive:true});
const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const [assets,ctx]=await Promise.all([sessionTestAssets(root),testEnvironment()]);
const fixture=dashboardFixture(ctx.accounts,'2026-11-05');fixture.salaries.forEach(s=>{s.photo=null;s.payslip=null;});fixture.factures=[];fixture.notesFrais=[];Object.assign(fixture,{params:{anneeSuivi:2026,entreprise:'CDInnov test'},types:[],mouvements:[],codesAffaires:[]});await ctx.setPortal(JSON.stringify(fixture));
const html=assets.get('/index.html').replace(/const CLOUD_ENDPOINT\s*=\s*["'][^"']+["']/,'const CLOUD_ENDPOINT=location.origin').replace('\nbootAuth();',"\nfacturxWarmLogin=()=>{};authSaveCredential=async()=>{};notify=()=>{throw Error('External notifications disabled')};bootAuth();");assets.set('/index.html',html);
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const requests=[],errors=[],checks=[];let forcedStatus=0,holdSheet=null,sheetReached=null,facturxStatus=200;const converterRequests=[];
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');

 if(url.pathname==='/files/facturx-fixture.pdf'){requests.push({path:url.pathname,cookie:!!req.headers.cookie});res.setHeader('Content-Type','application/pdf');res.end('%PDF-local-fixture');return;}
 if(url.pathname.startsWith('/api/v1/facturx/')){
   converterRequests.push({path:url.pathname,csrf:req.headers['x-cdinnov-request'],authorization:req.headers.authorization||null});
   if(url.pathname.endsWith('/health')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ready:true}));return;}
   if(url.pathname.endsWith('/import-pdf')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({source_sha256:'a'.repeat(64),pages:1,preview_image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8ioAAAAASUVORK5CYII=',text:'PDF fictif',warnings:[],invoice:{number:'TEST-FX-2026',issue_date:'2026-11-05',currency:'EUR',type_code:'380',buyer:{name:'Client fictif'},lines:[{description:'Prestation fictive',quantity:'1',unit_price:'100',vat_rate:'20',unit:'C62',vat_category:'S'}],totals:{net:'100',vat:'20',gross:'120',due:'120'}}}));return;}
   if(url.pathname.endsWith('/generate')){
     if(facturxStatus!==200){res.writeHead(facturxStatus,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Session de test expirée'}));return;}
     const result={valid:true,pdf_base64:Buffer.from('%PDF-local-test').toString('base64'),filename:'TEST-FX.pdf',xml:'<test/>',checks:Object.fromEntries(['source_review','amounts','xsd','schematron','france','embedding','pdfa_3b'].map(k=>[k,true]))};
     res.writeHead(200,{'Content-Type':'application/x-ndjson'});res.write(JSON.stringify({type:'progress',completed:1,total:6,label:'Validation locale'})+'\n');await new Promise(r=>setTimeout(r,250));res.end(JSON.stringify({type:'result',result})+'\n');return;
   }
   res.writeHead(404);res.end('{}');return;
 }
 if(/^\/(budgets|api\/v1|sheets|files)\//.test(url.pathname)){
   if(forcedStatus&&url.pathname==='/api/v1/portal'){res.writeHead(forcedStatus,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Réponse de contrôle local'}));return;}
   const parts=[];for await(const part of req)parts.push(part);const body=Buffer.concat(parts);const headers={Origin:'https://app.cdinnov.eu'};
   for(const key of ['cookie','content-type','if-match','if-none-match','x-cdinnov-request'])if(req.headers[key])headers[key]=req.headers[key];
   const response=await ctx.worker.dispatchFetch('https://app.cdinnov.eu'+url.pathname+url.search,{method:req.method,headers,...(body.length?{body}:{})});requests.push({path:url.pathname,method:req.method,status:response.status});
   res.writeHead(response.status,Object.fromEntries(response.headers));if(holdSheet&&url.pathname==='/sheets/state'){res.flushHeaders();sheetReached();await holdSheet;}res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 let name=url.pathname;if(name.endsWith('/'))name+='index.html';const file=resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+sep))throw Error('outside');res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(assets.has(name)?assets.get(name):await readFile(file));
}catch(error){res.writeHead(500);res.end('Local test error: '+error.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'fr-FR'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===base)return route.continue();if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});return route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER',e.message)});page.on('dialog',dialog=>dialog.accept());await page.goto(base);
 assert.equal(await page.locator('#cdi-session-dialog').count(),0,'initial login has no expired notice');
 await page.locator('#authEmail').fill(users[0]);await page.locator('#authEmail').press('Enter');await page.locator('#authPw').fill(ctx.password);await page.locator('#authPw').press('Enter');await page.waitForFunction(()=>document.body.classList.contains('authed'));

 const fileChecks=await page.evaluate(async()=>{const old=await facturxReadFile('https://cet-data.pascalquilici2b.workers.dev/files/facturx-fixture.pdf'),current=await facturxReadFile(location.origin+'/files/facturx-fixture.pdf');let refused=false;try{await facturxReadFile('https://untrusted.invalid/files/facturx-fixture.pdf');}catch{refused=true;}return {old:old.size,current:current.size,refused};});assert.ok(fileChecks.old>0&&fileChecks.old===fileChecks.current&&fileChecks.refused);assert.ok(requests.filter(r=>r.path==='/files/facturx-fixture.pdf').every(r=>r.cookie));
 await page.evaluate(async()=>{
   setView('facturier');const bytes=new TextEncoder().encode('%PDF-local-session-test'),sha=await facturxDigest(bytes);
   state.factures.push({id:'qa-facturx-session',number:'TEST-FX-2026',dateFacture:'2026-11-05',client:'Client fictif',ht:100,ttc:120,pdfSource:{url:'data:application/pdf;base64,'+btoa(String.fromCharCode(...bytes)),name:'facture-fictive.pdf',sha256:sha}});
   await openFacturX('qa-facturx-session');
 });
 const frame=page.frameLocator('#facturxFrame');await frame.locator('#file-label').filter({hasText:'facture-fictive.pdf'}).waitFor();
 const iframe=page.frames().find(f=>f.parentFrame());assert.ok(iframe);
 const initial=await iframe.evaluate(()=>({name:sourceFile.name,hash:sourceHash,bytes:sourceFile.size}));
 await iframe.evaluate(()=>{setValue('buyer.name','Client saisi avant expiration');});
 facturxStatus=401;
 const expired=await iframe.evaluate(async()=>{try{await apiFetch('/api/facturx/generate?output=stream',{method:'POST',body:new FormData()});return {ok:true};}catch(error){return {error:error.message,source:sourceFile?.name,hash:sourceHash,buyer:invoiceData().buyer.name};}});
 assert.match(expired.error,/Reconnectez-vous/);assert.equal(expired.source,initial.name);assert.equal(expired.hash,initial.hash);assert.equal(expired.buyer,'Client saisi avant expiration');
 await page.getByRole('dialog',{name:'Session expirée'}).waitFor();assert.equal(await page.locator('#cdi-session-dialog').count(),1);assert.equal(await iframe.locator('#cdi-session-dialog').count(),0);await page.screenshot({path:join(out,'facturx-401-session-modal.png')});
 facturxStatus=200;await page.getByRole('button',{name:'Se reconnecter',exact:true}).click();await page.getByLabel('Mot de passe',{exact:true}).fill(ctx.password);await page.locator('#cdi-session-dialog button[type=submit]').click();await page.getByRole('dialog',{name:'Session expirée'}).waitFor({state:'detached'});
 assert.equal(await page.locator('#facturxFrame').count(),1);assert.equal(await iframe.evaluate(()=>invoiceData().buyer.name),'Client saisi avant expiration');
 const streamed=await iframe.evaluate(async()=>{const events=[];const response=await apiFetch('/api/facturx/generate?output=stream',{method:'POST',body:new FormData()});const result=await CDIConversion.readStream(response,event=>events.push(event));return {events,valid:result.valid,pdf:result.pdf_base64,source:sourceFile.name,hash:sourceHash,buyer:invoiceData().buyer.name};});
 assert.equal(streamed.events.length,1);assert.equal(streamed.events[0].label,'Validation locale');assert.equal(streamed.valid,true);assert.equal(streamed.source,initial.name);assert.equal(streamed.hash,initial.hash);assert.equal(streamed.buyer,'Client saisi avant expiration');
 assert.ok(converterRequests.length>=4);assert.ok(converterRequests.every(r=>r.csrf==='1'&&r.authorization===null));assert.deepEqual(errors,[]);
 await writeFile(join(out,'checks.json'),JSON.stringify({checks:['historical and current R2 PDF route same-origin with cookie; foreign URL rejected','actual embedded app delegates to parent.facturxApi','401 opens exactly one shared modal','PDF source/hash and entered buyer retained','real same-account reconnect preserves iframe','NDJSON progress and validated result parsed after reconnect','same-origin cookie transport and no Authorization'],fileChecks,initial,streamed,converterRequests,errors},null,2));
 console.log('PASS Factur-X embedded session, source preservation and NDJSON stream');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await ctx.worker.dispose();}
