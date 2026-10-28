import assert from 'node:assert/strict';
import {zipSync} from 'fflate';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {stampEnvironment,fixtures,py} from './stamping-test-helper.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const ctx=await stampEnvironment(),f=await fixtures(),root=resolve('.'),out=resolve('platform/.private/stamping-shared-20261027/qa');await mkdir(out,{recursive:true});
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
 const read=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
 const {id}=await read(await ctx.send('/batches',{name:'RH · ZIP et bulletins regroupés',category:'RH'}),201),path='/batches/'+id;
 await read(await ctx.upload(path+'/table',Buffer.from(f.table,'base64'),'payment.csv',1));let b=await read(await ctx.call(path)),s=b.data.table.sheets[0];
 await read(await ctx.send(path+'/mapping',{mapping:{sheet:s.name,header:s.header,mapping:s.mapping},confirmed:true},b.version));
 b=await read(await ctx.call(path));const g=b.data.import.groups.find(g=>g.document_type==='PAYSLIP');
 const bundle=await py(['-c',"import sys;sys.path.insert(0,'tests');from test_stamping_intake_manual import bundle;sys.stdout.buffer.write(bundle())"]);
 const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'fr-FR'});page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByRole('button',{name:/Ressources humaines/}).click();await page.getByRole('button',{name:/^RH · ZIP et bulletins regroupés/}).click();
 await page.getByLabel('Importer une nouvelle pièce',{exact:true}).setInputFiles({name:'bulletins.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'agent/bulletins.pdf':bundle}))});
 console.log('Upload ZIP submitted');await page.getByText('3 pièces importées',{exact:true}).waitFor();console.log('3 documents visible');assert.equal(await page.locator('.stamp-documents tbody tr').count(),3);
 await page.getByRole('button',{name:'À analyser · bulletins · pages 1–2.pdf',exact:true}).click();
 await page.getByLabel('Groupe du document de paiement',{exact:true}).selectOption(g.id);
 await page.getByLabel('Salaire brut chargé vérifié dans le PDF (EUR)',{exact:true}).fill('7500');
 await page.getByLabel('J’ai vérifié l’identité et la période / le numéro de la pièce',{exact:true}).check();
 await page.getByLabel('J’ai vérifié le montant de référence dans le PDF',{exact:true}).check();
 const before=ctx.serviceActions.length;console.log('Manual fields complete');
 await page.getByRole('button',{name:'Confirmer les corrections',exact:true}).click();
 await page.getByRole('button',{name:'Tamponner',exact:true}).waitFor();assert.deepEqual(ctx.serviceActions.slice(before),['confirm']);assert.equal(ctx.aiCalls(),0);
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:out+'/corrections-validees.png',fullPage:true});
 await page.getByRole('button',{name:'Fermer la fiche',exact:true}).click();await page.getByRole('button',{name:'Tous les lots',exact:true}).click();await page.getByRole('button',{name:'Types de pièces',exact:true}).click();
 await page.getByRole('button',{name:/Prestations de services/}).click();await page.getByLabel('Nom du lot',{exact:true}).fill('Factures ZIP · essai');await page.getByRole('button',{name:'Créer le lot',exact:true}).click();
 await page.getByLabel('Importer les PDF ou ZIP',{exact:true}).setInputFiles({name:'factures.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'factures/facture.pdf':Buffer.from(f.invoice,'base64')}))});
 await page.getByRole('button',{name:'facture.pdf',exact:true}).waitFor();assert.equal(await page.locator('.stamp-documents tbody tr').count(),1);
 assert.deepEqual(errors,[]);console.log('UI: ZIP imports in RH and Services, 4-page bundle -> 3 pieces, explicit manual confirmation -> green Ready with no analysis/AI: PASS');
}catch(e){console.error(e);for(const p of browser.contexts().flatMap(c=>c.pages())){console.log((await p.locator('body').innerText()).slice(-5000));await p.screenshot({path:out+'/failure.png',fullPage:true});}throw e;}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await ctx.worker.dispose();}
