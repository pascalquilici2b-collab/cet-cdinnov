import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {billingPreview} from './billing-preview.mjs';
import {invoiceFixture,paymentFixtureTools} from './billing-payments-fixture.mjs';
import {quoteFixture} from './billing-quote-fixture.mjs';
const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json'),{chromium,expect}=require('playwright/test');
const out='platform/.private/billing-attention-20261028';await mkdir(out,{recursive:true});
const p=await billingPreview(),browser=await chromium.launch({channel:'msedge',headless:true});let page;
try{
 const f=await paymentFixtureTools(p.ctx,p.sessions[0].token),late=await f.create(invoiceFixture('Facture ancienne non envoyée')),future=await f.create({...invoiceFixture('Facture non échue'),dueDate:'2099-01-01'});
 await f.quoteCreate(quoteFixture('Devis à transmettre'));
 page=await browser.newPage({viewport:{width:1800,height:1080},locale:'fr-FR'});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(p.base);const nav=page.getByRole('navigation',{name:'Documents à suivre'}),overdue=nav.getByRole('button',{name:/En retard d’encaissement/}),pending=nav.getByRole('button',{name:/Factures à envoyer/}),quotes=nav.getByRole('button',{name:/Devis à envoyer/});
 await expect(overdue).toHaveAttribute('aria-label','En retard d’encaissement : 0');await expect(pending.locator('b')).not.toHaveText('—');const count=Number(await pending.locator('b').innerText());assert.ok(count>=2);
 assert.equal(await page.locator('.topbar #billingAttention nav').count(),1);
 await pending.click();await expect(pending).toHaveAttribute('aria-pressed','true');await expect(page.getByLabel('Filtrer par statut',{exact:true})).toHaveValue('finalized');
 await page.getByRole('button',{name:'Ouvrir '+late.data.title,exact:true}).click();const status=page.getByRole('button',{name:'Statut du document',exact:true});await expect(status).toContainText('Finalisé');await expect(pending).toHaveAttribute('aria-pressed','false');
 await status.click();await page.getByRole('menuitem',{name:'Envoyée',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Déclarer la facture envoyée'});await expect(dialog.getByLabel('Date de l’envoi')).toBeVisible();await dialog.getByRole('button',{name:'Confirmer l’envoi effectué'}).click();await expect(dialog).toHaveCount(0);await expect(status).toContainText('En retard d’encaissement');
 await expect(overdue).toHaveAttribute('aria-label','En retard d’encaissement : 1');await expect(pending.locator('b')).toHaveText(String(count-1));let saved=await(await f.call('/documents/'+late.id)).json();assert.equal(saved.data.dueDate,late.data.dueDate);assert.ok(saved.sentAt);
 await overdue.click();await expect(page.getByLabel('Filtrer par statut',{exact:true})).toHaveValue('overdue');await expect(page.getByRole('button',{name:'Ouvrir '+late.data.title,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Ouvrir '+future.data.title,exact:true})).toHaveCount(0);
 await pending.click();await page.getByRole('button',{name:'Ouvrir '+future.data.title,exact:true}).click();await status.click();await page.getByRole('menuitem',{name:'Envoyée',exact:true}).click();await dialog.getByRole('button',{name:'Confirmer l’envoi effectué'}).click();await expect(status).toContainText('Envoyée');await expect(pending.locator('b')).toHaveText(String(count-2));await expect(overdue.locator('b')).toHaveText('1');
 await quotes.click();await expect(page.getByLabel('Filtrer par statut',{exact:true})).toHaveValue('prepared');await expect(page.getByRole('button',{name:'Ouvrir Devis à transmettre',exact:true})).toBeVisible();await expect(quotes).toHaveAttribute('aria-pressed','true');
 for(const [width,theme]of [[1800,'light'],[1440,'dark'],[420,'dark']]){await page.setViewportSize({width,height:1000});await page.evaluate(t=>CDITheme.set(t),theme);await expect(nav).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow at '+width);const bounds=await nav.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1,'strip fits');await page.screenshot({path:out+'/billing-'+width+'-'+theme+'.png',fullPage:false});}
 assert.deepEqual(errors,[]);console.log('Attention strip, invoice/quote filters, sent declaration, unchanged due date, overdue only after sending, counter refresh, light/dark/mobile: PASS');
}catch(e){if(page){await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});await writeFile(out+'/failure.txt',await page.locator('body').innerText());}throw e;}finally{await browser.close();await p.close();}
