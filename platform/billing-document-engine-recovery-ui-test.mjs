/** Local browser -> Worker/D1/R2 recovery regression using fully fictitious documents.
 * node platform/billing-document-engine-recovery-ui-test.mjs
 * Optional: CHROMIUM_PATH and PLAYWRIGHT_PACKAGE. No production, email or AI calls.
 * Only retry delays are shortened in a private Worker bundle; this is not a latency test.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixture,samplePDF} from './billing-quote-fixture.mjs';
import {blankSettings,calculateBilling,addBillingDays} from './billing-domain.ts';
import {billingToday} from './billing-quote-domain.ts';
import {billingCanonicalJSON,createNumberSeries} from './billing-issuance.ts';
const root=resolve(import.meta.dirname,'..'),baseOut=resolve(root,'.private/document-engine-recovery-ui');await mkdir(baseOut,{recursive:true});
const {chromium}=createRequire(process.env.PLAYWRIGHT_PACKAGE||resolve(root,'package.json'))('playwright');
const sourceFile=resolve(root,'platform/billing-pdf-service.ts'),source=await readFile(sourceFile,'utf8');
assert.match(source,/const retryDelays = \[[^\]]+\];/);await writeFile(baseOut+'/helper-source.ts',source);
const worker=await build({entryPoints:[resolve(root,'platform/worker.ts')],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'accelerated-retry-backoff-only',setup(b){b.onLoad({filter:/billing-pdf-service\.ts$/},async()=>({contents:source.replace(/const retryDelays = \[[^\]]+\];/,'const retryDelays = [1,1,1,1,1,1,1,1];'),loader:'ts'}));}}]});
await writeFile(baseOut+'/worker.mjs',worker.outputFiles[0].text);const previousWorker=process.env.MARCHES_TEST_WORKER;process.env.MARCHES_TEST_WORKER=baseOut+'/worker.mjs';
async function check(kind){
const out=baseOut+'/'+kind;await mkdir(out,{recursive:true});
const hash=v=>createHash('sha256').update(v).digest('hex'),calls=[],today=billingToday();
let phase='history',warm=true,healthIndex=0,browserHealthIndex=0;const generationBodies=[];
const cold=(next)=>{phase=next;warm=false;healthIndex=0;browserHealthIndex=0;};
const preview=await billingPreview({bindings:{BILLING_PDF_SERVICE_URL:'https://billing-fixture.onrender.com'},outboundService:async request=>{
 const url=new URL(request.url);assert.equal(url.origin,'https://billing-fixture.onrender.com');
 if(request.method==='GET'){
  assert.equal(url.pathname,'/api/health');assert.equal(request.body,null);assert.equal(request.headers.get('X-API-Key'),null);assert.equal(request.headers.get('Accept'),'application/json');
  healthIndex++;const status=phase==='generation-blocked'?503:warm?200:429;
  const ready=phase!=='preflight';
  calls.push({phase,method:'GET',path:url.pathname,status,...(status===200?{ready}:{}),machineKeyPresent:false});
  if(status!==200)return new Response('<!doctype html><title>Fictitious hosting startup</title>',{status,headers:{'content-type':'text/html'}});
  warm=true;return Response.json({ready});
 }
 assert.equal(request.method,'POST');assert.equal(request.headers.get('X-API-Key'),'synthetic-billing-fixture-key-0123456789');assert.equal(warm,true,'No business POST before successful health JSON response');
 const payload=await request.json(),status=200;
 calls.push({phase,method:'POST',path:url.pathname,status,machineKeyPresent:true,bodyHash:hash(JSON.stringify(payload))});
 if(url.pathname.endsWith('/preflight-pdf')){if(phase==='preflight')cold('generation-blocked');return Response.json({valid:true,snapshotSha256:hash(billingCanonicalJSON({schemaVersion:1,document:payload.document,totals:calculateBilling(payload.document)})),checks:{render:true,amounts:true}});}
 if(url.pathname.endsWith('/preview-pdf'))return new Response(samplePDF(),{headers:{'Content-Type':'application/pdf'}});
 assert.ok(url.pathname.endsWith('/generate-issued-pdf'));if(phase!=='history')generationBodies.push(payload);
 const bytes=samplePDF();return Response.json({schemaVersion:1,envelopeSha256:payload.envelopeSha256,generatorVersion:'synthetic-cold-start-ui',profile:payload.document.kind==='quote'?'quote-pdf':'invoice-pdf',artifacts:[{kind:'pdf',sha256:hash(bytes),size:bytes.length,contentType:'application/pdf',base64:bytes.toString('base64')}]});
}});
const headers={Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1','Content-Type':'application/json',Cookie:preview.sessions[0].cookie};
const call=(path,method='GET',body,version)=>preview.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing'+path,{method,headers:{...headers,...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const ok=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
const counter=async()=>Number((await preview.ctx.db.prepare("SELECT coalesce(sum(next_value-first_value),0) n FROM billing_number_series WHERE kind=?").bind(kind).first()).n);
let browser,checks={fixture:'fully fictitious',backoff:'8 x 1ms in private Worker and browser test bundles only',sourceHash:hash(source),sourceWakeLogicUnmodified:true,host:'fake onrender.com intercepted entirely in local outboundService',network:'localhost + in-process fake PDF host only'};
try{
 const template=quoteFixture('Incident moteur — '+kind+' fictif');template.kind=kind;template.issueDate=today;template.dueDate=addBillingDays(today,30);template.validUntil=kind==='quote'?addBillingDays(today,60):'';template.buyer.siren='552100554';template.iban='FR1420041010050500013M02606';template.bic='PSSTFRPPXXX';template.paymentTerms='30 jours';template.references.quoteNumber=kind==='invoice'?'DEV-FICTIF-007':'';
 const settings={...blankSettings(),seller:template.seller,paymentTerms:template.paymentTerms,iban:template.iban,bic:template.bic};await ok(await call('/settings','PUT',{data:settings},0));
 const series=await createNumberSeries(preview.ctx.db,{id:randomUUID(),issuerSiren:template.seller.siren,kind,prefix:kind==='quote'?'DEV-AAAAMM':'FAC-AAAAMM',width:3,firstValue:1,startDate:'1970-01-01',endDate:'9999-12-31'},'synthetic-ui');await preview.ctx.db.prepare('INSERT INTO billing_monthly_series VALUES(?)').bind(series.id).run();await preview.ctx.db.prepare('INSERT INTO billing_default_series VALUES(?,?,?)').bind(series.issuer_siren,kind,series.id).run();
 const history=await ok(await call('/documents','POST',{id:randomUUID(),data:{...template,title:'Historical fictitious '+kind}}),201);
 let frozenHistory=await ok(await call('/documents/'+history.id+'/issue','POST',{id:randomUUID(),seriesId:'automatic'},history.version));frozenHistory=await ok(await call('/documents/'+history.id+'/finalize','POST',{},frozenHistory.version));assert.equal(frozenHistory.issuance.state,'ready');const historicalPDFHash=hash(Buffer.from(await (await call('/documents/'+history.id+'/files/pdf')).arrayBuffer()));
 const doc=await ok(await call('/documents','POST',{id:randomUUID(),data:template}),201),initialCounter=await counter();
 const compiled=await build({entryPoints:[resolve(root,'platform/client/billing.tsx')],outfile:out+'/billing.js',bundle:true,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',minify:true,write:false,plugins:[{name:'accelerated-browser-wake-delay-only',setup(b){b.onLoad({filter:/document-engine-wake\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replace(/const wakeRetryDelays=\[[^\]]+\];/,'const wakeRetryDelays=[1,1,1,1,1,1,1,1];'),loader:'ts'}));}}],external:['/platform/pdf-editor-font.ttf'],define:{'process.env.NODE_ENV':'"production"'}});
 const js=compiled.outputFiles.find(f=>f.path.endsWith('.js')).text,css=compiled.outputFiles.find(f=>f.path.endsWith('.css')).text;
 const html=`<!doctype html><html lang="fr"><meta charset="utf-8"><link rel="stylesheet" href="/platform/billing.css"><style>body{margin:0;padding:24px;background:#f7f9f8}</style><main id="app"></main><script type="module">import {mountBilling,createBillingTransport} from '/platform/billing.js';const transport=createBillingTransport({baseUrl:location.origin,getSession:async()=>"synthetic-session",isActive:()=>true});window.qaTransport=transport;mountBilling(document.querySelector('#app'),{transport,initialKind:${JSON.stringify(kind)},onLegacy:()=>{}});</script></html>`;
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});const page=await browser.newPage({viewport:{width:1440,height:1050}});page.setDefaultTimeout(20000);const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(/^(blob:|data:)/.test(url.protocol))return route.continue();if(url.origin==='https://billing-fixture.onrender.com'){
  const request=route.request(),headers=request.headers();assert.equal(url.pathname,'/api/health');assert.equal(url.search,'');assert.equal(request.method(),'GET');assert.equal(request.postData(),null);for(const field of ['cookie','authorization','x-api-key','x-cdinnov-request','content-type','referer'])assert.equal(headers[field],undefined,field);
  const index=browserHealthIndex++,startup=phase==='preview'&&index<2,ready=phase!=='preflight';
  calls.push({phase,method:'BROWSER_GET',path:url.pathname,status:startup?index===0?200:'network-error':200,...(!startup?{ready}:{}),machineKeyPresent:false});
  if(startup&&index===1)return route.abort('failed');
  if(startup)return route.fulfill({status:200,contentType:'text/html',headers:{'Access-Control-Allow-Origin':preview.base},body:'<!doctype html><title>Fictitious startup page</title>'});
  warm=true;return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':preview.base},body:JSON.stringify({ready})});
 }if(url.origin!==preview.base)throw new Error('Unexpected network: '+url.origin);if(url.pathname==='/'||url.pathname==='/index.html'){const response=await route.fetch();return route.fulfill({response,body:html});}if(url.pathname==='/platform/billing.js')return route.fulfill({body:js,contentType:'application/javascript'});if(url.pathname==='/platform/billing.css')return route.fulfill({body:css,contentType:'text/css'});return route.continue();});
 const finish=async()=>{const status=page.getByRole('button',{name:'Statut du document',exact:true});await page.waitForFunction(()=>{const b=document.querySelector('button[aria-label="Statut du document"]');return b&&!b.disabled;});await status.focus();await page.keyboard.press('ArrowDown');const dialog=page.getByRole('dialog',{name:'Finaliser ce document ?'});await page.waitForFunction(()=>document.querySelector('[role=menuitem][data-status=finalized]')||document.querySelector('.cdi-dialog[role=dialog]'));if(!await dialog.isVisible()){const item=page.getByRole('menuitem',{name:'Finalisé',exact:true});await item.focus();await page.keyboard.press('Enter');}await dialog.waitFor();await dialog.getByRole('button',{name:'Finaliser',exact:true}).click();};
 cold('preview');await page.goto(preview.base);await page.getByRole('button',{name:'Ouvrir '+template.title,exact:true}).click();
 await page.getByRole('img',{name:'Page 1 du document PDF',exact:true}).waitFor();await page.locator('.bill-pdf-rendering').waitFor({state:'detached'});checks.previewRecovered=true;
 const before=await ok(await call('/documents/'+doc.id));checks.quoteReservation=before.reservedNumber?.number||null;assert.equal(before.issuance,null);
 const editedTitle='Modification fictive conservée';await page.getByLabel('Objet du document',{exact:true}).fill(editedTitle);await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.bill-save-state')?.textContent?.startsWith('Enregistré à'));
 assert.equal((await ok(await call('/documents/'+doc.id))).data.title,editedTitle);checks.editSaved=true;
 // Wait for the saved version's preview before starting the next isolated cold phase.
 await page.waitForFunction(()=>{const button=document.querySelector('button[aria-label="Imprimer le document"]');return button&&!button.disabled;});
 cold('preflight');await finish();await page.locator('.bill-status-error').waitFor();const failed=await ok(await call('/documents/'+doc.id));assert.equal(failed.issuance.state,'failed');assert.equal(await counter(),initialCounter+1);checks.failedNumber=failed.issuance.number;checks.failedIssuanceId=failed.issuance.id;const frozenIssuance=await preview.ctx.db.prepare('SELECT * FROM billing_issuances WHERE id=?').bind(failed.issuance.id).first();assert.equal(calls.filter(c=>c.phase==='generation-blocked'&&c.method==='GET').length,9);assert.equal(calls.filter(c=>c.phase==='generation-blocked'&&c.method==='POST').length,0);checks.boundedUnavailableGeneration={healthCalls:9,businessPOSTs:0};checks.simplePDFAllowedWhenElectronicToolsNotReady=calls.some(c=>c.phase==='preflight'&&c.method==='GET'&&c.status===200&&c.ready===false);assert.equal(checks.simplePDFAllowedWhenElectronicToolsNotReady,true);await page.screenshot({path:out+'/failed.png',fullPage:true});
 cold('retry');await page.getByRole('button',{name:'Reprendre',exact:true}).click();await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).waitFor();
 const issued=await ok(await call('/documents/'+doc.id));assert.equal(issued.status,'issued');assert.equal(issued.data.title,editedTitle);assert.equal(issued.issuance.state,'ready');assert.equal(issued.issuance.id,failed.issuance.id);assert.equal(issued.issuance.number,failed.issuance.number);assert.equal(await counter(),initialCounter+1);assert.equal(issued.data.references.quoteNumber,template.references.quoteNumber);assert.equal(issued.data.issueDate,template.issueDate);assert.equal(issued.data.dueDate,template.dueDate);assert.equal(generationBodies.length,1);assert.deepEqual(await preview.ctx.db.prepare('SELECT * FROM billing_issuances WHERE id=?').bind(issued.issuance.id).first(),frozenIssuance);checks.issuanceSnapshotUnchanged=true;
 if(kind==='quote'){assert.ok(checks.quoteReservation);assert.equal(issued.issuance.number,checks.quoteReservation);}else assert.equal(checks.quoteReservation,null);
 checks.finalizedNumber=issued.issuance.number;checks.counterIncrement=1;checks.noPOSTBeforeHTTP200HealthJSON=true;
 for(const name of ['preview','preflight','retry']){const firstPost=calls.findIndex(c=>c.phase===name&&c.method==='POST'),readyCall=calls.findIndex(c=>c.phase===name&&c.method==='BROWSER_GET'&&typeof c.ready==='boolean');assert.ok(readyCall>=0&&firstPost>readyCall);}checks.browserWakeBeforeWorker=true;checks.browserStartupHTMLAndNetworkRecovery=true;
 await page.evaluate(async({id,version})=>window.qaTransport.finalize(id,version),{id:doc.id,version:issued.version});assert.equal(await counter(),initialCounter+1);assert.equal((await ok(await call('/documents/'+doc.id))).issuance.number,issued.issuance.number);checks.replaySameNumber=true;
 assert.deepEqual(await ok(await call('/documents/'+history.id)),frozenHistory);assert.equal(hash(Buffer.from(await (await call('/documents/'+history.id+'/files/pdf')).arrayBuffer())),historicalPDFHash);checks.historicalDocumentAndPDFUnchanged=true;
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).click();const file=await download;assert.equal(file.suggestedFilename(),issued.issuance.number+'-pdf.pdf');await file.saveAs(out+'/issued.pdf');assert.equal((await readFile(out+'/issued.pdf')).subarray(0,5).toString(),'%PDF-');checks.downloaded=true;await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).waitFor();await page.screenshot({path:out+'/recovery.png',fullPage:true});
 checks.pageErrors=pageErrors;assert.deepEqual(pageErrors,[]);checks.requests=preview.requests;checks.serviceCalls=calls;checks.completed=true;await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
}catch(error){await writeFile(out+'/failure.txt',error.stack);console.error(error);throw error;}finally{await browser?.close();await preview.close();}

}
try{for(const kind of ['invoice','quote'])await check(kind);}finally{if(previousWorker===undefined)delete process.env.MARCHES_TEST_WORKER;else process.env.MARCHES_TEST_WORKER=previousWorker;}
