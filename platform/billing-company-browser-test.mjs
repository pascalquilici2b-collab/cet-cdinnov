import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {billingPreview} from './billing-preview.mjs';
import {companyFixture} from './billing-company-fixture.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const out=process.env.PORTAL_QA;assert.ok(out);await mkdir(out,{recursive:true});
const preview=await billingPreview(),browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'fr-FR'}),errors=[],lookups=[];
 let mode='ok',release,started;
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===preview.base)return route.continue();
  if(url.hostname!=='recherche-entreprises.api.gouv.fr')return route.abort();
  lookups.push({query:url.searchParams.get('q'),hasAuth:!!request.headers().authorization});
  if(mode==='slow'){started?.();await new Promise(resolve=>{release=resolve;});}
  try{await route.fulfill({status:mode==='rate'?429:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(companyFixture)});}catch{}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 const nav=name=>page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name,exact:true});
 const search=page.getByRole('searchbox',{name:'Nom, SIREN ou SIRET du client',exact:true});
 await page.goto(preview.base);await nav('Clients').click();await page.getByRole('button',{name:'+ Nouveau client',exact:true}).click();
 await search.fill('Collectivité');assert.equal(lookups.length,0);
 await search.press('Enter');await page.getByRole('list',{name:'Établissements trouvés'}).waitFor();
 assert.equal(preview.requests.filter(r=>r.method==='POST').length,0);
 assert.equal(await page.getByLabel('Client — Raison sociale',{exact:true}).inputValue(),'');
 await page.getByRole('button',{name:/Utiliser COLLECTIVITE DE CORSE — SIRET 20007695800053/}).click();
 assert.equal(await page.getByLabel('Client — Ville',{exact:true}).inputValue(),'BASTIA');
 assert.equal(await page.getByLabel('Client — SIRET',{exact:true}).inputValue(),'20007695800053');
 assert.equal(await page.getByLabel('Client — N° de TVA',{exact:true}).inputValue(),'');
 await page.getByText('Coordonnées préremplies',{exact:true}).waitFor();
 await page.getByLabel('Client — Adresse',{exact:true}).fill('Adresse de facturation personnalisée');
 await page.getByRole('button',{name:'Enregistrer la fiche',exact:true}).click();await page.getByText('Fiche enregistrée.',{exact:true}).first().waitFor();
 await page.getByRole('button',{name:'Créer un devis pour ce client',exact:true}).click();
 assert.equal(await page.getByLabel('Client — Adresse',{exact:true}).inputValue(),'Adresse de facturation personnalisée');
 const logo=page.locator('.bill-client-choice .bill-client-logo img');await logo.waitFor();await logo.evaluate(img=>img.decode());
 assert.equal(await logo.getAttribute('src'),'platform/client-logos/collectivite-corse.webp');
 await page.getByLabel('Objet du document',{exact:true}).fill('Devis test — coordonnées préremplies');
 await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();await page.getByText('Brouillon enregistré.',{exact:true}).waitFor();
 mode='rate';await search.fill('Collectivité');await search.press('Enter');await page.getByRole('alert').filter({hasText:'trop de demandes'}).waitFor();
 assert.equal(await page.getByLabel('Client — Adresse',{exact:true}).inputValue(),'Adresse de facturation personnalisée');
 mode='slow';const began=new Promise(resolve=>{started=resolve;});await search.press('Enter');await began;
 await search.fill('Nouvelle recherche');release();await page.getByLabel('Client — Ville',{exact:true}).fill('Ma ville');
 assert.equal(await page.getByRole('list',{name:'Établissements trouvés'}).count(),0);
 mode='ok';await search.fill('Collectivité');await search.press('Enter');await page.getByRole('list',{name:'Établissements trouvés'}).waitFor();
 const captures=[];
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  await page.locator('.bill-company-lookup').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const file=join(out,`clients-${theme}-${width}.png`);await page.screenshot({path:file});captures.push(file);
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:/Utiliser COLLECTIVITE DE CORSE — SIRET 20007695800012/}).click();
 assert.equal(await page.locator('.bill-company-complete path').evaluate(e=>getComputedStyle(e).animationName),'none');
 // A lookup selection edits the current draft; the saved directory snapshot stays independent.
 const headers={Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+preview.sessions[0].token};
 const directory=await(await preview.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/clients?q=CORSE',{headers})).json();
 assert.equal(directory.records[0].data.party.addressLine1,'Adresse de facturation personnalisée');
 assert.equal(directory.records[0].data.party.siret,'20007695800053');
 assert.ok(lookups.length>=4);assert.equal(lookups.some(x=>x.hasAuth),false);assert.deepEqual(errors,[]);
 await writeFile(join(out,'verification.json'),JSON.stringify({passed:true,lookups,errors,captures,apiRequests:preview.requests.length},null,2));
 console.log('OK recherche explicite, choix établissement, fiche persistante, copie dans devis, logos, erreur 429, réponse obsolète, mobile, thèmes et mouvement réduit.');
}finally{await browser.close();await preview.close();}
