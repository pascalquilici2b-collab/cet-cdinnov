import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {stampEnvironment,fixtures} from './stamping-test-helper.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const ctx=await stampEnvironment(),f=await fixtures(),root=resolve('.'),out=resolve('.private/stamping-qa');await mkdir(out,{recursive:true});
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
 const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'fr-FR'});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>calls.push(r.url()));page.setDefaultTimeout(20000);
 await page.goto(base);await page.getByRole('heading',{name:'Tamponnage de pièces'}).waitFor();await page.screenshot({path:out+'/accueil.png'});
 await page.getByLabel('Nom du lot',{exact:true}).fill('Paie et factures · démonstration');await page.getByRole('button',{name:'Créer le lot',exact:true}).click();
 await page.getByLabel('Importer les PDF').setInputFiles([{name:'bulletin-fictif.pdf',mimeType:'application/pdf',buffer:Buffer.from(f.pdf,'base64')},{name:'facture-fictive.pdf',mimeType:'application/pdf',buffer:Buffer.from(f.invoice,'base64')}]);
 await page.getByRole('button',{name:'facture-fictive.pdf',exact:true}).waitFor();
 await page.getByLabel('Importer le document de paiement').setInputFiles({name:'repartition.csv',mimeType:'text/csv',buffer:Buffer.from(f.table,'base64')});
 await page.getByRole('heading',{name:'Correspondance des colonnes'}).waitFor();await page.screenshot({path:out+'/import.png',fullPage:true});
 await page.getByRole('button',{name:'Vérifier les lignes',exact:true}).click();await page.getByText('2 groupes de répartition',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Confirmer le document',exact:true}).click();await page.getByRole('button',{name:'Analyser les pièces',exact:true}).click();
 await page.locator('.stamp-status.NEEDS_APPROVAL').first().waitFor({timeout:60000});await page.locator('.stamp-status.NEEDS_APPROVAL').nth(1).waitFor({timeout:60000});
 await page.getByRole('button',{name:'bulletin-fictif.pdf',exact:true}).click();await page.locator('.stamp-preview img').waitFor();await page.locator('.stamp-preview img').evaluate(img=>img.decode());
 assert.match(await page.locator('.stamp-detail').innerText(),/6\s?459,40/);assert.match(await page.locator('.stamp-detail').innerText(),/717,70/);
 await page.screenshot({path:out+'/controle-six-projets.png',fullPage:true});
 await page.getByRole('button',{name:'Voir l’original',exact:true}).click();await page.waitForResponse(r=>r.url().includes('/source?image=1'));await page.locator('.stamp-preview img').evaluate(img=>img.decode());await page.locator('.stamp-placement').scrollIntoViewIfNeeded();
 const box=await page.locator('.stamp-placement').boundingBox();assert.ok(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+450);await page.mouse.up();
 await page.getByText('Disposition du tampon',{exact:true}).click();await page.getByRole('button',{name:'Recalculer l’aperçu',exact:true}).click();
 await page.locator('.stamp-status.REVIEW_REQUIRED').waitFor({timeout:60000});await page.getByRole('alert').filter({hasText:'recouvre'}).waitFor();
 // Reopen clears the tentative drag; automated placement can be safely retried.
 await page.getByRole('button',{name:'Fermer la fiche',exact:true}).click();await page.getByRole('button',{name:'bulletin-fictif.pdf',exact:true}).click();await page.getByRole('button',{name:'Relancer l’analyse automatique',exact:true}).click();
 await page.locator('.stamp-status.NEEDS_APPROVAL').nth(1).waitFor({timeout:60000});
 await page.getByLabel('J’ai vérifié la pièce, les imputations et l’aperçu',{exact:true}).check();await page.getByRole('button',{name:'Valider cette pièce',exact:true}).click();await page.getByRole('button',{name:'Tamponner',exact:true}).click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Télécharger le PDF tamponné',exact:true}).click()]);await download.saveAs(out+'/six-projets_tamponne.pdf');
 await page.getByRole('button',{name:'Voir le résultat',exact:true}).click();await page.locator('.stamp-preview img').waitFor();await page.locator('.stamp-preview img').evaluate(img=>img.decode());
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:out+`/resultat-dark-${width}.png`,fullPage:false});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 assert.deepEqual(errors,[]);assert.ok(calls.every(url=>url.startsWith(base)||url.startsWith('blob:')));
 await writeFile(out+'/checks.json',JSON.stringify({passed:true,checks:['real PDF/CSV import','column mapping','queued real processing','six allocations','safe placement','drag collision rejected','retry','approval','download','dark and mobile','no external browser calls'],ai:'simulated',pageErrors:errors},null,2));
 console.log('Browser end-to-end passed. Evidence: '+out);
}finally{await browser.close();await new Promise(r=>server.close(r));await ctx.worker.dispose();}
