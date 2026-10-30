import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {testEnvironment,users} from '../marches/test.mjs';
import {dashboardFixture} from './dashboard-fixture.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright'),root=fileURLToPath(new URL('../',import.meta.url)).replace(/[\\/]$/,'');
const out=process.env.PORTAL_QA;assert.ok(out,'Private PORTAL_QA required');await mkdir(out,{recursive:true});
// Login must exercise the current server implementation, never a stale build.
delete process.env.MARCHES_TEST_WORKER;process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const ctx=await testEnvironment();
const fixture=dashboardFixture(ctx.accounts,'2026-10-19');fixture.salaries.forEach(s=>{s.photo=null;s.payslip=null;});
Object.assign(fixture,{params:{anneeSuivi:2026,entreprise:'CDInnov test'},types:[],mouvements:[],codesAffaires:[]});
await ctx.setPortal(JSON.stringify(fixture));const before=await ctx.kv.get('markets-test');
// Keep real UI login, PBKDF2, challenge/HMAC proof and session storage; isolate external integrations.
const boot=`state={...freshState(),...${JSON.stringify(fixture)}};cloudEnabled=()=>true;budgetsObserveClients=()=>{};budgetsSyncClients=async()=>[];budgetsApi=()=>location.origin+'/budgets';facturxWarmLogin=()=>{};authSaveCredential=async()=>{};notify=()=>{throw Error('External notifications disabled')};bootAuth();`;
const html=(await readFile(join(root,'index.html'),'utf8')).replace(/const CLOUD_ENDPOINT\s*=\s*['"][^'"]+['"]/,'const CLOUD_ENDPOINT=location.origin').replace(/const CLOUD_ENDPOINT\s*=\s*['"][^'"]+['"]/,'const CLOUD_ENDPOINT=location.origin').replace('\nbootAuth();','\n'+boot);assert.ok(html.includes(boot));
const requests=[],errors=[],blocked=[],mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
let holdVerify=null,verifyReached=null;
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/budgets/')||url.pathname.startsWith('/api/v1/')||url.pathname.startsWith('/sheets/')||url.pathname.startsWith('/files/')||url.pathname.startsWith('/files/')) {
    const chunks=[];for await(const b of req)chunks.push(b);const body=Buffer.concat(chunks);
    const headers={Origin:'https://app.cdinnov.eu'};for(const key of ['authorization','content-type','if-match','if-none-match'])if(req.headers[key])headers[key]=req.headers[key];
    const r=await ctx.worker.dispatchFetch('https://test'+url.pathname+url.search,{method:req.method,headers,...(body.length?{body}:{})});
    requests.push({path:url.pathname,method:req.method,status:r.status});
    if(holdVerify&&url.pathname==='/budgets/session'&&JSON.parse(body.toString()).action==='verify'){verifyReached();await holdVerify;}
    res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;
  }
  let name=url.pathname;if(name.endsWith('/'))name+='index.html';const file=resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+sep))throw Error('outside');
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(name==='/index.html'?html:await readFile(file));
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
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  const enterEmail=async email=>{await page.locator('#authEmail').fill(email);await page.locator('#authEmail').press('Enter');await page.locator('#authPw').waitFor({state:'visible'});};
  await enterEmail(users[0]);await page.locator('#authPw').fill('wrong-password');await page.locator('#authPw').press('Enter');await page.getByText('Connexion CDInnov invalide ou expirée. Reconnectez-vous.',{exact:true}).waitFor();
  assert.equal(requests.filter(r=>r.path==='/budgets/session').length,2);
  await page.locator('#authPw').fill(ctx.password);await page.locator('#authPw').press('Enter');
  await page.waitForFunction(()=>!!budgetsCurrentSession());
  const summary=await page.evaluate(async()=>{const r=await fetch('/api/v1/session',{headers:{Authorization:'Bearer '+budgetsCurrentSession().token}});return {status:r.status,data:await r.json()};});
  assert.equal(summary.status,200);assert.equal(summary.data.email,users[0]);assert.equal(summary.data.admin,true);
  assert.equal(await page.evaluate(()=>JSON.stringify(state).includes('"hash"')),false);
  page.on('dialog',d=>d.accept());
  await page.evaluate(()=>setView('parametres'));await page.locator('#newAllowedEmail').fill('invited@example.invalid');await page.getByRole('button',{name:'Autoriser cette adresse',exact:true}).click();
  await page.locator('#accountInviteLink').waitFor();const inviteURL=await page.locator('#accountInviteLink').inputValue();assert.ok(inviteURL.includes('#invitation='));await page.evaluate(()=>closeModal());
  const invitedContext=await browser.newContext();await invitedContext.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  const invitee=await invitedContext.newPage();await invitee.goto(inviteURL);await invitee.locator('#authName').fill('Invité de test');await invitee.locator('#authPw1').fill(ctx.password);await invitee.locator('#authPw2').fill(ctx.password);await invitee.locator('#authCreate').click();await invitee.waitForFunction(()=>AUTH_USER==='invited@example.invalid'&&document.body.classList.contains('authed'));
  await page.evaluate(()=>authResetAccount('invited@example.invalid'));await page.locator('#accountInviteLink').waitFor();await page.evaluate(()=>closeModal());assert.equal(await invitee.evaluate(async()=>{const r=await fetch('/api/v1/session',{headers:{Authorization:'Bearer '+budgetsCurrentSession().token}});return r.status;}),401);
  await page.evaluate(()=>authRemoveAllowed('invited@example.invalid'));await page.waitForFunction(()=>!authState().allowed.includes('invited@example.invalid'));await invitedContext.close();
  const logins=requests.filter(r=>r.path==='/budgets/session').length;
  await page.reload();await page.waitForFunction(()=>!!AUTH_USER&&!!budgetsCurrentSession());
  assert.equal(requests.filter(r=>r.path==='/budgets/session').length,logins,'Reload reuses the existing signed session');
  await page.getByRole('button',{name:'Déconnexion',exact:true}).click();await page.locator('#authGate').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>getSession()),null);
  await enterEmail(users[1]);await page.locator('#authPw').fill(ctx.password);await page.locator('#authPw').press('Enter');await page.waitForFunction(()=>!!budgetsCurrentSession());
  const employee=await page.evaluate(async()=>{
    const headers={Authorization:'Bearer '+budgetsCurrentSession().token};
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
  await page.evaluate(()=>authLogout());releaseVerify();holdVerify=null;
  await page.waitForFunction(()=>!document.getElementById('authLogin').disabled);assert.equal(await page.evaluate(()=>getSession()),null);assert.equal(await page.evaluate(()=>AUTH_USER),null);
  assert.equal(await ctx.kv.get('markets-test'),before);assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  await writeFile(join(out,'identity-browser-checks.json'),JSON.stringify({checks:['real browser password derivation and HMAC','existing-session reload','direction and employee permissions','logout','late login response ignored'],requests,errors,blocked,portalUnchanged:true},null,2));
  console.log('PASS: real portal login and browser crypto, reload, roles, logout and late response; synthetic data unchanged.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await ctx.worker.dispose();}
