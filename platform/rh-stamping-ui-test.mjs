import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {mkdir,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,join,sep} from 'node:path';

const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright'),out=resolve('.private/rh-stamping-ui');await mkdir(out,{recursive:true});
await build({entryPoints:['platform/client/stamping.tsx'],outdir:out,entryNames:'stamping',bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},loader:{'.component.css':'text'}});
const id='11111111-1111-4111-8111-111111111111',versionId='22222222-2222-4222-8222-222222222222',calls=[];
const batch={id,version:1,name:'Document fictif janvier · RH v2',owner:'qa@example.test',canEdit:true,documents:[],unmatchedGroups:[],data:{category:'RH',rhVersionId:versionId,rhRevision:2,importConfirmed:true,sealed:true,import:{groups:[],errors:[],warnings:[]}}};
const bridge=await readFile('platform/client/stamping-bridge.js','utf8');
const html=`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;font-family:Arial;background:#f5f5f7"><nav><button id="normal" onclick="setView('tamponnage')">Tamponnage</button><button id="from-rh" onclick="openRhStampingBatch('${id}')">Ouvrir depuis RH</button></nav><main id="content" style="padding:20px"></main><script>
let AUTH_USER='qa@example.test',currentView='';const $=v=>document.querySelector(v),canAccess=()=>true,loadingMarkup=s=>s,budgetsApi=()=>location.origin+'/budgets',budgetsEnsureSession=async()=>({token:'test'}),agendaName=s=>s,agendaPortrait=()=>'';
function setView(v){currentView=v;if(v==='tamponnage')renderStamping();}
${bridge}
</script></body></html>`;
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/')){
 const chunks=[];for await(const c of req)chunks.push(c);calls.push({path:url.pathname,method:req.method,body:Buffer.concat(chunks).toString()});let data;
 if(url.pathname==='/api/v1/stamping/batches')data={batches:[]};else if(url.pathname==='/api/v1/stamping/profiles')data={profiles:[]};else if(url.pathname==='/api/v1/stamping/context')data={configured:true,projects:[]};else if(url.pathname==='/api/v1/rh/versions')data={versions:[{id:versionId,name:'Document fictif janvier',clientName:'Client fictif',revision:2}]};else if(url.pathname===`/api/v1/rh/versions/${versionId}/stamping`)data={batchId:id,needsPreviewApproval:true};else if(url.pathname==='/api/v1/stamping/batches/'+id)data=batch;
 if(!data){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
 }if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}const file=resolve(out,url.pathname.replace(/^\/platform\//,''));if(!file.startsWith(out+sep))throw Error('Path');res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/javascript');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:850},locale:'fr-FR'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('UI error:',e.message);});page.on('console',m=>{if(m.type()==='error')console.log('Console:',m.text());});page.setDefaultTimeout(15000);
 await context.route('**/*',route=>route.request().url().startsWith(base+'/')||/^(blob:|data:)/.test(route.request().url())?route.continue():route.abort());
 await page.goto(base);await page.locator('#normal').click();await page.getByRole('button',{name:/Ressources humaines/}).click();await page.getByLabel('Document RH à tamponner').selectOption(versionId);await page.getByRole('button',{name:'Préparer les bulletins',exact:true}).click();await page.getByText('Version RH 2',{exact:true}).waitFor();assert.equal(calls.filter(c=>c.path.endsWith('/stamping')&&c.method==='POST').length,1);assert.equal(calls.find(c=>c.path.endsWith('/stamping')&&c.method==='POST').body,'{}');assert.equal(await page.getByRole('button',{name:'Importer une nouvelle pièce',exact:true}).isVisible(),false);await page.screenshot({path:join(out,'version-to-stamping.png')});
 await page.goto(base);await page.locator('#from-rh').click();await page.getByText('Version RH 2',{exact:true}).waitFor();assert.equal(calls.filter(c=>c.path.endsWith('/stamping')&&c.method==='POST').length,1);await page.setViewportSize({width:390,height:850});await page.screenshot({path:join(out,'bridge-mobile.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 console.log('RH stamping browser bridge passed: archived version selector, POST then native lot, direct initial batch navigation, immutable controls, mobile, no runtime errors.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
