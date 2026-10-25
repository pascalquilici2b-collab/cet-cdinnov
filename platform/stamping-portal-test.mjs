import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {billingPreview} from './billing-preview.mjs';
import {migrateStamping} from './stamping-schema.mjs';
import {users} from '../marches/test.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright'),out=resolve('.private/stamping-qa');await mkdir(out,{recursive:true});
const preview=await billingPreview({stamping:true});await migrateStamping(preview.ctx.db);
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
try{
 const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'fr-FR'});
 await context.route('**/*',route=>route.request().url().startsWith(preview.base+'/')||route.request().url().startsWith('data:')?route.continue():route.abort());
 let releaseModule;const moduleGate=new Promise(resolve=>releaseModule=resolve);await context.route('**/platform/stamping.js*',async route=>{await moduleGate;await route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(preview.base);
 await page.locator('[data-react-billing]').waitFor();await page.locator('[data-view=tamponnage]').click();
 await page.getByRole('heading',{name:'Tamponnage des pièces'}).waitFor();
 await page.locator('#stampingRoot .cdi-bolt').waitFor();assert.equal(await page.locator('#stampingRoot .cdi-bolt').evaluate(e=>getComputedStyle(e).animationName),'none');assert.equal(await page.locator('.auth-brand-mark .cdi-bolt').evaluate(e=>getComputedStyle(e).animationName),'none');await page.screenshot({path:out+'/menu-triangle-rotation.png'});releaseModule();
 await page.waitForFunction(()=>!document.querySelector('.stamp-progress'));
 await page.screenshot({path:out+'/portail-tamponnage.png',fullPage:false});
 await page.locator('[data-theme-toggle]').click();
 const contrast=await page.locator('.stamp-category').first().evaluate(el=>{
  const style=getComputedStyle(el),luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
  const a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 });
 assert.ok(contrast>=4.5,'Stamping panel text must remain readable in the portal dark theme');
 await page.screenshot({path:out+'/portail-tamponnage-dark.png',fullPage:false});
 await page.getByRole('button',{name:/Ressources humaines/}).click();await page.getByLabel('Nom du lot',{exact:true}).fill('Lot privé de démonstration');await page.getByRole('button',{name:'Créer le lot',exact:true}).click();
 await page.getByRole('heading',{name:'Pièces du lot',exact:true}).waitFor();
 await page.locator('[data-view=facturier]').click();await page.locator('[data-react-billing]').waitFor();assert.equal(await page.locator('#stampingRoot').count(),0);
 await page.locator('[data-view=tamponnage]').click();await page.getByRole('button',{name:/Ressources humaines/}).click();await page.getByRole('button').filter({hasText:'Lot privé de démonstration'}).waitFor();
 await page.getByRole('button',{name:'Déconnexion',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#stampingRoot .stamp-app'));assert.equal(await page.locator('#stampingRoot .stamp-app').count(),0);
 await page.goto(preview.base+'/?consultant');await page.waitForFunction(email=>AUTH_USER===email,users[1]);
 assert.equal(await page.locator('[data-view=tamponnage]').isVisible(),false);
 await page.evaluate(()=>setView('tamponnage'));assert.equal(await page.locator('.stamp-app').count(),0);
 assert.deepEqual(errors,[]);console.log('Full portal: navigation, admin rights, private lot persistence and logout passed.');
}finally{await browser.close();await preview.close();}
