/** Synthetic local UI/API regression. No e-mail, production service or AI.
 * node platform/billing-finalization-number-ui-test.mjs
 * Optional browser configuration: PLAYWRIGHT_PACKAGE, CHROMIUM_PATH.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {build} from 'esbuild';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixture} from './billing-quote-fixture.mjs';
import {blankSettings,calculateBilling,addBillingDays} from './billing-domain.ts';
import {billingToday} from './billing-quote-domain.ts';
import {billingCanonicalJSON} from './billing-issuance.ts';
import {billingMonthlyNumberSchema,billingNumberSQL} from './billing-monthly-number-schema.mjs';
import {migrateBilling} from './billing-schema.mjs';

const {chromium}=createRequire(process.env.PLAYWRIGHT_PACKAGE||new URL('../package.json',import.meta.url))('playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'.private/invoice-finalization-number-ui');await mkdir(out,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex'),today=billingToday();
function pdf(text){
 const stream='BT /F1 12 Tf 40 780 Td ('+text.replace(/[^\x20-\x7e]/g,' ').replace(/[()\\]/g,'\\$&')+') Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let bytes='%PDF-1.4\n',offsets=[];for(const [i,object] of objects.entries()){offsets.push(Buffer.byteLength(bytes));bytes+=`${i+1} 0 obj\n${object}\nendobj\n`;}
 const start=Buffer.byteLength(bytes);return Buffer.from(bytes+`xref\n0 6\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
}
let failFirstInvoice=true;const serviceCalls=[];
const preview=await billingPreview({outboundService:async request=>{
 const url=new URL(request.url);assert.equal(url.origin,'https://billing-fixture.invalid');const payload=await request.json();
 serviceCalls.push({path:url.pathname,number:payload.number||null,quoteNumber:payload.document?.references.quoteNumber||'',issueDate:payload.document?.issueDate});
 if(url.pathname.endsWith('/preflight-pdf'))return Response.json({valid:true,snapshotSha256:hash(billingCanonicalJSON({schemaVersion:1,document:payload.document,totals:calculateBilling(payload.document)})),checks:{render:true,amounts:true}});
 if(url.pathname.endsWith('/preview-pdf'))return new Response(pdf('DRAFT - fictitious - number assigned on finalization'),{headers:{'Content-Type':'application/pdf'}});
 assert.ok(url.pathname.endsWith('/generate-issued-pdf'));
 if(payload.document.kind==='invoice'&&failFirstInvoice){failFirstInvoice=false;return Response.json({detail:{message:'Synthetic rendering validation failure'}},{status:422});}
 const bytes=pdf('FICTITIOUS '+payload.number+' - quote '+(payload.document.references.quoteNumber||''));
 return Response.json({schemaVersion:1,envelopeSha256:payload.envelopeSha256,generatorVersion:'synthetic-numbering-ui',profile:payload.document.kind==='quote'?'quote-pdf':'invoice-pdf',artifacts:[{kind:'pdf',sha256:hash(bytes),size:bytes.length,contentType:'application/pdf',base64:bytes.toString('base64')}]});
}});
const headers={Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1','Content-Type':'application/json',Cookie:preview.sessions[0].cookie};
const call=(path,method='GET',body,version)=>preview.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing'+path,{method,headers:{...headers,...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const ok=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
const counter=async kind=>(await preview.ctx.db.prepare('SELECT coalesce(sum(next_value-first_value),0) AS n FROM billing_number_series WHERE kind=?').bind(kind).first()).n;
const invoiceRows=async()=>(await preview.ctx.db.prepare("SELECT id FROM billing_documents WHERE kind='invoice' ORDER BY created_at,id").all()).results;
const read=id=>call('/documents/'+id).then(ok);
let browser;
try{
 const template=quoteFixture();template.issueDate=today;template.validUntil=addBillingDays(today,60);
 const settings={...blankSettings(),seller:template.seller,paymentTerms:'30 jours',iban:'FR1420041010050500013M02606',bic:'PSSTFRPPXXX'};
 await ok(await call('/settings','PUT',{data:settings},0));
 const compiled=await build({entryPoints:[resolve(root,'platform/client/billing.tsx')],outfile:out+'/billing.js',bundle:true,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',minify:true,write:false,external:['/platform/pdf-editor-font.ttf'],define:{'process.env.NODE_ENV':'"production"'}});
 const js=compiled.outputFiles.find(f=>f.path.endsWith('.js')).text,css=compiled.outputFiles.find(f=>f.path.endsWith('.css')).text;
 const html=`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/platform/billing.css"><style>body{margin:0;padding:24px;background:#f7f9f8}</style><main id="app"></main><script type="module">import {mountBilling,createBillingTransport} from '/platform/billing.js';const transport=createBillingTransport({baseUrl:location.origin,getSession:async()=>"synthetic-session",isActive:()=>true});window.qaTransport=transport;mountBilling(document.querySelector('#app'),{transport,initialKind:'invoice',onLegacy:()=>{}});</script></html>`;
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true}),page=await context.newPage(),pageErrors=[],browserCalls=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>pageErrors.push(e.message));page.on('request',r=>browserCalls.push(r.url()));
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(/^(blob:|data:)/.test(url.protocol))return route.continue();if(url.origin!==preview.base)return route.abort();if(url.pathname==='/'||url.pathname==='/index.html'){const response=await route.fetch();return route.fulfill({response,body:html});}if(url.pathname==='/platform/billing.js')return route.fulfill({body:js,contentType:'application/javascript'});if(url.pathname==='/platform/billing.css')return route.fulfill({body:css,contentType:'text/css'});return route.continue();});
 const nav=kind=>page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:kind,exact:true});
 const step=async name=>{const panel=page.locator('[data-step="'+name+'"]');if(await panel.getAttribute('open')===null)await panel.locator(':scope > summary').click();};
 const finish=async()=>{const status=page.getByRole('button',{name:'Statut du document',exact:true});await page.waitForFunction(()=>{const button=document.querySelector('button[aria-label="Statut du document"]');return button&&!button.disabled;});await status.focus();await page.keyboard.press('ArrowDown');const dialog=page.getByRole('dialog',{name:'Finaliser ce document ?'});await page.waitForFunction(()=>document.querySelector('[role=menuitem][data-status=finalized]')||document.querySelector('.cdi-dialog[role=dialog]'));if(!await dialog.isVisible()){const item=page.getByRole('menuitem',{name:'Finalisé',exact:true});await item.focus();await page.keyboard.press('Enter');}await dialog.waitFor();await dialog.getByRole('button',{name:'Finaliser',exact:true}).click();};
 await page.goto(preview.base);await page.getByRole('button',{name:'Nouvelle facture',exact:true}).first().waitFor();const baseCounter=await counter('invoice');
 await page.getByRole('button',{name:'Nouvelle facture',exact:true}).first().click();await page.locator('.bill-document-number').filter({hasText:'Brouillon'}).waitFor();const first=(await invoiceRows())[0];assert.ok(first);
 assert.equal(await counter('invoice'),baseCounter);assert.equal((await read(first.id)).reservedNumber,null);
 await page.getByLabel('Objet du document',{exact:true}).fill('Facture UI fictive');
 await step('buyer');for(const [label,value] of [['Raison sociale','Client fictif UI'],['Adresse','1 rue de la Démonstration'],['Code postal','20000'],['Ville','Ajaccio']])await page.getByLabel('Client — '+label,{exact:true}).fill(value);
 await step('lines');await page.getByLabel('Description',{exact:true}).fill('Prestation fictive');await page.getByLabel('Prix unitaire HT (€)',{exact:true}).fill('120');
 await step('references');await page.getByLabel('Référence du devis',{exact:true}).fill('DEV-EXTERNE-FICTIF');assert.equal(await page.getByLabel('Référence du devis',{exact:true}).isEditable(),true);
 await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.bill-save-state')?.textContent?.startsWith('Enregistré à'));
 let draft=await read(first.id);assert.equal(draft.data.references.quoteNumber,'DEV-EXTERNE-FICTIF');assert.equal(draft.sourceDocumentId,null);assert.equal(await counter('invoice'),baseCounter);
 await nav('Factures').click();await page.getByRole('button',{name:'Ouvrir Facture UI fictive',exact:true}).click();await page.locator('.bill-document-number').filter({hasText:'Brouillon'}).waitFor();assert.equal(await counter('invoice'),baseCounter);assert.equal(preview.requests.filter(r=>r.path==='/api/v1/billing/documents/'+first.id+'/number').length,0);
 await page.screenshot({path:out+'/invoice-draft.png',fullPage:true});
 const beforeDates=[draft.data.issueDate,draft.data.dueDate];await finish();await page.getByRole('button',{name:'Statut du document',exact:true}).filter({hasText:'À reprendre'}).waitFor();draft=await read(first.id);const number=draft.issuance.number;assert.equal(await counter('invoice'),baseCounter+1);await page.locator('.bill-document-number').filter({hasText:number}).waitFor();
 await page.reload();await page.getByRole('button',{name:'Ouvrir Facture UI fictive',exact:true}).click();await page.getByRole('button',{name:'Reprendre',exact:true}).click();await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).waitFor();
 const issued=await read(first.id);assert.equal(issued.issuance.number,number);assert.deepEqual([issued.data.issueDate,issued.data.dueDate],beforeDates);assert.equal(await counter('invoice'),baseCounter+1);
 await page.locator('[role="status"]').filter({hasText:'Facture '+number+' finalisée'}).first().waitFor();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).click();const file=await download;assert.equal(file.suggestedFilename(),number+'-pdf.pdf');await file.saveAs(out+'/invoice-issued.pdf');assert.match((await readFile(out+'/invoice-issued.pdf')).toString(),new RegExp(number));
 await page.evaluate(async({id,version})=>{await window.qaTransport.finalize(id,version);},{id:first.id,version:issued.version});assert.equal(await counter('invoice'),baseCounter+1);await page.screenshot({path:out+'/invoice-finalized.png',fullPage:true});

 // A quote keeps its reservation and conversion retains its own reference.
 const quote=await page.evaluate(async({id,data})=>window.qaTransport.create(id,data),{id:randomUUID(),data:{...template,title:'Devis UI fictif'}});assert.ok(quote.reservedNumber?.number);const quoteNumber=quote.reservedNumber.number;
 await nav('Devis').click();await page.getByRole('button',{name:'Ouvrir Devis UI fictif',exact:true}).click();await finish();await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).waitFor();let q=await read(quote.id);assert.equal(q.issuance.number,quoteNumber);
 q=await ok(await call('/documents/'+q.id+'/quote-events','POST',{id:randomUUID(),documentVersion:q.version,action:'accepted',occurredOn:today,note:'Accord fictif local pour le test'},q.quote.version),201);
 const proof=pdf('FICTITIOUS SIGNED QUOTE');const params=new URLSearchParams({kind:'signed_quote',reference:quoteNumber,date:today,amountMinor:q.totals.netMinor,marketId:'',projectId:'',marketReference:''});
 const attached=await preview.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/documents/'+q.id+'/engagement?'+params,{method:'PUT',headers:{Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1',Cookie:preview.sessions[0].cookie,'If-Match':String(q.version),'X-Filename':'accord-fictif.pdf','Content-Type':'application/pdf'},body:proof});await ok(attached,201);
 await page.reload();await nav('Devis').click();await page.getByRole('button',{name:'Ouvrir Devis UI fictif',exact:true}).click();await page.getByRole('button',{name:'Créer la facture',exact:true}).click();await page.getByRole('dialog',{name:'Facturer le devis'}).getByRole('button',{name:'Créer la facture',exact:true}).click();await page.locator('.bill-document-number').filter({hasText:'Brouillon'}).waitFor();
 const converted=(await invoiceRows()).find(r=>r.id!==first.id);let linked=await read(converted.id);assert.equal(linked.sourceDocumentId,q.id);assert.equal(linked.data.references.quoteNumber,quoteNumber);assert.equal(linked.reservedNumber,null);assert.equal(await counter('invoice'),baseCounter+1);await step('references');assert.equal(await page.getByLabel('Référence du devis',{exact:true}).inputValue(),quoteNumber);assert.equal(await page.getByLabel('Référence du devis',{exact:true}).isEditable(),false);
 await finish();await page.getByRole('button',{name:'Télécharger le PDF',exact:true}).waitFor();linked=await read(linked.id);assert.notEqual(linked.issuance.number,quoteNumber);assert.equal(linked.data.references.quoteNumber,quoteNumber);assert.equal(linked.sourceDocumentId,q.id);assert.equal(await counter('invoice'),baseCounter+2);

 // Recreate only a local historical allocation, then reinstall current guards.
 await page.getByRole('button',{name:'Rectifier la facture',exact:true}).click();await page.getByRole('dialog',{name:'Rectifier avant transmission'}).getByRole('button',{name:'Facture non transmise · Rectifier',exact:true}).click();await page.locator('.bill-document-number').filter({hasText:'Brouillon'}).waitFor();const copyRows=await invoiceRows(),copy=await read(copyRows.find(r=>r.id!==first.id&&r.id!==linked.id).id);assert.equal(copy.rectification.parentId,linked.id);
 await preview.ctx.db.batch(billingMonthlyNumberSchema.filter(sql=>/billing_draft_number_guard/.test(sql)).map(sql=>preview.ctx.db.prepare(sql)));
 const series=await preview.ctx.db.prepare('SELECT s.* FROM billing_number_series s JOIN billing_issuances i ON i.series_id=s.id WHERE i.id=?').bind(linked.issuance.id).first();assert.ok(series);
 await preview.ctx.db.prepare(`INSERT INTO billing_draft_numbers SELECT d.id,s.id,s.issuer_siren,s.next_value,${billingNumberSQL('?')},?,?,? FROM billing_documents d JOIN billing_number_series s ON s.id=? WHERE d.id=?`).bind(today,today,today,new Date().toISOString(),'synthetic-ui',series.id,copy.id).run();await migrateBilling(preview.ctx.db);
 const oldNumber=(await preview.ctx.db.prepare('SELECT number FROM billing_draft_numbers WHERE document_id=?').bind(copy.id).first()).number,legacyCounter=await counter('invoice'),before=await read(copy.id);
 await page.reload();await page.getByRole('row').filter({has:page.getByText('Brouillon',{exact:true})}).getByRole('button',{name:'Ouvrir '+copy.data.title,exact:true}).click();await page.getByRole('button',{name:'Régulariser ce brouillon',exact:true}).click();const retirement=page.getByRole('dialog',{name:'Régulariser l’ancien numéro'});assert.equal(await retirement.getByRole('button',{name:'Retirer l’ancien numéro',exact:true}).isEnabled(),false);await retirement.getByLabel(/J’atteste/).check();await retirement.getByLabel('Motif du retrait de l’ancien numéro',{exact:true}).fill('Ancienne réservation fictive non transmise, PDF locaux vérifiés.');
 let releaseRetirement;await page.route('**/retire-draft-number',async route=>{await new Promise(resolve=>{releaseRetirement=resolve;});await route.continue();});const request=page.waitForRequest(r=>r.url().endsWith('/retire-draft-number'));await retirement.getByRole('button',{name:'Retirer l’ancien numéro',exact:true}).click();const submitted=await request;assert.equal(await retirement.getByLabel(/J’atteste/).isDisabled(),true);assert.equal(await retirement.getByLabel('Motif du retrait de l’ancien numéro',{exact:true}).isDisabled(),true);releaseRetirement();assert.equal(submitted.headers()['if-match'],String(before.version));await page.getByRole('button',{name:'Régulariser ce brouillon',exact:true}).waitFor({state:'detached'});await page.unroute('**/retire-draft-number');const retired=await read(copy.id);assert.deepEqual(retired.data,before.data);assert.equal(retired.issuance,null);assert.equal(retired.reservedNumber,null);assert.equal(retired.rectification.parentId,linked.id);assert.equal(retired.retiredNumber.number,oldNumber);assert.equal(await counter('invoice'),legacyCounter);assert.equal(await page.locator('.bill-document-number').textContent(),'Brouillon');
 await page.evaluate(async({id,version,input})=>window.qaTransport.retireDraftNumber(id,version,input),{id:copy.id,version:before.version,input:submitted.postDataJSON()});assert.equal((await preview.ctx.db.prepare('SELECT count(*) n FROM billing_invoice_number_retirements WHERE document_id=?').bind(copy.id).first()).n,1);
 await page.screenshot({path:out+'/legacy-retired-draft.png',fullPage:true});assert.deepEqual(pageErrors,[]);assert.ok(browserCalls.every(url=>url.startsWith(preview.base)||/^(data:|blob:)/.test(url)));
 await writeFile(out+'/checks.json',JSON.stringify({passed:true,invoiceNumber:number,quoteNumber,linkedInvoiceNumber:linked.issuance.number,newInvoiceNumberCalls:preview.requests.filter(r=>r.path.endsWith('/number')&&!r.path.includes(quote.id)).length,legacyRetirementWithoutIssuance:true,counterUnaffectedByDraftSave:true,datesPreserved:true,sourceQuoteLinkPreserved:true,serviceCalls,pageErrors,browserCallsLocalOnly:true,pdfService:'synthetic PDF adapter; real renderer covered separately'},null,2));
 console.log('PASS invoice UI: drafts/save/read no numbering; finalization/retry/replay; independent quote numbering/reference; audited legacy retirement; no email, AI or production network.');
}catch(error){if(browser){for(const page of browser.contexts().flatMap(c=>c.pages())){await writeFile(out+'/failure.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/failure.png',fullPage:true});}console.error(preview.requests.slice(-12));}throw error;}finally{await browser?.close();await preview.close();}
