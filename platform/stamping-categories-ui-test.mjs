import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {billingPreview} from './billing-preview.mjs';
import {migrateStamping} from './stamping-schema.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright'),out=resolve('platform/.private/stamping-payroll-20261025/qa');await mkdir(out,{recursive:true});
const preview=await billingPreview({stamping:true});await migrateStamping(preview.ctx.db);const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1500,height:950},locale:'fr-FR'}),errors=[];
 await context.route('**/*',route=>route.request().url().startsWith(preview.base+'/')||/^(data:|blob:)/.test(route.request().url())?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);await page.goto(preview.base);await page.locator('[data-react-billing]').waitFor();await page.locator('[data-view=tamponnage]').click();
 const nav=page.getByRole('navigation',{name:'Types de pièces',exact:true});await nav.waitFor();assert.equal(await nav.getByRole('button').count(),2);assert.equal(await page.getByLabel('Nom du lot',{exact:true}).count(),0);
 await page.screenshot({path:out+'/categories-light.png'});await page.locator('[data-theme-toggle]').click();await page.screenshot({path:out+'/categories-dark.png'});
 await nav.getByRole('button',{name:/Ressources humaines/}).click();await page.getByLabel('Nom du lot',{exact:true}).fill('Paie fictive');await page.getByRole('button',{name:'Créer le lot',exact:true}).click();await page.getByRole('heading',{name:'Pièces du lot',exact:true}).waitFor();
 await page.getByRole('button',{name:'Tous les lots',exact:true}).click();await page.locator('.stamp-lot-open').filter({hasText:'Paie fictive'}).waitFor();await page.getByRole('button',{name:'Types de pièces',exact:true}).click();
 await nav.getByRole('button',{name:/Prestations de services & équipements/}).click();assert.equal(await page.locator('.stamp-lot-open').filter({hasText:'Paie fictive'}).count(),0);
 await page.getByLabel('Nom du lot',{exact:true}).fill('Équipement fictif');await page.getByRole('button',{name:'Créer le lot',exact:true}).click();await page.getByRole('heading',{name:'Pièces du lot',exact:true}).waitFor();
 await page.getByRole('button',{name:'Tous les lots',exact:true}).click();await page.locator('.stamp-lot-open').filter({hasText:'Équipement fictif'}).waitFor();await page.getByRole('button',{name:'Types de pièces',exact:true}).click();
 await page.setViewportSize({width:390,height:850});await page.screenshot({path:out+'/categories-mobile.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const data=(await preview.ctx.db.prepare('SELECT name,data FROM stamp_batches').all()).results.map(b=>({name:b.name,category:JSON.parse(b.data).category}));assert.deepEqual(data,[{name:'Paie fictive',category:'RH'},{name:'Équipement fictif',category:'SERVICES'}]);assert.deepEqual(errors,[]);
 console.log('Category UI passed: two entrances, filtered lists, persistent categories, back navigation, light/dark/mobile.');
}finally{await browser.close();await preview.close();}
