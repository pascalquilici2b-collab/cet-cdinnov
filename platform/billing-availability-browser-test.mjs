import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {billingPreview} from './billing-preview.mjs';

const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const out=process.env.PORTAL_QA;assert.ok(out);await mkdir(out,{recursive:true});
const preview=await billingPreview({bindings:{BILLING_PDF_SERVICE_URL:'',BILLING_PDF_SERVICE_KEY:''}}),browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>route.request().url().startsWith(preview.base+'/')?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(preview.base);await page.getByRole('button',{name:'Nouvelle facture',exact:true}).first().click();
 await page.getByRole('status').filter({hasText:'PDF & émission à activer'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'PDF paginé',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Télécharger le PDF brouillon',exact:true}).count(),0);
 assert.equal(await page.getByText('Vérifier et finaliser',{exact:true}).count(),0);
 await page.getByLabel('Objet du document',{exact:true}).fill('Première version — brouillon fictif');
 await page.getByLabel('Client — Raison sociale',{exact:true}).fill('Client fictif');
 await page.getByLabel('Description',{exact:true}).fill('Prestation fictive');
 await page.getByLabel('Prix unitaire HT (€)',{exact:true}).fill('100');
 assert.match(await page.locator('.bill-paper-grand').innerText(),/120,00/);
 await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();await page.getByText('Brouillon enregistré.',{exact:true}).waitFor();
 await page.screenshot({path:join(out,'first-version-desktop.png'),fullPage:false});
 await page.locator('.bill-back').click();await page.getByRole('button',{name:'Ouvrir Première version — brouillon fictif',exact:true}).click();
 assert.equal(await page.getByLabel('Prix unitaire HT (€)',{exact:true}).inputValue(),'100');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Aperçu',exact:true}).click();
 assert.equal(await page.getByRole('region',{name:'Aperçu du document',exact:true}).isVisible(),true);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:join(out,'first-version-mobile.png'),fullPage:false});
 await page.getByText('Historique & dossiers',{exact:false}).click();await page.getByRole('button',{name:'Historique des factures & Factur-X',exact:true}).click();
 assert.equal(preview.requests.some(r=>r.path.includes('preview.pdf')||r.path.endsWith('/issue')||r.path.endsWith('/finalize')),false);
 assert.equal((await preview.ctx.db.prepare('SELECT COUNT(*) n FROM billing_documents').first()).n,1);
 assert.equal((await preview.ctx.db.prepare('SELECT COUNT(*) n FROM billing_issuances').first()).n,0);
 assert.deepEqual(errors,[]);console.log('PASS unconfigured service: drafts, live totals, persistence, mobile and legacy access; no PDF/issuance attempts');
}finally{await browser.close();await preview.close();}
