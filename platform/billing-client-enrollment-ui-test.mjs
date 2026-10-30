import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {blankClient} from './billing-directory-domain.ts';
import {blankClientDetails} from './billing-client-details.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const appRequire=createRequire(new URL('../package.json',import.meta.url));
const runtimeRequire=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium,expect}=runtimeRequire('playwright/test');
const output=resolve(process.env.PORTAL_QA||join(root,'platform/.private/client-enrollment-qa'));
const company=(siren,name,sirets)=>({siren,nom_raison_sociale:name,etat_administratif:'A',statut_diffusion:'O',nature_juridique:'5710',nombre_etablissements_ouverts:sirets.length,
 siege:{siret:sirets[0],etat_administratif:'A',statut_diffusion_etablissement:'O',est_siege:true,numero_voie:'12',type_voie:'RUE',libelle_voie:'DE L ANNUAIRE',code_postal:'20000',libelle_commune:'AJACCIO'},
 matching_etablissements:sirets.slice(1).map(siret=>({siret,etat_administratif:'A',statut_diffusion_etablissement:'O',est_siege:false,adresse:'18 RUE DE L ANNUAIRE 20200 BASTIA',code_postal:'20200',libelle_commune:'BASTIA'}))});
const registry={results:[company('200076958','ENTREPRISE ANNUAIRE QA',['20007695800012','20007695800053']),company('392175568','EXISTANT ANNUAIRE QA',['39217556800022']),company('732829320','REESSAI ANNUAIRE QA',['73282932000074']),company('552100554','ETABLISSEMENT HISTORIQUE QA',['55210055400013'])],total_results:4};

