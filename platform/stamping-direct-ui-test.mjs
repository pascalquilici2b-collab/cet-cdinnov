import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {stampEnvironment,fixtures,py} from './stamping-test-helper.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const ctx=await stampEnvironment(),f=await fixtures(),root=resolve('.'),out=resolve('platform/.private/evolutions-20261026/stamping');await mkdir(out,{recursive:true});
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
 await page.goto(base);await page.getByRole('button',{name:/Prestations de services/}).click();await page.getByLabel('Nom du lot',{exact:true}).fill('Lot sans document de paiement');await page.getByRole('button',{name:'Créer le lot',exact:true}).click();
 await page.getByLabel('Sans document de paiement',{exact:true}).check();await page.getByLabel('Projet',{exact:true}).fill('Projet démonstration');await page.locator('.stamp-direct select').selectOption('TTC');await page.getByRole('button',{name:'Appliquer au lot',exact:true}).click();await page.getByRole('button',{name:'Document de paiement',exact:true}).waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Pièces à tamponner',exact:true}).locator('input[type=file]').setInputFiles({name:'facture-directe.pdf',mimeType:'application/pdf',buffer:Buffer.from(f.invoice,'base64')});await page.getByLabel('Taux TVA · facture-directe.pdf',{exact:true}).fill('10');
 await page.getByRole('button',{name:'Analyser les pièces',exact:true}).click();await page.getByText(/Saisissez le montant à imputer pour cette facture/).waitFor();assert.equal((await ctx.db.prepare('SELECT status FROM stamp_documents').first()).status,'UPLOADED');
 await page.getByLabel('Montant à imputer · facture-directe.pdf',{exact:true}).fill('1250.55');
 await page.getByRole('button',{name:'Analyser les pièces',exact:true}).click();await page.locator('.stamp-status.NEEDS_APPROVAL').waitFor({timeout:60000});
 const b=(await ctx.db.prepare('SELECT data FROM stamp_documents').first()),result=JSON.parse(b.data);assert.equal(result.total_cents,125055);assert.equal(result.base_cents,789481);assert.equal(result.directInvoice.vatRate,'10');assert.equal(result.directInvoice.amount,'1250.55');assert.equal(result.allocations[0].project,'Projet démonstration');assert.equal(ctx.aiCalls(),0);
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:out+'/direct-'+theme+'.png',fullPage:true});}
 await page.getByRole('button',{name:/Aperçu à valider · facture-directe/}).click();await page.getByRole('button',{name:'Valider cette pièce',exact:true}).waitFor();assert.deepEqual(errors,[]);console.log('Services sans référence : montant obligatoire et partiel par facture, TVA, queue réelle et aperçu vérifiés.');
}finally{await browser.close();await new Promise(r=>server.close(r));await ctx.worker.dispose();}
