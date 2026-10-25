import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {testEnvironment,users} from '../marches/test.mjs';
import {dashboardFixture,insertDashboardTrips} from './dashboard-fixture.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
process.env.MARCHES_TEST_WORKER=fileURLToPath(new URL('../.build/entry.mjs',import.meta.url));
process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const ctx=await testEnvironment();
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fixture=dashboardFixture(ctx.accounts,today);fixture.salaries[0].photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';fixture.notesFrais[0].signature=null;await ctx.setPortal(JSON.stringify(fixture));
await insertDashboardTrips(ctx.db,today,users[0],users[1]);
const sessions=await Promise.all(users.map(email=>ctx.login(email)));
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/[\\/]$/,'');
const out=process.env.PORTAL_QA;assert.ok(out,'Private QA output is required');await mkdir(out,{recursive:true});
const boot=`state={...freshState(),...${JSON.stringify(fixture)}};cloudEnabled=()=>false;budgetsObserveClients=()=>{};budgetsSyncClients=async()=>[];budgetsApi=()=>location.origin+'/budgets';budgetsEnsureSession=async()=>AUTH_USER===${JSON.stringify(users[0])}?${JSON.stringify(sessions[0])}:${JSON.stringify(sessions[1])};notify=()=>{throw Error('No notifications allowed in tests')};unlockApp(new URLSearchParams(location.search).has('consultant')?${JSON.stringify(users[1])}:${JSON.stringify(users[0])});`;
const html=(await readFile(join(root,'index.html'),'utf8')).replace('\nbootAuth();','\n'+boot);
assert.ok(html.includes(boot));
const requests=[];
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/budgets/')||url.pathname.startsWith('/api/v1/')){
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
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'fr-FR',timezoneId:'Europe/Paris'});
 await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-10-25T22:59:59Z')});await page.goto(base);
 await page.getByRole('heading',{name:'Dernières factures',exact:true}).waitFor();
 assert.equal(await page.locator('.db-calendar-tile>strong').innerText(),'25');
 await page.clock.fastForward(2000);assert.equal(await page.locator('.db-calendar-tile>strong').innerText(),'26');assert.match((await page.locator('.db-live-clock').innerText()).replace(/\s/g,''),/00:00/);
 await page.screenshot({path:join(out,'date-light.png'),fullPage:true});await page.locator('[data-theme-toggle]').click();await page.clock.fastForward(1000);await page.screenshot({path:join(out,'date-dark.png'),fullPage:true});
 for(const width of [390,320]){await page.setViewportSize({width,height:900});await page.clock.fastForward(1000);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:join(out,'date-mobile-'+width+'.png'),fullPage:true});}
 assert.deepEqual(errors,[]);console.log('Live date: Paris midnight rollover, clock, light/dark and 390/320px passed.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await ctx.worker.dispose();}
