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
 if(path.endsWith('/preflight'))return Response.json({valid:true,snapshotSha256:hash(billingCanonicalJSON({schemaVersion:1,document:payload.document,totals:calculateBilling(payload.document)})),checks:{render:true,amounts:true,xsd:true,schematron:true,france:true}});
 if(path.endsWith('/preview-pdf'))return new Response(samplePDF(),{headers:{'content-type':'application/pdf'}});
 if(failedFinalization){failedFinalization=false;return new Response('synthetic retry test',{status:503});}
 const pdf=samplePDF(),xml=Buffer.from('<synthetic/>'),report=Buffer.from(JSON.stringify({valid:true,profile:'en16931',envelope_sha256:payload.envelopeSha256,pdf_sha256:hash(pdf),xml_sha256:hash(xml),checks:{structured_source:true,amounts:true,xsd:true,schematron:true,france:true,embedding:true,pdfa_3b:true},pdf_differences_acknowledged:false}));
 const artifacts=(payload.document.kind==='quote'?[['pdf',pdf,'application/pdf']]:[['pdf',pdf,'application/pdf'],['xml',xml,'application/xml'],['validation',report,'application/json'],['verapdf',xml,'application/xml']]).map(([kind,bytes,contentType])=>({kind,sha256:hash(bytes),size:bytes.length,contentType,base64:bytes.toString('base64')}));
 return Response.json({schemaVersion:1,envelopeSha256:payload.envelopeSha256,generatorVersion:'synthetic-workflow-test',profile:payload.document.kind==='quote'?'quote-pdf':'en16931',artifacts});
}});
const browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});
await mkdir('platform/.private/refinement-20261023b',{recursive:true});
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
 await page.screenshot({path:'platform/.private/refinement-20261023b/liste-test.png'});
 await page.setViewportSize({width:390,height:844});const importedRow=page.locator('[data-imported-invoice="invoice-1"]');const docBox=await importedRow.locator('[data-column=document]').boundingBox(),actionBox=await importedRow.locator('[data-column=action]').boundingBox();assert.ok(actionBox.y>docBox.y+docBox.height);assert.ok(actionBox.x+actionBox.width<=390);await page.screenshot({path:'platform/.private/refinement-20261023b/mobile-test.png'});await page.setViewportSize({width:1600,height:1050});
 await page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:'Devis',exact:true}).click();await page.getByRole('button',{name:/Devis parcours finalisation/}).first().click();await page.getByLabel('Statut du document',{exact:true}).waitFor();await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).waitFor();console.log('Historical actions verified; checking finalization.');
 assert.equal(await page.getByText('Finaliser le document',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:/Déposer sur/}).count(),0);assert.equal(await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).count(),1);
 // Auto-save the edited fields before freezing the final snapshot.
 await page.getByLabel('Objet du document',{exact:true}).fill('Devis ajusté et finalisé');
 await page.getByRole('button',{name:'Statut du document',exact:true}).click();await page.getByRole('menuitem',{name:'Finalisé',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Finaliser',exact:true}).click();
 await page.getByRole('button',{name:'Statut du document',exact:true}).filter({hasText:'À reprendre'}).waitFor();
 await page.getByRole('button',{name:'Reprendre',exact:true}).click();await page.getByRole('button',{name:'Facturer',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('button[aria-label="Statut du document"]')?.textContent==='Finalisé');
 assert.equal(await page.getByRole('button',{name:'Facturer',exact:true}).isEnabled(),true);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).click();assert.doesNotMatch((await download).suggestedFilename(),/brouillon/);
 await page.getByRole('button',{name:'Facturer',exact:true}).click();await page.getByLabel('Origine de l’accord',{exact:true}).fill('Accord fictif pour test local');await page.getByRole('button',{name:'Confirmer et facturer',exact:true}).click();await page.getByRole('button',{name:'Créer le Factur-X',exact:true}).waitFor();assert.equal(await page.getByLabel('Statut du document',{exact:true}).textContent(),'Brouillon');
 await page.getByLabel('Date d’échéance',{exact:true}).fill('2027-01-30');
 const fx=page.waitForEvent('download');await page.getByRole('button',{name:'Créer le Factur-X',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Finaliser',exact:true}).click();assert.match((await fx).suggestedFilename(),/-facturx\.pdf$/);
 assert.equal(await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Télécharger le Factur-X',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:/Déposer sur/}).count(),0);
 await page.screenshot({path:'platform/.private/refinement-20261023b/finalise-test.png'});assert.deepEqual(errors,[]);
 console.log('OK workflow: historical edit/delete/converter, auto-save, failed generation retry, quote agreement/conversion, PDF and Factur-X downloads. Synthetic local documents only.');
}catch(e){const p=browser.contexts()[0]?.pages()[0];if(p){console.log((await p.locator('.bill-app').innerText()).slice(0,3500));await p.screenshot({path:'platform/.private/refinement-20261023b/workflow-failure.png'});}console.log(preview.requests.slice(-12));throw e;}finally{await browser.close();await preview.close();}
