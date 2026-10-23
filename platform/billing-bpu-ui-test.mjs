import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixture,samplePDF} from './billing-quote-fixture.mjs';
import {blankService} from './billing-directory-domain.ts';
import {emptyMarket} from '../marches/domain.mjs';
import {bpuPrices} from './billing-bpu-fixture.mjs';
const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const preview=await billingPreview({outboundService:async()=>new Response(samplePDF(),{headers:{'Content-Type':'application/pdf'}})}),browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});
const out='platform/.private/bpu-catalogue-20261023';await mkdir(out,{recursive:true});
try{
 const headers={Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+preview.sessions[0].token,'Content-Type':'application/json'};
 const call=(path,method='GET',body)=>preview.ctx.worker.dispatchFetch('https://test/api/v1/billing'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
 const marketId=randomUUID(),otherId=randomUUID(),prices=bpuPrices();
 for(const [id,reference,rates] of [[marketId,'BPU-2026',prices],[otherId,'AUTRE-MARCHE',[{...prices[0],label:'Tarif autre marché',amountMinor:120000,vatRate:5.5},{...prices[0],id:'no-price',label:'Mission sur mesure',amountMinor:null,vatRate:20}] ]]){
  const r=await preview.ctx.call('markets',{method:'POST',headers,body:JSON.stringify({id,market:{...emptyMarket(),title:'Assistance aux projets',clientName:'Client Démonstration',reference,prices:rates}})});assert.equal(r.status,201,await r.clone().text());
 }
 assert.equal((await(await call('/context')).json()).markets.find(m=>m.id===marketId).prices[0].vatRate,20);
 const general={...blankService(),label:'Assistance générale',unitPrice:'900',unitCode:'DAY'};assert.equal((await call('/services','POST',{id:randomUUID(),data:general})).status,201);
 const quoteId=randomUUID(),invoiceId=randomUUID();
 for(const [id,kind] of [[quoteId,'quote'],[invoiceId,'invoice']]){
  const d=quoteFixture('Test catalogue '+kind);d.kind=kind;d.issueDate='2026-10-23';d.lines=[];d.buyer.name='Client Démonstration';d.references.marketId=marketId;d.references.marketReference='BPU-2026';
  assert.equal((await call('/documents','POST',{id,data:d})).status,201);
 }
 const context=await browser.newContext({viewport:{width:1500,height:1080},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 await context.route('**/*',r=>r.request().url().startsWith(preview.base)||r.request().url().startsWith('data:')?r.continue():r.abort());
 await page.goto(preview.base);
 await page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:'Devis',exact:true}).click();await page.getByRole('button',{name:'Ouvrir Test catalogue quote',exact:true}).click();
 await page.locator('[data-step=lines]>summary').click();await page.getByRole('button',{name:/Ajouter depuis le catalogue/}).click();
 const dialog=page.getByRole('dialog',{name:'Choisir une prestation'}),bpu=dialog.getByRole('region',{name:'Tarifs du marché'});
 await bpu.getByRole('button',{name:/Choisir le tarif/}).first().waitFor();assert.equal(await bpu.getByRole('button',{name:/Choisir le tarif/}).count(),6);
 assert.equal(await dialog.getByText('Tarif autre marché',{exact:true}).count(),0);await dialog.getByRole('button',{name:'Choisir Assistance générale',exact:true}).waitFor();
 assert.ok((await bpu.innerText()).includes('864,00'));assert.ok(await bpu.evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('.bill-directory-rows'))&Node.DOCUMENT_POSITION_FOLLOWING)));
 await page.screenshot({path:out+'/catalogue-light.png'});await page.evaluate(()=>CDITheme.set('dark'));await page.screenshot({path:out+'/catalogue-dark.png'});
 assert.deepEqual(await bpu.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el).color})),{bg:'rgb(28, 46, 72)',fg:'rgb(211, 228, 255)'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/catalogue-mobile.png'});assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.setViewportSize({width:1500,height:1080});
 await dialog.getByLabel('Rechercher une prestation',{exact:true}).fill('corse senior');assert.equal(await bpu.getByRole('button',{name:/Choisir le tarif/}).count(),1);
 await bpu.getByRole('button',{name:/Choisir le tarif/}).click();const lines=page.locator('[data-step=lines]');assert.equal(await lines.getByLabel('Description',{exact:true}).inputValue(),prices[0].label);assert.equal(await lines.getByLabel('Prix unitaire HT (€)',{exact:true}).inputValue(),'720.00');assert.equal(await lines.getByLabel('Taux TVA (%)',{exact:true}).inputValue(),'20');
 assert.deepEqual(await lines.getByLabel('Unité',{exact:true}).locator('option').allTextContents(),['jour','heure','unité']);await lines.getByLabel('Quantité',{exact:true}).fill('2.5');
 await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.bill-save-state')?.textContent?.startsWith('Enregistré'));
 const saved=await(await call('/documents/'+quoteId)).json();assert.equal(saved.totals.grossMinor,'216000');assert.equal(saved.data.references.marketId,marketId);
 // Switching the market refreshes the priority group; edits to the line remain manual.
 await page.locator('[data-step=document]>summary').click();await page.getByRole('combobox',{name:'Marché lié',exact:true}).click();await page.getByRole('option').filter({hasText:'AUTRE-MARCHE'}).click();await page.locator('[data-step=lines]>summary').click();await page.getByRole('button',{name:/Ajouter depuis le catalogue/}).click();
 assert.equal(await bpu.getByRole('button',{name:/Choisir le tarif/}).count(),2);await bpu.getByRole('button',{name:/Tarif autre marché/}).click();assert.equal(await lines.getByLabel('Taux TVA (%)',{exact:true}).nth(1).inputValue(),'5.5');
 // A line with no price remains selectable and manually editable.
 await page.getByRole('button',{name:/Ajouter depuis le catalogue/}).click();await bpu.getByRole('button',{name:'Choisir le tarif Mission sur mesure · Sénior · Corse',exact:true}).click();assert.equal(await lines.getByLabel('Prix unitaire HT (€)',{exact:true}).nth(2).inputValue(),'');await lines.getByLabel('Prix unitaire HT (€)',{exact:true}).nth(2).fill('450');
 await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.bill-save-state')?.textContent?.startsWith('Enregistré'));
 await page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:'Factures',exact:true}).click();await page.getByRole('button',{name:'Ouvrir Test catalogue invoice',exact:true}).click();
 await page.locator('[data-step=lines]>summary').click();await page.getByRole('button',{name:/Ajouter depuis le catalogue/}).click();assert.equal(await bpu.getByRole('button',{name:/Choisir le tarif/}).count(),6);await bpu.getByRole('button',{name:/Consultant Junior/}).last().click();assert.equal(await lines.getByLabel('Prix unitaire HT (€)',{exact:true}).inputValue(),'580.00');
 await lines.getByLabel('Quantité',{exact:true}).fill('3');await lines.getByLabel('Prix unitaire HT (€)',{exact:true}).fill('575');await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.bill-save-state')?.textContent?.startsWith('Enregistré'));
 const invoice=await(await call('/documents/'+invoiceId)).json();assert.equal(invoice.totals.grossMinor,'207000');assert.equal(invoice.data.lines[0].unitPrice,'575');assert.deepEqual(errors,[]);
 console.log('OK: real Worker market VAT persistence, quote/invoice BPU priority, search, HT/TVA/TTC, quantity calculations, manual adjustments, market switch, simplified units, light/dark/mobile. Synthetic data only.');
}catch(e){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:out+'/failure.png'});console.log((await page.locator('#billingRoot').innerText()).slice(-2500));}throw e;}finally{await browser.close();await preview.close();}
