import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {billingPreview} from './billing-preview.mjs';
import {companyFixture} from './billing-company-fixture.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const preview=await billingPreview(),browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 let mode='ok';
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin===preview.base)return route.continue();
  if(url.hostname==='recherche-entreprises.api.gouv.fr')return route.fulfill({status:mode==='ok'?200:429,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(companyFixture)});
  return route.abort();
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(preview.base);
 await page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:'Clients',exact:true}).click();
 const lookup=page.getByRole('searchbox',{name:'Nom, SIREN ou SIRET du client'});
 await lookup.fill('Collectivité');await lookup.press('Enter');
 await page.getByRole('button',{name:/Utiliser COLLECTIVITE DE CORSE — SIRET 20007695800053/}).click();
 assert.equal(await page.getByLabel('Client — SIRET',{exact:true}).inputValue(),'20007695800053');
 assert.equal(preview.requests.filter(r=>r.method==='POST').length,0);
 await page.getByLabel('Client — Adresse',{exact:true}).fill('Adresse de facturation personnalisée');
 await page.getByRole('button',{name:'Enregistrer la fiche',exact:true}).click();
 await page.locator('.bill-message-success').getByText('Fiche enregistrée.',{exact:true}).waitFor();
 const row=await preview.ctx.db.prepare("SELECT data_json FROM billing_directory WHERE kind='clients' AND json_extract(data_json,'$.party.siret')=?").bind('20007695800053').first();
 assert.equal(JSON.parse(row.data_json).party.addressLine1,'Adresse de facturation personnalisée');
 const saved=await preview.ctx.db.prepare("SELECT id FROM billing_directory WHERE kind='clients' AND json_extract(data_json,'$.party.siret')=?").bind('20007695800053').first();
 await page.getByRole('button',{name:'‹ Clients',exact:true}).click();await lookup.fill('Collectivité');await lookup.press('Enter');await page.getByRole('button',{name:/Utiliser COLLECTIVITE DE CORSE — SIRET 20007695800053/}).click();
 await page.getByText('Fiche existante préremplie.',{exact:true}).waitFor();await page.getByRole('button',{name:'Enregistrer la fiche',exact:true}).click();await page.locator('.bill-message-success').getByText('Fiche enregistrée.',{exact:true}).waitFor();
 const after=await preview.ctx.db.prepare("SELECT id FROM billing_directory WHERE kind='clients' AND json_extract(data_json,'$.party.siret')=?").bind('20007695800053').all();assert.equal(after.results.length,1);assert.equal(after.results[0].id,saved.id);
 mode='rate';await lookup.fill('Collectivité');await lookup.press('Enter');
 await page.getByRole('alert').filter({hasText:'trop de demandes'}).waitFor();
 assert.ok(await page.getByLabel('Client — Adresse',{exact:true}).inputValue());
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(-12).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,text:e.textContent?.slice(0,70)})))));}
 assert.deepEqual(errors,[]);
 console.log('OK Clients : recherche directe, choix SIRET, édition, persistance, erreur annuaire sans perte, mobile.');
}finally{await browser.close();await preview.close();}
