import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import {blankSettings} from './billing-domain.ts';
import {quoteFixture} from './billing-quote-fixture.mjs';
import {billingPreview} from './billing-preview.mjs';
import {fixture as marketFixture} from '../marches/test.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const python=new URL('./.private/facturx-venv/Scripts/python.exe',import.meta.url).pathname.replace(/^\//,''),cwd=new URL('../facturx-service/',import.meta.url).pathname.replace(/^\//,'');
const render=body=>new Promise((resolve,reject)=>{const p=spawn(decodeURIComponent(python),['-X','utf8','-c',"import sys,json;from cdi_facturx.billing_document import PreviewRequest;from cdi_facturx.document_pdf import render_document;r=PreviewRequest.model_validate(json.load(sys.stdin));sys.stdout.buffer.write(render_document(r.document.model_dump(),r.document.draft_totals(),number=r.number,editable=r.editable))"],{cwd:decodeURIComponent(cwd),windowsHide:true});let output=[],error=[];p.stdout.on('data',b=>output.push(b));p.stderr.on('data',b=>error.push(b));p.on('exit',c=>c?reject(Error(Buffer.concat(error).toString())):resolve(Buffer.concat(output)));p.stdin.end(JSON.stringify(body));});
const preview=await billingPreview({outboundService:async req=>{assert.equal(new URL(req.url).hostname,'billing-fixture.invalid');try{return new Response(await render(await req.json()),{headers:{'Content-Type':'application/pdf'}});}catch(e){console.error(e.message);return new Response('invalid',{status:422});}}}),browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});
await mkdir(new URL('./.private/modules-20261022/ui/',import.meta.url),{recursive:true});
try{
 const headers={Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+preview.sessions[0].token,'Content-Type':'application/json'};
 const settings=blankSettings();settings.seller=quoteFixture().seller;
 const settingResult=await preview.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/settings',{method:'PUT',headers:{...headers,'If-Match':'0'},body:JSON.stringify({data:settings})});assert.equal(settingResult.status,200);
 const m={...marketFixture(),startBasis:'date',startDate:'2026-01-01',initialDurationMonths:12,projects:[{id:'project-1',name:'Projet commun',code:'PC',startDate:'2026-01-01',endDate:'2026-12-31',notes:'',archived:false,orders:[]}]};await preview.ctx.call('markets',{method:'POST',headers,body:JSON.stringify({id:'market-test',market:m})});
 const context=await browser.newContext({viewport:{width:1440,height:1050}});await context.route('**/*',r=>r.request().url().startsWith(preview.base)||r.request().url().startsWith('data:')?r.continue():r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(preview.base);
 const choose=async(label,value)=>{await page.getByRole('combobox',{name:label,exact:true}).click();const option=page.locator('[role=option][data-value="'+value+'"]');assert.equal(await option.locator('.cdi-activity[data-state=active]').count(),1);if(label==='Marché du projet'){assert.ok((await option.innerText()).includes(m.clientName));await page.screenshot({path:'platform/.private/unified-20261023a/selection-marche.png'});}await option.click();};
 const nav=page.getByRole('navigation',{name:'Documents commerciaux'});await nav.getByRole('button',{name:'Projets',exact:true}).click();await page.getByRole('button',{name:'Nouveau projet'}).click();await choose('Marché du projet','market-test');await page.getByLabel('Date de début du projet').fill('2026-01-01');await page.getByLabel('Date de fin du projet').fill('2026-12-31');assert.match(await page.getByLabel('État du projet',{exact:true}).innerText(),/Actif/);await page.getByLabel('Date de fin du projet').fill('2026-01-31');assert.match(await page.getByLabel('État du projet',{exact:true}).innerText(),/Inactif/);await page.getByLabel('Date de fin du projet').fill('2026-12-31');await page.getByLabel('Nom du projet').fill('Projet créé');await page.getByLabel('ID du projet',{exact:true}).fill('TEST-2026');await page.getByLabel('Programme',{exact:true}).selectOption('Interreg Euro-Med');await page.getByRole('button',{name:'Enregistrer le projet'}).click();await page.getByText('Projet enregistré.',{exact:true}).waitFor();
 const savedProjects=await(await preview.ctx.worker.dispatchFetch('https://preview.test/api/v1/projects',{headers})).json();const savedProject=savedProjects.projects.find(p=>p.name==='Projet créé');assert.equal(savedProject.startDate,'2026-01-01');assert.equal(savedProject.endDate,'2026-12-31');
 await nav.getByRole('button',{name:'Prestations',exact:true}).click();await page.getByRole('button',{name:'+ Nouvelle prestation',exact:true}).click();assert.equal(await page.getByLabel('Référence catalogue',{exact:true}).count(),0);page.once('dialog',d=>d.accept());await page.locator('.bill-back').click();
 await nav.getByRole('button',{name:'Devis',exact:true}).click();await page.getByRole('button',{name:'Nouveau devis',exact:true}).click();await page.locator('.bill-document-number').waitFor();const draftNumber=await page.locator('.bill-document-number').innerText();assert.match(draftNumber,/^\d{8}-001$/);await page.getByLabel('Objet du document',{exact:true}).fill('Mission européenne');await page.getByLabel('Validité du devis (mois)').fill('3');await page.getByRole('button',{name:'Période concernée',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Semestre 1',exact:true}).click();await page.keyboard.press('Escape');await page.getByLabel('Programme de financement').selectOption('Horizon Europe');await choose('Marché lié','market-test');assert.equal(await page.getByLabel('Objet du marché',{exact:true}).inputValue(),m.title);await choose('Projet lié','project-1');
 await page.getByRole('button',{name:'Modifier l’objet du document',exact:true}).waitFor({timeout:20000});await page.getByRole('button',{name:'Modifier l’objet du document',exact:true}).click();
 for(const theme of ['light','dark']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  const colors=await page.getByLabel('Valeur du champ').evaluate(el=>{const c=getComputedStyle(el);return {color:c.color,background:c.backgroundColor};});
  const luminance=rgb=>rgb.match(/[\d.]+/g).slice(0,3).map(n=>Number(n)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const values=[luminance(colors.color),luminance(colors.background)].sort((a,b)=>b-a);assert.ok((values[0]+.05)/(values[1]+.05)>=4.5,JSON.stringify({theme,colors}));
 }
 await page.screenshot({path:new URL('./.private/modules-20261022/ui/contraste-nuit.png',import.meta.url).pathname.replace(/^\//,'')});
 await page.evaluate(()=>document.documentElement.dataset.theme='light');
 await page.getByLabel('Valeur du champ').fill('Mission ajustée dans l’aperçu');await page.getByRole('button',{name:'Appliquer',exact:true}).click();assert.equal(await page.getByLabel('Objet du document',{exact:true}).inputValue(),'Mission ajustée dans l’aperçu');
 const canvas=page.getByRole('img',{name:'Page 1 du document PDF'});await page.getByRole('button',{name:'Modifier l’objet du document',exact:true}).waitFor();assert.ok(Math.abs((await canvas.boundingBox()).width-794)<1);
 for(const zoom of [1,.75,.5,1.25]){
  await page.getByRole('button',{name:'Format A4 à 100 %'}).click();
  for(let n=0;n<Math.abs(zoom-1)/.25;n++)await page.getByRole('button',{name:zoom<1?'Réduire le zoom':'Agrandir le PDF'}).click();
  await page.getByRole('button',{name:'Modifier l’objet du document',exact:true}).waitFor();
  const measured=await page.waitForFunction(z=>{
   const canvas=document.querySelector('.bill-pdf-page canvas'),buttons=Array.from(document.querySelectorAll('.bill-pdf-edit-field'));
   if(!canvas||Math.abs(canvas.getBoundingClientRect().width-794*z)>=1||document.querySelector('.bill-pdf-rendering')||buttons.length<=5)return false;
   return buttons.map(b=>{const c=b.parentElement.querySelector('canvas').getBoundingClientRect(),r=b.getBoundingClientRect();return {dx:r.left-c.left-parseFloat(b.style.left),dy:r.top-c.top-parseFloat(b.style.top),dw:r.width-parseFloat(b.style.width),dh:r.height-parseFloat(b.style.height)};});
  },zoom);
  const areas=await measured.jsonValue();await measured.dispose();
  assert.ok(areas.length>5);assert.ok(areas.every(a=>Object.values(a).every(v=>Math.abs(v)<.1)),JSON.stringify(areas));
 }
 await page.getByRole('button',{name:'Format A4 à 100 %'}).click();
 assert.equal(await page.getByLabel('Mode de paiement',{exact:true}).count(),0);assert.equal(await page.getByLabel('Exigibilité de la TVA',{exact:true}).count(),0);
 assert.ok(await page.locator('.bill-button-pdf').count());assert.equal(await page.locator('.bill-button-pdf').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(201, 42, 54)');
await page.locator('.bill-pdf-sheet .bill-sr-only').filter({hasText:draftNumber}).waitFor();
 await page.locator('[data-step=conditions]>summary').click();await page.getByLabel('Conditions de paiement',{exact:true}).waitFor({state:'visible'});assert.ok(await page.getByLabel('Conditions de paiement',{exact:true}).isVisible());assert.equal(await page.locator('.bill-extra-fields[open]').count(),0);
 await page.screenshot({path:new URL('./.private/modules-20261022/ui/editeur.png',import.meta.url).pathname.replace(/^\//,'')});
 page.once('dialog',d=>d.accept());await page.evaluate(()=>setView('notesfrais'));await page.getByRole('button',{name:'Créer une note de frais'}).click();await choose('Projet','project-1');assert.equal(await page.locator('#nfAffaire,#nfCodeA').count(),0);assert.ok(await page.getByRole('region',{name:'Identification du salarié'}).isVisible());await page.getByLabel('Objet de la mission').fill('Mission test aperçu');await page.getByRole('button',{name:'Aperçu',exact:true}).click();await page.getByRole('img',{name:'Page 1 du document PDF'}).waitFor({timeout:20000});await page.locator('.bill-pdf-sheet .bill-sr-only').filter({hasText:'Projet commun'}).waitFor();await page.screenshot({path:new URL('./.private/modules-20261022/ui/frais.png',import.meta.url).pathname.replace(/^\//,'')});await page.getByRole('button',{name:'Retour',exact:true}).click();assert.equal(await page.locator('#nfProject').inputValue(),'project-1');assert.equal(await page.getByLabel('Objet de la mission').inputValue(),'Mission test aperçu');
 await page.evaluate(()=>{closeModal();setView('agenda');});await page.evaluate(()=>openAgendaTrip(null,'2026-10-23'));await page.getByRole('button',{name:'Afficher la liste : Projets concernés',exact:true}).click();await page.locator('#ag-project-options [data-value="Projet commun"] .cdi-activity[data-state=active]').waitFor();await page.evaluate(()=>closeModal());
 assert.deepEqual(errors,[]);console.log('OK Interface Projets, devis, édition dans le PDF A4, frais, agenda et aperçu fidèle.');
}finally{await browser.close();await preview.close();}
