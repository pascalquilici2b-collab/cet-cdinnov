import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixture,samplePDF} from './billing-quote-fixture.mjs';
import {billingCanonicalJSON} from './billing-issuance.ts';
import {blankSettings,calculateBilling} from './billing-domain.ts';
import {mkdir} from 'node:fs/promises';
const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
let failedFinalization=true;
const preview=await billingPreview({outboundService:async request=>{
 const path=new URL(request.url).pathname,payload=await request.json();
 if(path.endsWith('/preflight-pdf'))return Response.json({valid:true,snapshotSha256:hash(billingCanonicalJSON({schemaVersion:1,document:payload.document,totals:calculateBilling(payload.document)})),checks:{render:true,amounts:true,xsd:true,schematron:true,france:true}});
 if(path.endsWith('/preview-pdf'))return new Response(samplePDF(),{headers:{'content-type':'application/pdf'}});
 if(failedFinalization){failedFinalization=false;return new Response('synthetic retry test',{status:503});}
 const pdf=samplePDF();const artifacts=[{kind:'pdf',sha256:hash(pdf),size:pdf.length,contentType:'application/pdf',base64:pdf.toString('base64')}];
 return Response.json({schemaVersion:1,envelopeSha256:payload.envelopeSha256,generatorVersion:'synthetic-workflow-test',profile:payload.document.kind==='quote'?'quote-pdf':'invoice-pdf',artifacts});
}});
const browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});
await mkdir('platform/.private/sheets-workflow-20261023c',{recursive:true});
try{
 const headers={Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+preview.sessions[0].token,'Content-Type':'application/json'};
 const data=quoteFixture('Devis parcours finalisation');data.businessProcess='S1';data.paymentMeans='30';data.paymentTerms='30 jours';data.iban='FR1420041010050500013M02606';data.bic='PSSTFRPPXXX';
 data.seller.electronicAddress='732829320';data.seller.electronicScheme='0225';data.buyer.siren='552100554';data.buyer.electronicAddress='552100554';data.buyer.electronicScheme='0225';data.legalNotes={recovery:'Indemnité de 40 euros',penalties:'Taux légal',discount:'Sans escompte'};
 const settings={...blankSettings(),seller:data.seller,iban:data.iban,bic:data.bic,paymentTerms:data.paymentTerms};const settingsResponse=await preview.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/settings',{method:'PUT',headers:{...headers,'If-Match':'0'},body:JSON.stringify({data:settings})});assert.equal(settingsResponse.status,200);
 const r=await preview.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/documents',{method:'POST',headers,body:JSON.stringify({id:randomUUID(),data})});assert.equal(r.status,201,await r.clone().text());
 const context=await browser.newContext({viewport:{width:1600,height:1050},acceptDownloads:true});await context.route('**/*',r=>r.request().url().startsWith(preview.base)||r.request().url().startsWith('data:')?r.continue():r.abort());
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.goto(preview.base);
 // Historical rows use the existing editor/converter and refresh after save/delete.
 await page.locator('[data-imported-invoice="invoice-1"]').waitFor();assert.equal(await page.locator('[data-imported-invoice]').count(),2);
 await page.getByRole('button',{name:'Créer le Factur-X F-2026-001',exact:true}).click();assert.deepEqual(await page.evaluate(()=>qaFacturx),['invoice-1']);
 await page.getByRole('button',{name:'Modifier la facture F-2026-001',exact:true}).click();await page.locator('#fvNum').fill('F-2026-001-CORRIGE');await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.getByRole('button',{name:'Modifier la facture F-2026-001-CORRIGE',exact:true}).waitFor();
 await page.getByRole('button',{name:'Supprimer la facture F-2026-002',exact:true}).click();await page.locator('#overlay').getByRole('button',{name:'Confirmer',exact:true}).click();await page.locator('[data-imported-invoice="invoice-2"]').waitFor({state:'detached'});
 await page.screenshot({path:'platform/.private/sheets-workflow-20261023c/liste-test.png'});
 await page.setViewportSize({width:390,height:844});const importedRow=page.locator('[data-imported-invoice="invoice-1"]');const docBox=await importedRow.locator('[data-column=document]').boundingBox(),actionBox=await importedRow.locator('[data-column=action]').boundingBox();assert.ok(actionBox.y>docBox.y+docBox.height);assert.ok(actionBox.x+actionBox.width<=390);await page.screenshot({path:'platform/.private/sheets-workflow-20261023c/mobile-test.png'});await page.setViewportSize({width:1600,height:1050});
 await page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:'Devis',exact:true}).click();await page.getByRole('button',{name:/Devis parcours finalisation/}).first().click();await page.getByLabel('Statut du document',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).count(),0);console.log('Historical actions verified; checking finalization.');
 assert.equal(await page.getByText('Finaliser le document',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:/Déposer sur/}).count(),0);assert.equal(await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).count(),0);
 // Auto-save the edited fields before freezing the final snapshot.
 await page.getByLabel('Objet du document',{exact:true}).fill('Devis ajusté et finalisé');
 await page.getByRole('button',{name:'Statut du document',exact:true}).click();await page.getByRole('menuitem',{name:'Finalisé',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Finaliser',exact:true}).click();
 await page.getByRole('button',{name:'Statut du document',exact:true}).filter({hasText:'À reprendre'}).waitFor();
 await page.getByRole('button',{name:'Reprendre',exact:true}).click();await page.getByRole('button',{name:'Facturer',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('button[aria-label="Statut du document"]')?.textContent==='Finalisé');
 assert.equal(await page.getByRole('button',{name:'Facturer',exact:true}).isEnabled(),true);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).click();assert.doesNotMatch((await download).suggestedFilename(),/brouillon/);
 await page.getByRole('button',{name:'Facturer',exact:true}).click();await page.getByLabel('Origine de l’accord',{exact:true}).fill('Accord fictif pour test local');await page.getByRole('button',{name:'Confirmer et facturer',exact:true}).click();await page.getByLabel('Statut du document',{exact:true}).filter({hasText:'Brouillon'}).waitFor();assert.equal(await page.getByLabel('Statut du document',{exact:true}).textContent(),'Brouillon');
 await page.getByLabel('Date d’échéance',{exact:true}).fill('2027-01-30');
 // Electronic-only data can be absent at finalization. The review block stays out of the editor.
 assert.equal(await page.locator('.bill-review').count(),0);
 assert.equal(await page.getByRole('button',{name:'Créer le Factur-X',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).count(),0);
 const row=await preview.ctx.db.prepare("SELECT id,data_json FROM billing_documents WHERE kind='invoice'").first();
 // Clear routing using the UI's editable draft (not direct database mutation).
 await page.evaluate(()=>{const fields=document.querySelectorAll('input');for(const field of fields){if(field.closest('[data-billing-path]')?.dataset.billingPath?.includes('electronicAddress')){const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(field,'');field.dispatchEvent(new Event('input',{bubbles:true}));}}});
 await page.getByRole('button',{name:'Statut du document',exact:true}).click();await page.getByRole('menuitem',{name:'Finalisé',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Finaliser',exact:true}).click();
 await page.getByLabel('Statut du document',{exact:true}).filter({hasText:'À régler'}).waitFor();
 await page.getByLabel('Statut du document',{exact:true}).click();await page.getByRole('menuitem',{name:'Réglée',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmer le règlement',exact:true}).click();
 await page.getByLabel('Statut du document',{exact:true}).filter({hasText:'Réglée'}).waitFor();
 assert.equal((await (await preview.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/documents/'+row.id,{headers})).json()).settlement.dueMinor,'0');
 await page.getByLabel('Statut du document',{exact:true}).click();await page.getByRole('menuitem',{name:'À régler',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmer la correction',exact:true}).click();
 await page.getByLabel('Statut du document',{exact:true}).filter({hasText:'À régler'}).waitFor();
 const corrected=await (await preview.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/documents/'+row.id,{headers})).json();assert.equal(corrected.settlement.netPaidMinor,'0');assert.equal(corrected.settlement.version,2);
 assert.equal(await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Créer le Factur-X',exact:true}).count(),1);
 await page.getByRole('button',{name:'Créer le Factur-X',exact:true}).click();await page.waitForFunction(()=>qaFacturx.some(id=>id.startsWith('billing:')));
 const saved=await page.evaluate(()=>Object.values(state.billingFacturx)[0]);assert.equal(saved.nativeDocumentId,row.id);assert.equal(saved.facturxDraft.number,saved.number);assert.equal(await page.locator('[data-imported-invoice="billing:'+row.id+'"]').count(),0);
 // Exercise the real embedded converter with a synthetic import response and no external request.
 await page.route('https://cdinnov-facturx.onrender.com/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  assert.ok(['/api/health','/api/facturx/import-pdf'].includes(path),'Unexpected converter request '+path);
  if(path==='/api/health')return route.fulfill({json:{ready:true},headers:{'Access-Control-Allow-Origin':preview.base}});
  const sha=await page.evaluate(()=>Object.values(state.billingFacturx)[0].pdfSource.sha256);
  return route.fulfill({json:{source_sha256:sha,pages:1,preview_image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=',invoice:saved.facturxDraft,text:'Document de test',warnings:[]},headers:{'Access-Control-Allow-Origin':preview.base}});
 });
 await page.evaluate(async id=>{facturxEnsureAuth=async()=>null;await qaOpenFacturX(id);},'billing:'+row.id);
 const converter=page.frameLocator('#facturxFrame');await converter.locator('#quick-review').waitFor();
 assert.equal(await converter.locator('input[name="number"]').inputValue(),saved.number);
 await page.screenshot({path:'platform/.private/sheets-workflow-20261023c/facturx-native-modal.png'});
 // Even the converter's direct download path must not create a different financial document.
 await converter.locator('input[name="number"]').evaluate(el=>{el.value='CHANGED';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await converter.locator('#invoice-form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await converter.getByText('Les prestations, le numéro, la date et les montants doivent rester identiques au PDF finalisé. Vous pouvez compléter les coordonnées électroniques.',{exact:true}).waitFor();
 await page.evaluate(()=>closeModal());
 assert.equal(await page.getByRole('button',{name:/Déposer sur/}).count(),0);
 await page.screenshot({path:'platform/.private/sheets-workflow-20261023c/finalise-test.png'});assert.deepEqual(errors,[]);
 console.log('OK workflow: historical edit/delete/converter, auto-save, failed generation retry, quote agreement/conversion, PDF download, native Factur-X handoff and separate electronic metadata. Synthetic local documents only.');
}catch(e){const p=browser.contexts()[0]?.pages()[0];if(p){console.log((await p.locator('.bill-app').innerText()).slice(0,3500));await p.screenshot({path:'platform/.private/sheets-workflow-20261023c/workflow-failure.png'});}console.log(preview.requests.slice(-12));throw e;}finally{await browser.close();await preview.close();}
