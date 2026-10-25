import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixtureTools,quoteFixture,samplePDF} from './billing-quote-fixture.mjs';
import {users} from '../marches/test.mjs';
const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json'),{chromium,expect}=require('playwright/test');
const out='platform/.private/account-access-20261025/ui';await mkdir(out,{recursive:true});
const preview=await billingPreview({outboundService:async()=>new Response(samplePDF(),{headers:{'Content-Type':'application/pdf'}})}),browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const portalSeed=JSON.parse((await preview.ctx.db.prepare("SELECT payload FROM app_portal_workspace WHERE id='shared'").first()).payload);
 await preview.ctx.setPortal(JSON.stringify({params:{anneeSuivi:2026},types:[],mouvements:[],...portalSeed}));
 const {create}=await quoteFixtureTools(preview.ctx,preview.sessions[0].token);
 await create(quoteFixture('Devis de contrôle des couleurs'),false);
 const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'fr-FR'});
 await context.route('**/*',r=>r.request().url().startsWith(preview.base+'/')||/^(blob:|data:)/.test(r.request().url())?r.continue():r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await page.goto(preview.base);await page.locator('.bill-app').waitFor();
 const nav=name=>page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name,exact:true});
 await nav('Factures').click();await expect(page.locator('tr[data-imported-invoice]').first()).toBeVisible();
 const imported=page.locator('tr[data-imported-invoice]').first();
 for(const [theme,color] of [['light','rgb(233, 234, 237)'],['dark','rgb(56, 56, 62)']]){
  await page.evaluate(t=>CDITheme.set(t),theme);await page.mouse.move(1,1);
  await expect.poll(()=>imported.locator('td').first().evaluate(e=>getComputedStyle(e).backgroundColor)).toBe(color);
  await page.screenshot({path:out+'/imported-'+theme+'.png'});
 }
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>imported.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(56, 56, 62)');await page.screenshot({path:out+'/imported-mobile.png'});await page.setViewportSize({width:1500,height:1000});
 await nav('Devis').click();await page.getByRole('button',{name:'Statut du document',exact:true}).first().click();
 for(const [theme,colors] of [['light',['rgb(164, 69, 7)','rgb(6, 104, 199)','rgb(121, 59, 181)','rgb(23, 108, 62)']],['dark',['rgb(255, 184, 119)','rgb(145, 200, 255)','rgb(210, 173, 255)','rgb(140, 221, 170)']]]){
  await page.evaluate(t=>CDITheme.set(t),theme);
  for(const [i,state] of ['draft','finalized','sent','accepted'].entries())await expect.poll(()=>page.locator('.bill-state-menu [data-status="'+state+'"]').evaluate(e=>getComputedStyle(e).color)).toBe(colors[i]);
  await page.screenshot({path:out+'/quote-colors-'+theme+'.png'});
 }
 await page.keyboard.press('Escape');
 const loading=await page.evaluate(()=>{const root=document.createElement('div');root.innerHTML=loadingMarkup('Chargement');document.body.append(root);const mark=root.querySelector('.cdi-bolt'),out={rotation:getComputedStyle(mark).animationName,shimmer:getComputedStyle(mark,'::after').animationName,auth:getComputedStyle(document.querySelector('.auth-brand-mark .cdi-bolt')).animationName};root.remove();return out;});
 assert.deepEqual(loading,{rotation:'none',shimmer:'cdi-bolt-flash',auth:'none'});
 // Use real authenticated account endpoints, with the preview's temporary database.
 await page.evaluate(async()=>{cloudEnabled=()=>true;cloudURL=()=>location.origin+'/api/v1/portal';portalClean='';await cloudLoad({discard:true});setView('parametres');});
 await page.getByRole('heading',{name:'Comptes & accès',exact:true}).waitFor();
 const staffRow=page.locator('tr').filter({hasText:users[1]});
 await staffRow.getByRole('button',{name:/^Accès de /}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('switch')).toHaveCount(9);
 await page.screenshot({path:out+'/access-dark.png'});
 for(const control of await dialog.getByRole('switch').all())await control.uncheck();
 await dialog.getByRole('button',{name:'Enregistrer les accès'}).click();await expect(dialog).toHaveCount(0);
 let account=await preview.ctx.db.prepare('SELECT data_json FROM portal_accounts WHERE map_key=?').bind(users[1]).first();assert.ok(Object.values(JSON.parse(account.data_json).access).every(v=>v===false));
 const staff=await context.newPage();staff.on('pageerror',e=>errors.push(e.message));await staff.goto(preview.base+'/?consultant=1');
 await staff.evaluate(async()=>{cloudEnabled=()=>true;cloudURL=()=>location.origin+'/api/v1/portal';portalClean='';await cloudLoad({discard:true});});
 await expect(staff.getByText('Aucune rubrique n’est activée pour ce compte.')).toBeVisible();
 await expect(staff.locator('.nav-item[data-view="facturier"]')).toBeHidden();await expect(staff.locator('#cdiSheetsLink')).toBeHidden();
 await staff.evaluate(()=>setView('facturier'));assert.equal(await staff.locator('.bill-app').count(),0);
 await staffRow.getByRole('button',{name:/^Accès de /}).click();await dialog.getByRole('switch',{name:'Logiciel de facturation',exact:true}).check();await dialog.getByRole('switch',{name:'Salariés',exact:true}).check();
 await page.evaluate(()=>CDITheme.set('light'));await page.screenshot({path:out+'/access-light.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/access-mobile.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await dialog.getByRole('button',{name:'Enregistrer les accès'}).click();await expect(dialog).toHaveCount(0);
 await staff.evaluate(async()=>{await cloudLoad({discard:true});setView('facturier');});await expect(staff.locator('.bill-app')).toBeVisible();await expect(staff.locator('.nav-item[data-view="budgetsprojets"]')).toBeHidden();
 await staff.evaluate(()=>setView('salaries'));await expect(staff.locator('[data-react-personnel=salaries]')).toBeVisible();await expect(staff.getByRole('button',{name:'Nouveau salarié',exact:true})).toHaveCount(0);
 assert.deepEqual(errors,[]);console.log('OK light/dark/mobile imported surfaces; all quote colors; static marks and loading shimmer; account grant/revoke UI, direct navigation and read-only employee scope');
}finally{await browser.close();await preview.close();}
