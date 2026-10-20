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
 const pdfFixture=Buffer.from('%PDF-1.7\n% Local synthetic download fixture only\n%%EOF\n');
 let pdfMode='success',pdfRequests=0;const downloads=[];page.on('download',download=>downloads.push(download));
 await page.route('**/api/v1/billing/documents/*/preview.pdf',async route=>{pdfRequests++;assert.match(route.request().headers()['if-match']||'',/^\d+$/);await route.fulfill(pdfMode==='success'?{status:200,contentType:'application/pdf',body:pdfFixture}:{status:503,contentType:'application/json',body:JSON.stringify({error:'Service PDF indisponible pour démonstration.'})});});
 const pdfButton=()=>page.getByRole('button',{name:'Télécharger le PDF brouillon',exact:true});
 const downloadPDF=async filename=>{const pending=page.waitForEvent('download');await pdfButton().click();const download=await pending;assert.equal(download.suggestedFilename(),filename);const stream=await download.createReadStream(),parts=[];for await(const chunk of stream)parts.push(chunk);assert.deepEqual(Buffer.concat(parts),pdfFixture);await page.getByRole('status').filter({hasText:'Téléchargement du PDF brouillon lancé.'}).waitFor();};
 const save=async()=>{await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();await page.getByRole('status').filter({hasText:'Brouillon enregistré.'}).waitFor();};
 const records=async()=> (await preview.ctx.db.prepare('SELECT * FROM billing_documents ORDER BY created_at,id').all()).results;
 const expectTitle=async value=>assert.equal(await page.getByLabel('Objet du document',{exact:true}).inputValue(),value);
 await page.goto(preview.base);await page.locator('[data-react-billing]').waitFor();
 await page.getByText('Votre prochaine facture commence ici',{exact:true}).waitFor();
 step('Démarrage réel du portail et liste de facturation');
 assert.equal(await page.locator('[data-react-finance]').count(),0);
 await page.getByRole('button',{name:'Nouvelle facture',exact:true}).first().click();
 assert.equal(await pdfButton().isDisabled(),true);assert.equal(pdfRequests,0);
 await page.getByText('Enregistrez le brouillon avant le téléchargement.',{exact:true}).waitFor();
 await page.getByLabel('Objet du document',{exact:true}).fill('Accompagnement technique — octobre');
 assert.match(await page.locator('.bill-paper-grand').innerText(),/À compléter/);
 await page.getByLabel('Émetteur — Raison sociale',{exact:true}).fill('Atelier de démonstration');
 await page.getByLabel('Émetteur — Adresse',{exact:true}).fill('1 rue de la Démonstration');
 await page.getByLabel('Émetteur — Code postal',{exact:true}).fill('20000');
 await page.getByLabel('Émetteur — Ville',{exact:true}).fill('Ajaccio');
 await page.getByLabel('Émetteur — N° de TVA',{exact:true}).fill('FR00123456789');
 await page.getByRole('button',{name:'Choisir un client',exact:true}).click();await page.getByRole('dialog',{name:'Choisir un client',exact:true}).getByRole('button',{name:'Choisir Client fictif',exact:true}).click();
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
 await downloadPDF('facture-brouillon.pdf');assert.equal(pdfRequests,1);
 pdfMode='error';await pdfButton().click();await page.getByRole('alert').filter({hasText:'Service PDF indisponible'}).waitFor();
 await expectTitle('Accompagnement technique — octobre');assert.equal(downloads.length,1);assert.equal((await records())[0].version,1);pdfMode='success';
 await page.locator('.bill-editor').evaluate(el=>el.scrollTop=0);await page.screenshot({path:join(out,'billing-editor-desktop.png'),fullPage:true});
 await page.evaluate(()=>{CDITheme.set('dark');window.scrollTo(0,0);});
 assert.equal(await page.locator('.bill-paper').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
 assert.equal(await page.locator('.bill-paper-object').evaluate(el=>getComputedStyle(el).color),'rgb(35, 60, 52)');
 assert.notEqual(await page.getByLabel('Objet du document',{exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
 await page.screenshot({path:join(out,'billing-editor-dark.png'),fullPage:false});await page.evaluate(()=>CDITheme.set('light'));
 step('Création avec aperçu, données client, quantités fractionnées, sauvegarde réelle');

 await page.getByLabel('Objet du document',{exact:true}).fill('Ma saisie non enregistrée');
 assert.equal(await pdfButton().isDisabled(),true);assert.equal(pdfRequests,2);
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

 // Settings use their own optimistic version and are copied only into new documents.
 const settingsButton=()=>page.getByRole('button',{name:'Paramètres de facturation',exact:true});
 const settingsPanel=()=>page.getByRole('region',{name:'Paramètres de facturation',exact:true});
 const fetchSettings=async()=>{
  const response=await preview.ctx.worker.dispatchFetch('https://preview.example/api/v1/billing/settings',{headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+preview.sessions[0].token}});
  assert.equal(response.status,200);return response.json();
 };
 const saveDefaults=async()=>{await page.getByRole('button',{name:'Enregistrer les paramètres',exact:true}).click();await page.getByRole('status').filter({hasText:'Paramètres enregistrés. Ils seront repris'}).waitFor();};
 const existingBeforeSettings=(await records()).find(r=>r.id===firstId).data_json;
 await settingsButton().click();await settingsPanel().getByLabel('Émetteur — Raison sociale',{exact:true}).fill('Entreprise des paramètres');
 await page.getByLabel('Émetteur — Adresse',{exact:true}).fill('8 rue des Paramètres');
 await page.getByLabel('Émetteur — Code postal',{exact:true}).fill('20000');await page.getByLabel('Émetteur — Ville',{exact:true}).fill('Ajaccio');
 await page.getByLabel('Émetteur — SIREN',{exact:true}).fill('123456789');await page.getByLabel('Émetteur — SIRET',{exact:true}).fill('12345678900012');
 await page.getByLabel('Émetteur — N° de TVA',{exact:true}).fill('FR00123456789');
 await settingsPanel().locator('summary').filter({hasText:'Adresse de facturation électronique'}).click();
 await page.getByLabel('Émetteur — Adresse de facturation électronique',{exact:true}).fill('123456789');
 await page.getByLabel('Émetteur — Type d’adresse électronique',{exact:true}).fill('0225');
 await page.getByLabel('Mode de paiement',{exact:true}).selectOption('58');await page.getByLabel('Exigibilité de la TVA',{exact:true}).selectOption('payment');
 await page.getByLabel('Mode de facturation',{exact:true}).selectOption('S1');
 await page.getByLabel('Conditions de paiement',{exact:true}).fill('Règlement de démonstration à 30 jours');
 await page.getByLabel('IBAN',{exact:true}).fill('FR7630006000011234567890189');await page.getByLabel('BIC',{exact:true}).fill('AGRIFRPP');
 await settingsPanel().locator('summary').filter({hasText:'Mentions de paiement'}).click();
 await page.getByLabel('Indemnité de recouvrement',{exact:true}).fill('Mention de recouvrement de démonstration');
 await page.getByLabel('Pénalités de retard',{exact:true}).fill('Mention de pénalités de démonstration');
 await page.getByLabel('Escompte',{exact:true}).fill('Mention d’escompte de démonstration');
 await saveDefaults();const settingsV1=await fetchSettings();assert.equal(settingsV1.version,1);assert.equal(settingsV1.data.seller.electronicScheme,'0225');
 assert.equal((await records()).find(r=>r.id===firstId).data_json,existingBeforeSettings);
 await page.reload();await page.locator('[data-react-billing]').waitFor();await settingsButton().click();
 assert.equal(await page.getByLabel('Émetteur — Raison sociale',{exact:true}).inputValue(),'Entreprise des paramètres');
 assert.equal(await page.getByLabel('Mode de paiement',{exact:true}).inputValue(),'58');
 assert.equal(await page.getByLabel('Mode de facturation',{exact:true}).inputValue(),'S1');
 await settingsPanel().locator('summary').filter({hasText:'Adresse de facturation électronique'}).click();
 assert.equal(await page.getByLabel('Émetteur — Adresse de facturation électronique',{exact:true}).inputValue(),'123456789');
 await settingsPanel().locator('summary').filter({hasText:'Mentions de paiement'}).click();
 assert.equal(await page.getByLabel('Escompte',{exact:true}).inputValue(),'Mention d’escompte de démonstration');
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(out,'billing-settings-desktop.png'),fullPage:true});
 for(const theme of ['dark','light']){
  await page.evaluate(theme=>CDITheme.set(theme),theme);
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Settings overflow '+theme+' '+width);
   if(width===390){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(out,'billing-settings-mobile-'+theme+'.png'),fullPage:true});}
  }
 }
 await page.setViewportSize({width:1550,height:1100});
 await page.getByLabel('Émetteur — Raison sociale',{exact:true}).fill('Paramètres non enregistrés');
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('.bill-nav').getByRole('button',{name:/^Factures/}).click();
 assert.equal(await page.getByLabel('Émetteur — Raison sociale',{exact:true}).inputValue(),'Paramètres non enregistrés');
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('#userChip .uc-logout').click();
 assert.equal(await page.evaluate(()=>document.body.classList.contains('authed')),true);
 assert.equal(await page.getByLabel('Émetteur — Raison sociale',{exact:true}).inputValue(),'Paramètres non enregistrés');
 assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),false);
 const settingsExternal={...settingsV1.data,seller:{...settingsV1.data.seller,name:'Paramètres autre onglet'}};
 const settingsUpdated=await preview.ctx.worker.dispatchFetch('https://preview.example/api/v1/billing/settings',{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+preview.sessions[0].token,'Content-Type':'application/json','If-Match':String(settingsV1.version)},body:JSON.stringify({data:settingsExternal})});assert.equal(settingsUpdated.status,200);
 await page.getByRole('button',{name:'Enregistrer les paramètres',exact:true}).click();await page.getByRole('alert').filter({hasText:'Les paramètres ont été modifiés'}).waitFor();
 assert.equal(await page.getByLabel('Émetteur — Raison sociale',{exact:true}).inputValue(),'Paramètres non enregistrés');
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Recharger les paramètres enregistrés',exact:true}).click();
 assert.equal(await page.getByLabel('Émetteur — Raison sociale',{exact:true}).inputValue(),'Paramètres non enregistrés');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Recharger les paramètres enregistrés',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('input[aria-label="Émetteur — Raison sociale"]')?.value==='Paramètres autre onglet');
 await page.locator('.bill-nav').getByRole('button',{name:/^Factures/}).click();await page.getByRole('button',{name:'Nouvelle facture',exact:true}).first().click();
 await page.getByLabel('Objet du document',{exact:true}).fill('Facture avec paramètres copiés');
 assert.equal(await page.getByLabel('Émetteur — Raison sociale',{exact:true}).inputValue(),'Paramètres autre onglet');
 assert.equal(await page.getByLabel('Mode de paiement',{exact:true}).inputValue(),'58');
 assert.match(await page.locator('.bill-paper').innerText(),/Mention de recouvrement de démonstration/);
 await save();const documentWithSettings=(await records()).find(r=>JSON.parse(r.data_json).title==='Facture avec paramètres copiés');assert.ok(documentWithSettings);
 await settingsButton().click();await page.getByLabel('Émetteur — Raison sociale',{exact:true}).fill('Paramètres futurs uniquement');await saveDefaults();
 assert.equal((await records()).find(r=>r.id===documentWithSettings.id).data_json,documentWithSettings.data_json);
 assert.equal((await records()).find(r=>r.id===firstId).data_json,existingBeforeSettings);
 await page.locator('.bill-nav').getByRole('button',{name:/^Factures/}).click();await page.getByRole('button',{name:'Ouvrir Facture avec paramètres copiés',exact:true}).click();
 assert.equal(await page.getByLabel('Émetteur — Raison sociale',{exact:true}).inputValue(),'Paramètres autre onglet');
 step('Paramètres persistants, garde navigation/déconnexion, conflit réel, copie indépendante et mobile clair/sombre');

 await page.locator('.bill-nav').getByRole('button',{name:/^Devis/}).click();await page.getByRole('button',{name:'Nouveau devis',exact:true}).first().click();
 await page.getByLabel('Objet du document',{exact:true}).fill('Devis de démonstration');
 await page.getByLabel('Valable jusqu’au',{exact:true}).fill('2026-11-30');
 await page.getByLabel('Client — Raison sociale',{exact:true}).fill('Client du devis');
 await page.getByLabel('Description',{exact:true}).fill('Étude préalable');
 await page.getByLabel('Quantité',{exact:true}).fill('2');await page.getByLabel('Prix unitaire HT (€)',{exact:true}).fill('100');await save();
 rows=await records();const quote=rows.find(r=>r.kind==='quote');assert.ok(quote);
 await downloadPDF('devis-brouillon.pdf');assert.equal(downloads.length,2);
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
 await page.getByRole('button',{name:'Historique des factures & Factur-X',exact:true}).click();
 await page.locator('[data-react-finance="facturier"]').waitFor();assert.equal(await page.locator('#billingRoot').count(),0);
 await page.getByRole('button',{name:'Créer un Factur-X à partir du PDF',exact:true}).click();assert.deepEqual(await page.evaluate(()=>qaFacturx),['invoice-1']);
 // A payment-only edit must preserve a historical Factur-X snapshot and its download action.
 const oldSnapshot=await page.evaluate(()=>{const f=factures()[0];f.facturx={snapshot:JSON.stringify([f.id,f.number,f.dateFacture,f.client,f.code,String(f.ht),String(f.ttc),f.datePaiement,f.pdfSource.sha256]),pdfUrl:'data:application/pdf;base64,JVBERi0xLjc=',filename:'fixture.pdf'};renderFacturier();return f.facturx.snapshot;});
 await page.locator('tbody tr').filter({hasText:'F-2026-001'}).getByRole('button',{name:'Modifier',exact:true}).click();
 await page.locator('#fvPay').fill('2026-10-20');await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.locator('#overlay').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>factures()[0].facturx?.snapshot),oldSnapshot);assert.equal(await page.getByRole('button',{name:'Télécharger le Factur-X validé',exact:true}).count(),1);
 await page.locator('.billing-nav').getByRole('button',{name:'Facturation',exact:true}).click();await page.locator('[data-react-billing]').waitFor();
 step('Mobile 390/320 px et accès conservé au Factur-X des factures importées');

 // A pending PDF response must not initiate a download after leaving the editor.
 for(const destination of ['dashboard','logout']){
  const exportPage=await context.newPage();exportPage.setDefaultTimeout(15000);const lateDownloads=[];exportPage.on('download',d=>lateDownloads.push(d));exportPage.on('pageerror',e=>errors.push(e.message));
  await exportPage.goto(preview.base);await exportPage.locator('[data-react-billing]').waitFor();
  await exportPage.getByRole('button',{name:'Ouvrir Modification dans un autre onglet',exact:true}).click();
  let releasePDF,startedPDF,settledPDF;const heldPDF=new Promise(r=>releasePDF=r),started=new Promise(r=>startedPDF=r),settled=new Promise(r=>settledPDF=r);
  await exportPage.route('**/api/v1/billing/documents/*/preview.pdf',async route=>{startedPDF();await heldPDF;try{await route.fulfill({status:200,contentType:'application/pdf',body:pdfFixture});}catch{}finally{settledPDF();}});
  await exportPage.getByRole('button',{name:'Télécharger le PDF brouillon',exact:true}).click();await started;
  assert.equal(await exportPage.getByLabel('Objet du document',{exact:true}).isDisabled(),true);
  assert.equal(await exportPage.locator('.bill-nav').getByRole('button',{name:/^Devis/}).isDisabled(),true);
  if(destination==='dashboard'){await exportPage.evaluate(()=>setView('dashboard'));await exportPage.waitForFunction(()=>currentView==='dashboard');}
  else{await exportPage.locator('#userChip .uc-logout').click();await exportPage.waitForFunction(()=>!document.body.classList.contains('authed'));}
  releasePDF();await settled;await exportPage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(lateDownloads.length,0);assert.equal(await exportPage.locator('[data-react-billing]').count(),0);await exportPage.close();
 }
 step('PDF brouillon : noms facture/devis, état sauvegardé, erreur conservant la saisie, aucun téléchargement après navigation/déconnexion');

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
