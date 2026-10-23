import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {zipSync,strToU8} from 'fflate';
import {jsPDF} from 'jspdf';
import ExcelJS from 'exceljs';
import {billingPreview} from './billing-preview.mjs';
const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const out='platform/.private/market-import-20261023';await mkdir(out,{recursive:true});
let modelCalls=0;
const preview=await billingPreview({ai:async input=>{
 modelCalls++;const text=input.messages.at(-1).content;
 const facts=[],prices=[],conditions=[];
 for(const [field,value,quote] of [['title','Assistance AZUR','Objet : Assistance AZUR.'],['clientName','Commune Fictive','Acheteur : Commune Fictive.'],['reference','TEST-26','Reference : TEST-26.'],['startBasis','notification','Demarrage a notification pour une duree initiale de 24 mois.'],['initialDurationMonths',24,'Demarrage a notification pour une duree initiale de 24 mois.'],['maximumMinor',12000000,'Montant maximum global du contrat : 120 000 euros HT.']])if(text.includes(quote))facts.push({field,value,quote});
 if(text.includes('Assistance technique'))prices.push({label:'Assistance technique',unit:'day',amount:700,quote:'A2 : Assistance technique | B2 : 700 | C2 : HT / jour'});
 if(text.includes('Paiement sous 30 jours apres reception.'))conditions.push({category:'payment',label:'Paiement',value:'30 jours apres reception',quote:'Paiement sous 30 jours apres reception.'});
 return {response:{facts,prices,ceilings:[],periods:[],conditions,issues:[]}};
}}),browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});
const headers={Authorization:'Bearer '+preview.sessions[0].token,Origin:'https://app.cdinnov.eu'};
try{
 const pdf=new jsPDF();pdf.text(['ACTE D ENGAGEMENT','Objet : Assistance AZUR.','Acheteur : Commune Fictive.','Reference : TEST-26.','Demarrage a notification pour une duree initiale de 24 mois.','Montant maximum global du contrat : 120 000 euros HT.'],20,30);
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('BPU');sheet.addRow(['Prestation','Prix unitaire','Unite']);sheet.addRow(['Assistance technique',700,'HT / jour']);
 const zip=zipSync({'dossier/AE.pdf':new Uint8Array(pdf.output('arraybuffer')),'dossier/BPU.xlsx':new Uint8Array(await workbook.xlsx.writeBuffer())});
 const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'fr-FR'});await context.route('**/*',route=>route.request().url().startsWith(preview.base)||route.request().url().startsWith('data:')?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(preview.base);await page.locator('[data-react-billing]').waitFor();await page.evaluate(()=>setView('marches'));await page.getByRole('button',{name:'Nouveau marché',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Importer',exact:true}).count(),1);
 await page.locator('#mkImportFiles').setInputFiles({name:'marche.zip',mimeType:'application/zip',buffer:Buffer.from(zip)});
 await page.getByText(/2 pièce\(s\) importée\(s\).*élément\(s\) reconnus/).waitFor();
 const list=await(await preview.ctx.call('markets',{headers})).json();assert.equal(list.markets.length,1);const id=list.markets[0].id;
 const get=async()=>await(await preview.ctx.call('markets/'+id,{headers})).json();let saved=await get();
 assert.equal(saved.market.title,'Assistance AZUR');assert.equal(saved.market.clientName,'Commune Fictive');assert.equal(saved.market.initialDurationMonths,24);assert.equal(saved.market.maximumMinor,12000000);assert.equal(saved.market.prices[0].amountMinor,70000);assert.equal(saved.market.prices[0].status,'proposed');assert.deepEqual(saved.documents.map(d=>d.kind).sort(),['ae','price']);assert.equal(saved.market.version,2);
 assert.equal(await page.locator('.mk-file-icon-pdf').count(),1);assert.equal(await page.locator('.mk-file-icon-xls').count(),1);
 await page.screenshot({path:out+'/pieces-light.png',fullPage:true});
 // A progressive Word import fills payment terms, preserving existing edits and rates.
 await page.locator('[data-tab=summary]').click();await page.locator('#mk-title').fill('Objet personnalise');await page.locator('[data-action=save]').click();await page.getByText(/Fiche enregistrée · version 3/).waitFor();
 const docx=zipSync({'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Paiement sous 30 jours apres reception.</w:t></w:r></w:p></w:body></w:document>')});
 await page.locator('#mkImportFiles').setInputFiles({name:'CCAP.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(docx)});await page.getByText(/1 pièce\(s\) importée\(s\).*élément\(s\) reconnus/).waitFor();
 saved=await get();assert.equal(saved.market.conditions[0].category,'payment');assert.equal(saved.market.title,'Objet personnalise');assert.equal(saved.market.prices.length,1);assert.equal(saved.documents.length,3);
 // Retrying an existing original does not create duplicate files or tariff rows.
 await page.locator('#mkImportFiles').setInputFiles({name:'marche.zip',mimeType:'application/zip',buffer:Buffer.from(zip)});await page.getByText(/2 déjà présente\(s\).*élément\(s\) reconnus/).waitFor();saved=await get();assert.equal(saved.documents.length,3);assert.equal(saved.market.prices.length,1);assert.equal(saved.market.title,'Objet personnalise');assert.ok(saved.market.issues.some(i=>i.title==='Vérifier : title'));
 const before=modelCalls;await page.locator('[data-analyse]').first().click();await page.getByText(/élément\(s\) reconnus · fiche mise à jour/).waitFor();assert.ok(modelCalls>before);assert.ok(!preview.requests.some(r=>r.path.endsWith('?analysis=1')));
 await page.evaluate(()=>CDITheme.set('dark'));await page.locator('.mk-analysis-details>summary').click();await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));window.scrollTo(0,0);});await page.screenshot({path:out+'/pieces-dark.png',fullPage:true});
 const colors=await page.locator('.mk-ai-proposals>div').first().evaluate(e=>({bg:getComputedStyle(e).backgroundColor,fg:getComputedStyle(e).color}));assert.equal(colors.bg,'rgb(45, 45, 48)');assert.equal(colors.fg,'rgb(245, 245, 247)');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/pieces-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 const ocr=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=1800;c.height=400;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='50px Arial';x.fillText('BORDEREAU DES PRIX UNITAIRES',60,90);x.fillText('Assistance technique : 700 euros HT par jour.',60,180);const blob=await new Promise(r=>c.toBlob(r,'image/png'));const {readDocument}=await import('/marches/reader.mjs?v=market-import-20261023');return readDocument(new File([blob],'BPU-scan.png',{type:'image/png'}));});assert.equal(ocr.method,'ocr');assert.match(ocr.text,/700/);assert.match(ocr.text,/Assistance technique/i);
 console.log({passed:true,modelCalls,files:saved.documents.length,checks:'ZIP, real PDF/Excel/Word parsing, automatic Qwen flow (stub), classification, persistence, sources, deduplication, manual values, legacy analysis button, dark mode and mobile'});
}catch(e){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:out+'/failure.png',fullPage:true});console.log((await page.locator('#marketRoot').innerText()).slice(0,3000));}throw e;}finally{await browser.close();await preview.close();}
