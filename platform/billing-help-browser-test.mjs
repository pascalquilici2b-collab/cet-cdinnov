import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {billingPreview} from './billing-preview.mjs';

const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright'),out=process.env.PORTAL_QA;
assert.ok(out,'Private PORTAL_QA output directory required');await mkdir(out,{recursive:true});
const preview=await billingPreview(),browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];let page;
const context=async options=>{
 const ctx=await browser.newContext({locale:'fr-FR',...options});
 await ctx.route('**/*',route=>route.request().url().startsWith(preview.base+'/')||route.request().url().startsWith('data:')?route.continue():route.abort());
 const p=await ctx.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));return p;
};
const withinViewport=async p=>{
 const box=await p.getByRole('tooltip').boundingBox();assert.ok(box&&box.width>0);
 const size=p.viewportSize();assert.ok(box.x>=11&&box.y>=11&&box.x+box.width<=size.width-11&&box.y+box.height<=size.height-11,JSON.stringify(box));
 assert.equal(await p.getByRole('tooltip').evaluate(el=>{const b=el.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===el;}),true,'tooltip not behind another surface');
};
try{
 page=await context({viewport:{width:1440,height:1000}});await page.goto(preview.base);
 const nav=name=>page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name,exact:true});
 await nav('Paramètres de facturation').click();
 const help=page.getByRole('button',{name:'Aide — Paramètres de facturation',exact:true}),tip=page.getByRole('tooltip');
 assert.equal(await page.locator('.bill-settings-aside').count(),0);
 await help.hover();await tip.waitFor();await withinViewport(page);
 await tip.hover();await page.waitForTimeout(250);assert.equal(await tip.isVisible(),true,'hoverable help remains readable');
 await page.locator('.bill-heading h1').hover();await tip.waitFor({state:'detached'});
 await help.focus();await tip.waitFor();assert.equal(await help.getAttribute('aria-describedby'),await tip.getAttribute('id'));
 await page.keyboard.press('Escape');await tip.waitFor({state:'detached'});assert.equal(await help.evaluate(el=>el===document.activeElement),true);
 await page.keyboard.press('Tab');assert.equal(await tip.count(),0);
 await help.focus();await tip.waitFor();await page.keyboard.press('Tab');await tip.waitFor({state:'detached'});
 await help.click();await tip.waitFor();await help.click();await tip.waitFor({state:'detached'});
 await help.click();await tip.waitFor();await page.locator('.bill-settings-heading h2').click({position:{x:5,y:5}});await tip.waitFor({state:'detached'});
 await page.screenshot({path:join(out,'help-settings-desktop.png'),fullPage:true});
 await page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:/^Factures/}).click();await page.getByRole('button',{name:'Nouvelle facture',exact:true}).first().click();
 const reviewHelp=page.getByRole('button',{name:'Aide — Vérification du document',exact:true}),previewHelp=page.getByRole('button',{name:'Aide — Aperçu en direct',exact:true});
 await reviewHelp.hover();await tip.waitFor();await previewHelp.hover();await tip.waitFor();assert.equal(await tip.count(),1);assert.match(await tip.innerText(),/aperçu|PDF/i);
 await page.keyboard.press('Escape');await tip.waitFor({state:'detached'});
 await page.screenshot({path:join(out,'help-editor-desktop.png'),fullPage:false});

 // Portals must remain inside a native modal's top layer. Escape dismisses help first.
 await page.getByRole('button',{name:'+ Ajouter depuis le catalogue',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Choisir une prestation',exact:true});
 await dialog.getByRole('button',{name:'+ Nouvelle prestation',exact:true}).click();
 const referenceHelp=dialog.getByRole('button',{name:'Aide — Référence catalogue',exact:true});
 await referenceHelp.click();await dialog.getByRole('tooltip').waitFor();await withinViewport(page);
 assert.equal(await dialog.getByLabel('Référence catalogue',{exact:true}).evaluate(el=>document.getElementById(el.getAttribute('aria-describedby')).classList.contains('bill-sr-only')),true);
 assert.equal(await dialog.getByLabel('Référence catalogue',{exact:true}).getAttribute('aria-invalid'),null,'help did not mark input touched');
 await page.screenshot({path:join(out,'help-dialog-desktop.png'),fullPage:false});
 await page.keyboard.press('Escape');await tip.waitFor({state:'detached'});assert.equal(await dialog.isVisible(),true,'Escape kept directory open');
 assert.equal(await referenceHelp.evaluate(el=>el===document.activeElement),true);
 page.once('dialog',d=>d.accept());await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
 console.log('OK hover, pointer travel, focus, Escape, blur, click toggle, single help and modal top layer');

 const mobile=await context({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await mobile.goto(preview.base);await mobile.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:'Paramètres de facturation',exact:true}).tap();
 const mobileHelp=mobile.getByRole('button',{name:'Aide — Paramètres de facturation',exact:true});
 for(const theme of ['light','dark']){
  await mobile.evaluate(theme=>CDITheme.set(theme),theme);
  for(const width of [390,320]){
   await mobile.setViewportSize({width,height:844});await mobileHelp.tap();await mobile.getByRole('tooltip').waitFor();await withinViewport(mobile);
   const hit=await mobileHelp.boundingBox();assert.ok(hit.width>=43.9&&hit.height>=43.9,JSON.stringify({hit,coarse:await mobile.evaluate(()=>matchMedia('(pointer:coarse)').matches)}));
   assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page overflow');
   if(width===390)await mobile.screenshot({path:join(out,'help-mobile-'+theme+'.png'),fullPage:false});
   await mobileHelp.tap();await mobile.getByRole('tooltip').waitFor({state:'detached'});
  }
 }
 await mobileHelp.tap();await mobile.getByRole('tooltip').waitFor();await mobile.getByLabel('Émetteur — Raison sociale',{exact:true}).tap();await mobile.getByRole('tooltip').waitFor({state:'detached'});
 assert.equal((await preview.ctx.db.prepare('SELECT count(*) AS n FROM billing_documents').first()).n,0,'help never saved a document');
 assert.equal((await preview.ctx.db.prepare('SELECT count(*) AS n FROM billing_directory').first()).n,0,'help never submitted the directory form');
 assert.equal((await preview.ctx.db.prepare('SELECT count(*) AS n FROM billing_issuances').first()).n,0);
 assert.deepEqual(errors,[]);console.log('PASS contextual-help browser checks, touch/light/dark at 320/390 px, no accidental submissions');
}catch(error){if(page)await page.screenshot({path:join(out,'help-failure.png'),fullPage:true});throw error;}
finally{await browser.close();await preview.close();}
