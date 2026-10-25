import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {stampEnvironment,fixtures,py} from './stamping-test-helper.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const ctx=await stampEnvironment(),f=await fixtures(),root=resolve('.'),out=resolve('platform/.private/stamping-upload-20261025/qa');await mkdir(out,{recursive:true});
const html=`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/platform/stamping.css"><style>body{margin:0;background:#f6f8fa;font-family:Arial,sans-serif;color:#233242}#app{padding:28px;max-width:1440px;margin:auto}html[data-theme=dark]{--card:#18242d;--ink:#e7edf2;--line:#35444e;--muted:#a4b5c2;--accent-strong:#1682b5}html[data-theme=dark] body{background:#111a21;color:#e7edf2}@media(max-width:650px){#app{padding:12px}}</style><main id="app"></main><script type="module">import {mountStamping} from '/platform/stamping.js';mountStamping(document.querySelector('#app'),{baseUrl:location.origin,getToken:async()=>${JSON.stringify(ctx.admin.token)},isActive:()=>true});</script></html>`;
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/v1/stamping')){
   const body=[];for await(const chunk of req)body.push(chunk);
   const r=await ctx.worker.dispatchFetch('https://preview.example'+req.url,{method:req.method,headers:{...req.headers,host:'preview.example',origin:'http://127.0.0.1:5196'},...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(body)})});
   res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;
  }
  if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  const file=resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+sep)||pathname.includes('.private'))throw new Error();
  res.setHeader('Content-Type',({'.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch(e){res.writeHead(500);res.end('Test server error');console.error(e.message);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[],calls=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'fr-FR'});page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(25000);
 await page.goto(base);await page.getByRole('button',{name:/Prestations de services/}).click();await page.getByLabel('Nom du lot',{exact:true}).fill('Prestations · essai');await page.getByRole('button',{name:'Créer le lot',exact:true}).click();
 const zone=page.getByRole('button',{name:'Document de paiement',exact:true});await zone.waitFor();
 const drag=await page.evaluateHandle(()=>{const d=new DataTransfer();d.items.add(new File(['invalid'],'test.pdf',{type:'application/pdf'}));return d;});
 await zone.dispatchEvent('dragenter',{dataTransfer:drag});assert.equal(await page.locator('.stamp-upload.is-dragging').count(),1);assert.equal(await zone.getByText('Relâchez pour importer').count(),1);
 await zone.locator('strong').dispatchEvent('dragenter',{dataTransfer:drag});await zone.locator('strong').dispatchEvent('dragleave',{dataTransfer:drag});assert.equal(await page.locator('.stamp-upload.is-dragging').count(),1);
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:out+'/upload-'+theme+'.png',fullPage:true});}
 await zone.dispatchEvent('dragleave',{dataTransfer:drag});assert.equal(await page.locator('.stamp-upload.is-dragging').count(),0);
 await page.emulateMedia({reducedMotion:'reduce'});await zone.dispatchEvent('dragenter',{dataTransfer:drag});assert.equal(await page.locator('.is-dragging').evaluate(e=>getComputedStyle(e,'::before').animationName),'none');await zone.dispatchEvent('dragleave',{dataTransfer:drag});
 await zone.focus();const chooser=page.waitForEvent('filechooser');await page.keyboard.press('Enter');const fc=await chooser;
 await fc.setFiles({name:'payment.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:await py(['-c',"import runpy,sys;sys.stdout.buffer.write(runpy.run_path('tests/test_stamping_payment_import.py')['services_table']())"])});
 await page.getByRole('heading',{name:'Répartition reconnue',exact:true}).waitFor();assert.equal(await page.getByLabel('Fournisseur reconnu').inputValue(),'FOURNISSEUR-TEST');assert.equal(await page.getByLabel('Numéro de facture reconnu').inputValue(),'F-TEST');assert.equal(await page.getByLabel('Montant Projet A',{exact:true}).inputValue(),'1234.56');
 await page.getByLabel('Montant Projet A',{exact:true}).fill('1250.00');await page.getByRole('button',{name:'Confirmer la répartition',exact:true}).click();await page.getByRole('heading',{name:'Répartition reconnue',exact:true}).waitFor({state:'hidden'});
 const source=page.getByRole('button',{name:'Déposer les PDF',exact:true});
 const invalid=await page.evaluateHandle(()=>{const d=new DataTransfer();d.items.add(new File(['txt'],'text.txt',{type:'text/plain'}));return d;});await source.dispatchEvent('drop',{dataTransfer:invalid});await page.getByText('Choisissez uniquement des fichiers PDF.',{exact:true}).waitFor();
 const invoice=await page.evaluateHandle(encoded=>{const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],'facture-test.pdf',{type:'application/pdf'}));return d;},f.invoice);
 await source.dispatchEvent('dragenter',{dataTransfer:invoice});await source.dispatchEvent('drop',{dataTransfer:invoice});await page.getByRole('button',{name:'facture-test.pdf',exact:true}).waitFor();assert.equal(await page.locator('.stamp-upload.is-dragging').count(),0);
 await page.getByRole('button',{name:'Analyser les pièces',exact:true}).click();await page.locator('.stamp-status.NEEDS_APPROVAL').waitFor({timeout:60000});
 const b=(await ctx.db.prepare('SELECT data FROM stamp_documents').first());assert.equal(JSON.parse(b.data).total_cents,203910);
 await page.getByRole('button',{name:'Tous les lots',exact:true}).click();await page.getByLabel('Nom du lot',{exact:true}).fill('Prestations PDF · essai');await page.getByRole('button',{name:'Créer le lot',exact:true}).click();
 const payment=await py(['-c',"import runpy,sys;sys.stdout.buffer.write(runpy.run_path('tests/test_stamping_payment_import.py')['services_table']('pdf'))"]);
 const paymentDrag=await page.evaluateHandle(encoded=>{const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],'paiement.pdf',{type:'application/pdf'}));return d;},payment.toString('base64'));
 await page.getByRole('button',{name:'Document de paiement',exact:true}).dispatchEvent('drop',{dataTransfer:paymentDrag});await page.getByRole('heading',{name:'Répartition reconnue',exact:true}).waitFor();assert.equal(await page.getByLabel('Montant Projet A',{exact:true}).inputValue(),'1234.56');
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:out+`/services-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 assert.deepEqual(errors,[]);console.log('Animated drop zones, nested drag, keyboard chooser, reduced motion, file rejection, Excel/PDF service import and eligible amounts through stamping passed.');
}finally{await browser.close();await new Promise(r=>server.close(r));await ctx.worker.dispose();}
