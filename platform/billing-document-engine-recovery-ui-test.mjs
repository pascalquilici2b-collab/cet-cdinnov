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
const worker=await build({entryPoints:[resolve(root,'platform/worker.ts')],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'accelerated-retry-backoff-only',setup(b){b.onLoad({filter:/billing-pdf-service\.ts$/},async()=>({contents:source.replace(/const retryDelays = \[[^\]]+\];/,'const retryDelays = [1,1,1,1,1,1,1,1];'),loader:'ts'}));}}]});
await writeFile(baseOut+'/worker.mjs',worker.outputFiles[0].text);const previousWorker=process.env.MARCHES_TEST_WORKER;process.env.MARCHES_TEST_WORKER=baseOut+'/worker.mjs';
async function check(kind){
const out=baseOut+'/'+kind;await mkdir(out,{recursive:true});
const hash=v=>createHash('sha256').update(v).digest('hex'),calls=[],today=billingToday();
let awake=false,preflightCold=true;
const preview=await billingPreview({outboundService:async request=>{
 const url=new URL(request.url);assert.equal(url.origin,'https://billing-fixture.invalid');assert.equal(request.headers.get('X-API-Key'),'synthetic-billing-fixture-key-0123456789');if(url.pathname.endsWith('/preflight-pdf')&&preflightCold){awake=false;preflightCold=false;}
 calls.push({method:request.method,path:url.pathname,status:request.method==='GET'||awake?200:429});
 if(request.method==='GET'){assert.equal(request.body,null);assert.equal(url.pathname,'/api/health');awake=true;return Response.json({ready:true});}
 const payload=await request.json();if(!awake)return new Response('<!doctype html><title>Host starting</title>',{status:429,headers:{'content-type':'text/html'}});
 if(url.pathname.endsWith('/preflight-pdf'))return Response.json({valid:true,snapshotSha256:hash(billingCanonicalJSON({schemaVersion:1,document:payload.document,totals:calculateBilling(payload.document)})),checks:{render:true,amounts:true}});
 if(url.pathname.endsWith('/preview-pdf'))return new Response(samplePDF(),{headers:{'Content-Type':'application/pdf'}});
 assert.ok(url.pathname.endsWith('/generate-issued-pdf'));const bytes=samplePDF();return Response.json({schemaVersion:1,envelopeSha256:payload.envelopeSha256,generatorVersion:'synthetic-429-ui',profile:payload.document.kind==='quote'?'quote-pdf':'invoice-pdf',artifacts:[{kind:'pdf',sha256:hash(bytes),size:bytes.length,contentType:'application/pdf',base64:bytes.toString('base64')}]});
}});
const headers={Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1','Content-Type':'application/json',Cookie:preview.sessions[0].cookie};
const call=(path,method='GET',body,version)=>preview.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing'+path,{method,headers:{...headers,...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const ok=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
const counter=async()=>Number((await preview.ctx.db.prepare("SELECT coalesce(sum(next_value-first_value),0) n FROM billing_number_series WHERE kind=?").bind(kind).first()).n);
let browser,checks={fixture:'fully fictitious',backoff:'8 x 1ms in private Worker bundle only',sourceHash:hash(source),sourceWakeLogicUnmodified:true,network:'localhost + in-process fake PDF host only'};
try{
 const template=quoteFixture('Incident moteur — '+kind+' fictif');template.kind=kind;template.issueDate=today;template.dueDate=addBillingDays(today,30);template.validUntil=kind==='quote'?addBillingDays(today,60):'';template.buyer.siren='552100554';template.iban='FR1420041010050500013M02606';template.bic='PSSTFRPPXXX';template.paymentTerms='30 jours';template.references.quoteNumber=kind==='invoice'?'DEV-FICTIF-007':'';
 const settings={...blankSettings(),seller:template.seller,paymentTerms:template.paymentTerms,iban:template.iban,bic:template.bic};await ok(await call('/settings','PUT',{data:settings},0));
 const series=await createNumberSeries(preview.ctx.db,{id:randomUUID(),issuerSiren:template.seller.siren,kind,prefix:kind==='quote'?'DEV-AAAAMM':'FAC-AAAAMM',width:3,firstValue:1,startDate:'1970-01-01',endDate:'9999-12-31'},'synthetic-ui');await preview.ctx.db.prepare('INSERT INTO billing_monthly_series VALUES(?)').bind(series.id).run();await preview.ctx.db.prepare('INSERT INTO billing_default_series VALUES(?,?,?)').bind(series.issuer_siren,kind,series.id).run();
 const doc=await ok(await call('/documents','POST',{id:randomUUID(),data:template}),201),initialCounter=await counter();
 const compiled=await build({entryPoints:[resolve(root,'platform/client/billing.tsx')],outfile:out+'/billing.js',bundle:true,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',minify:true,write:false,external:['/platform/pdf-editor-font.ttf'],define:{'process.env.NODE_ENV':'"production"'}});
 const js=compiled.outputFiles.find(f=>f.path.endsWith('.js')).text,css=compiled.outputFiles.find(f=>f.path.endsWith('.css')).text;
 const html=`<!doctype html><html lang="fr"><meta charset="utf-8"><link rel="stylesheet" href="/platform/billing.css"><style>body{margin:0;padding:24px;background:#f7f9f8}</style><main id="app"></main><script type="module">import {mountBilling,createBillingTransport} from '/platform/billing.js';const transport=createBillingTransport({baseUrl:location.origin,getSession:async()=>"synthetic-session",isActive:()=>true});window.qaTransport=transport;mountBilling(document.querySelector('#app'),{transport,initialKind:${JSON.stringify(kind)},onLegacy:()=>{}});</script></html>`;
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});const page=await browser.newPage({viewport:{width:1440,height:1050}});page.setDefaultTimeout(20000);const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(/^(blob:|data:)/.test(url.protocol))return route.continue();if(url.origin!==preview.base)throw new Error('Unexpected network: '+url.origin);if(url.pathname==='/'||url.pathname==='/index.html'){const response=await route.fetch();return route.fulfill({response,body:html});}if(url.pathname==='/platform/billing.js')return route.fulfill({body:js,contentType:'application/javascript'});if(url.pathname==='/platform/billing.css')return route.fulfill({body:css,contentType:'text/css'});return route.continue();});
 const finish=async()=>{const status=page.getByRole('button',{name:'Statut du document',exact:true});await page.waitForFunction(()=>{const b=document.querySelector('button[aria-label="Statut du document"]');return b&&!b.disabled;});await status.focus();await page.keyboard.press('ArrowDown');const dialog=page.getByRole('dialog',{name:'Finaliser ce document ?'});await page.waitForFunction(()=>document.querySelector('[role=menuitem][data-status=finalized]')||document.querySelector('.cdi-dialog[role=dialog]'));if(!await dialog.isVisible()){const item=page.getByRole('menuitem',{name:'Finalisé',exact:true});await item.focus();await page.keyboard.press('Enter');}await dialog.waitFor();await dialog.getByRole('button',{name:'Finaliser',exact:true}).click();};
 await page.goto(preview.base);await page.getByRole('button',{name:'Ouvrir '+template.title,exact:true}).click();
 await page.getByRole('img',{name:'Page 1 du document PDF',exact:true}).waitFor();checks.previewRecovered=true;
 const before=await ok(await call('/documents/'+doc.id));checks.quoteReservation=before.reservedNumber?.number||null;
 await page.getByLabel('Objet du document',{exact:true}).fill('Modification fictive conservée');await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.bill-save-state')?.textContent?.startsWith('Enregistré à'));assert.equal((await ok(await call('/documents/'+doc.id))).data.title,'Modification fictive conservée');checks.editSaved=true;
 await finish();await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).waitFor();
 const issued=await ok(await call('/documents/'+doc.id));assert.equal(issued.status,'issued');assert.equal(issued.issuance.state,'ready');assert.equal(await counter(),initialCounter+1);assert.equal(issued.data.references.quoteNumber,template.references.quoteNumber);assert.equal(issued.data.issueDate,template.issueDate);assert.equal(issued.data.dueDate,template.dueDate);
 if(kind==='quote'){assert.ok(checks.quoteReservation);assert.equal(issued.issuance.number,checks.quoteReservation);}else assert.equal(checks.quoteReservation,null);
 checks.finalizedNumber=issued.issuance.number;checks.counterIncrement=1;checks.getWakeCalls=calls.filter(c=>c.method==='GET').length;assert.equal(checks.getWakeCalls,2);
 const preflight=calls.filter(c=>c.path.endsWith('/preflight-pdf'));assert.deepEqual(preflight.map(c=>c.status),[429,200]);assert.ok(calls.some(c=>c.path.endsWith('/preview-pdf')&&c.status===429));assert.ok(calls.some(c=>c.path.endsWith('/preview-pdf')&&c.status===200));
 await page.evaluate(async({id,version})=>window.qaTransport.finalize(id,version),{id:doc.id,version:issued.version});assert.equal(await counter(),initialCounter+1);assert.equal((await ok(await call('/documents/'+doc.id))).issuance.number,issued.issuance.number);checks.replaySameNumber=true;
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).click();const file=await download;assert.equal(file.suggestedFilename(),issued.issuance.number+'-pdf.pdf');await file.saveAs(out+'/issued.pdf');assert.equal((await readFile(out+'/issued.pdf')).subarray(0,5).toString(),'%PDF-');checks.downloaded=true;await page.screenshot({path:out+'/recovery.png',fullPage:true});
 checks.pageErrors=pageErrors;assert.deepEqual(pageErrors,[]);checks.requests=preview.requests;checks.serviceCalls=calls;checks.completed=true;await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
}catch(error){await writeFile(out+'/failure.txt',error.stack);console.error(error);throw error;}finally{await browser?.close();await preview.close();}

}
try{for(const kind of ['invoice','quote'])await check(kind);}finally{if(previousWorker===undefined)delete process.env.MARCHES_TEST_WORKER;else process.env.MARCHES_TEST_WORKER=previousWorker;}
