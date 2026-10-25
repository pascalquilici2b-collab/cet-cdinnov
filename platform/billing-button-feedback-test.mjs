import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {billingPreview} from './billing-preview.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium,expect}=require('playwright/test'),preview=await billingPreview(),browser=await chromium.launch({channel:'msedge',headless:true});
const out='platform/.private/stamping-compact-20261025/qa';await mkdir(out,{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1450,height:1000}});await context.route('**/*',r=>r.request().url().startsWith(preview.base+'/')||/^(data:|blob:)/.test(r.request().url())?r.continue():r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.goto(preview.base);
 const nav=name=>page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name,exact:true});
 await nav('Clients').click();await page.getByRole('button',{name:'+ Nouveau client',exact:true}).click();await page.getByLabel('Client — Raison sociale',{exact:true}).fill('Client animation fictif');
 const save=page.getByRole('button',{name:'Enregistrer la fiche',exact:true}),box=await save.boundingBox();await save.click();
 const confirmed=page.locator('button.cdi-save-confirmed');await expect(confirmed).toContainText('Fiche enregistrée');await expect.poll(()=>confirmed.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(228, 246, 235)');const after=await confirmed.boundingBox();assert.ok(Math.abs(after.width-box.width)<1);await confirmed.screenshot({path:out+'/client-save-green.png'});
 await page.getByLabel('Client — Ville',{exact:true}).fill('Bastia');await page.locator('.cdi-button-success').waitFor({state:'hidden'});
 await page.route('**/billing/clients/**',r=>['PUT','POST'].includes(r.request().method())?r.fulfill({status:422,contentType:'application/json',body:'{"error":"Erreur fictive de sauvegarde"}'}):r.continue());await save.click();await expect(page.getByRole('alert')).toContainText('Erreur fictive');assert.equal(await confirmed.count(),0);await page.unroute('**/billing/clients/**');await save.click();await expect(confirmed).toContainText('Fiche enregistrée');
 await nav('Prestations').click();await page.getByRole('button',{name:'+ Nouvelle prestation',exact:true}).click();await page.getByLabel('Nom de la prestation',{exact:true}).fill('Conseil fictif');await page.getByLabel('Tarif unitaire HT (€)',{exact:true}).fill('720');await page.evaluate(()=>CDITheme.set('dark'));await save.click();await expect(confirmed).toContainText('Fiche enregistrée');await expect.poll(()=>confirmed.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(23, 61, 43)');await confirmed.screenshot({path:out+'/service-save-dark.png'});
 await page.locator('.cdi-button-success').waitFor({state:'hidden'});await page.getByLabel('Description détaillée',{exact:true}).fill('Nouvelle saisie');assert.equal(await save.innerText(),'Enregistrer la fiche');assert.deepEqual(errors,[]);
 console.log('Client/catalogue: success inside unchanged button, light/dark contrast, error stays an error, editing remains functional.');
}finally{await browser.close();await preview.close();}
