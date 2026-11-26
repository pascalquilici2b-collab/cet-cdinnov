/** Synthetic local browser/Worker/D1 regression; no production, email or AI calls.
 * node platform/billing-draft-preservation-ui-test.mjs
 * Optional browser configuration: PLAYWRIGHT_PACKAGE, CHROMIUM_PATH.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixture,samplePDF} from './billing-quote-fixture.mjs';
import {blankSettings,addBillingDays} from './billing-domain.ts';
import {billingToday} from './billing-quote-domain.ts';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'.private/billing-draft-preservation-ui');await mkdir(out,{recursive:true});
const {chromium}=createRequire(process.env.PLAYWRIGHT_PACKAGE||resolve(root,'package.json'))('playwright');
const preview=await billingPreview({outboundService:async request=>{assert.equal(new URL(request.url).origin,'https://billing-fixture.invalid');assert.ok(new URL(request.url).pathname.endsWith('/preview-pdf'));return new Response(samplePDF(),{headers:{'Content-Type':'application/pdf'}});}});
const headers={Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1','Content-Type':'application/json',Cookie:preview.sessions[0].cookie};
const call=(path,method='GET',body,version)=>preview.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing'+path,{method,headers:{...headers,...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const ok=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
let browser,page;const checks={fictitiousOnly:true,documents:[],pageErrors:[]};
try{
 const today=billingToday(),template=quoteFixture(),settings={...blankSettings(),seller:template.seller,paymentTerms:'30 jours',iban:'FR1420041010050500013M02606',bic:'PSSTFRPPXXX'};await ok(await call('/settings','PUT',{data:settings},0));
 const docs=[];for(const [paymentMeans,days,label] of [['10',60,'Espèces'],['58',30,'Virement SEPA'],['48',60,'Carte bancaire']]){
  const data={...template,kind:'invoice',issueDate:today,dueDate:addBillingDays(today,days),validUntil:'',paymentMeans,paymentTerms:'Conditions historiques fictives',title:'AUDIT préservation '+label,iban:settings.iban,bic:settings.bic};
  docs.push({doc:await ok(await call('/documents','POST',{id:randomUUID(),data}),201),automatic:days===30,label});
 }
 const compiled=await build({entryPoints:[resolve(root,'platform/client/billing.tsx')],outfile:out+'/billing.js',bundle:true,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',minify:true,write:false,external:['/platform/pdf-editor-font.ttf'],define:{'process.env.NODE_ENV':'"production"'}}),js=compiled.outputFiles.find(f=>f.path.endsWith('.js')).text,css=compiled.outputFiles.find(f=>f.path.endsWith('.css')).text;
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});page=await browser.newPage({viewport:{width:1440,height:1000},locale:'fr-FR'});page.setDefaultTimeout(15000);page.on('pageerror',e=>checks.pageErrors.push(e.message));
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(/^(blob:|data:)/.test(url.protocol))return route.continue();if(url.origin!==preview.base)return route.abort();if(url.pathname==='/platform/billing.js')return route.fulfill({body:js,contentType:'application/javascript'});if(url.pathname==='/platform/billing.css')return route.fulfill({body:css,contentType:'text/css'});return route.continue();});
 const nav=()=>page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:'Factures',exact:true});
 const save=async()=>{await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.bill-save-state')?.textContent?.startsWith('Enregistré à'));};
 await page.goto(preview.base);await nav().waitFor();await nav().click();
 for(const {doc,automatic,label} of docs){
  const baselineWrites=preview.requests.filter(r=>r.path==='/api/v1/billing/documents/'+doc.id&&r.method==='PUT').length;
  await page.getByRole('button',{name:'Ouvrir '+doc.data.title,exact:true}).click();await page.getByLabel('Objet du document',{exact:true}).waitFor();await page.getByRole('img',{name:'Page 1 du document PDF',exact:true}).waitFor();
  assert.match(await page.locator('.bill-save-state').innerText(),/^Enregistré à/);assert.equal(await page.getByRole('button',{name:'Enregistrer',exact:true}).isDisabled(),true);assert.equal(preview.requests.filter(r=>r.path==='/api/v1/billing/documents/'+doc.id&&r.method==='PUT').length,baselineWrites);
  assert.match(await page.locator('[data-step=conditions]>summary').innerText(),new RegExp(label));await page.locator('[data-step=conditions]>summary').click();assert.equal(await page.locator('.bill-fixed-bank').count(),['30','58'].includes(doc.data.paymentMeans)?1:0);await page.locator('[data-step=document]>summary').click();
  await page.getByLabel('Objet du document',{exact:true}).fill(doc.data.title+' — titre modifié');await save();let stored=await ok(await call('/documents/'+doc.id));assert.equal(stored.data.paymentMeans,doc.data.paymentMeans);assert.equal(stored.data.dueDate,doc.data.dueDate);assert.equal(stored.data.paymentTerms,doc.data.paymentTerms);assert.deepEqual(stored.data.details,doc.data.details);
  const issueDate=addBillingDays(today,-1),expectedDueDate=automatic?addBillingDays(issueDate,30):doc.data.dueDate;await page.getByLabel('Date du document',{exact:true}).fill(issueDate);assert.equal(await page.getByLabel('Date d’échéance',{exact:true}).inputValue(),expectedDueDate);await save();stored=await ok(await call('/documents/'+doc.id));assert.equal(stored.data.paymentMeans,doc.data.paymentMeans);assert.equal(stored.data.dueDate,expectedDueDate);assert.equal(stored.data.issueDate,issueDate);
  // Once the user changes an automatic deadline explicitly, later date changes preserve it.
  if(automatic){const custom=addBillingDays(today,75);await page.getByLabel('Date d’échéance',{exact:true}).fill(custom);await page.getByLabel('Date du document',{exact:true}).fill(today);assert.equal(await page.getByLabel('Date d’échéance',{exact:true}).inputValue(),custom);await save();}
  checks.documents.push({paymentMeans:doc.data.paymentMeans,label,openedWithoutDirtyOrWrite:true,titleSavePreservesData:true,automaticDueDate:automatic,customDueDatePreserved:true});await page.screenshot({path:out+'/'+doc.data.paymentMeans+'.png',fullPage:true});await nav().click();
 }
 await page.getByRole('button',{name:'Nouvelle facture',exact:true}).first().click();await page.getByLabel('Date d’échéance',{exact:true}).waitFor();assert.equal(await page.getByLabel('Date d’échéance',{exact:true}).inputValue(),addBillingDays(today,30));assert.match(await page.locator('[data-step=conditions]>summary').innerText(),/Virement bancaire/);checks.newInvoiceDefaultsPreserved=true;
 assert.deepEqual(checks.pageErrors,[]);checks.completed=true;await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
}catch(error){await writeFile(out+'/failure.txt',error.stack);if(page)await page.screenshot({path:out+'/failure.png',fullPage:true});throw error;}finally{await browser?.close();await preview.close();}
