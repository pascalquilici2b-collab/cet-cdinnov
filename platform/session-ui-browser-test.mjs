import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {testEnvironment,users} from '../marches/test.mjs';
import {dashboardFixture} from './dashboard-fixture.mjs';
import {sessionTestAssets} from './session-test-assets.mjs';
const root=process.cwd(),out=join(root,'platform/security-audit-20261105/session-ui');await mkdir(out,{recursive:true});
const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const [assets,ctx]=await Promise.all([sessionTestAssets(root),testEnvironment()]);
const fixture=dashboardFixture(ctx.accounts,'2026-11-05');fixture.salaries.forEach(s=>{s.photo=null;s.payslip=null;});fixture.factures=[];fixture.notesFrais=[];Object.assign(fixture,{params:{anneeSuivi:2026,entreprise:'CDInnov test'},types:[],mouvements:[],codesAffaires:[]});await ctx.setPortal(JSON.stringify(fixture));
const html=assets.get('/index.html').replace(/const CLOUD_ENDPOINT\s*=\s*["'][^"']+["']/,'const CLOUD_ENDPOINT=location.origin').replace('\nbootAuth();',"\nfacturxWarmLogin=()=>{};authSaveCredential=async()=>{};notify=()=>{throw Error('External notifications disabled')};bootAuth();");assets.set('/index.html',html);
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const requests=[],errors=[],checks=[];let forcedStatus=0,holdSheet=null,sheetReached=null;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(/^\/(budgets|api\/v1|sheets|files)\//.test(url.pathname)){
   if(forcedStatus&&url.pathname==='/api/v1/portal'){res.writeHead(forcedStatus,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Réponse de contrôle local'}));return;}
   const parts=[];for await(const part of req)parts.push(part);const body=Buffer.concat(parts);const headers={Origin:'https://app.cdinnov.eu'};
   for(const key of ['cookie','content-type','if-match','if-none-match','x-cdinnov-request'])if(req.headers[key])headers[key]=req.headers[key];
   const response=await ctx.worker.dispatchFetch('https://app.cdinnov.eu'+url.pathname+url.search,{method:req.method,headers,...(body.length?{body}:{})});requests.push({path:url.pathname,method:req.method,status:response.status});
   res.writeHead(response.status,Object.fromEntries(response.headers));if(holdSheet&&url.pathname==='/sheets/state'){res.flushHeaders();sheetReached();await holdSheet;}res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 let name=url.pathname;if(name.endsWith('/'))name+='index.html';const file=resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+sep))throw Error('outside');res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(assets.has(name)?assets.get(name):await readFile(file));
}catch(error){res.writeHead(500);res.end('Local test error: '+error.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'fr-FR'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===base)return route.continue();if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});return route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER',e.message)});page.on('dialog',dialog=>dialog.accept());await page.goto(base);
 assert.equal(await page.locator('#cdi-session-dialog').count(),0,'initial login has no expired notice');
 await page.locator('#authEmail').fill(users[0]);await page.locator('#authEmail').press('Enter');await page.locator('#authPw').fill(ctx.password);await page.locator('#authPw').press('Enter');await page.waitForFunction(()=>document.body.classList.contains('authed'));
 let session=await page.evaluate(()=>CDISession.read());assert.ok(session.sessionId);assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('"token"')),false);
 const inspect=async(name,theme,width=1440)=>{
   await page.setViewportSize({width,height:width<500?844:1000});await page.evaluate(theme=>CDITheme.set(theme),theme);
   await page.evaluate(()=>{CDISession.expire({sessionId:CDISession.current().sessionId});CDISession.expire();});
   const dialog=page.getByRole('dialog',{name:'Session expirée'});await dialog.waitFor();assert.equal(await dialog.count(),1);
   assert.equal(await page.locator('#cdi-session-description').innerText(),'Vous êtes resté inactif trop longtemps. Veuillez vous reconnecter');
   const state=await page.evaluate(()=>{const dialog=document.querySelector('#cdi-session-dialog'),box=dialog.getBoundingClientRect();return {focused:dialog.contains(document.activeElement),x:box.x,right:box.right,width:innerWidth,color:getComputedStyle(dialog).backgroundColor,svg:!!dialog.querySelector('svg')}});
   assert.ok(state.focused&&state.svg&&state.x>=0&&state.right<=state.width);assert.equal(state.color,theme==='dark'?'rgb(36, 36, 38)':'rgb(255, 255, 255)');
   await page.keyboard.press('Escape');assert.equal(await dialog.count(),1);await page.screenshot({path:join(out,name+'-'+theme+'-'+width+'.png')});checks.push({name,theme,width,...state});
   await page.evaluate(session=>CDISession.accept(session),session);await dialog.waitFor({state:'detached'});
 };
 for(const view of ['dashboard','mouvements','salaries','cet','notesfrais','agenda','tamponnage','facturier','marches','budgetsprojets','parametres']){
   await page.evaluate(view=>setView(view),view);await page.waitForTimeout(180);
   assert.equal(await page.evaluate(()=>currentView),view);for(const theme of ['light','dark'])await inspect(view,theme);console.log('PASS section',view);
 }
 await inspect('portal-mobile','light',390);await inspect('portal-mobile','dark',390);
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{setView('parametres');const input=document.createElement('input');input.id='qa-unsaved';input.value='Brouillon conservé';document.querySelector('#content').append(input);input.focus();const original=CDISession.read();CDISession.accept({...original,expiresAt:Date.now()+250});});
  await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Se reconnecter',exact:true}).click();await page.locator('#cdi-session-dialog').getByLabel('Mot de passe',{exact:true}).fill(ctx.password);await page.locator('#cdi-session-dialog button[type=submit]').click();await page.getByRole('dialog').waitFor({state:'detached'}).catch(async error=>{console.log('DIALOG ERROR',await page.locator('#cdi-session-dialog').innerText());throw error;});assert.equal(await page.locator('#qa-unsaved').inputValue(),'Brouillon conservé');session=await page.evaluate(()=>CDISession.read());checks.push({name:'actual-timer-and-same-account-reconnect',passed:true});
 forcedStatus=403;await page.evaluate(()=>portalFetch('/api/v1/portal').catch(()=>{}));assert.equal(await page.locator('#cdi-session-dialog').count(),0);forcedStatus=401;await page.evaluate(()=>portalFetch('/api/v1/portal').catch(()=>{}));await page.getByRole('dialog').waitFor();forcedStatus=0;await page.evaluate(session=>CDISession.accept(session),session);checks.push({name:'403-versus-401',passed:true});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('cdinnov-session-expired',{detail:{sessionId:'old-session-id'}})));assert.equal(await page.locator('#cdi-session-dialog').count(),0);
 for(const [url,name,ready] of [['/feuilles/','sheets','.home-hero'],['/budgets-projets/','budgets','.app-main']]){
   await page.goto(base+url);await page.locator(ready).waitFor();session=await page.evaluate(()=>CDISession.read());
   for(const theme of ['light','dark'])await inspect(name,theme,390);
   await page.evaluate(()=>CDISession.expire());await page.getByRole('button',{name:'Se reconnecter',exact:true}).click();await page.locator('#cdi-session-dialog').getByLabel('Mot de passe',{exact:true}).fill(ctx.password);await page.locator('#cdi-session-dialog button[type=submit]').click();await page.getByRole('dialog').waitFor({state:'detached'}).catch(async error=>{console.log('DIALOG ERROR',await page.locator('#cdi-session-dialog').innerText());throw error;});await page.locator(ready).waitFor();session=await page.evaluate(()=>CDISession.read());checks.push({name:name+'-real-reconnect',passed:true});
 }
 let releaseSheet;holdSheet=new Promise(r=>{releaseSheet=r;});const reachedSheet=new Promise(r=>{sheetReached=r;});
 await page.evaluate(()=>{window.qaPending=import('/platform/session-api.js').then(api=>api.requestState()).then(()=>({ok:true}),error=>({error:error.message}));});await reachedSheet;
 await page.evaluate(()=>CDISession.accept({...CDISession.read(),sessionId:'replaced-test-session'}));releaseSheet();holdSheet=null;
 const lateResult=await page.evaluate(()=>window.qaPending);assert.match(lateResult.error,/session a changé/);assert.equal(await page.locator('#cdi-session-dialog').count(),0);await page.evaluate(session=>CDISession.accept(session),session);checks.push({name:'late-sheets-body-cannot-update-replacement-session',passed:true});
 await page.goto(base);await page.waitForFunction(()=>document.body.classList.contains('authed'));await page.evaluate(()=>{const input=document.createElement('input');input.id='qa-secret';input.value='PRIVATE OLD ACCOUNT';document.querySelector('#content').append(input);CDISession.expire();});await page.getByRole('button',{name:'Se reconnecter',exact:true}).click();await page.locator('#cdi-session-dialog').getByLabel('Adresse e-mail',{exact:true}).fill(users[1]);await page.locator('#cdi-session-dialog').getByLabel('Mot de passe',{exact:true}).fill(ctx.password);await page.locator('#cdi-session-dialog button[type=submit]').click();await page.getByRole('dialog').waitFor({state:'detached'}).catch(async error=>{console.log('DIALOG ERROR',await page.locator('#cdi-session-dialog').innerText());throw error;});assert.equal(await page.locator('#qa-secret').count(),0);assert.equal(await page.evaluate(()=>AUTH_USER),users[1]);checks.push({name:'different-account-clears-private-dom',passed:true});
 await page.evaluate(()=>authLogout());assert.equal(await page.locator('#cdi-session-dialog').count(),0);assert.equal(await page.evaluate(()=>CDISession.read()),null);checks.push({name:'intentional-logout-no-dialog',passed:true});
 assert.deepEqual(errors,[]);await writeFile(join(out,'checks.json'),JSON.stringify({checks,requests,errors},null,2));console.log('PASS all session UI checks:',checks.length);
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await ctx.worker.dispose();}
