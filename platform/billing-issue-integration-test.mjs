// Real browser -> Worker/D1 -> FastAPI -> Ghostscript/Factur-X/veraPDF -> private R2 -> verified download.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {billingPreview} from './billing-preview.mjs';
const python=process.env.BILLING_TEST_PYTHON,out=process.env.PORTAL_QA;
assert.ok(python&&out&&process.env.BILLING_FULL_RUNTIME==='1','Prepared Python/native runtime and private output directory required');await mkdir(out,{recursive:true});
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const key='synthetic-issue-key-01234567890123456789';
const service=spawn(python,['-m','uvicorn','cdi_facturx.api:app','--host','127.0.0.1','--port','0'],{windowsHide:true,env:{...process.env,PYTHONPATH:resolve('facturx-service'),PYTHONIOENCODING:'utf-8',FACTURX_DEPLOYMENT:'server',FACTURX_API_KEY:key,FACTURX_ALLOWED_HOSTS:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
let preview,browser,serviceLog='';
try{
 const base=await new Promise((done,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Service startup timeout: '+serviceLog)),20000);
  const read=chunk=>{serviceLog+=chunk;const match=serviceLog.match(/Uvicorn running on (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);done(match[1]);}};
  service.stdout.on('data',read);service.stderr.on('data',read);service.once('error',e=>{clearTimeout(timer);reject(e);});service.once('exit',code=>{clearTimeout(timer);reject(new Error('Service stopped '+code+': '+serviceLog));});
 });
 let generateCalls=0,preflightCalls=0,firstFailure=true;
 preview=await billingPreview({bindings:{BILLING_PDF_SERVICE_URL:'https://billing-service.test',BILLING_PDF_SERVICE_KEY:key},outboundService:async request=>{
  const path=new URL(request.url).pathname;assert.equal(new URL(request.url).origin,'https://billing-service.test');assert.ok(['/api/billing/preflight','/api/billing/generate-issued','/api/billing/preview-pdf'].includes(path));assert.equal(request.headers.get('x-api-key'),key);
  if(path.endsWith('/preflight'))preflightCalls++;
  else if(path.endsWith('/generate-issued')){generateCalls++;if(firstFailure){firstFailure=false;return Response.json({detail:'Synthetic temporary outage'}, {status:503});}}
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':key},body:await request.text()});
  return new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers});
 }});
 const headers={Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+preview.sessions[0].token,'Content-Type':'application/json'};
 const call=(path,options={})=>preview.ctx.worker.dispatchFetch('https://preview.example'+path,{...options,headers:{...headers,...options.headers}});
 const sample=spawnSync(python,['-c',"import json;from tests.test_billing_issuance import document;print(json.dumps(document(),ensure_ascii=False))"],{encoding:'utf8',env:{...process.env,PYTHONPATH:resolve('facturx-service'),PYTHONIOENCODING:'utf-8'}});assert.equal(sample.status,0,sample.stderr);
 const d=JSON.parse(sample.stdout);d.title='Facture structurée — intégration';const documentId=randomUUID();
 const created=await call('/api/v1/billing/documents',{method:'POST',body:JSON.stringify({id:documentId,data:d})});assert.equal(created.status,201,await created.clone().text());
 browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({acceptDownloads:true,locale:'fr-FR',viewport:{width:1440,height:1050}});
 await context.route('**/*',route=>route.request().url().startsWith(preview.base+'/')||route.request().url().startsWith('blob:')?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);page.on('dialog',dialog=>dialog.accept());
 await page.goto(preview.base);await page.getByRole('button',{name:'Paramètres de facturation',exact:true}).click();
 await page.getByLabel('SIREN de la série',{exact:true}).fill('732829320');await page.getByLabel('Préfixe de numérotation',{exact:true}).fill('TEST-F-2026-');await page.getByLabel('Premier compteur',{exact:true}).fill('41');
 await page.getByLabel('Début de série',{exact:true}).fill('2026-01-01');await page.getByLabel('Fin de série',{exact:true}).fill('2026-12-31');await page.getByRole('button',{name:'Créer la série',exact:true}).click();
 await page.getByText('Série enregistrée. Aucun numéro n’a été consommé.',{exact:true}).waitFor();
 const series=await preview.ctx.db.prepare('SELECT * FROM billing_number_series').first();assert.equal(series.next_value,41);
 await page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:/Factures/}).click();await page.getByRole('button',{name:'Ouvrir '+d.title,exact:true}).click();
 const rendered=async()=>page.waitForFunction(()=>{const c=document.querySelector('.bill-pdf-sheet canvas');return c&&c.width>0&&getComputedStyle(c).visibility==='visible';});
 await page.getByRole('button',{name:'PDF paginé',exact:true}).click();await rendered();
 await page.getByText('Page 1 / 2',{exact:true}).waitFor();await page.getByRole('button',{name:'Page suivante du PDF',exact:true}).click();await rendered();await page.getByText('Page 2 / 2',{exact:true}).waitFor();
 const width=await page.locator('.bill-pdf-sheet canvas').evaluate(e=>e.width);await page.getByRole('button',{name:'Agrandir le PDF',exact:true}).click();await rendered();assert.ok(await page.locator('.bill-pdf-sheet canvas').evaluate(e=>e.width)>width);
 await page.getByRole('button',{name:'Ajuster le PDF à la largeur',exact:true}).click();await rendered();
 await page.getByLabel('Objet du document',{exact:true}).fill(d.title+' modifié');assert.equal(await page.getByRole('button',{name:'PDF paginé',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('region',{name:'Aperçu PDF paginé',exact:true}).count(),0);
 await page.getByLabel('Objet du document',{exact:true}).fill(d.title);
 await page.getByText('Vérifier et finaliser',{exact:true}).click();
 await page.getByLabel('Série de numérotation',{exact:true}).selectOption(series.id);await page.getByRole('button',{name:'Finaliser et générer',exact:true}).click();
 await page.getByText('La génération doit être reprise. Le numéro et le document sont conservés.',{exact:true}).waitFor({timeout:60000});
 let result=await (await call('/api/v1/billing/documents/'+documentId)).json();assert.equal(result.status,'issue_failed');assert.equal(result.issuance.number,'TEST-F-2026-0041');assert.equal(result.issuance.attempts,1);
 assert.equal(await page.getByLabel('Objet du document',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).count(),0);
 assert.equal((await preview.ctx.db.prepare('SELECT next_value FROM billing_number_series').first()).next_value,42);
 const denied=await call('/api/v1/billing/documents/'+documentId,{method:'PUT',headers:{'If-Match':'1'},body:JSON.stringify({data:{...d,title:'Forbidden'}})});assert.equal(denied.status,409);
 assert.equal((await call('/api/v1/billing/documents/'+documentId+'/preview.pdf',{headers:{'If-Match':'1'}})).status,409);
 assert.equal((await call('/api/v1/billing/documents/'+documentId+'/files/pdf')).status,409);
 let failPreview=true;await page.route('**/api/v1/billing/documents/'+documentId+'/files/pdf',route=>{if(failPreview){failPreview=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Indisponibilité temporaire de test'})});}return route.continue();});
 await page.getByRole('button',{name:'Reprendre la génération',exact:true}).click();
 await page.getByRole('button',{name:'Télécharger le Factur-X',exact:true}).waitFor({timeout:180000});
 await page.getByText('Document finalisé et fichiers archivés. Aucune transmission à AGIRIS n’a été effectuée.',{exact:true}).waitFor();
 await page.getByText('Indisponibilité temporaire de test',{exact:true}).waitFor();await page.getByRole('button',{name:'Réessayer l’aperçu',exact:true}).click();await rendered();
 result=await (await call('/api/v1/billing/documents/'+documentId)).json();assert.equal(result.status,'issued');assert.equal(result.issuance.attempts,2);assert.equal(result.issuance.number,'TEST-F-2026-0041');assert.equal(preflightCalls,1);assert.equal(generateCalls,2);
 const list=await (await call('/api/v1/billing/documents')).json();assert.equal(list.documents.find(x=>x.id===documentId).status,'issued');
 assert.equal((await preview.ctx.db.prepare('SELECT next_value FROM billing_number_series').first()).next_value,42);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Télécharger le Factur-X',exact:true}).click();const download=await downloadPromise;
 assert.equal(download.suggestedFilename(),'TEST-F-2026-0041-pdf.pdf');const file=join(out,download.suggestedFilename());await download.saveAs(file);
 const saved=await readFile(file);assert.equal(saved.subarray(0,5).toString(),'%PDF-');
 const reportResponse=await call('/api/v1/billing/documents/'+documentId+'/files/validation');assert.equal(reportResponse.status,200);const report=await reportResponse.json();assert.equal(report.valid,true);assert.equal(report.checks.pdfa_3b,true);assert.equal(report.pdf_sha256,createHash('sha256').update(saved).digest('hex'));await writeFile(join(out,'validation.json'),JSON.stringify(report,null,2));
 for(const [token,status] of [['',401],['Bearer '+preview.sessions[1].token,403]]){
  for(const [path,method,body] of [['/number-series','GET'],['/documents/'+documentId+'/files/pdf','GET'],['/documents/'+documentId+'/finalize','POST',{}]])assert.equal((await call('/api/v1/billing'+path,{method,headers:{Authorization:token,'If-Match':'1'},...(body?{body:JSON.stringify(body)}:{})})).status,status);
 }
 const job=await preview.ctx.db.prepare('SELECT * FROM billing_issue_jobs WHERE issuance_id=?').bind(result.issuance.id).first(),manifest=JSON.parse(job.manifest_json),pdf=manifest.artifacts.find(a=>a.kind==='pdf');
 for(const method of ['GET','PUT','DELETE'])assert.equal((await call('/files/'+encodeURIComponent(pdf.key),{method,...(method==='PUT'?{body:'forged'}:{})})).status,403);
 const replay=await call('/api/v1/billing/documents/'+documentId+'/issue',{method:'POST',headers:{'If-Match':'1'},body:JSON.stringify({id:result.issuance.id,seriesId:series.id})});assert.equal(replay.status,200);assert.equal((await replay.json()).issuance.number,result.issuance.number);assert.equal(preflightCalls,1);
 assert.equal((await call('/api/v1/billing/documents/'+documentId+'/finalize',{method:'POST',headers:{'If-Match':'1'},body:'{}'})).status,200);assert.equal(generateCalls,2);
 await rendered();await page.getByText('Page 1 / 2',{exact:true}).waitFor();assert.equal(await page.locator('.bill-editor').count(),0);
 assert.equal(await page.getByRole('button',{name:'Rapport de validation',exact:true}).isVisible(),false);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(out,'issued-desktop.png'),fullPage:true});await page.evaluate(()=>CDITheme.set('dark'));await page.setViewportSize({width:390,height:844});
 await page.getByRole('group',{name:'Affichage du document',exact:true}).getByRole('button',{name:'Résumé',exact:true}).click();assert.equal(await page.locator('.bill-document-customer').isVisible(),true);assert.equal(await page.getByRole('region',{name:'Aperçu PDF paginé',exact:true}).isVisible(),false);
 await page.getByRole('button',{name:'Document PDF',exact:true}).click();assert.equal(await page.locator('.bill-document-customer').isVisible(),false);
 await page.waitForFunction(()=>{const c=document.querySelector('.bill-pdf-sheet canvas'),v=document.querySelector('.bill-pdf-viewport');return c&&v&&getComputedStyle(c).visibility==='visible'&&Math.abs(c.getBoundingClientRect().width-(v.clientWidth-32))<3;});
 await page.screenshot({path:join(out,'issued-mobile-dark.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 const checked=spawnSync(python,['-c',"import sys,json;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);text='\\n'.join(p.extract_text() for p in r.pages);assert 'TEST-F-2026-0041' in text;assert 'BROUILLON' not in text;assert list(r.attachments)==['factur-x.xml'];print(json.dumps({'pages':len(r.pages),'embeddedXml':True}))",file],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}});assert.equal(checked.status,0,checked.stderr);
 // Corrupted private storage is never silently downloaded, even to an administrator.
 const bucket=await preview.ctx.worker.getR2Bucket('CET_FILES');await bucket.put(pdf.key,'%PDF-corrupt',{httpMetadata:{contentType:'application/pdf'}});assert.equal((await call('/api/v1/billing/documents/'+documentId+'/files/pdf')).status,503);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({realFacturX:true,...JSON.parse(checked.stdout),number:result.issuance.number,preflightCalls,generationAttempts:generateCalls,storedArtifacts:manifest.artifacts.length,bytes:saved.length,javascriptErrors:errors}));
}finally{if(browser)await browser.close();if(preview)await preview.close();service.kill();}
