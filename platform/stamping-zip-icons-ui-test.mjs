import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {billingPreview} from './billing-preview.mjs';
import {migrateStamping} from './stamping-schema.mjs';
const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json'),{chromium,expect}=require('playwright/test');
const out='platform/.private/billing-attention-20261028';await mkdir(out,{recursive:true});const p=await billingPreview({stamping:true});await migrateStamping(p.ctx.db);const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'fr-FR'});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(p.base);await page.locator('[data-react-billing]').waitFor();await page.locator('[data-view=tamponnage]').click();
 await page.getByRole('button',{name:/Ressources humaines/}).click();await page.getByLabel('Nom du lot',{exact:true}).fill('Icônes ZIP · essai');await page.getByRole('button',{name:'Créer le lot',exact:true}).click();
 const upload=page.getByRole('button',{name:'Pièces à tamponner',exact:true}),payment=page.getByRole('button',{name:'Document de paiement',exact:true});await expect(upload.locator('.stamp-file-icon.zip')).toHaveCount(1);await expect(upload.locator('.stamp-file-icon.pdf')).toHaveCount(2);await expect(payment.locator('.stamp-file-icon.xls')).toHaveCount(1);await expect(payment.locator('.stamp-file-icon.zip')).toHaveCount(0);
 await expect(page.getByLabel('Importer les PDF ou ZIP',{exact:true})).toHaveAttribute('accept',/\.zip/);
 const drag=await page.evaluateHandle(()=>{const d=new DataTransfer();d.items.add(new File(['fixture'],'factures.zip',{type:'application/zip'}));return d;});await upload.dispatchEvent('dragenter',{dataTransfer:drag});await expect(page.locator('.stamp-upload.is-dragging .has-zip')).toHaveCount(1);await expect(upload.getByText('Relâchez pour importer',{exact:true})).toBeVisible();
 for(const theme of ['light','dark']){await page.evaluate(t=>CDITheme.set(t),theme);await upload.screenshot({path:out+'/zip-'+theme+'.png'});}
 await upload.dispatchEvent('dragleave',{dataTransfer:drag});await expect(page.locator('.stamp-upload.is-dragging')).toHaveCount(0);
 await page.emulateMedia({reducedMotion:'reduce'});await upload.dispatchEvent('dragenter',{dataTransfer:drag});assert.equal(await page.locator('.stamp-upload.is-dragging').evaluate(e=>getComputedStyle(e,'::before').animationName),'none');assert.deepEqual(errors,[]);console.log('ZIP/PDF fan, payment Excel/PDF fan, ZIP accepted, drag feedback, reduced motion, light/dark: PASS');
}finally{await browser.close();await p.close();}
