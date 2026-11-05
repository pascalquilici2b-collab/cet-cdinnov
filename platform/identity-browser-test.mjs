import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {testEnvironment,users} from '../marches/test.mjs';
import {dashboardFixture} from './dashboard-fixture.mjs';
import {sessionTestAssets} from './session-test-assets.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright'),root=fileURLToPath(new URL('../',import.meta.url)).replace(/[\\/]$/,'');
const out=process.env.PORTAL_QA;assert.ok(out,'Private PORTAL_QA required');await mkdir(out,{recursive:true});
// Login must exercise the current server implementation, never a stale build.
if(process.env.SESSION_WORKER_ARTIFACT)process.env.MARCHES_TEST_WORKER=resolve(process.env.SESSION_WORKER_ARTIFACT);else delete process.env.MARCHES_TEST_WORKER;
process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const ctx=await testEnvironment();
const fixture=dashboardFixture(ctx.accounts,'2026-10-19');fixture.salaries.forEach(s=>{s.photo=null;s.payslip=null;});
fixture.salaries[0].email=users[0];fixture.salaries[0].photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVwQAAAAASUVORK5CYII=';fixture.salaries[1].email=users[1];
Object.assign(fixture,{params:{anneeSuivi:2026,entreprise:'CDInnov test'},types:[],mouvements:[],codesAffaires:[]});
await ctx.setPortal(JSON.stringify(fixture));const before=await ctx.kv.get('markets-test');
// Keep real UI login, PBKDF2, challenge/HMAC proof and browser-managed HttpOnly cookie; isolate external integrations.
const boot=`state={...freshState(),...${JSON.stringify(fixture)}};cloudEnabled=()=>true;budgetsObserveClients=()=>{};budgetsSyncClients=async()=>[];budgetsApi=()=>location.origin+'/budgets';facturxWarmLogin=()=>{};authSaveCredential=async()=>{};notify=()=>{throw Error('External notifications disabled')};bootAuth();`;
const assetRoot=process.env.FRONTEND_ARTIFACT?resolve(process.env.FRONTEND_ARTIFACT):root;
const frontend=process.env.FRONTEND_ARTIFACT?(await import(pathToFileURL(join(assetRoot,'_worker.js')).href)).default:null;
const assets=frontend?new Map():await sessionTestAssets(root);
const html=(assets.get('/index.html')||await readFile(join(assetRoot,'index.html'),'utf8')).replace(/const CLOUD_ENDPOINT\s*=\s*['"][^'"]+['"]/,'const CLOUD_ENDPOINT=location.origin').replace('\nbootAuth();','\n'+boot);assert.ok(html.includes(boot));
const requests=[],errors=[],blocked=[],mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
let holdVerify=null,verifyReached=null;
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/budgets/')||url.pathname.startsWith('/api/v1/')||url.pathname.startsWith('/sheets/')||url.pathname.startsWith('/files/')||url.pathname.startsWith('/files/')) {
    const chunks=[];for await(const b of req)chunks.push(b);const body=Buffer.concat(chunks);
    const headers={Origin:'https://app.cdinnov.eu'};for(const key of ['authorization','cookie','x-cdinnov-request','sec-fetch-site','content-type','if-match','if-none-match'])if(req.headers[key])headers[key]=req.headers[key];
    const r=await ctx.worker.dispatchFetch('https://test'+url.pathname+url.search,{method:req.method,headers,...(body.length?{body}:{})});
    requests.push({path:url.pathname,method:req.method,status:r.status,bearer:!!req.headers.authorization});
    if(holdVerify&&['/budgets/session','/api/v1/session'].includes(url.pathname)&&req.method==='POST'&&JSON.parse(body.toString()).action==='verify'){verifyReached();await holdVerify;}
    const served=frontend?await frontend.fetch(new Request(base+req.url,{method:req.method,headers,...(body.length?{body}:{})}),{CET_API:{fetch:async()=>r}}):r;
    res.writeHead(served.status,Object.fromEntries(served.headers));res.end(Buffer.from(await served.arrayBuffer()));return;
  }
  let name=url.pathname;if(name.endsWith('/'))name+='index.html';const file=resolve(assetRoot,'.'+decodeURIComponent(name));if(!file.startsWith(assetRoot+sep))throw Error('outside');
  const raw=new Response(name==='/index.html'?html:assets.get(name)||await readFile(file),{headers:{'Content-Type':mime[extname(file)]||'application/octet-stream'}});
  const served=frontend?await frontend.fetch(new Request(base+req.url),{ASSETS:{fetch:async()=>raw}}):raw;
  res.writeHead(served.status,Object.fromEntries(served.headers));res.end(Buffer.from(await served.arrayBuffer()));
}catch{res.writeHead(500);res.end('Local test error');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'fr-FR'});
  await context.route('**/*',route=>{
    const request=route.request();if(request.url().startsWith(base+'/'))return route.continue();
    if(request.resourceType()==='image' && new URL(request.url()).origin==='https://cdinnov.eu')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'});
    blocked.push(new URL(request.url()).origin);return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER',e.message);});await page.goto(base);
  const enterEmail=async email=>{if(await page.locator('#authStepRecent').isVisible())await page.locator('#authStepRecent .auth-other-account').click();await page.locator('#authEmail').fill(email);await page.locator('#authEmail').press('Enter');await page.locator('#authPw').waitFor({state:'visible'});};
  await enterEmail(users[0]);await page.locator('#authPw').fill('wrong-password');await page.locator('#authPw').press('Enter');await page.getByText('Connexion CDInnov invalide ou expirée. Reconnectez-vous.',{exact:true}).waitFor();
  assert.equal(requests.filter(r=>['/budgets/session','/api/v1/session'].includes(r.path)&&r.method==='POST').length,2);
  await page.locator('#authPw').fill(ctx.password);await page.locator('#authPw').press('Enter');
  await page.waitForFunction(()=>!!budgetsCurrentSession());
  await page.waitForFunction(()=>!!authRecentAccount()?.photo);
  const remembered=await page.evaluate(()=>authRecentAccount());assert.deepEqual(Object.keys(remembered).sort(),['email','name','photo']);assert.equal(remembered.email,users[0]);assert.equal(remembered.name,'Camille Direction');assert.match(remembered.photo,/^data:image\/jpeg;base64,/);assert.ok(remembered.photo.length<=32768);
  const summary=await page.evaluate(async()=>{const r=await fetch('/api/v1/session',{credentials:'same-origin'});return {status:r.status,data:await r.json()};});
  assert.equal(summary.status,200);assert.equal(summary.data.email,users[0]);assert.equal(summary.data.admin,true);
  assert.equal(summary.data.token,undefined);assert.match(summary.data.sessionId,/^[a-f0-9]{32}$/);
  const capturedCookie=(await context.cookies()).find(c=>c.name==='__Host-cdi_session');assert.ok(capturedCookie);assert.equal(capturedCookie.httpOnly,true);assert.equal(capturedCookie.secure,true);assert.equal(capturedCookie.sameSite,'Strict');assert.equal(capturedCookie.path,'/');
  const visibility=await page.evaluate(async()=>({cookie:document.cookie,local:JSON.stringify(localStorage),session:JSON.stringify(sessionStorage),header:(await fetch('/api/v1/session')).headers.get('set-cookie')}));
  assert.equal(visibility.cookie.includes('__Host-cdi_session'),false);assert.equal(visibility.header,null);
  assert.equal(visibility.local.includes(capturedCookie.value),false);assert.equal(visibility.session.includes(capturedCookie.value),false);
  assert.equal(await page.evaluate(async()=>{const r=await fetch('/api/v1/session',{method:'DELETE'});return r.status;}),403,'A same-site forged mutation without the custom header is refused');
  assert.equal(await page.evaluate(()=>JSON.stringify(state).includes('"hash"')),false);
  page.on('dialog',d=>d.accept());
  await page.evaluate(()=>setView('parametres'));await page.locator('#newAllowedEmail').fill('invited@example.invalid');await page.getByRole('button',{name:'Autoriser cette adresse',exact:true}).click();
  await page.locator('#accountInviteLink').waitFor();const inviteURL=await page.locator('#accountInviteLink').inputValue();assert.ok(inviteURL.includes('#invitation='));await page.evaluate(()=>closeModal());
  const invitedContext=await browser.newContext();await invitedContext.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  const invitee=await invitedContext.newPage();await invitee.goto(inviteURL);await invitee.locator('#authName').fill('Invité de test');await invitee.locator('#authPw1').fill(ctx.password);await invitee.locator('#authPw2').fill(ctx.password);await invitee.locator('#authCreate').click();await invitee.waitForFunction(()=>AUTH_USER==='invited@example.invalid'&&document.body.classList.contains('authed'));
  await page.evaluate(()=>authResetAccount('invited@example.invalid'));await page.locator('#accountInviteLink').waitFor();await page.evaluate(()=>closeModal());assert.equal(await invitee.evaluate(async()=>{const r=await fetch('/api/v1/session',{credentials:'same-origin'});return r.status;}),401);
  await page.evaluate(()=>authRemoveAllowed('invited@example.invalid'));await page.waitForFunction(()=>!authState().allowed.includes('invited@example.invalid'));await invitedContext.close();
  const logins=requests.filter(r=>['/budgets/session','/api/v1/session'].includes(r.path)&&r.method==='POST').length;
  await page.reload();await page.waitForFunction(()=>!!AUTH_USER&&!!budgetsCurrentSession());
  assert.equal(requests.filter(r=>['/budgets/session','/api/v1/session'].includes(r.path)&&r.method==='POST').length,logins,'Reload reuses the existing signed session');
  await page.getByRole('button',{name:'Déconnexion',exact:true}).click();await page.locator('#authGate').waitFor({state:'visible'});
  await page.waitForFunction(()=>!portalLogoutPending);
  assert.equal(await page.evaluate(()=>getSession()),null);
  assert.equal((await ctx.worker.dispatchFetch('https://test/api/v1/session',{headers:{Cookie:'__Host-cdi_session='+capturedCookie.value,Origin:'https://app.cdinnov.eu'}})).status,401,'Logout revokes a copied cookie on the server');
  assert.equal((await context.cookies()).some(c=>c.name==='__Host-cdi_session'),false);
  await page.locator('#authRecentAccount').waitFor({state:'visible'});assert.equal(await page.locator('#authRecentAccount img').count(),1);assert.equal(await page.locator('#authStepRecent .auth-recent-badge').innerText(),'Dernière connexion utilisée');
  await page.locator('.auth-recent-badge').focus();await page.getByRole('tooltip').waitFor({state:'visible'});assert.match(await page.getByRole('tooltip').innerText(),/mot de passe reste nécessaire/);
  await page.locator('#authRecentAccount').focus();await page.screenshot({path:join(out,'login-last-account-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(out,'login-last-account-mobile.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>CDITheme.set('dark'));await page.screenshot({path:join(out,'login-last-account-dark-mobile.png')});await page.evaluate(()=>CDITheme.set('light'));await page.setViewportSize({width:1440,height:1000});
  const beforeChoice=requests.length;await page.locator('#authRecentAccount').click();await page.locator('#authPw').waitFor({state:'visible'});assert.equal(requests.length,beforeChoice,'Choosing a remembered account must not make an authentication request');assert.equal(await page.evaluate(()=>_authEmailPending),users[0]);assert.equal(await page.locator('#authPw').inputValue(),'');assert.equal(await page.evaluate(()=>AUTH_USER),null);
  await page.locator('#authPw').fill('temporary-unsent-password');await page.locator('#authStepLogin .auth-other-account').click();await page.locator('#authEmail').waitFor({state:'visible'});assert.equal(await page.locator('#authEmail').inputValue(),'');assert.equal(await page.locator('#authPw').inputValue(),'');assert.equal(await page.evaluate(()=>_authEmailPending),'');
  await page.reload();await page.locator('#authRecentAccount').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>getSession()),null);assert.equal(await page.locator('#authRecentAccount img').count(),1);
  await enterEmail(users[1]);await page.locator('#authPw').fill(ctx.password);await page.locator('#authPw').press('Enter');await page.waitForFunction(()=>!!budgetsCurrentSession());
  await page.waitForFunction(()=>authRecentAccount()?.email===AUTH_USER);const secondRemembered=await page.evaluate(()=>authRecentAccount());assert.equal(secondRemembered.name,'Alex Consultant');assert.equal(secondRemembered.photo,'');
  const employee=await page.evaluate(async()=>{
    const headers={'X-CDInnov-Request':'1'};
    return {session:await(await fetch('/api/v1/session',{headers})).json(),market:(await fetch('/budgets/markets',{headers})).status,sheets:(await fetch('/sheets/session',{headers})).status};
  });
  assert.equal(employee.session.email,users[1]);assert.equal(employee.session.admin,false);assert.equal(employee.market,403);assert.equal(employee.sheets,200);
  const fileResult=await page.evaluate(async()=>{
    const url=await uploadFileToR2(new File(['%PDF-test'],'test.pdf',{type:'application/pdf'}),'justif-test');
    const file=await privateFileURL(url),bytes=await toU8Async(url);
    state.notesFrais[0].objet='Objet mis à jour';state.notesFrais[0].lignes[0].justificatif=url;save();const saved=await cloudPush();
    return {file,bytes:bytes.length,saved,url};
  });assert.ok(fileResult.file.startsWith('blob:'));assert.equal(fileResult.bytes,9);assert.equal(fileResult.saved,true);
  const savedPortal=JSON.parse((await ctx.db.prepare("SELECT payload FROM app_portal_workspace WHERE id='shared'").first()).payload);assert.equal(savedPortal.notesFrais.find(n=>n.id==='expense-1').objet,'Objet mis à jour');assert.equal(savedPortal.factures.length,fixture.factures.length);assert.deepEqual(savedPortal.auth.accounts,fixture.auth.accounts);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(out,'identity-employee-mobile.png'),fullPage:true});
  const sibling=await context.newPage();await sibling.goto(base);await sibling.waitForFunction(()=>AUTH_USER&&document.body.classList.contains('authed'));
  await page.evaluate(()=>authLogout());await sibling.waitForFunction(()=>!AUTH_USER&&!document.body.classList.contains('authed'));assert.equal(await sibling.locator('[data-react-dashboard]').count(),0);await sibling.close();await enterEmail(users[0]);
  let releaseVerify;holdVerify=new Promise(r=>{releaseVerify=r;});const reached=new Promise(r=>{verifyReached=r;});
  await page.locator('#authPw').fill(ctx.password);await page.locator('#authPw').press('Enter');await reached;
  await page.evaluate(()=>{void authLogout();});releaseVerify();holdVerify=null;
  await page.waitForFunction(()=>!document.getElementById('authLogin').disabled);assert.equal(await page.evaluate(()=>getSession()),null);assert.equal(await page.evaluate(()=>AUTH_USER),null);
  await page.waitForFunction(async()=>{const r=await fetch('/api/v1/session');return r.status===401;});
  assert.ok(requests.every(r=>!r.bearer),'The application never sends a portal bearer token');
  assert.equal(await ctx.kv.get('markets-test'),before);assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  await writeFile(join(out,'identity-browser-checks.json'),JSON.stringify({frontendArtifact:process.env.FRONTEND_ARTIFACT||null,workerArtifact:process.env.SESSION_WORKER_ARTIFACT||null,checks:['real browser password derivation and HMAC','HttpOnly Secure SameSite Strict cookie','no browser-readable bearer','server revocation of copied cookie','CSRF denial','existing-session reload','direction and employee permissions','logout','late login response ignored','last account identity and bounded portrait only','remembered selection still requires password with no request','other account clears pending email and password','keyboard tooltip','desktop mobile and dark login','last account replaced after a different successful login'],requests,errors,blocked,portalUnchanged:true},null,2));
  console.log('PASS: real portal login and browser crypto, reload, roles, logout and late response; synthetic data unchanged.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await ctx.worker.dispose();}
