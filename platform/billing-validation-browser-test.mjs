import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {billingPreview} from './billing-preview.mjs';
import {invoiceFixture} from './billing-payments-fixture.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright'),out=process.env.PORTAL_QA;
assert.ok(out,'Private PORTAL_QA output directory required');await mkdir(out,{recursive:true});
const preview=await billingPreview(),browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];let page;
try{
 const data=invoiceFixture('Vérification guidée — document fictif'),id=randomUUID();
 data.seller.electronicScheme='';data.legalNotes.penalties='';
 data.lines.push({...data.lines[0],id:randomUUID(),description:'Deuxième prestation',unitPrice:''},{...data.lines[0],id:randomUUID(),description:'Troisième prestation',discountPercent:'120'});
 const created=await preview.ctx.worker.dispatchFetch('https://preview.example/api/v1/billing/documents',{method:'POST',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+preview.sessions[0].token,'Content-Type':'application/json'},body:JSON.stringify({id,data})});assert.equal(created.status,201);
 const context=await browser.newContext({viewport:{width:1550,height:1100},locale:'fr-FR'});
 await context.route('**/*',route=>route.request().url().startsWith(preview.base+'/')||route.request().url().startsWith('data:')?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/React|flushSync|unmount/i.test(m.text()))errors.push(m.text());});
 const field=path=>page.locator('[data-billing-path="'+path+'"]');
 const focused=async path=>assert.equal(await field(path).evaluate(el=>el===document.activeElement),true,'focus '+path);
 const review=()=>page.getByRole('region',{name:'Vérification du document',exact:true});
 const point=label=>review().getByRole('button',{name:label});
 const save=async()=>{await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();await page.getByRole('status').filter({hasText:'Brouillon enregistré.'}).waitFor();};
 await page.goto(preview.base);await page.getByRole('button',{name:'Ouvrir '+data.title,exact:true}).click();
 assert.equal(await page.locator('[aria-invalid=true]').count(),0,'no errors on untouched opening');
 assert.equal(await review().getByRole('button',{name:'Vérifier le document',exact:true}).evaluate(el=>!!document.getElementById(el.getAttribute('aria-controls'))),true);
 await field('lines.1.unitPrice').focus();await field('lines.1.unitPrice').press('Tab');assert.equal(await field('lines.1.unitPrice').getAttribute('aria-invalid'),'true');
 await page.locator('.bill-finalize-disclosure>summary').click();await page.getByRole('button',{name:'Compléter le document',exact:true}).click();
 await point(/^Type d’adresse électronique/).waitFor();
 assert.equal(await page.getByRole('button',{name:'Finaliser et générer',exact:true}).count(),0);
 assert.equal(preview.requests.filter(r=>r.path.endsWith('/issue')).length,0);
 await point(/^Type d’adresse électronique/).click();await focused('seller.electronicScheme');
 assert.equal(await field('seller.electronicScheme').evaluate(el=>{let p=el.parentElement;while(p){if(p.tagName==='DETAILS'&&!p.open)return false;p=p.parentElement;}return true;}),true);
 const descriptions=await field('seller.electronicScheme').evaluate(el=>el.getAttribute('aria-describedby').split(' ').map(id=>document.getElementById(id)?.textContent));
 assert.equal(descriptions.length,2);assert.ok(descriptions[0].includes('0225'));assert.ok(descriptions[1].includes('précisez ensemble'));
 await field('seller.electronicScheme').fill('0225');assert.equal(await field('seller.electronicScheme').getAttribute('aria-invalid'),null);await focused('seller.electronicScheme');
 await point(/^Pénalités de retard/).click();await focused('legalNotes.penalties');await field('legalNotes.penalties').fill('Mention fictive de pénalités');await focused('legalNotes.penalties');
 assert.equal(await point(/^Pénalités de retard/).count(),0);
 await review().scrollIntoViewIfNeeded();await page.screenshot({path:join(out,'validation-desktop.png'),fullPage:false});
 console.log('OK delayed inline guidance, nested disclosure focus, hints and no issuance before correction');

 // Links must reveal the editor on mobile before moving keyboard focus.
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Aperçu',exact:true}).click();
 assert.equal(await page.locator('.bill-workspace .bill-editor').isVisible(),false);
 await point(/^Prestation 3 · Remise/).click();await focused('lines.2.discountPercent');
 assert.equal(await page.getByRole('button',{name:'Saisie',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await field('lines.2.discountPercent').evaluate(el=>getComputedStyle(el).fontSize),'16px');
 await field('lines.2.discountPercent').fill('10');
 // Removing a preceding line must not redirect validation to its old index.
 await page.getByRole('button',{name:'Supprimer la prestation 1',exact:true}).click();
 await point(/^Prestation 1 · Prix unitaire HT/).click();await focused('lines.0.unitPrice');
 assert.equal(await field('lines.0.description').inputValue(),'Deuxième prestation');
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>CDITheme.set(theme),theme);
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   await point(/^Prestation 1 · Prix unitaire HT/).click();await focused('lines.0.unitPrice');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow '+theme+' '+width);
   const color=await field('lines.0.unitPrice').locator('..').locator('.bill-field-error').evaluate(el=>getComputedStyle(el).color);assert.equal(color,theme==='dark'?'rgb(255, 181, 168)':'rgb(153, 59, 47)');
   if(width===390)await page.screenshot({path:join(out,'validation-mobile-'+theme+'.png'),fullPage:false});
  }
 }
 await save();const stored=await preview.ctx.db.prepare('SELECT data_json,version FROM billing_documents WHERE id=?').bind(id).first();
 assert.equal(stored.version,2);assert.equal(JSON.parse(stored.data_json).lines[0].unitPrice,'','unfinished draft still saved');
 await field('lines.0.unitPrice').fill('125,50');await focused('lines.0.unitPrice');await review().getByText('Champs renseignés',{exact:true}).waitFor();
 assert.equal(await page.locator('[aria-invalid=true]').count(),0);await save();
 assert.equal(await page.getByRole('button',{name:'Finaliser et générer',exact:true}).count(),1);
 assert.equal((await preview.ctx.db.prepare('SELECT count(*) AS n FROM billing_issuances').first()).n,0);
 await page.locator('.bill-back').click();await page.getByRole('button',{name:'Nouvelle facture',exact:true}).click();
 assert.equal(await page.locator('[aria-invalid=true]').count(),0,'review state reset for a different document');
 assert.equal(await review().getByRole('button',{name:'Vérifier le document',exact:true}).getAttribute('aria-expanded'),'false');
 console.log('OK mobile preview-to-field navigation, line removal, light/dark at 320/390 px, unfinished persistence and live readiness');
 assert.deepEqual(errors,[]);console.log('PASS guided-validation browser checks; '+preview.requests.length+' API requests');
}catch(error){if(page)await page.screenshot({path:join(out,'validation-failure.png'),fullPage:true});throw error;}
finally{await browser.close();await preview.close();}