test('client enrollment uses current edited values, preserves existing identities and survives retries in quotes and invoices',async t=>{
 const ctx=await testEnvironment();let server,browser;
 const requests=[],lookups=[],errors=[],captures=[];
 try{
  await migrateBilling(ctx.db);await mkdir(output,{recursive:true});
  const token=(await ctx.login(users[0])).token;
  const call=(path,method='GET',body)=>ctx.worker.dispatchFetch('https://local/api/v1/billing'+path,{method,headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const read=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
  const logo='data:image/webp;base64,'+(await readFile(join(root,'platform/client-logos/collectivite-corse.webp'))).toString('base64');
  const existingId=randomUUID(),existingData={...blankClient(),party:{...blankClient().party,name:'Client existant conservé',siren:'392175568',siret:'39217556800022',addressLine1:'Adresse privée conservée',postalCode:'20200',city:'Bastia',email:'contact@example.invalid',legal:'Mentions conservées'},notes:'Note interne conservée',logoData:logo,logoKey:'collectivite-corse.webp',details:{...blankClientDetails(),shareCapital:'Capital conservé'}};
  const existing=await read(await call('/clients','POST',{id:existingId,data:existingData}),201);
  const legacyId=randomUUID(),legacy=await read(await call('/clients','POST',{id:legacyId,data:{...blankClient(),party:{...blankClient().party,name:'Fiche historique sans établissement',siren:'552100554',addressLine1:'Adresse historique conservée'},notes:'Ne pas remplacer cette fiche historique',logoData:logo}}),201);
  const source=`import {mountBilling} from './platform/client/billing';import {createBillingTransport} from './platform/client/billing-api';
   const transport=createBillingTransport({baseUrl:location.origin,getToken:async()=>${JSON.stringify(token)},isActive:()=>true});
   mountBilling(document.getElementById('root'),{transport,initialKind:new URLSearchParams(location.search).get('kind')==='quote'?'quote':'invoice',onLegacy:()=>{}});`;
  const bundle=await build({stdin:{contents:source,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',alias:{react:dirname(appRequire.resolve('react/package.json')),'react-dom':dirname(appRequire.resolve('react-dom/package.json'))},external:['/platform/pdf-editor-font.ttf'],outfile:'bundle.js',logLevel:'silent',plugins:[{name:'enrollment-preview-stub',setup(b){b.onResolve({filter:/^\.\/billing-pdf-preview$/},()=>({path:'preview',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function PDFPreview(){return <div data-testid="pdf-preview">Aperçu du document</div>}',loader:'tsx',resolveDir:root}));}}]});
  const assets=new Map(bundle.outputFiles.map(o=>['/'+o.path.split(/[\\/]/).at(-1),o.contents]));
  server=createServer(async(req,res)=>{try{
   const url=new URL(req.url,'http://local');
   if(url.pathname.startsWith('/api/')){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks),headers={Origin:'https://app.cdinnov.eu'};
    for(const key of ['authorization','content-type','if-match','if-none-match','x-filename'])if(req.headers[key])headers[key]=req.headers[key];
    const response=await ctx.worker.dispatchFetch('https://local'+url.pathname+url.search,{method:req.method,headers,...(bytes.length?{body:bytes}:{})});
    requests.push({method:req.method,path:url.pathname,status:response.status,...(req.method==='POST'&&['/api/v1/billing/clients','/api/v1/billing/documents'].includes(url.pathname)?{body:JSON.parse(bytes.toString())}:{})});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="fr" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><style>body{margin:0;padding:20px;background:#f6f8fa}html[data-theme=dark] body{background:#101d24}@media(max-width:500px){body{padding:8px}}</style><div id="root"></div><script type="module" src="/bundle.js"></script></html>');return;}
   if(url.pathname.startsWith('/platform/client-logos/')){const path=resolve(root,'.'+url.pathname);if(!path.startsWith(resolve(root,'platform/client-logos')+sep))throw Error('Invalid asset');res.setHeader('Content-Type',path.endsWith('.webp')?'image/webp':'image/png');res.end(await readFile(path));return;}
   const asset=assets.get(url.pathname);res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'application/javascript');res.statusCode=asset?200:404;res.end(asset);
  }catch(e){res.writeHead(500);res.end(String(e));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1080},locale:'fr-FR'});
  let registryMode='ok';
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===base||/^(blob:|data:)/.test(request.url()))return route.continue();
   if(url.hostname!=='recherche-entreprises.api.gouv.fr')return route.abort();
   lookups.push({q:url.searchParams.get('q'),authorization:!!request.headers().authorization});
   await route.fulfill({status:registryMode==='error'?429:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(registry)});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));let failedScenarios=0;
  const scenario=(name,fn)=>t.test(name,async()=>{try{await fn();}catch(error){failedScenarios++;console.error(name+': '+error.message+'; JavaScript='+JSON.stringify(errors)+'; UI='+(await page.locator('body').innerText()).slice(0,2200));await page.screenshot({path:join(output,'failure-'+name.split(' : ')[0].replace(/[^a-z]+/gi,'-')+'.png')});throw error;}});
  const field=name=>page.getByLabel('Client — '+name,{exact:true});
  const clientPosts=()=>requests.filter(r=>r.path==='/api/v1/billing/clients'&&r.method==='POST');
  const allClients=async()=>read(await call('/clients?limit=100'));
  async function start(kind){
   await page.goto(base+'/?kind='+kind);await page.getByRole('button',{name:kind==='quote'?'Nouveau devis':'Nouvelle facture',exact:true}).click();
   await expect(field('Raison sociale')).toBeEnabled();await expect(page.locator('.bill-save-state')).not.toHaveText('Enregistrement…');await page.locator('[data-step="buyer"]>summary').click();await expect(field('Raison sociale')).toBeVisible();
   return requests.filter(r=>r.path==='/api/v1/billing/documents'&&r.method==='POST').at(-1).body.id;
  }
  async function lookup(siret){
   const input=page.getByRole('searchbox',{name:'Nom, SIREN ou SIRET du client',exact:true});await input.fill(siret);await input.press('Enter');
   const result=page.getByRole('button',{name:new RegExp('— SIRET '+siret+'$')});await expect(result).toBeVisible();await result.focus();await page.keyboard.press('Enter');await expect(field('SIRET')).toHaveValue(siret);
  }
  async function save(id){await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.locator('.bill-save-state')).toContainText('Enregistré');return read(await call('/documents/'+id));}
  async function screenshot(name,locator){const path=join(output,name+'.png');await locator.scrollIntoViewIfNeeded();await locator.screenshot({path});captures.push(path);}

  const enrolled=[];
  for(const [kind,siret,theme] of [['quote','20007695800012','light'],['invoice','20007695800053','dark']])await scenario(kind+' : lookup, edited values, enrollment, document link and reload',async()=>{
   const id=await start(kind),before=clientPosts().length;await lookup(siret);await expect(page.getByRole('button',{name:'Ajouter aux clients',exact:true})).toBeEnabled();assert.equal(clientPosts().length,before);
   const name=kind==='quote'?'Raison sociale corrigée du devis':'Raison sociale corrigée de la facture',address=kind==='quote'?'47 rue corrigée du Devis':'59 avenue corrigée de la Facture';
   await field('Raison sociale').fill(name);await field('Adresse').fill(address);await field('Code postal').fill('20100');await field('Ville').fill('Sartène');
   const add=page.getByRole('button',{name:'Ajouter aux clients',exact:true});await expect(add).toBeEnabled();await add.dblclick({delay:30});await expect(page.getByRole('status').filter({hasText:/^Client ajouté$/})).toBeVisible();
   assert.equal(clientPosts().length,before+1,'a double click must produce only one creation');
   const matches=(await allClients()).records.filter(r=>r.data.party.siret===siret);assert.equal(matches.length,1);const client=matches[0];
   assert.equal(client.data.party.name,name);assert.equal(client.data.party.addressLine1,address);assert.equal(client.data.party.city,'Sartène');assert.ok(client.data.details.source.endsWith(siret));
   const doc=await save(id);assert.equal(doc.data.clientId,client.id);assert.equal(doc.data.buyer.name,name);assert.equal(doc.data.buyer.addressLine1,address);
   await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);await screenshot('enrolled-'+kind+'-'+theme,page.locator('.bill-client-selection'));
   await page.reload();const row=page.locator('.bill-list-table tbody tr').filter({hasText:name});await row.getByRole('button',{name:'Ouvrir le brouillon',exact:true}).click();await page.locator('[data-step="buyer"]>summary').click();await expect(field('Raison sociale')).toHaveValue(name);await expect(field('Adresse')).toHaveValue(address);
   await page.getByRole('navigation',{name:'Documents commerciaux'}).getByRole('button',{name:'Clients',exact:true}).click();await page.getByRole('button',{name:'Ouvrir la fiche '+name,exact:true}).click();await expect(field('Raison sociale')).toHaveValue(name);await expect(field('Adresse')).toHaveValue(address);
   enrolled.push({id,clientId:client.id,siret});
  });
  await scenario('same SIREN with different SIRET stays a separate establishment',async()=>{
   assert.equal(enrolled.length,2);assert.notEqual(enrolled[0].clientId,enrolled[1].clientId);
   assert.equal((await allClients()).records.filter(r=>r.data.party.siren==='200076958').length,2);
  });
  await scenario('a legacy SIREN-only card is suggested without automatic linking or overwriting',async()=>{
   const id=await start('quote'),before=clientPosts().length;await lookup('55210055400013');await expect(page.getByRole('button',{name:'Fiche à vérifier',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Ajouter cet établissement',exact:true})).toBeEnabled();
   assert.equal(clientPosts().length,before);assert.equal((await save(id)).data.clientId,'');assert.deepEqual(await read(await call('/clients/'+legacyId)),legacy);
   await page.getByRole('button',{name:'Fiche à vérifier',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Choisir un client',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Choisir Fiche historique sans établissement',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
   await page.getByRole('button',{name:'Ajouter cet établissement',exact:true}).click();await expect(page.getByRole('status').filter({hasText:/^Client ajouté$/})).toBeVisible();const doc=await save(id);assert.notEqual(doc.data.clientId,legacyId);assert.ok(doc.data.clientId);
   assert.equal((await read(await call('/clients/'+doc.data.clientId))).data.party.siret,'55210055400013');assert.deepEqual(await read(await call('/clients/'+legacyId)),legacy);assert.equal(clientPosts().length,before+1);
  });
  for(const kind of ['quote','invoice'])await scenario(kind+' : same existing SIRET links without changing the client card or logo',async()=>{
   const id=await start(kind),before=clientPosts().length;await lookup('39217556800022');await expect(page.getByRole('status').filter({hasText:'Déjà dans le carnet clients'})).toBeVisible();
   assert.equal(await page.getByRole('button',{name:'Ajouter aux clients',exact:true}).count(),0);assert.equal(clientPosts().length,before);
   await expect(page.locator('.bill-client-book img')).toHaveAttribute('src',logo);await page.locator('.bill-client-book img').evaluate(image=>image.decode());
   const doc=await save(id);assert.equal(doc.data.clientId,existingId);assert.deepEqual(await read(await call('/clients/'+existingId)),existing);
   const writes=requests.filter(r=>r.path==='/api/v1/billing/clients/'+existingId&&r.method==='PUT');assert.equal(writes.length,0);
  });
  await scenario('a lost creation response is recovered without duplicate or lost edited values',async()=>{
   const id=await start('quote');await lookup('73282932000074');await field('Raison sociale').fill('Réessai — saisie conservée');await field('Adresse').fill('81 chemin du Réessai');
   let dropped=false;await page.route('**/api/v1/billing/clients',async route=>{if(route.request().method()==='POST'&&!dropped){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
   await page.getByRole('button',{name:'Ajouter aux clients',exact:true}).click();await expect(page.locator('.bill-client-enrollment-error')).toContainText('interrompue');await expect(field('Raison sociale')).toHaveValue('Réessai — saisie conservée');
   await page.getByRole('button',{name:'Réessayer l’ajout',exact:true}).click();await expect(page.getByRole('status').filter({hasText:/^Client ajouté$/})).toBeVisible();await page.unroute('**/api/v1/billing/clients');
   const records=(await allClients()).records.filter(r=>r.data.party.siret==='73282932000074');assert.equal(records.length,1);assert.equal(records[0].data.party.addressLine1,'81 chemin du Réessai');
   const creates=clientPosts().filter(r=>r.body.data.party.siret==='73282932000074');assert.equal(new Set(creates.map(r=>r.body.id)).size,1);assert.equal((await save(id)).data.clientId,records[0].id);
  });
  await scenario('a manually changed establishment does not inherit the previous registry evidence',async()=>{
   const id=await start('invoice');await lookup('73282932000074');await expect(page.getByRole('status').filter({hasText:'Déjà dans le carnet clients'})).toBeVisible();
   await field('SIRET').fill('73282932000082');await field('Raison sociale').fill('Établissement corrigé manuellement');await field('Adresse').fill('91 route du Nouvel établissement');
   await page.getByRole('button',{name:'Ajouter aux clients',exact:true}).click();await expect(page.getByRole('status').filter({hasText:/^Client ajouté$/})).toBeVisible();
   const records=(await allClients()).records.filter(r=>r.data.party.siret==='73282932000082');assert.equal(records.length,1);const data=records[0].data;
   assert.equal(data.party.addressLine1,'91 route du Nouvel établissement');assert.ok(!data.details?.source||data.details.source.endsWith('73282932000082'),'registry evidence must not name the previous establishment');assert.ok(!data.details?.retrievedAt,'a manual establishment was not retrieved from the registry');
   await field('Adresse').fill('97 adresse propre au document');await expect(page.getByRole('status').filter({hasText:'Modifications réservées au document'})).toBeVisible();assert.equal((await read(await call('/clients/'+records[0].id))).data.party.addressLine1,'91 route du Nouvel établissement');
   const doc=await save(id);assert.equal(doc.data.clientId,records[0].id);assert.equal(doc.data.buyer.addressLine1,'97 adresse propre au document');
  });
  await scenario('directory failure preserves manual fields; keyboard carnet selection works in both themes',async()=>{
   await start('invoice');await field('Raison sociale').fill('Saisie à conserver');await field('Adresse').fill('Adresse avant erreur');const count=(await allClients()).total;registryMode='error';
   const input=page.getByRole('searchbox',{name:'Nom, SIREN ou SIRET du client',exact:true});await input.fill('Recherche impossible');await input.press('Enter');await expect(page.getByRole('alert').filter({hasText:'trop de demandes'})).toBeVisible();
   await expect(field('Raison sociale')).toHaveValue('Saisie à conserver');await expect(field('Adresse')).toHaveValue('Adresse avant erreur');assert.equal((await allClients()).total,count);registryMode='ok';
   const backgrounds=[];
   for(const theme of ['light','dark']){
    await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);const book=page.getByRole('button',{name:'Choisir dans le carnet clients',exact:true});await book.focus();await page.keyboard.press('Enter');
    const dialog=page.getByRole('dialog',{name:'Choisir un client',exact:true});await expect(dialog).toBeVisible();await dialog.getByLabel('Rechercher un client',{exact:true}).fill('Client existant conservé');const choice=dialog.getByRole('button',{name:'Choisir Client existant conservé',exact:true});await expect(choice).toBeVisible();await choice.focus();await page.keyboard.press('Enter');await expect(dialog).not.toBeVisible();await expect(book).toBeFocused();await expect(field('Adresse')).toHaveValue(existingData.party.addressLine1);await expect(page.getByRole('alert').filter({hasText:'trop de demandes'})).toHaveCount(0);
    await book.press('Enter');await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(book).toBeFocused();
    backgrounds.push(await book.evaluate(el=>getComputedStyle(el).backgroundColor));await screenshot('client-carnet-'+theme,page.locator('.bill-client-selection'));await page.setViewportSize({width:390,height:844});const selection=page.locator('.bill-client-selection');await expect(selection).toBeVisible();const box=await selection.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=391,'client controls must stay inside the mobile viewport');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'billing navigation and editor stay inside the mobile viewport');await screenshot('client-carnet-mobile-'+theme,selection);await page.setViewportSize({width:1440,height:1080});
   }
   assert.notEqual(backgrounds[0],backgrounds[1],'client control must respond to the light/dark theme');
  });
  assert.equal(lookups.some(r=>r.authorization),false,'directory requests must not receive portal tokens');assert.deepEqual(errors,[]);
  await writeFile(join(output,'verification.json'),JSON.stringify({passed:failedScenarios===0,failedScenarios,lookups,requests:requests.map(({body,...r})=>r),captures,javascriptErrors:errors},null,2));
  console.log('Client enrollment QA: '+captures.length+' local captures; '+lookups.length+' mocked external directory requests; '+requests.length+' real local Worker requests.');
 }finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await ctx.worker.dispose();}
});
