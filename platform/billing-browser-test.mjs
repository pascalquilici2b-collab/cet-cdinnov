import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {billingPreview} from './billing-preview.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const out=process.env.PORTAL_QA;assert.ok(out,'Private PORTAL_QA output directory required');await mkdir(out,{recursive:true});
const preview=await billingPreview(),browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[],warnings=[],step=message=>console.log('OK '+message);let activePage;
try{
 const context=await browser.newContext({viewport:{width:1550,height:1100},locale:'fr-FR'});
 await context.route('**/*',route=>route.request().url().startsWith(preview.base+'/')||route.request().url().startsWith('data:')?route.continue():route.abort());
 const page=activePage=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/React|flushSync|unmount/i.test(m.text()))warnings.push(m.text());});
 const save=async()=>{await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();await page.getByRole('status').filter({hasText:'Brouillon enregistré.'}).waitFor();};
 const records=async()=> (await preview.ctx.db.prepare('SELECT * FROM billing_documents ORDER BY created_at,id').all()).results;
 const expectTitle=async value=>assert.equal(await page.getByLabel('Objet du document',{exact:true}).inputValue(),value);
 await page.goto(preview.base);await page.locator('[data-react-billing]').waitFor();
 await page.getByText('Votre prochaine facture commence ici',{exact:true}).waitFor();
 step('Démarrage réel du portail et liste de facturation');
 assert.equal(await page.locator('[data-react-finance]').count(),0);
 await page.getByRole('button',{name:'Nouvelle facture',exact:true}).first().click();
 await page.getByLabel('Objet du document',{exact:true}).fill('Accompagnement technique — octobre');
 assert.match(await page.locator('.bill-paper-grand').innerText(),/À compléter/);
 await page.getByLabel('Émetteur — Raison sociale',{exact:true}).fill('Atelier de démonstration');
 await page.getByLabel('Émetteur — Adresse',{exact:true}).fill('1 rue de la Démonstration');
 await page.getByLabel('Émetteur — Code postal',{exact:true}).fill('20000');
 await page.getByLabel('Émetteur — Ville',{exact:true}).fill('Ajaccio');
 await page.getByLabel('Émetteur — N° de TVA',{exact:true}).fill('FR00123456789');
 await page.getByLabel(/^Retrouver un client/).selectOption('client-test');
 await page.getByLabel('Client — Adresse',{exact:true}).fill('2 avenue du Test');
 await page.getByLabel('Client — Code postal',{exact:true}).fill('20200');
 await page.getByLabel('Client — Ville',{exact:true}).fill('Bastia');
 await page.getByLabel('Description',{exact:true}).fill('Suivi de projet et assistance technique');
 await page.getByLabel('Quantité',{exact:true}).fill('3,875');
 await page.getByLabel('Prix unitaire HT (€)',{exact:true}).fill('620');
 assert.match((await page.locator('.bill-paper-grand').innerText()).replace(/[\u00a0\u202f]/g,' '),/2 883,00 €/);
 await page.getByLabel('Date d’échéance',{exact:true}).fill('2026-11-20');
 await save();let rows=await records();assert.equal(rows.length,1);const firstId=rows[0].id;
 assert.equal(JSON.parse(rows[0].totals_json).grossMinor,'288300');
 await page.locator('.bill-editor').evaluate(el=>el.scrollTop=0);await page.screenshot({path:join(out,'billing-editor-desktop.png'),fullPage:true});
 await page.evaluate(()=>{CDITheme.set('dark');window.scrollTo(0,0);});
 assert.equal(await page.locator('.bill-paper').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
 assert.equal(await page.locator('.bill-paper-object').evaluate(el=>getComputedStyle(el).color),'rgb(35, 60, 52)');
 assert.notEqual(await page.getByLabel('Objet du document',{exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
 await page.screenshot({path:join(out,'billing-editor-dark.png'),fullPage:false});await page.evaluate(()=>CDITheme.set('light'));
 step('Création avec aperçu, données client, quantités fractionnées, sauvegarde réelle');

 await page.getByLabel('Objet du document',{exact:true}).fill('Ma saisie non enregistrée');
 page.once('dialog',dialog=>dialog.dismiss());await page.evaluate(()=>setView('dashboard'));
 assert.equal(await page.evaluate(()=>currentView),'facturier');await expectTitle('Ma saisie non enregistrée');
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('.bill-nav').getByRole('button',{name:/^Devis/}).click();await expectTitle('Ma saisie non enregistrée');
 const serverData={...JSON.parse(rows[0].data_json),title:'Modification dans un autre onglet'};
 const external=await preview.ctx.worker.dispatchFetch('https://preview.example/api/v1/billing/documents/'+firstId,{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+preview.sessions[0].token,'Content-Type':'application/json','If-Match':'1'},body:JSON.stringify({data:serverData})});assert.equal(external.status,200);
 await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();await page.getByRole('alert').filter({hasText:'Ce document a changé'}).waitFor();await expectTitle('Ma saisie non enregistrée');
 await page.getByRole('button',{name:'Conserver dans un nouveau brouillon',exact:true}).click();await page.getByRole('status').filter({hasText:'Votre saisie a été enregistrée'}).waitFor();
 rows=await records();assert.equal(rows.length,2);assert.equal(JSON.parse(rows.find(r=>r.id===firstId).data_json).title,'Modification dans un autre onglet');
 await page.locator('.bill-back').click();await page.getByLabel('Rechercher un document',{exact:true}).fill('Ma saisie');
 await page.waitForFunction(()=>document.querySelectorAll('.bill-list-table tbody tr').length===1);
 await page.locator('.bill-document-link').click();await expectTitle('Ma saisie non enregistrée');
 step('Navigation protégée, conflit réel sans perte, copie indépendante, recherche et réouverture');

 await page.locator('.bill-nav').getByRole('button',{name:/^Devis/}).click();await page.getByRole('button',{name:'Nouveau devis',exact:true}).first().click();
 await page.getByLabel('Objet du document',{exact:true}).fill('Devis de démonstration');
 await page.getByLabel('Valable jusqu’au',{exact:true}).fill('2026-11-30');
 await page.getByLabel('Client — Raison sociale',{exact:true}).fill('Client du devis');
 await page.getByLabel('Description',{exact:true}).fill('Étude préalable');
 await page.getByLabel('Quantité',{exact:true}).fill('2');await page.getByLabel('Prix unitaire HT (€)',{exact:true}).fill('100');await save();
 rows=await records();const quote=rows.find(r=>r.kind==='quote');assert.ok(quote);
 // Let the server complete once, then lose the response: the retry must recover that same invoice.
 let lost=false;
 await page.route('**/api/v1/billing/documents/*/convert',async route=>{if(!lost){lost=true;const response=await route.fetch();assert.equal(response.status(),201);await route.abort('failed');}else await route.continue();});
 await page.getByRole('button',{name:'Créer une facture',exact:true}).click();await page.getByRole('alert').filter({hasText:'L’action n’a pas abouti'}).waitFor();
 await page.getByRole('button',{name:'Créer une facture',exact:true}).click();await page.getByRole('status').filter({hasText:'Un brouillon de facture a été créé'}).waitFor();
 rows=await records();assert.equal(rows.filter(r=>r.source_document_id===quote.id).length,1);assert.equal(JSON.parse(rows.find(r=>r.id===quote.id).data_json).kind,'quote');
 await page.unroute('**/api/v1/billing/documents/*/convert');
 assert.equal(JSON.parse(rows.find(r=>r.source_document_id===quote.id).totals_json).grossMinor,'24000');
 step('Conversion devis → facture et reprise après réponse perdue sans doublon');

 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});await page.getByRole('button',{name:'Aperçu',exact:true}).click();
  assert.ok(await page.locator('.bill-preview').isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No viewport overflow at '+width);
  if(width===390)await page.screenshot({path:join(out,'billing-editor-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'Saisie',exact:true}).click();await expectTitle('Devis de démonstration');
 }
 await page.setViewportSize({width:1550,height:1100});
 await page.locator('.bill-legacy summary').click();await page.getByRole('button',{name:'Historique des factures & Factur-X',exact:true}).click();
 await page.locator('[data-react-finance="facturier"]').waitFor();assert.equal(await page.locator('#billingRoot').count(),0);
 await page.getByRole('button',{name:'Créer un Factur-X à partir du PDF',exact:true}).click();assert.deepEqual(await page.evaluate(()=>qaFacturx),['invoice-1']);
 // A payment-only edit must preserve a historical Factur-X snapshot and its download action.
 const oldSnapshot=await page.evaluate(()=>{const f=factures()[0];f.facturx={snapshot:JSON.stringify([f.id,f.number,f.dateFacture,f.client,f.code,String(f.ht),String(f.ttc),f.datePaiement,f.pdfSource.sha256]),pdfUrl:'data:application/pdf;base64,JVBERi0xLjc=',filename:'fixture.pdf'};renderFacturier();return f.facturx.snapshot;});
 await page.locator('tbody tr').filter({hasText:'F-2026-001'}).getByRole('button',{name:'Modifier',exact:true}).click();
 await page.locator('#fvPay').fill('2026-10-20');await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.locator('#overlay').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>factures()[0].facturx?.snapshot),oldSnapshot);assert.equal(await page.getByRole('button',{name:'Télécharger le Factur-X validé',exact:true}).count(),1);
 await page.locator('.billing-nav').getByRole('button',{name:'Facturation',exact:true}).click();await page.locator('[data-react-billing]').waitFor();
 step('Mobile 390/320 px et accès conservé au Factur-X des factures importées');

 // A slow logout cannot accept new edits after its unsaved-changes check.
 await page.getByRole('button',{name:'Ouvrir Modification dans un autre onglet',exact:true}).click();await expectTitle('Modification dans un autre onglet');
 await page.evaluate(()=>{cloudEnabled=()=>true;portalClean='pending-sync';cloudPush=()=>new Promise(resolve=>window.qaSyncComplete=resolve);});
 await page.locator('#userChip .uc-logout').click();await page.waitForFunction(()=>billingLogoutPending&&document.getElementById('content').inert);
 await page.evaluate(()=>{document.querySelector('.bill-editor input').focus();setView('dashboard');});
 assert.equal(await page.evaluate(()=>currentView),'facturier');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#content')),false);
 await page.evaluate(()=>qaSyncComplete(false));await page.waitForFunction(()=>!billingLogoutPending);assert.equal(await page.locator('#content').evaluate(el=>el.inert),false);await expectTitle('Modification dans un autre onglet');
 await page.evaluate(()=>{cloudEnabled=()=>false;portalClean='';});await page.locator('.bill-back').click();
 step('Déconnexion lente : saisie gelée, navigation bloquée et brouillon conservé en cas d’échec');

 // Logout while a document response is in flight must dispose the UI and ignore that response.
 let finish;const held=new Promise(r=>finish=r);let started;
 const starting=new Promise(r=>started=r);
 await page.route('**/api/v1/billing/documents/'+firstId,async route=>{const response=await route.fetch();started();await held;await route.fulfill({response}).catch(()=>{});});
 await page.getByRole('button',{name:'Ouvrir Modification dans un autre onglet',exact:true}).click();await starting;
 await page.locator('#userChip .uc-logout').click();finish();
 await page.waitForFunction(()=>!document.body.classList.contains('authed'));
 assert.equal(await page.locator('[data-react-billing]').count(),0);assert.equal(await page.evaluate(()=>AUTH_USER),null);
 assert.equal(await page.locator('#content').innerText(),'');assert.deepEqual(await page.evaluate(()=>qaNotifications),[]);
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
 step('Déconnexion et réponse tardive : aucune donnée réaffichée, aucun envoi');
 console.log(JSON.stringify({requests:preview.requests.length,javascriptErrors:errors,reactWarnings:warnings,screenshots:out}));
}catch(error){console.error(JSON.stringify({errors,warnings}));if(activePage)await activePage.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{await browser.close();await preview.close();}
