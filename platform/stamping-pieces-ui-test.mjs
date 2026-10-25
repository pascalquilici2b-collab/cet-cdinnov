import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {jsPDF} from 'jspdf';
import {billingPreview} from './billing-preview.mjs';
import {migrateStamping} from './stamping-schema.mjs';
import {users} from '../marches/test.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright'),out=resolve('platform/.private/stamping-layout-20261025/qa');await mkdir(out,{recursive:true});
const preview=await billingPreview({stamping:true});await migrateStamping(preview.ctx.db);const bucket=await preview.ctx.worker.getR2Bucket('CET_FILES');
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
try{
 const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'fr-FR'});await context.route('**/*',route=>route.request().url().startsWith(preview.base+'/')||/^(data:|blob:)/.test(route.request().url())?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);await page.goto(preview.base);await page.locator('[data-react-billing]').waitFor();await page.locator('[data-view=tamponnage]').click();await page.getByLabel('Nom du lot',{exact:true}).fill('Pièces · vérification');await page.getByRole('button',{name:'Créer le lot',exact:true}).click();await page.getByRole('heading',{name:'Pièces du lot',exact:true}).waitFor();
 const batch=await preview.ctx.db.prepare('SELECT * FROM stamp_batches WHERE owner=?').bind(users[0]).first(),sha=b=>createHash('sha256').update(b).digest('hex'),prefix='stamping/'+sha(users[0]).slice(0,24)+'/'+batch.id+'/';
 const allocations=['DEVELOP','I.V.C','NEST4ESG','P.Ri.s.Ma.MED2'].map((project,i)=>({id:String(i),project,amount_cents:[22773,42667,60467,27014][i],source:{sheet:'Paiement',cell:'G'+(i+2),row:i+2}}));
 const d1=randomUUID(),d2=randomUUID();const pdf=new jsPDF();pdf.text('Piece fictive - page 1',20,20);pdf.addPage();pdf.text('Piece fictive - page 2',20,20);const bytes=Buffer.from(pdf.output('arraybuffer'));
 for(const [id,name,status,extra] of [[d1,'bulletin-1.pdf','NEEDS_APPROVAL',{allocations,base_cents:523522,total_cents:152921,progress:{stage:'complete',startedAt:Date.now()-6000}}],[d2,'bulletin-2.pdf','PROCESSING',{progress:{stage:'reading',startedAt:Date.now()-2000}}]]){
  await bucket.put(prefix+id+'/source.pdf',bytes);
  await preview.ctx.db.prepare('INSERT INTO stamp_documents(id,batch_id,name,sha256,size,status,data,lease_until) VALUES(?,?,?,?,?,?,?,?)').bind(id,batch.id,name,sha(bytes)+id.slice(0,1),bytes.length,status,JSON.stringify(extra),Date.now()+600000).run();
 }
 // Distinct hashes in the lot, while source downloads must verify the original.
 const pdf2=new jsPDF();pdf2.text('Deuxieme piece fictive - page 1',20,20);pdf2.addPage();pdf2.text('Deuxieme piece fictive - page 2',20,20);const bytes2=Buffer.from(pdf2.output('arraybuffer'));await bucket.put(prefix+d2+'/source.pdf',bytes2);
 await preview.ctx.db.prepare('UPDATE stamp_documents SET sha256=? WHERE id=?').bind(sha(bytes),d1).run();await preview.ctx.db.prepare('UPDATE stamp_documents SET sha256=? WHERE id=?').bind(sha(bytes2),d2).run();
 await page.getByRole('button',{name:'Actualiser',exact:true}).click();await page.getByRole('progressbar',{name:'Pièces analysées'}).waitFor();assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'1');assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuemax'),'2');
 const headers=await page.locator('.stamp-documents thead th').allTextContents();assert.deepEqual(headers,['Pièce','Type / période','Salaire brut chargé','Projets','Montant imputé','État','']);assert.equal(await page.getByText(/Accès privé · originaux préservés/).count(),0);
 const first=page.locator('.stamp-documents tbody tr').first();assert.deepEqual(await first.locator('.stamp-project-column>div').allTextContents(),allocations.map(a=>a.project));assert.deepEqual((await first.locator('.stamp-amount-column>div').allTextContents()).map(s=>s.replace(/\s/g,'')),['227,73€','426,67€','604,67€','270,14€']);
 const aligned=await first.evaluate(tr=>[...tr.querySelectorAll('.stamp-project-column>div')].every((p,i)=>Math.abs(p.getBoundingClientRect().top-tr.querySelectorAll('.stamp-amount-column>div')[i].getBoundingClientRect().top)<1));assert.ok(aligned);
 await page.locator('.stamp-documents').screenshot({path:out+'/piece-columns-light.png'});
 await page.getByRole('button',{name:'bulletin-2.pdf',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Aperçu et contrôle de la pièce'});await dialog.waitFor();await dialog.locator('.stamp-preview img').waitFor();await dialog.locator('.stamp-preview img').evaluate(img=>img.decode());
 await dialog.getByLabel('Page de la pièce',{exact:true}).selectOption('1');await dialog.locator('.stamp-preview img').evaluate(img=>img.decode());assert.equal(preview.requests.filter(r=>r.path.endsWith('/documents/'+d2+'/source')).length,1);assert.equal(preview.requests.filter(r=>r.path.includes('?image=1')).length,0);
 await dialog.getByRole('button',{name:'Fermer la fiche',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await preview.ctx.db.prepare("UPDATE stamp_documents SET status='REVIEW_REQUIRED',data=json_set(data,'$.progress.stage','complete') WHERE id=?").bind(d2).run();await page.getByRole('button',{name:'Actualiser',exact:true}).click();await page.getByText('Analyse terminée',{exact:true}).waitFor();assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'2');
 await page.locator('[data-theme-toggle]').click();await page.getByRole('button',{name:'bulletin-1.pdf',exact:true}).click();await dialog.locator('.stamp-preview img').waitFor();await dialog.screenshot({path:out+'/piece-preview-dark.png'});
 await page.setViewportSize({width:390,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await dialog.screenshot({path:out+'/piece-preview-mobile.png'});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.deepEqual(errors,[]);
 console.log('Piece UI passed: aligned project/amount rows, real progress, source preview during analysis, local page rendering/cache, modal close/Escape, dark/mobile.');
}finally{await browser.close();await preview.close();}
