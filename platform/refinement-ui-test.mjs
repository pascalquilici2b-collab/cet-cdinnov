import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {billingPreview} from './billing-preview.mjs';
import {emptyMarket} from '../marches/domain.mjs';
import {quoteFixture,samplePDF} from './billing-quote-fixture.mjs';
import {blankSettings} from './billing-domain.ts';
const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const p=await billingPreview({outboundService:async()=>new Response(samplePDF(),{headers:{'content-type':'application/pdf'}})}),browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});
const dir='platform/.private/refinement-20261023b';await mkdir(dir,{recursive:true});
try{
 const headers={Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+p.sessions[0].token,'Content-Type':'application/json'};
 const settings={...blankSettings(),seller:quoteFixture().seller};assert.equal((await p.ctx.worker.dispatchFetch('https://local/api/v1/billing/settings',{method:'PUT',headers:{...headers,'If-Match':'0'},body:JSON.stringify({data:settings})})).status,200);
 for(const [id,clientName,reference,startDate] of [['m1',"Etablissement public du commerce et de l'industrie de Corse",'EPCI/2026.030','2026-01-01'],['m2',"Communauté d’agglomération de Bastia",'24002DDET','2023-01-01']]){
  const m={...emptyMarket(),title:'Accompagnement des projets européens',clientName,reference,startBasis:'date',startDate,initialDurationMonths:12,maximumMinor:12000000};
  assert.equal((await p.ctx.call('markets',{method:'POST',headers,body:JSON.stringify({id,market:m})})).status,201);
 }
 const context=await browser.newContext({viewport:{width:1500,height:1050}});await context.route('**/*',r=>r.request().url().startsWith(p.base)||r.request().url().startsWith('data:')?r.continue():r.abort());
 const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(p.base);
 await page.getByRole('button',{name:'Nouvelle facture',exact:true}).click();await page.locator('.bill-document-number').waitFor();const number=await page.locator('.bill-document-number').textContent();
 await page.getByRole('button',{name:'Statut du document',exact:true}).click();await page.getByRole('menuitem',{name:'Finalisé',exact:true}).click();await page.locator('.bill-status-control [role=alert]').waitFor();assert.match(await page.locator('.bill-status-control').innerText(),/Finalisation impossible/);
 for(const theme of ['light','dark']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.getByRole('button',{name:'Statut du document',exact:true}).click();await page.screenshot({path:dir+'/statut-'+theme+'.png',animations:'disabled'});await page.keyboard.press('Escape');
 }
 await page.getByRole('button',{name:'Supprimer le brouillon '+number,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Supprimer',exact:true}).click();await page.getByRole('button',{name:'Nouvelle facture',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Supprimer le brouillon '+number,exact:true}).count(),0);
 await page.getByLabel('Filtrer par statut',{exact:true}).selectOption('trash');await page.getByRole('button',{name:'Restaurer le brouillon '+number,exact:true}).waitFor();assert.equal(await page.locator('[data-imported-invoice]').count(),0);await page.getByRole('button',{name:'Restaurer le brouillon '+number,exact:true}).click();await page.getByText('Aucun document trouvé',{exact:true}).waitFor();await page.getByLabel('Filtrer par statut',{exact:true}).selectOption('all');await page.getByRole('button',{name:'Supprimer le brouillon '+number,exact:true}).waitFor();
 assert.equal(await page.locator('.bill-list-table .bill-document-icon').count(),0);assert.ok(await page.locator('.bill-list-table .lucide-file-pen-line').count());
 await page.getByRole('button',{name:'Modifier la facture F-2026-001',exact:true}).click();await page.locator('.finance-pdf-box').waitFor();const colours=await page.locator('.finance-pdf-box').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));assert.equal(colours.bg,'rgb(36, 44, 54)');assert.equal(colours.color,'rgb(245, 245, 247)');await page.screenshot({path:dir+'/import-nuit.png',animations:'disabled'});await page.evaluate(()=>closeModal());
 await page.evaluate(()=>setView('marches'));await page.getByRole('button',{name:'Ouvrir le marché EPCI/2026.030',exact:true}).waitFor();
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:dir+'/marches-'+theme+'.png',animations:'disabled'});}
 assert.equal(await page.locator('.mk-table .cdi-activity[data-state=active]').count(),1);assert.equal(await page.locator('.mk-table .cdi-activity[data-state=inactive]').count(),1);
 await page.getByRole('combobox',{name:'Filtrer les marchés par client'}).selectOption("Communauté d’agglomération de Bastia");assert.equal(await page.locator('.mk-table tbody tr').count(),1);await page.getByRole('combobox',{name:'Filtrer les marchés par client'}).selectOption('');
 await page.getByRole('button',{name:'Ouvrir le marché EPCI/2026.030',exact:true}).click();await page.getByLabel('Objet du marché *',{exact:true}).waitFor();
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:dir+'/fiche-marche-'+theme+'.png',animations:'disabled'});}
 await page.getByRole('button',{name:'Aide — Date portée sur la notification'}).hover();await page.getByRole('tooltip').waitFor();await page.keyboard.press('Escape');
 for(const tab of ['Projets & commandes','Tarifs','Pièces','Périodes','Conditions'])await page.getByRole('button',{name:tab,exact:true}).click();
 for(const tab of ['Assistant','Plafonds','Points à confirmer','Historique']){await page.locator('.mk-more-tabs summary').click();await page.getByRole('button',{name:tab,exact:true}).click();}
 await page.getByRole('button',{name:'Fiche marché',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:dir+'/marche-mobile.png',animations:'disabled'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 console.log('OK UI : statut + erreurs, suppression/restauration, icônes, import PDF nuit, marchés light/dark, filtres, onglets, aides et mobile.');
}catch(e){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:dir+'/failure.png',animations:'disabled'});console.log((await page.locator('body').innerText()).slice(-2800));}throw e;}finally{await browser.close();await p.close();}
