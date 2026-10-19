import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixture,quoteFixtureTools} from './billing-quote-fixture.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const out=process.env.PORTAL_QA;assert.ok(out);await mkdir(out,{recursive:true});
const preview=await billingPreview(),browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});
try{
 const {create,call,send,input}=await quoteFixtureTools(preview.ctx,preview.sessions[0].token);
 const quote=await create(),expired=await create(quoteFixture('Mission de faisabilité','2020-02-15'));await create(quoteFixture('Brouillon à compléter'),false);
 const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'fr-FR'});await context.route('**/*',route=>route.request().url().startsWith(preview.base+'/')?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 const nav=name=>page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name,exact:true});
 const follow=page.getByRole('region',{name:'Suivi du devis'}),submit=()=>follow.getByRole('button',{name:'Enregistrer le suivi',exact:true}).click();
 const open=title=>page.getByRole('button',{name:'Ouvrir '+title,exact:true}).click();
 await page.goto(preview.base);await nav('Devis').click();await page.getByLabel('Filtrer par statut').selectOption('expired');await page.waitForFunction(()=>document.querySelectorAll('.bill-list-table tbody tr').length===1);assert.match(await page.locator('.bill-list-table tbody').innerText(),/Mission de faisabilité/);
 await page.getByLabel('Filtrer par statut').selectOption('accepted');await page.getByText('Aucun document trouvé',{exact:true}).waitFor();await page.getByRole('button',{name:'Réinitialiser les filtres',exact:true}).click();await open('Accompagnement technique');
 assert.equal(await page.getByRole('button',{name:'Créer une facture',exact:true}).isDisabled(),true);
 await follow.getByRole('button',{name:'Marquer comme envoyé',exact:true}).click();assert.equal(await follow.getByLabel('Date de l’envoi').evaluate(e=>document.activeElement===e),true);
 await follow.getByLabel('Date de l’envoi').fill('2020-01-03');await follow.getByLabel('Note interne (facultatif)').fill('Envoyé par e-mail au client');
 page.once('dialog',d=>d.dismiss());await nav('Clients').click();assert.equal(await follow.getByLabel('Note interne (facultatif)').inputValue(),'Envoyé par e-mail au client');await submit();await follow.getByText('En attente',{exact:true}).waitFor();
 await follow.getByRole('button',{name:'Enregistrer un accord',exact:true}).click();await follow.getByLabel('Date de la réponse').fill('2020-01-04');await follow.getByLabel('Origine de la réponse',{exact:true}).fill('Devis signé reçu par e-mail');
 let lost=false;await page.route('**/api/v1/billing/documents/*/quote-events',async route=>{if(route.request().method()==='POST'&&!lost){lost=true;await route.fetch();await route.abort('connectionfailed');}else await route.continue();});
 await submit();await follow.getByRole('alert').waitFor();assert.equal(await follow.getByLabel('Origine de la réponse',{exact:true}).inputValue(),'Devis signé reçu par e-mail');await submit();await follow.getByText('Accepté',{exact:true}).waitFor();assert.equal((await (await call('/documents/'+quote.id+'/quote-events')).json()).events.length,2);
 await follow.locator('summary').filter({hasText:'Historique du suivi'}).click();await follow.getByText('Devis signé reçu par e-mail',{exact:true}).waitFor();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(out,'devis-accepte-desktop.png'),fullPage:true});
 console.log('OK Filtres, envoi déclaré, garde de saisie, accord après réponse perdue sans doublon et historique');

 await follow.getByRole('button',{name:'Corriger la réponse',exact:true}).click();await follow.getByLabel('Raison de la correction').fill('Ma correction locale');
 const current=await (await call('/documents/'+quote.id)).json();assert.equal((await send(current,input(current,'reopened','Correction depuis une autre session','2020-01-05'))).status,201);
 await submit();await follow.getByRole('button',{name:'Actualiser le suivi',exact:true}).waitFor();assert.equal(await follow.getByLabel('Raison de la correction').inputValue(),'Ma correction locale');await follow.getByRole('button',{name:'Actualiser le suivi',exact:true}).click();await follow.getByText('En attente',{exact:true}).waitFor();assert.equal(await follow.getByLabel('Raison de la correction').inputValue(),'Ma correction locale');
 page.once('dialog',d=>d.accept());await follow.getByRole('button',{name:'Annuler',exact:true}).click();await follow.getByRole('button',{name:'Enregistrer un accord',exact:true}).click();await follow.getByLabel('Date de la réponse').fill('2020-01-06');await follow.getByLabel('Origine de la réponse',{exact:true}).fill('Nouvel accord confirmé');await submit();await follow.getByText('Accepté',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Créer une facture',exact:true}).click();await page.getByText('Un brouillon de facture a été créé à partir de ce devis.',{exact:true}).waitFor();await nav('Devis').click();await page.getByLabel('Filtrer par statut').selectOption('accepted');await open('Accompagnement technique');await follow.getByRole('button',{name:'Ouvrir la facture brouillon',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Créer une facture',exact:true}).count(),0);await follow.getByRole('button',{name:'Ouvrir la facture brouillon',exact:true}).click();await page.getByText('Créé à partir d’un devis enregistré.',{exact:true}).waitFor();
 assert.equal(await nav('Factures').getAttribute('aria-current'),'page');
 console.log('OK Conflit sans perte, correction traçable, conversion unique et navigation vers la facture liée');

 await nav('Devis').click();await open('Mission de faisabilité');await page.evaluate(()=>CDITheme.set('dark'));await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Résumé',exact:true}).click();await follow.getByRole('button',{name:'Enregistrer un accord',exact:true}).click();await follow.getByLabel('Origine de la réponse',{exact:true}).fill('Accord signé retrouvé dans les échanges');await submit();await follow.getByRole('alert').filter({hasText:'dépasse la validité'}).waitFor();
 await follow.getByLabel('Date de la réponse').fill('2020-02-15');assert.equal(await follow.getByRole('alert').count(),0);const followWidth=await follow.boundingBox(),summaryWidth=await page.locator('.bill-document-summary').boundingBox();assert.ok(followWidth.width>summaryWidth.width*.9);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(out,'devis-suivi-mobile-dark.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.setViewportSize({width:320,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await submit();await follow.getByText('Accepté',{exact:true}).waitFor();assert.equal((await (await call('/documents/'+expired.id)).json()).quote.state,'accepted');
 await page.evaluate(()=>CDITheme.set('light'));await page.setViewportSize({width:1440,height:1000});await nav('Devis').click();await page.getByLabel('Filtrer par statut').selectOption('accepted');await page.waitForFunction(()=>document.querySelectorAll('.bill-list-table tbody tr').length===2);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(out,'devis-liste-desktop.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('OK Expiration, saisie de la date réelle, thème sombre et mobile 390/320 sans débordement');console.log(JSON.stringify({javascriptErrors:errors,apiRequests:preview.requests.length,screenshots:out}));
}finally{await browser.close();await preview.close();}
