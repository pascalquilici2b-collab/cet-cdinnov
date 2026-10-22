import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {billingPreview} from './billing-preview.mjs';
import {emptyMarket,marketTracking,validateMarket} from '../marches/domain.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const m={...emptyMarket(),title:'Accompagnement européen',reference:'M-2026',clientName:'Client fictif',clientId:'client-test',startBasis:'first_order',initialDurationMonths:24,maximumMinor:1000000,prices:[{id:'bpu-1',label:'Assistance BPU',unit:'day',amountMinor:80000,status:'proposed',profile:'',location:'',startDate:'',endDate:'',notes:'',source:{documentId:'',locator:'',note:''}}],projects:[{id:'project-a',name:'Projet A',code:'PA',notes:'',archived:true,orders:[{id:'order-1',reference:'BC1',date:'2026-10-01',amountMinor:200000,archived:true,documentId:'',notes:''},{id:'order-2',reference:'BC2',date:'',amountMinor:100000,archived:false,documentId:'',notes:''}]}]};
assert.equal(validateMarket(m).initialDurationMonths,24);assert.throws(()=>validateMarket({...m,initialDurationMonths:18}));assert.throws(()=>validateMarket({...m,startBasis:'date',startDate:''}));
assert.deepEqual(marketTracking(m),{orderCount:1,orderedMinor:200000,unknownAmounts:0,maximumMinor:1000000,startDate:'2026-10-01'});
const preview=await billingPreview(),browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});
try{
 const headers={Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+preview.sessions[0].token,'Content-Type':'application/json'};
 const response=await preview.ctx.worker.dispatchFetch('https://preview.test/budgets/markets',{method:'POST',headers,body:JSON.stringify({id:'market-test',market:m})});assert.equal(response.status,201);
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',r=>r.request().url().startsWith(preview.base)?r.continue():r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(preview.base);await page.evaluate(()=>setView('marches'));
 await page.getByRole('button',{name:'Ouvrir',exact:true}).click();await page.getByRole('button',{name:'Fiche marché',exact:true}).click();
 await page.getByLabel('Démarrage du marché').selectOption('date');await page.locator('#mk-startDate').fill('2026-11-01');
 await page.getByLabel('Durée initiale du marché').selectOption('36');await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.getByText('Fiche enregistrée · version 2',{exact:true}).waitFor();
 assert.equal(await page.getByRole('progressbar',{name:'Consommation prévisionnelle par devis envoyés'}).getAttribute('value'),'0');
 await page.getByRole('button',{name:'Tarifs',exact:true}).click();await page.getByLabel('Tarif du BPU').selectOption('bpu-1');
 await page.getByRole('button',{name:'+ Frais de déplacement',exact:true}).click();assert.equal(await page.locator('[data-path="prices.1.label"]').inputValue(),'Frais de déplacement');
 page.once('dialog',d=>d.accept());await page.evaluate(()=>setView('facturier'));
 await page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:'Clients',exact:true}).click();await page.getByRole('button',{name:'Ouvrir la fiche Client fictif',exact:true}).click();
 await page.getByRole('button',{name:'Créer un devis pour ce client'}).click();await page.locator('summary').filter({hasText:'Prestations'}).click();
 await page.getByRole('button',{name:'+ Ajouter depuis le catalogue'}).click();const bpu=page.getByRole('region',{name:'BPU du client'});
 assert.match(await bpu.getByRole('combobox',{name:'Marché du client'}).innerText(),/Client fictif/);await bpu.getByRole('button',{name:/Assistance BPU/}).click();
 assert.equal(await page.getByLabel('Prix unitaire HT (€)',{exact:true}).inputValue(),'800.00');
 assert.deepEqual(errors,[]);console.log('OK Marchés : dates/durée, suivi des BC archivés, frais, sélection BPU et reprise du tarif.');
}finally{await browser.close();await preview.close();}
