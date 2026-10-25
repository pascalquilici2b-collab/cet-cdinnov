import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixture,quoteFixtureTools,samplePDF} from './billing-quote-fixture.mjs';
import {blankDocumentDetails,defaultPaymentTerms} from './billing-domain.ts';
import {billingToday} from './billing-quote-domain.ts';

const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium,expect}=require('playwright/test'),out='platform/.private/document-actions-20261025/ui';
await mkdir(out,{recursive:true});
const preview=await billingPreview({outboundService:async()=>new Response(samplePDF(),{headers:{'Content-Type':'application/pdf'}})}),browser=await chromium.launch({channel:'msedge',headless:true});let page;
try{
 const {create:createFixture,call,input,send}=await quoteFixtureTools(preview.ctx,preview.sessions[0].token,{endDate:'2020-12-31'});
 const create=(data,ready=true)=>createFixture({...data,paymentMeans:'30',paymentTerms:defaultPaymentTerms,details:{...blankDocumentDetails(),validityMonths:'',returnEmail:'cdi@cdinnov.com'}},ready);
 const source=await create({...quoteFixture('Devis navigation et versions'),issueDate:'2020-01-01'});
 const draft=await create({...quoteFixture('Devis brouillon supprimable'),issueDate:billingToday()},false);
 const invoice=await create({...quoteFixture('Facture navigation'),kind:'invoice',issueDate:billingToday()},false);
 const get=async id=>(await call('/documents/'+id)).json();
 const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'fr-FR'});
 await context.route('**/*',r=>r.request().url().startsWith(preview.base+'/')||/^(blob:|data:)/.test(r.request().url())?r.continue():r.abort());
 page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const nav=name=>page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name,exact:true});
 const row=title=>page.locator('.bill-list-table tbody tr').filter({has:page.locator('[data-column=label]',{hasText:title})});
 const success=page.locator('.cdi-action-success,.cdi-button-success');
 await page.goto(preview.base);await nav('Devis').click();
 // Clicking a plain cell opens finalized and draft documents; actions never open the row.
 await row(source.data.title).locator('[data-column=client]').click();await expect(page.getByRole('button',{name:'Télécharger le PDF',exact:true})).toBeVisible();
 const versions=page.getByRole('region',{name:'Versions du devis'});
 await versions.getByRole('button',{name:'Préparer une nouvelle version',exact:true}).click();await versions.getByLabel('Motif de la nouvelle version',{exact:true}).fill('Périmètre ajusté');
 await versions.getByRole('button',{name:'Créer la nouvelle version',exact:true}).click();await expect(success).toContainText('Nouvelle version créée');
 let current=await get((await get(source.id)).quote.revision.currentId);assert.equal(current.quote.revision.ordinal,2);
 const version=page.getByRole('combobox',{name:'Version du devis',exact:true});await expect(version).toContainText('Version 2');
 await version.click();await expect(page.getByRole('option',{name:/Version 2/}).locator('.bill-version-current')).toBeVisible();
 await page.getByRole('option',{name:/Version 1/}).click();await expect(versions.getByRole('heading',{name:'Version précédente',exact:true})).toBeVisible();
 await version.click();await page.getByRole('option',{name:/Version 2/}).click();
 await expect(page.getByLabel('Objet du document',{exact:true})).toHaveValue(source.data.title);
 await page.getByLabel('Objet du document',{exact:true}).fill('Version 2 ajustée');
 const save=page.getByRole('button',{name:'Enregistrer',exact:true});await save.click();await expect(success).toContainText('Enregistré');
 const buttonBox=await save.boundingBox(),checkBox=await success.boundingBox();assert.ok(Math.abs(buttonBox.y+buttonBox.height/2-checkBox.y-checkBox.height/2)<8,'Confirmation at save button height');
 await expect(page.locator('.bill-message-success')).toHaveCount(0);
 await page.screenshot({path:out+'/save-light.png'});
 await page.evaluate(()=>CDITheme.set('dark'));await page.screenshot({path:out+'/save-dark.png'});
 await version.click();await page.locator('.bill-version-options').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished)));await page.screenshot({path:out+'/versions-dark.png'});await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await version.scrollIntoViewIfNeeded();await version.click();await page.locator('.bill-version-options').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished)));await page.screenshot({path:out+'/versions-mobile.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.keyboard.press('Escape');await page.setViewportSize({width:1500,height:1000});
 await nav('Devis').click();await row(draft.data.title).focus();await page.keyboard.press('Enter');await expect(page.getByLabel('Objet du document',{exact:true})).toHaveValue(draft.data.title);
 // A rejected save retains the editor and does not display success.
 await page.getByLabel('Objet du document',{exact:true}).fill('Modification refusée');await page.evaluate(()=>document.querySelectorAll('.cdi-action-success').forEach(e=>e.remove()));
 await page.route('**/api/v1/billing/documents/'+draft.id,route=>route.request().method()==='PUT'?route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:'Refus synthétique'})}):route.continue());
 await save.click();await expect(page.getByRole('alert')).toContainText('Refus synthétique');await expect(success).toHaveCount(0);await page.unroute('**/api/v1/billing/documents/'+draft.id);
 await save.click();await expect(success).toContainText('Enregistré');await nav('Devis').click();
 let draftRow=row('Modification refusée');await draftRow.getByRole('button',{name:/Supprimer le devis/}).click();
 let dialog=page.getByRole('dialog',{name:'Supprimer ce devis ?',exact:true});await expect(dialog).toBeVisible();await expect(page.getByLabel('Objet du document',{exact:true})).toHaveCount(0);await dialog.getByRole('button',{name:'Supprimer',exact:true}).click();await expect(draftRow).toHaveCount(0);
 await page.getByLabel('Filtrer par statut').selectOption('trash');await page.getByRole('button',{name:/Restaurer le devis/}).click();await expect(success).toContainText('Document restauré');await page.getByLabel('Filtrer par statut').selectOption('all');await expect(row('Modification refusée')).toBeVisible();
 // Finalized quote deletion is reversible and preserves all archived versions/files.
 await page.getByLabel('Filtrer par statut').selectOption('previous');const originalRow=row(source.data.title);
 await originalRow.getByRole('button',{name:/Supprimer le devis/}).click();await page.getByRole('dialog',{name:'Supprimer ce devis ?',exact:true}).getByRole('button',{name:'Supprimer',exact:true}).click();await expect(originalRow).toHaveCount(0);
 const list=await(await call('/documents/'+current.id+'/quote-versions')).json();assert.equal(!!list.versions.find(v=>v.id===source.id).trashed,true);
 assert.equal((await call('/documents/'+source.id)).status,410);
 await page.getByLabel('Filtrer par statut').selectOption('trash');await page.getByRole('button',{name:/Restaurer le devis/}).click();await expect(success).toContainText('Document restauré');assert.equal((await get(source.id)).issuance.number,source.issuance.number);
 await page.getByLabel('Filtrer par statut').selectOption('previous');await originalRow.locator('[data-column=label]').click();await expect(version).toContainText('Version 1');
 // An independent quote accepts one of the structured agreement origins from the list.
 const acceptance=await create({...quoteFixture('Accord avec origine'),issueDate:'2020-01-01'});
 await nav('Factures').click();await nav('Devis').click();await row(acceptance.data.title).getByRole('button',{name:'Statut du document',exact:true}).click();await page.getByRole('menuitem',{name:'Accepté',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Accepter le devis',exact:true});await expect(dialog.locator('textarea')).toHaveCount(0);await dialog.getByLabel('Origine de l’accord',{exact:true}).selectOption('Bon de commande');await dialog.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(row(acceptance.data.title).getByRole('button',{name:'Statut du document',exact:true})).toContainText('Accepté');
 const events=await(await call('/documents/'+acceptance.id+'/quote-events')).json();assert.equal(events.events[0].note,'Bon de commande');
 await row(acceptance.data.title).locator('[data-column=date]').click();await expect(page.getByRole('button',{name:'Télécharger le PDF',exact:true})).toBeVisible();
 // Native invoice rows and imported quick-edit forms have the same direct access.
 await nav('Factures').click();await row(invoice.data.title).locator('[data-column=label]').click();await expect(page.getByLabel('Objet du document',{exact:true})).toHaveValue(invoice.data.title);await nav('Factures').click();
 const imported=page.locator('tr[data-imported-invoice]').first();await imported.locator('[data-column=client]').click();await expect(page.getByRole('heading',{name:'Modifier la facture',exact:true})).toBeVisible();await expect(page.locator('#fvPdfInput')).toHaveCount(0);await page.getByRole('button',{name:'Annuler',exact:true}).click();
 assert.deepEqual(errors,[]);console.log({ok:true,rowNavigation:true,actionIsolation:true,versionSelect:true,successNearButton:true,rejectedSaveNoSuccess:true,quoteTrashRestore:true,agreementOrigin:true,quickEditNoUpload:true});
}catch(error){if(page){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});await writeFile(out+'/failure.txt',await page.locator('body').innerText());}throw error;}finally{await browser.close();await preview.close();}
