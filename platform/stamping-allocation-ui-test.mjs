import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {stampEnvironment,fixtures,py} from './stamping-test-helper.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const ctx=await stampEnvironment(),f=await fixtures(),root=resolve('.'),out=resolve('platform/.private/stamping-allocation-20261025/qa');await mkdir(out,{recursive:true});
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
 const workbook=await py(['-c',"import runpy,sys;sys.stdout.buffer.write(runpy.run_path('tests/test_stamping_allocations.py')['allocation_workbook']())"]);
 const payroll=await py(['-c',"import io,sys;from reportlab.pdfgen import canvas;from cdi_facturx.stamping_pdf import FONT;o=io.BytesIO();c=canvas.Canvas(o);c.setFont(FONT,11);[c.drawString(32,810-i*22,t) for i,t in enumerate(['Bulletin de paie - TEST','Madame Camille TEST','Matricule : 12345','Période : février 2025','Total versé par l’employeur : 6 929,52 EUR'])];c.save();sys.stdout.buffer.write(o.getvalue())"]);
 const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'fr-FR'});page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await page.goto(base);await page.getByRole('heading',{name:'Tamponnage de pièces',exact:true}).waitFor();
 assert.equal(await page.getByLabel('Assistance Qwen via Cloudflare',{exact:true}).count(),0);
 await page.getByRole('button',{name:'À propos de l’assistance Qwen'}).hover();await page.getByRole('tooltip').waitFor();
 await page.getByLabel('Nom du lot',{exact:true}).fill('Répartition · démonstration');await page.getByRole('button',{name:'Créer le lot',exact:true}).click();
 await page.getByLabel('Importer le document de paiement').setInputFiles({name:'repartition.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbook});
 await page.getByRole('heading',{name:'Répartition reconnue',exact:true}).waitFor();
 assert.equal(await page.getByLabel('Salarié reconnu',{exact:true}).inputValue(),'Camille TEST');
 assert.equal(await page.getByLabel('Mois reconnu',{exact:true}).inputValue(),'2025-02');
 assert.equal(await page.getByLabel('Montant Projet A',{exact:true}).inputValue(),'1039.43');
 assert.equal(await page.getByLabel('Montant Projet B',{exact:true}).inputValue(),'1732.38');
 await page.screenshot({path:out+'/repartition-light.png',fullPage:true});
 await page.getByLabel('Montant Projet A',{exact:true}).fill('9000');await page.getByRole('button',{name:'Confirmer la répartition',exact:true}).click();
 await page.getByText('Total supérieur à l’assiette.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Analyser les pièces',exact:true}).isEnabled(),false);
 await page.getByLabel('Montant Projet A',{exact:true}).fill('1100,00');
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:out+`/repartition-dark-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Confirmer la répartition',exact:true}).click();
 await page.getByRole('button',{name:'Analyser les pièces',exact:true}).waitFor();
 await page.getByLabel('Importer les PDF').setInputFiles({name:'bulletin-test.pdf',mimeType:'application/pdf',buffer:payroll});
 await page.getByRole('button',{name:'bulletin-test.pdf',exact:true}).waitFor();await page.getByRole('button',{name:'Analyser les pièces',exact:true}).click();
 await page.locator('.stamp-status.NEEDS_APPROVAL').waitFor({timeout:60000});await page.getByRole('button',{name:'bulletin-test.pdf',exact:true}).click();
 await page.locator('.stamp-preview img').waitFor();await page.locator('.stamp-preview img').evaluate(img=>img.decode());
 assert.match(await page.locator('.stamp-detail').innerText(),/5\s?604,19/);
 await page.getByLabel('J’ai vérifié la pièce, les imputations et l’aperçu',{exact:true}).check();await page.getByRole('button',{name:'Valider cette pièce',exact:true}).click();await page.getByRole('button',{name:'Tamponner',exact:true}).click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Télécharger le PDF tamponné',exact:true}).click()]);await download.saveAs(out+'/bulletin-test-tamponne.pdf');
 await page.screenshot({path:out+'/tampon-valide.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('Automatic workbook review, correction, overrun rejection, payroll match, stamping and dark/mobile checks passed.');
}finally{await browser.close();await new Promise(r=>server.close(r));await ctx.worker.dispose();}
