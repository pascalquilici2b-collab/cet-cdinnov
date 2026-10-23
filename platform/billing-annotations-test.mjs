// Real browser -> Worker/D1 -> Python/ReportLab; only synthetic local records.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixture} from './billing-quote-fixture.mjs';
import {normalizeAnnotations} from './billing-annotations.ts';
const python=resolve(process.env.BILLING_TEST_PYTHON||'platform/.private/facturx-venv/Scripts/python.exe'),out=resolve(process.env.PORTAL_QA||'platform/.private/pdf-editor-20261023/ui');
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium,expect}=require('playwright/test');
const key='synthetic-pdf-editor-key-01234567890123456789';
const service=spawn(python,['-X','utf8','-m','uvicorn','cdi_facturx.api:app','--host','127.0.0.1','--port','0'],{windowsHide:true,env:{...process.env,PYTHONPATH:resolve('facturx-service'),FACTURX_API_KEY:key},stdio:['ignore','pipe','pipe']});
let preview,browser,log='',page;
await mkdir(out,{recursive:true});
try{
 const base=await new Promise((done,reject)=>{const timer=setTimeout(()=>reject(Error(log)),20000);const read=b=>{log+=b;const m=log.match(/Uvicorn running on (http:\/\/127.0.0.1:\d+)/);if(m){clearTimeout(timer);done(m[1]);}};service.stdout.on('data',read);service.stderr.on('data',read);service.once('error',reject);});
 let calls=0;
 preview=await billingPreview({bindings:{BILLING_PDF_SERVICE_URL:'https://pdf.test',BILLING_PDF_SERVICE_KEY:key},outboundService:async req=>{const path=new URL(req.url).pathname;assert.ok(['/api/billing/preview-pdf','/api/billing/preflight-pdf','/api/billing/generate-issued-pdf'].includes(path));calls++;const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':key},body:await req.text()});return new Response(await r.arrayBuffer(),{status:r.status,headers:r.headers});}});
 const headers={Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+preview.sessions[0].token,'Content-Type':'application/json'};
 const call=(path,method='GET',body,version)=>preview.ctx.worker.dispatchFetch('https://local/api/v1/billing'+path,{method,headers:{...headers,...(version?{'If-Match':String(version)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const title='Essai des mentions libres',id=randomUUID(),d={...quoteFixture(title),kind:'invoice',issueDate:'2026-10-23',dueDate:'2026-11-23',validUntil:''};d.seller.siren='322556580';
 let r=await call('/documents','POST',{id,data:d});assert.equal(r.status,201,await r.clone().text());const initial=await r.json();
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1600,height:1100},locale:'fr-FR'});
 await context.route('**/*',route=>route.request().url().startsWith(preview.base+'/')||route.request().url().startsWith('data:')?route.continue():route.abort());
 page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await page.goto(preview.base);await page.getByRole('button',{name:'Ouvrir '+title,exact:true}).click();
 const toolbar=page.getByRole('toolbar',{name:'Édition du PDF'}),layer=page.locator('.bill-pdf-annotation-layer');
 const ready=()=>expect(toolbar.getByRole('button',{name:'Texte',exact:true})).toBeEnabled({timeout:25000});
 const text='Mention spéciale : validation du chef de file.';
 async function at(x,y){await layer.scrollIntoViewIfNeeded();const b=await layer.boundingBox();return {x:b.x+b.width*x/10000,y:b.y+b.height*y/10000};}
 async function draw(x,y,w,h){const a=await at(x,y),b=await at(x+w,y+h);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();}
 async function save(){await ready();const button=page.getByRole('button',{name:'Enregistrer',exact:true});await button.click();await expect(page.locator('.bill-save-state')).toContainText('Enregistré');return (await call('/documents/'+id)).json();}
 await ready();await toolbar.getByRole('button',{name:'Texte',exact:true}).click();await draw(700,6500,7000,700);
 const dialog=page.getByRole('dialog',{name:'Modifier un ajout PDF'});await dialog.getByLabel('Texte de l’encart').fill(text);await dialog.getByRole('button',{name:'Bleu',exact:true}).click();await dialog.getByRole('button',{name:'Appliquer',exact:true}).click();await ready();await expect(page.locator('.bill-pdf-page .bill-sr-only')).toContainText(text);
 await toolbar.getByRole('button',{name:'Surligner',exact:true}).click();await draw(700,6500,7000,230);await ready();await expect(page.locator('[data-annotation]')).toHaveCount(2);
 await toolbar.getByRole('button',{name:'Annuler le dernier ajout ou déplacement'}).click();await ready();await expect(page.locator('[data-annotation]')).toHaveCount(1);
 await toolbar.getByRole('button',{name:'Rétablir l’ajout ou le déplacement'}).click();await ready();await expect(page.locator('[data-annotation]')).toHaveCount(2);
 let stored=await save();assert.equal(stored.data.annotations.length,2);assert.deepEqual(stored.totals,initial.totals);
 const textId=stored.data.annotations[0].id;
 await page.getByRole('button',{name:'Agrandir le PDF',exact:true}).click();await ready();await toolbar.getByLabel('Ajouts au document').selectOption(textId);
 // Keyboard movement is normalized at 125% zoom and survives regeneration.
 await page.locator('[data-annotation="'+textId+'"]').focus();await page.keyboard.press('Shift+ArrowDown');await ready();stored=await save();assert.equal(stored.data.annotations[0].y,6750);
 await toolbar.getByRole('button',{name:'Modifier l’ajout sélectionné'}).click();await dialog.getByLabel('Texte de l’encart').fill(text+' Retour sous quinze jours.');await dialog.getByLabel('Taille du texte').selectOption('12');await dialog.getByRole('button',{name:'Appliquer',exact:true}).click();await ready();
 // Remove and restore preserve the content, not just its on-screen outline.
 await toolbar.getByRole('button',{name:'Supprimer l’ajout sélectionné'}).click();await ready();await expect(page.locator('.bill-pdf-page .bill-sr-only')).not.toContainText(text);
 await toolbar.getByRole('button',{name:'Annuler le dernier ajout ou déplacement'}).click();await ready();await expect(page.locator('.bill-pdf-page .bill-sr-only')).toContainText(text);
 stored=await save();assert.equal(stored.data.annotations[0].fontSize,12);
 await page.reload();await page.getByRole('button',{name:'Ouvrir '+title,exact:true}).click();await ready();await expect(page.locator('[data-annotation]')).toHaveCount(2);
 // Pointer movement and corner resize on the real A4 page.
 await toolbar.getByLabel('Ajouts au document').selectOption(textId);await draw(1000,6900,300,300);await ready();
 stored=await save();assert.ok(Math.abs(stored.data.annotations[0].x-1000)<20);assert.ok(Math.abs(stored.data.annotations[0].y-7050)<20);
 const handle=page.getByRole('button',{name:'Redimensionner l’ajout',exact:true});await handle.scrollIntoViewIfNeeded();let b=await handle.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2-80,b.y+b.height/2+30,{steps:8});await page.mouse.up();await ready();stored=await save();assert.ok(stored.data.annotations[0].width<7000);
 await page.getByRole('button',{name:'Format A4 à 100 %'}).click();await ready();await page.locator('.bill-pdf-viewer').screenshot({path:out+'/light.png'});
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await toolbar.getByRole('button',{name:'Modifier l’ajout sélectionné'}).click();await dialog.screenshot({path:out+'/dark-dialog.png'});await dialog.getByRole('button',{name:'Annuler',exact:true}).click();await page.locator('.bill-pdf-viewer').screenshot({path:out+'/dark.png'});
 await page.setViewportSize({width:390,height:844});await page.getByRole('group',{name:'Affichage de l’éditeur'}).getByRole('button',{name:'Aperçu',exact:true}).click();await toolbar.screenshot({path:out+'/mobile-toolbar.png'});assert.ok(await toolbar.evaluate(e=>e.scrollWidth<=e.clientWidth+2));await page.setViewportSize({width:1600,height:1100});
 // Reject malformed coordinates and unknown attributes through the real API.
 for(const patch of [{x:9999},{page:0},{fontSize:40},{color:'javascript:alert(1)'},{url:'https://example.com'}]){const bad=structuredClone(stored.data);Object.assign(bad.annotations[0],patch);const response=await call('/documents/'+id,'PUT',{data:bad},stored.version);assert.equal(response.status,400,await response.clone().text());assert.throws(()=>normalizeAnnotations(bad.annotations));}
 console.log('Browser: add/edit/highlight/undo/resize/save/reload/light/dark/mobile verified.');
 // Real immutable PDF issuance includes the same additions and totals.
 r=await call('/preview.pdf','POST',{data:stored.data});assert.equal(r.status,200,await r.clone().text());await writeFile(out+'/preview.pdf',Buffer.from(await r.arrayBuffer()));
 r=await call('/documents/'+id+'/issue','POST',{id:randomUUID(),seriesId:'automatic'},stored.version);assert.equal(r.status,200,await r.clone().text());
 r=await call('/documents/'+id+'/finalize','POST',{},stored.version);assert.equal(r.status,200,await r.clone().text());const issued=await r.json();assert.equal(issued.status,'issued');
 r=await call('/documents/'+id+'/files/pdf');assert.equal(r.status,200);await writeFile(out+'/issued.pdf',Buffer.from(await r.arrayBuffer()));
 const verify=spawnSync(python,['-X','utf8','-c',"import sys,pymupdf as f; a=f.open(sys.argv[1]);b=f.open(sys.argv[2]);s='Mention spéciale';assert a[0].search_for(s)==b[0].search_for(s);assert 'Retour sous quinze jours.' in ' '.join(b[0].get_text().split());assert not b[0].get_links();print('matching preview/archive positions')",out+'/preview.pdf',out+'/issued.pdf'],{encoding:'utf8'});assert.equal(verify.status,0,verify.stderr);
 await page.reload();await page.getByRole('button',{name:'Ouvrir '+title,exact:true}).click();await expect(toolbar).toHaveCount(0);
 // Multi-page quote, native pencil editing and retained additions on conversion.
 const q=quoteFixture('Devis multi-pages'),qid=randomUUID();q.issueDate='2026-10-23';q.seller.siren='322556580';q.lines=Array.from({length:45},(_,i)=>({...q.lines[0],id:randomUUID(),description:'Prestation de démonstration '+(i+1)}));
 r=await call('/documents','POST',{id:qid,data:q});assert.equal(r.status,201);
 await page.reload();await page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:'Devis',exact:true}).click();await page.getByRole('button',{name:'Ouvrir Devis multi-pages',exact:true}).click();await ready();await page.getByRole('button',{name:'Page suivante du PDF'}).click();await ready();
 await toolbar.getByRole('button',{name:'Texte',exact:true}).click();await draw(700,6500,6500,700);await dialog.getByLabel('Texte de l’encart').fill('MENTION SUR LA PAGE DEUX');await dialog.getByRole('button',{name:'Appliquer',exact:true}).click();await ready();await expect(page.locator('.bill-pdf-page .bill-sr-only')).toContainText('MENTION SUR LA PAGE DEUX');
 await page.getByRole('button',{name:'Page précédente du PDF'}).click();await ready();await expect(page.locator('[data-annotation]')).toHaveCount(0);await expect(page.locator('.bill-pdf-page .bill-sr-only')).not.toContainText('MENTION SUR LA PAGE DEUX');
 await page.getByRole('button',{name:'Modifier l’objet du document',exact:true}).click();const native=page.getByRole('dialog',{name:'Modifier dans l’aperçu',exact:true});await native.getByLabel('Valeur du champ').fill('Devis ajusté depuis l’aperçu');await native.getByRole('button',{name:'Appliquer',exact:true}).click();await ready();
 await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.locator('.bill-save-state')).toContainText('Enregistré');const savedQuote=await(await call('/documents/'+qid)).json();assert.equal(savedQuote.data.annotations[0].page,2);assert.equal(savedQuote.data.title,'Devis ajusté depuis l’aperçu');
 // Removing a page reports the orphaned addition and lets the user move it back.
 r=await call('/documents/'+qid,'PUT',{data:{...savedQuote.data,lines:savedQuote.data.lines.slice(0,1)}},savedQuote.version);assert.equal(r.status,200);
 await page.reload();await page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:'Devis',exact:true}).click();await page.getByRole('button',{name:'Ouvrir Devis ajusté depuis l’aperçu',exact:true}).click();await expect(page.locator('.bill-pdf-feedback')).toContainText('page supprimée',{timeout:25000});
 await toolbar.getByLabel('Ajouts au document').selectOption(savedQuote.data.annotations[0].id);await toolbar.getByRole('button',{name:'Modifier l’ajout sélectionné'}).click();await dialog.getByLabel('Page de l’ajout').selectOption('1');await dialog.getByRole('button',{name:'Appliquer',exact:true}).click();await ready();await expect(page.locator('.bill-pdf-page .bill-sr-only')).toContainText('MENTION SUR LA PAGE DEUX');
 await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.locator('.bill-save-state')).toContainText('Enregistré');const repaired=await(await call('/documents/'+qid)).json();assert.equal(repaired.data.annotations[0].page,1);
 r=await call('/documents/'+qid+'/convert','POST',{id:randomUUID()},repaired.version);assert.equal(r.status,201,await r.clone().text());const converted=await r.json();assert.deepEqual(converted.data.annotations,repaired.data.annotations);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,realPDFCalls:calls,persistence:true,undoRedo:true,pointerResize:true,normalizedZoom:true,lightDarkMobile:true,immutableArchive:true,errors}));
}catch(e){if(page){await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});await writeFile(out+'/failure.txt',await page.locator('body').innerText());}throw e;}
finally{await browser?.close();await preview?.close();service.kill();}

