import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {billingPreview} from './billing-preview.mjs';
const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright'),preview=await billingPreview(),out=new URL('./.private/interface-access-20261023/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
try{
 const portalFixture=JSON.parse((await preview.ctx.db.prepare("SELECT payload FROM app_portal_workspace WHERE id='shared'").first()).payload);
 await preview.ctx.setPortal(JSON.stringify({params:{anneeSuivi:2026},types:[],mouvements:[],...portalFixture}));
 const context=await browser.newContext({viewport:{width:1600,height:1080},locale:'fr-FR'});
 await context.route('**/*',route=>route.request().url().startsWith(preview.base)||route.request().url().startsWith('data:')?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(preview.base);await page.waitForFunction(()=>!!window.CDIPlatform);
 await page.evaluate(async()=>{cloudURL=()=>location.origin+'/api/v1/portal';cloudEnabled=()=>true;await cloudLoad({discard:true});setView('dashboard');});
 await page.locator('.db-today strong').waitFor();await page.evaluate(()=>document.fonts.ready);
 assert.ok(await page.locator('.db-today strong').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=26));
 assert.equal(await page.evaluate(()=>document.fonts.check('600 30px Poppins')),true);
 assert.equal(await page.locator('#syncPill').getAttribute('data-state'),'ok');assert.equal(await page.locator('#syncIcon svg').count(),1);
 assert.match(await page.locator('.sheets-nav-symbol').getAttribute('src'),/cdinnov-sheets-symbol/);
 const checkViewport=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
 for(const theme of ['light','dark']){await page.evaluate(theme=>CDITheme.set(theme),theme);await checkViewport();await page.screenshot({path:new URL('dashboard-'+theme+'.png',out).pathname.slice(1),fullPage:true});}
 // Persisted role changes through the actual Worker, without real user accounts.
 await page.evaluate(()=>setView('parametres'));await page.locator('[data-react-personnel="parametres"]').waitFor();
 const controls=page.getByRole('combobox',{name:/Droits de/});assert.equal(await controls.count(),2);
 // Find by value instead of depending on label sorting.
 const collaborator=page.locator('.account-role select').filter({has:page.locator('option:checked[value="collaborator"]')});
 const staffLabel=await collaborator.getAttribute('aria-label');await collaborator.selectOption('admin');await page.waitForFunction(()=>!document.querySelector('.account-role[aria-busy=true]'));
 assert.equal(await page.getByRole('combobox',{name:staffLabel,exact:true}).inputValue(),'admin');
 await page.getByRole('combobox',{name:staffLabel,exact:true}).selectOption('collaborator');await page.waitForFunction(()=>!document.querySelector('.account-role[aria-busy=true]'));
 assert.equal(await page.getByRole('combobox',{name:staffLabel,exact:true}).inputValue(),'collaborator');
 await page.locator('.account-role').first().scrollIntoViewIfNeeded();await page.screenshot({path:new URL('accounts-dark.png',out).pathname.slice(1),fullPage:true});
 assert.equal(preview.requests.filter(r=>r.path.endsWith('/accounts')&&r.method==='POST'&&r.status===200).length,2);
 await page.evaluate(()=>{agendaState.month=new Date('2026-10-01T12:00:00');setView('agenda');});await page.locator('.agenda-shell').waitFor();await page.locator('#agendaBalances').waitFor();
 assert.equal(await page.locator('.portal-top-actions #agendaBalances').count(),1);assert.equal(await page.locator('#agendaBalances .agenda-avatar').count(),1);
 const buttons=await page.locator('#agendaBalances,#agendaTopLeave').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));assert.ok(Math.abs(buttons[0].y-buttons[1].y)<5,'balances and new leave share top-right row');
 assert.equal(await page.locator('.agenda-aside-head .lucide-footprints').count(),1);
 await page.screenshot({path:new URL('agenda-dark.png',out).pathname.slice(1),fullPage:true});await checkViewport();
 await page.locator('#agendaBalances').click();await page.locator('[data-react-agenda="balances"]').waitFor();
 for(const width of [1024,768,390,320]){await page.setViewportSize({width,height:920});await checkViewport();}
 await page.screenshot({path:new URL('agenda-balances-mobile.png',out).pathname.slice(1),fullPage:true});
 await page.evaluate(()=>setView('dashboard'));await page.locator('.db-today').waitFor();await checkViewport();await page.screenshot({path:new URL('dashboard-mobile.png',out).pathname.slice(1),fullPage:true});
 await page.evaluate(async()=>{await authSetRole('calendini.matthieu@cdinnov.com','admin');await authSetRole('quilici.pascal@cdinnov.com','collaborator');});
 await page.locator('.db-today').waitFor();assert.equal(await page.evaluate(()=>isAdmin(AUTH_USER)),false);
 assert.equal(await page.locator('.nav-item[data-view="facturier"]').isVisible(),false);assert.equal(await page.evaluate(()=>state.factures.length),0);
 assert.equal(await page.evaluate(()=>movAccess),'001','former admin retains their own employee folder');
 assert.deepEqual(errors,[]);await writeFile(new URL('ui-checks.json',out),JSON.stringify({checked:['Poppins date','light/dark dashboard','cloud state','green Sheets symbol','grant/revoke via real Worker','self-demotion clears private views','top-right leave actions','portraits','footprints','mobile overflow'],errors},null,2));console.log('OK interface, role controls, agenda toolbar, light/dark and mobile checks');
}finally{await browser.close();await preview.close();}
