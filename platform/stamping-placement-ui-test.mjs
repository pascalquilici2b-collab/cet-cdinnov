/** Synthetic placement UI regression; local Worker/D1/R2/queue + real Python.
 * node platform/stamping-placement-ui-test.mjs [split|preference]
 * PLAYWRIGHT_PACKAGE may point to an installed Playwright package.json.
 * CHROMIUM_PATH optionally selects a browser executable; otherwise use Playwright's.
 * No external browser traffic or AI calls. Evidence: .private/stamping-placement-ui/.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {stampEnvironment,py} from './stamping-test-helper.mjs';
const {chromium}=createRequire(process.env.PLAYWRIGHT_PACKAGE||new URL('../package.json',import.meta.url))('playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const scenario=process.argv[2]||'split';assert.ok(process.argv.length<=3&&['split','preference'].includes(scenario),'Expected split or preference');
const holes=scenario==='split'?[[[40,200,166,80],[350,400,166,80]]]:[[[40,200,166,114]],[[40,200,196,114]]];
const sourceFiles=['facturx-service/cdi_facturx/stamping_pdf.py','facturx-service/cdi_facturx/stamping_geometry.py','facturx-service/cdi_facturx/stamping_vision.py','platform/client/stamping.tsx','platform/client/stamping-pdf-scroll.tsx','facturx-service/tests/test_stamping_geometry.py'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,sha(await readFile(resolve(root,p)))])));
const out=resolve(root,'.private/stamping-placement-ui',scenario);await mkdir(out,{recursive:true});
const startHashes=await hashes(),ctx=await stampEnvironment();let browser,server;
try{
const fixture=JSON.parse(await py(['-c',`import sys,json,base64;sys.path.insert(0,'tests');from test_stamping_geometry import holed_pdf;from test_stamping import table;print(json.dumps({'pdf':base64.b64encode(holed_pdf(${JSON.stringify(holes)})).decode(),'table':base64.b64encode(table(4,'INVOICE')).decode()}))`]));
const source=Buffer.from(fixture.pdf,'base64');await writeFile(out+'/source.pdf',source);
await build({entryPoints:[resolve(root,'platform/client/stamping.tsx')],outfile:out+'/client/stamping.js',bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const read=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
const batchId=(await read(await ctx.send('/batches',{name:'Placement compact fictif '+scenario,useAI:false,pagePreference:'first',allowAppendix:false}),201)).id;
const batchPath='/batches/'+batchId;
await read(await ctx.upload(batchPath+'/table',Buffer.from(fixture.table,'base64'),'repartition-fictive.csv',1));
let batch=await read(await ctx.call(batchPath)),sheet=batch.data.table.sheets[0];
await read(await ctx.send(batchPath+'/mapping',{mapping:{sheet:sheet.name,header:sheet.header,mapping:sheet.mapping},confirmed:true},batch.version));
const html=`<!doctype html><html lang="fr"><meta charset="utf-8"><link rel="stylesheet" href="/platform/stamping.css"><style>body{margin:0;font-family:Arial;background:#f6f8fa}#app{padding:24px;max-width:1440px;margin:auto}</style><main id="app"></main><script type="module">import {mountStamping} from '/platform/stamping.js';mountStamping(document.querySelector('#app'),{baseUrl:location.origin,getSession:async()=>"local-placement-session",isActive:()=>true,initialBatchId:${JSON.stringify(batchId)}});</script></html>`;
const apiTrace=[],pageErrors=[],browserCalls=[],snapshots=[];
server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  const body=[];for await(const chunk of req)body.push(chunk);
  const response=await ctx.worker.dispatchFetch('https://preview.example'+req.url,{method:req.method,headers:{...req.headers,cookie:ctx.admin.cookie,host:'preview.example',origin:'http://127.0.0.1:5196'},...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(body)})});
  const bytes=Buffer.from(await response.arrayBuffer());let submitted=null;if((req.headers['content-type']||'').startsWith('application/json')){try{submitted=JSON.parse(Buffer.concat(body).toString());}catch{}}
  apiTrace.push({path:url.pathname,method:req.method,status:response.status,pdfSha256:(response.headers.get('content-type')||'').startsWith('application/pdf')?sha(bytes):null,submitted});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(bytes);return;
 }
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 const file=['/platform/stamping.js','/platform/stamping.css'].includes(url.pathname)?resolve(out,'client',url.pathname.split('/').at(-1)):resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root)||(!['/platform/stamping.js','/platform/stamping.css'].includes(url.pathname)&&/[/\\](?:\.private|\.git|node_modules)[/\\]/.test(file)))throw Error('Outside public test assets');
 res.setHeader('Content-Type',({'.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch(error){console.error(error.message);res.writeHead(500);res.end('Local fixture failure');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
async function snapshot(label){
 batch=await read(await ctx.call(batchPath));assert.equal(batch.documents.length,1,'Fixture must stay one source document');const doc=batch.documents[0],data=doc.data;
 const value={label,status:doc.status,version:doc.version,outputSha256:data.output_sha256,sourceSha256:doc.sha256,blocks:data.blocks.map(({image,...block})=>block),checks:data.checks,allocations:data.allocations.map(a=>({id:a.id,project:a.project,amount_cents:a.amount_cents}))};snapshots.push(value);
 await writeFile(out+'/'+label+'.pdf',Buffer.from(await(await ctx.call(batchPath+'/documents/'+doc.id+'/preview')).arrayBuffer()));return {value,doc,path:batchPath+'/documents/'+doc.id};
}
 const page=await browser.newPage({viewport:{width:1440,height:1100},locale:'fr-FR',acceptDownloads:true});page.setDefaultTimeout(30000);page.on('pageerror',e=>pageErrors.push(e.message));page.on('request',r=>browserCalls.push(r.url()));await page.route('**/*',r=>r.request().url().startsWith(base)||/^(blob:|data:)/.test(r.request().url())?r.continue():r.abort());
 await page.goto(base);console.log('Mounted '+scenario);await page.getByLabel('Importer les PDF ou ZIP',{exact:true}).setInputFiles({name:'placement-compact-fictif.pdf',mimeType:'application/pdf',buffer:source});
 await page.getByRole('button',{name:'placement-compact-fictif.pdf',exact:true}).waitFor();console.log('Imported '+scenario);await page.getByRole('button',{name:'Analyser les pièces',exact:true}).click();await page.locator('.stamp-status.NEEDS_APPROVAL').waitFor({timeout:60000});
 const automatic=await snapshot('automatic');assert.equal(automatic.value.blocks.length,scenario==='split'?2:1);assert.equal(automatic.doc.data.total_cents,40000);
 for(const b of automatic.value.blocks){assert.equal(b.page,0);assert.equal(b.width,150);assert.equal(b.fontSize,5);assert.equal(b.overlap,false);assert.ok(holes[0].some(([x,y,w,h])=>b.x-7>=x&&b.y-7>=y&&b.x+b.width+7<=x+w&&b.y+b.height+7<=y+h));}
 assert.equal((await ctx.call(automatic.path+'/output')).status,409);
 await page.getByRole('button',{name:'Aperçu à valider · '+automatic.doc.name,exact:true}).click();const dialog=page.getByRole('dialog',{name:'Aperçu et contrôle de la pièce'});await dialog.locator('.stamp-preview canvas').first().waitFor({state:'visible'});await dialog.screenshot({path:out+'/automatic.png'});
 await dialog.getByRole('button',{name:'Modifier le tampon',exact:true}).click();await dialog.getByRole('button',{name:'Déplacer le tampon 1',exact:true}).waitFor();assert.equal(await dialog.locator('.stamp-edit-overlay').count(),automatic.value.blocks.length);
 for(let i=0;i<automatic.value.blocks.length;i++){const overlay=dialog.getByRole('button',{name:'Déplacer le tampon '+(i+1),exact:true});await overlay.locator('img').evaluate(image=>image.decode());const box=await overlay.boundingBox(),sheetBox=await dialog.locator('[data-stamp-page="0"]').boundingBox();assert.ok(Math.abs(box.width-150*sheetBox.width/595)<1.5,'Compact width must match the PDF-point to CSS-pixel scale');}
 const first=dialog.getByRole('button',{name:'Déplacer le tampon 1',exact:true});await first.focus();await first.press('ArrowRight');await dialog.getByLabel('J’ai vérifié la pièce, les imputations et l’aperçu').check();assert.equal(await dialog.getByRole('button',{name:'Valider cette pièce',exact:true}).isEnabled(),false);
 const analyses=ctx.serviceActions.filter(a=>a==='analyze').length;await dialog.getByRole('button',{name:'Enregistrer la position',exact:true}).click();await dialog.getByText('Aperçu mis à jour',{exact:true}).waitFor();const moved=await snapshot('moved');
 assert.equal(moved.value.blocks[0].x,automatic.value.blocks[0].x+1);assert.equal(moved.value.blocks[0].width,150);if(scenario==='split')assert.deepEqual(moved.value.blocks[1],automatic.value.blocks[1]);assert.equal(await dialog.getByLabel('J’ai vérifié la pièce, les imputations et l’aperçu').isChecked(),false);assert.equal(ctx.serviceActions.filter(a=>a==='analyze').length,analyses);
 assert.equal((await ctx.send(moved.path+'/approve',{reviewed:true,outputSha256:automatic.value.outputSha256},moved.value.version)).status,422);
 await dialog.getByLabel('J’ai vérifié la pièce, les imputations et l’aperçu').check();await dialog.getByRole('button',{name:'Valider cette pièce',exact:true}).click();await dialog.getByRole('button',{name:'Tamponner',exact:true}).click();const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'Télécharger le PDF tamponné',exact:true}).click();await(await pending).saveAs(out+'/tampon-modifie.pdf');const final=await snapshot('verified');assert.equal(sha(await readFile(out+'/tampon-modifie.pdf')),final.value.outputSha256);
 const approved=apiTrace.filter(r=>r.path.endsWith('/approve')&&r.status===200).at(-1);assert.equal(approved.submitted.outputSha256,final.value.outputSha256);assert.ok(apiTrace.some(r=>r.path.endsWith('/preview')&&r.pdfSha256===moved.value.outputSha256));assert.equal(ctx.aiCalls(),0);assert.deepEqual(pageErrors,[]);assert.ok(browserCalls.every(u=>u.startsWith(base)||/^(blob:|data:)/.test(u)));
 const endHashes=await hashes();assert.deepEqual(endHashes,startHashes,'Engine, fixture or UI source changed during the test');await writeFile(out+'/checks.json',JSON.stringify({passed:true,scenario,knownSafeHoles:holes,sourceStableDuringRun:JSON.stringify(startHashes)===JSON.stringify(endHashes),startHashes,endHashes,aiMockCalls:ctx.aiCalls(),serviceActions:ctx.serviceActions,browserCallsLocalOnly:true,pageErrors,snapshots,apiTrace,downloadSha256:final.value.outputSha256,staleApprovalRejected:true,unapprovedDownloadRejected:true},null,2));console.log(JSON.stringify({passed:true,scenario,blocks:automatic.value.blocks.length,width:150,fonts:5,aiMockCalls:ctx.aiCalls(),sourceStableDuringRun:JSON.stringify(startHashes)===JSON.stringify(endHashes)}));
}catch(error){for(const page of browser?.contexts().flatMap(c=>c.pages())||[]){await writeFile(out+'/failure.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/failure.png',fullPage:true});}throw error;}finally{await browser?.close();if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}await ctx.worker.dispose();}
