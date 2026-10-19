import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {testEnvironment,users} from '../marches/test.mjs';
import {seedBusinessDocument} from './business-migration.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
process.env.MARCHES_TEST_WORKER=fileURLToPath(new URL('../.build/entry.mjs',import.meta.url));
process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const ctx=await testEnvironment(),session=await ctx.login(users[0]);
const workspace=process.env.CDI_BUDGET_BACKUP?JSON.parse(JSON.parse(await readFile(process.env.CDI_BUDGET_BACKUP,'utf8'))[0].payload):{demo:false,clients:[{id:'c1',name:'Client de démonstration',accounts:[]}],projects:[],budgetLines:[],expenses:[],drs:[],imports:[]};
await seedBusinessDocument(ctx.db,'budgets',workspace,1,'2026-10-18',users[0]);
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/[\\/]$/,'');
const out=process.env.PORTAL_QA;assert.ok(out,'Private QA output is required');await mkdir(out,{recursive:true});
const boot=`state=freshState();AUTH_USER=null;cloudEnabled=()=>false;budgetsObserveClients=()=>{};budgetsSyncClients=async()=>[];budgetsApi=()=>location.origin+'/budgets';budgetsEnsureSession=async()=>(${JSON.stringify({...session,email:users[0]})});agendaEnter=()=>{};unlockApp(${JSON.stringify(users[0])});budgetsOpenClients();`;
const html=(await readFile(join(root,'index.html'),'utf8')).replace('\nbootAuth();','\n'+boot);
assert.ok(html.includes(boot));
const requests=[];
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/budgets/')){
   const body=[];for await(const b of req)body.push(b);
   const headers={Origin:'https://app.cdinnov.eu'};for(const name of ['authorization','content-type','if-match','if-none-match'])if(req.headers[name])headers[name]=req.headers[name];
   const r=await ctx.worker.dispatchFetch('https://test'+url.pathname+url.search,{method:req.method,headers,...(body.length?{body:Buffer.concat(body)}:{})});
   const b=Buffer.from(await r.arrayBuffer());requests.push({path:url.pathname,method:req.method,status:r.status,bytes:b.length});
   res.writeHead(r.status,Object.fromEntries(r.headers));res.end(b);return;
  }
  let name=url.pathname;if(name.endsWith('/'))name+='index.html';const file=resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+sep))throw Error('outside');
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(name==='/index.html'?html:await readFile(file));
 }catch(error){console.error('Local test adapter:',error.name,error.message);res.writeHead(500);res.end('Local test error');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'msedge'}),errors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 const frame=page.frameLocator('#cdiBudgetsFrame');
 await frame.getByRole('heading',{name:'Clients',exact:true}).waitFor({timeout:30000});
 await frame.getByText(workspace.clients[0].name,{exact:true}).first().waitFor();
 await page.screenshot({path:join(out,'budgets-repertoire.png'),fullPage:true});
 await page.evaluate(()=>{setView('facturier');budgetsOpenClients();});
 await frame.getByRole('heading',{name:'Clients',exact:true}).waitFor({timeout:30000});
 await frame.getByText(workspace.clients[0].name,{exact:true}).first().waitFor();
 assert.ok(requests.some(r=>r.status===304 && r.bytes===0),'Reopening unchanged workspace uses 304');
 await frame.getByLabel('Nom du client',{exact:true}).fill('Vérification migration locale');
 const saved=page.waitForResponse(r=>r.url().endsWith('/budgets/workspace')&&r.request().method()==='PATCH');
 await frame.getByRole('button',{name:'Créer le client',exact:true}).click();
 assert.equal((await saved).status(),200);
 const after=JSON.parse((await ctx.db.prepare("SELECT payload FROM budgets_workspace WHERE id='shared'").first()).payload);
 assert.deepEqual({...after,clients:workspace.clients},workspace);
 assert.ok(after.clients.some(c=>c.name==='Vérification migration locale'));
 assert.equal((await ctx.db.prepare("SELECT count(*) n FROM app_budget_records WHERE collection='clients' AND name='Vérification migration locale'").first()).n,1);
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>toggleSidebar(false));
 await page.waitForTimeout(250);
 const dialog=await frame.locator('[data-slot="dialog-content"]').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}});
 assert.ok(dialog.x>=0&&dialog.y>=0&&dialog.right<=dialog.width&&dialog.bottom<=dialog.height,'Client editor stays within the visible budget frame');
 await page.screenshot({path:join(out,'budgets-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({browser:'React budget directory loaded with existing records; reopen reuses a validated snapshot',requests,errors}));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await ctx.worker.dispose();}
