// Real browser -> portal transport -> Worker/D1 -> local FastAPI -> ReportLab PDF.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {billingPreview} from './billing-preview.mjs';
import {blankDraft} from './billing-domain.ts';
const python=process.env.BILLING_TEST_PYTHON,out=process.env.PORTAL_QA;
assert.ok(python&&out,'BILLING_TEST_PYTHON and private PORTAL_QA directory required');await mkdir(out,{recursive:true});
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const key='synthetic-local-pdf-key-01234567890123456789';
const service=spawn(python,['-m','uvicorn','cdi_facturx.api:app','--host','127.0.0.1','--port','0'],{windowsHide:true,env:{...process.env,PYTHONPATH:resolve('facturx-service'),PYTHONIOENCODING:'utf-8',FACTURX_DEPLOYMENT:'server',FACTURX_API_KEY:key,FACTURX_ALLOWED_HOSTS:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
let preview,browser,serviceLog='';
try{
 const base=await new Promise((done,reject)=>{
  const timer=setTimeout(()=>reject(new Error('PDF service startup timeout: '+serviceLog)),20000);
  const read=chunk=>{serviceLog+=chunk;const match=serviceLog.match(/Uvicorn running on (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);done(match[1]);}};
  service.stdout.on('data',read);service.stderr.on('data',read);service.once('error',error=>{clearTimeout(timer);reject(error);});service.once('exit',code=>{clearTimeout(timer);reject(new Error('PDF service stopped '+code+': '+serviceLog));});
 });
 let calls=0;
 preview=await billingPreview({bindings:{BILLING_PDF_SERVICE_URL:'https://pdf-local.test',BILLING_PDF_SERVICE_KEY:key},outboundService:async request=>{
  assert.equal(request.url,'https://pdf-local.test/api/billing/preview-pdf');calls++;
  const response=await fetch(base+'/api/billing/preview-pdf',{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':request.headers.get('x-api-key')},body:await request.text()});
  return new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers});
 }});
 const d=blankDraft('invoice','2026-10-20');d.title='Contrôle PDF intégré';d.seller.name='Émetteur fictif';d.buyer.name='Client fictif';d.vatDue='invoice';d.dueDate='2026-11-19';
 d.lines[0]={...d.lines[0],description:'Accompagnement à Bastia',quantity:'1.833333',unitPrice:'123.456789',discountPercent:'12.34'};
 const created=await preview.ctx.worker.dispatchFetch('https://preview.example/api/v1/billing/documents',{method:'POST',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+preview.sessions[0].token,'Content-Type':'application/json'},body:JSON.stringify({id:randomUUID(),data:d})});assert.equal(created.status,201);
 browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({acceptDownloads:true,locale:'fr-FR'});
 await context.route('**/*',route=>route.request().url().startsWith(preview.base+'/')?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 await page.goto(preview.base);await page.getByRole('button',{name:'Ouvrir Contrôle PDF intégré',exact:true}).click();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Télécharger le PDF brouillon',exact:true}).click();const download=await pending;
 assert.equal(download.suggestedFilename(),'facture-brouillon.pdf');const output=join(out,'facture-integration.pdf');await download.saveAs(output);
 const bytes=await readFile(output);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.length>5000);assert.equal(calls,1);assert.deepEqual(errors,[]);
 const extracted=spawnSync(python,['-c',"import sys,json;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);print(json.dumps({'pages':len(r.pages),'text':'\\n'.join(p.extract_text() for p in r.pages)},ensure_ascii=False))",output],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}});
 assert.equal(extracted.status,0,extracted.stderr);const content=JSON.parse(extracted.stdout);assert.match(content.text,/BROUILLON/);assert.match(content.text,/Contrôle PDF intégré/);assert.match(content.text,/Accompagnement à Bastia/);
 console.log(JSON.stringify({realPDF:true,pages:content.pages,bytes:bytes.length,serviceCalls:calls,javascriptErrors:errors}));
}finally{
 if(browser)await browser.close();if(preview)await preview.close();service.kill();
}
