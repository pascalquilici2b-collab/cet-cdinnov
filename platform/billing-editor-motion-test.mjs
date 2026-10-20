import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {billingPreview} from './billing-preview.mjs';
import {invoiceFixture} from './billing-payments-fixture.mjs';
import {quoteFixture} from './billing-quote-fixture.mjs';

const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const out=process.env.PORTAL_QA;assert.ok(out,'Private PORTAL_QA directory required');await mkdir(out,{recursive:true});
const preview=await billingPreview(),browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});
const errors=[],checks=[];let page;
try{
 const headers={Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+preview.sessions[0].token,'Content-Type':'application/json'};
 const invoice=invoiceFixture('Facture — parcours de saisie'),quote=quoteFixture('Devis — parcours de saisie'),invalid=invoiceFixture('Facture — correction ciblée');
 invalid.buyer.electronicScheme='';invalid.lines[0].unitPrice='';
 const records=[];
 for(const data of [invoice,quote,invalid]){
  const id=randomUUID(),r=await preview.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/documents',{method:'POST',headers,body:JSON.stringify({id,data})});
  assert.equal(r.status,201,await r.clone().text());records.push({id,data});
 }
 const ctx=await browser.newContext({viewport:{width:1440,height:1050},locale:'fr-FR'});
 await ctx.route('**/*',r=>r.request().url().startsWith(preview.base+'/')?r.continue():r.abort());
 page=await ctx.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 const step=id=>page.locator('.bill-step[data-step="'+id+'"]');
 const open=async id=>{if(!await step(id).evaluate(el=>el.open))await step(id).locator(':scope>summary').click();};
 const focused=async selector=>page.waitForFunction(selector=>document.querySelector(selector)===document.activeElement,selector);
 const settle=()=>page.waitForTimeout(340);
 await page.goto(preview.base);
 for(const [index,kind] of ['invoice','quote'].entries()){
  if(index)await page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:'Devis',exact:true}).click();
  await page.getByRole('button',{name:'Ouvrir '+records[index].data.title,exact:true}).click();
  await step('document').locator(':scope>summary').focus();
  for(const [key,id] of [['ArrowDown','buyer'],['ArrowUp','document'],['End','references'],['Home','document']]){
   await page.keyboard.press(key);await focused('.bill-step[data-step="'+id+'"]>summary');
  }
  assert.equal(await step('document').evaluate(el=>el.open),true,'arrow navigation does not change the open panel');
  if(!index){
   await settle();
   const heights=await step('document').evaluate(el=>new Promise(resolve=>{
    const values=[el.getBoundingClientRect().height],started=performance.now();el.querySelector(':scope>summary').click();
    function sample(){values.push(el.getBoundingClientRect().height);if(performance.now()-started<380)requestAnimationFrame(sample);else resolve(values);}
    requestAnimationFrame(sample);
   }));
   assert.ok(new Set(heights.map(h=>Math.round(h))).size>3,'panel height changes progressively');
   assert.ok(heights.at(-1)<heights[0]-60,'panel actually closes');
   await open('document');await settle();
   checks.push('measured progressive panel height during closing');
  }
  const ids=['document','buyer','lines','conditions','references'];
  for(const [i,id] of ids.entries()){
   assert.equal(await step(id).evaluate(el=>el.open),true);
   await step(id).getByRole('button',{name:'Valider',exact:true}).click();
   assert.equal(await step(id).getAttribute('data-complete'),'true',kind+' '+id);
   assert.equal(await step(id).evaluate(el=>el.open),false);
   await focused('.bill-step[data-step="'+(ids[i+1]||id)+'"]>summary');
   await settle();
   if(i<4)assert.equal(await step(ids[i+1]).evaluate(el=>el.open),true);
   assert.equal(await page.locator('.bill-step[open]').count(),i<4?1:0);
  }
  assert.equal(await page.locator('.bill-step .bill-blue-check').count(),5);
  await page.locator('.bill-step-flow').scrollIntoViewIfNeeded();
  await page.screenshot({path:out+'/'+kind+'-validated.png'});
  await open('document');
  const field=page.getByLabel('Objet du document',{exact:true});
  await field.fill(records[index].data.title+' modifié');
  assert.equal(await step('document').getAttribute('data-complete'),'false','editing invalidates the acknowledgement');
  assert.equal(await step('buyer').getAttribute('data-complete'),'true','other acknowledgements stay valid');
  await step('document').getByRole('button',{name:'Valider',exact:true}).click();await settle();
  await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Brouillon enregistré.'}).waitFor();
  const saved=await preview.ctx.db.prepare('SELECT data_json FROM billing_documents WHERE id=?').bind(records[index].id).first();
  const data=JSON.parse(saved.data_json);assert.equal(data.title,records[index].data.title+' modifié');
  assert.deepEqual(data.lines,records[index].data.lines,'closing sections preserves line values');
  assert.deepEqual(data.buyer,records[index].data.buyer,'closing sections preserves client');
  for(const theme of ['light','dark'])for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1050});await page.evaluate(t=>CDITheme.set(t),theme);
   await open('lines');await settle();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),kind+theme+width);
   if(width!==320)await page.screenshot({path:out+'/'+kind+'-'+theme+'-'+width+'.png'});
  }
  await page.setViewportSize({width:1440,height:1050});await page.locator('.bill-back').click();
  checks.push(kind+': five sections, focus, reopening, invalidation and persistence');
 }
 await page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:'Factures',exact:true}).click();
 await page.getByRole('button',{name:'Ouvrir '+invalid.title,exact:true}).click();await open('buyer');await settle();
 await step('buyer').getByRole('button',{name:'Valider',exact:true}).click();
 assert.equal(await step('buyer').getAttribute('data-complete'),'false');assert.equal(await step('buyer').evaluate(el=>el.open),true);
 await focused('[data-billing-path="buyer.electronicScheme"]');
 await page.locator('[data-billing-path="buyer.electronicScheme"]').fill('0225');
 await step('buyer').getByRole('button',{name:'Valider',exact:true}).click();await settle();
 // A review link must reveal and focus an input inside a currently collapsed section.
 await open('document');await settle();
 await page.getByRole('button',{name:'Vérifier le document',exact:true}).click();
 await page.locator('.bill-review').getByRole('button',{name:/Prestation 1 · Prix unitaire HT/}).click();
 await focused('[data-billing-path="lines.0.unitPrice"]');
 assert.equal(await step('lines').evaluate(el=>el.open),true);
 await page.locator('[data-billing-path="lines.0.unitPrice"]').fill('125');
 // During closing, hidden controls must be removed from keyboard navigation.
 await step('lines').getByRole('button',{name:'Valider',exact:true}).click();
 assert.equal(await step('lines').locator('.bill-step-body').getAttribute('inert'),'');
 await page.emulateMedia({reducedMotion:'reduce'});
 await open('lines');
 assert.equal(await step('lines').evaluate(el=>getComputedStyle(el,'::details-content').transitionDuration),'0s');
 assert.equal(await step('buyer').locator('.bill-blue-check path').evaluate(el=>getComputedStyle(el).animationName),'none');
 checks.push('invalid fields and nested disclosures; review focus; reduced motion; hidden controls inert');
 assert.deepEqual(errors,[]);
 assert.equal(preview.requests.filter(r=>/\/(issue|finalize)$/.test(r.path)).length,0);
 await writeFile(out+'/editor-checks.json',JSON.stringify({passed:true,checks,errors},null,2));
 console.log('PASS invoice/quote sections, keyboard focus, invalidation, persistence, review links and reduced motion.');
}catch(error){if(page)await page.screenshot({path:out+'/failure.png',fullPage:true});throw error;}
finally{await browser.close();await preview.close();}
