import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {dirname} from 'node:path';
import {build} from 'esbuild';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {quoteFixture,quoteFixtureTools,samplePDF} from './billing-quote-fixture.mjs';

const appRequire=createRequire(new URL('../package.json',import.meta.url));
const runtimeRequire=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium,expect}=runtimeRequire('playwright/test');

test('native/imported report buttons retain their full labels and saved state in list/detail views',async()=>{
 const ctx=await testEnvironment({bindings:{BILLING_PDF_SERVICE_URL:'https://report-fixture.invalid',BILLING_PDF_SERVICE_KEY:'synthetic-report-button-key-0123456789'},outboundService:async()=>new Response(samplePDF(),{headers:{'Content-Type':'application/pdf'}})});
 let browser,server;
 try{
  await migrateBilling(ctx.db);
  await ctx.setPortal(JSON.stringify({auth:{accounts:ctx.accounts,allowed:users},factures:[{id:'report-legacy',number:'2610065',client:'Client fictif',dateFacture:'2026-10-06',title:'Relevé importé'}]}));
  const token=(await ctx.login(users[0])).token,f=await quoteFixtureTools(ctx,token,{kind:'invoice',prefix:'REPORT-TEST-'});
  const draft=quoteFixture('Relevé natif');draft.kind='invoice';draft.validUntil='';draft.lines[0].unitCode='DAY';
  const invoice=await f.create(draft),documents=[{id:invoice.id,number:invoice.issuance.number,draft:invoice.data},{id:'imported:report-legacy',number:'2610065',draft:{...draft,title:'Relevé importé'}}];
  const initialContext=await(await f.call('/context')).json();
  const source=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {InterventionReport} from './platform/client/billing-report';import {createBillingTransport} from './platform/client/billing-api';
   const docs=${JSON.stringify(documents)},transport=createBillingTransport({baseUrl:location.origin,getToken:async()=>${JSON.stringify(token)},isActive:()=>true});
   function App(){const [index,setIndex]=useState(0),[compact,setCompact]=useState(true),[context,setContext]=useState(${JSON.stringify(initialContext)}),[saves,setSaves]=useState(0),[epoch,setEpoch]=useState(0);window.reportTestRefresh=()=>transport.context().then(setContext);const d=docs[index];return <><nav><button onClick={()=>setIndex(0)}>Facture native</button><button onClick={()=>setIndex(1)}>Facture importée</button><button onClick={()=>setCompact(true)}>Liste</button><button onClick={()=>setCompact(false)}>Détail</button><button onClick={()=>setContext({...context,interventionReports:{}})}>Contexte en attente</button><button onClick={()=>setEpoch(n=>n+1)}>Remonter la vue</button></nav><section data-compact={compact}><InterventionReport key={epoch} {...d} context={context} transport={transport} compact={compact} onSaved={()=>{setSaves(n=>n+1);void transport.context().then(setContext);}}/></section><output id="saves">{saves}</output><output id="versions">{JSON.stringify(context.interventionReports||{})}</output></>;}
   createRoot(document.getElementById('root')).render(<App/>);`;
  const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',alias:{react:dirname(appRequire.resolve('react/package.json')),'react-dom':dirname(appRequire.resolve('react-dom/package.json'))},outfile:'bundle.js',logLevel:'silent',plugins:[{name:'report-button-preview-stub',setup(b){b.onResolve({filter:/^\.\/billing-pdf-preview$/},()=>({path:'preview',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function PDFPreview(){return <div data-testid="pdf-preview">Aperçu PDF chargé</div>}',loader:'tsx',resolveDir:process.cwd()}));}}]});
  const assets=new Map(bundle.outputFiles.map(o=>['/'+o.path.split(/[\\/]/).at(-1),o.contents]));
  server=createServer(async(req,res)=>{try{
   if(req.url.startsWith('/api/')){const chunks=[];for await(const chunk of req)chunks.push(chunk);const response=await ctx.worker.dispatchFetch('https://local'+req.url,{method:req.method,headers:{Origin:'https://app.cdinnov.eu',...(req.headers.authorization?{Authorization:req.headers.authorization}:{}),...(req.headers['content-type']?{'Content-Type':req.headers['content-type']}:{}),...(req.headers['if-match']?{'If-Match':req.headers['if-match']}:{})},...(chunks.length?{body:Buffer.concat(chunks)}:{})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
   if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/bundle.css"><div id="root"></div><script type="module" src="/bundle.js"></script>');return;}
   const asset=assets.get(req.url);res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'application/javascript');res.statusCode=asset?200:404;res.end(asset);
  }catch(e){res.writeHead(500);res.end(String(e));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(base+'/')||/^(blob:|data:)/.test(r.request().url())?r.continue():r.abort());await page.goto(base);
  const trigger=page.locator('section>button.bill-report-button'),dialog=page.getByRole('dialog',{name:'Relevé d’intervention',exact:true});
  async function assertButton(saved){await expect(trigger).toHaveText(saved?'Voir le relevé':'Générer le relevé');await expect(trigger).toHaveAttribute('data-saved',String(saved));await expect(trigger.locator(saved?'svg.lucide-eye':'svg.lucide-clipboard-list')).toHaveCount(1);}
  await assertButton(false);await page.getByRole('button',{name:'Détail',exact:true}).click();await assertButton(false);
  // Opening or editing a preview does not create a report.
  await trigger.click();await expect(dialog.getByLabel('Travail effectué 1',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Fermer le relevé',exact:true}).click();await assertButton(false);
  await trigger.click();await dialog.getByLabel('Travail effectué 1',{exact:true}).fill('Animation et contrôle qualité');await dialog.getByRole('button',{name:'Enregistrer et voir le relevé',exact:true}).click();await expect(dialog.getByRole('button',{name:'Modifier le relevé',exact:true})).toBeVisible();await assertButton(true);await expect(page.locator('#saves')).toHaveText('1');
  await dialog.getByRole('button',{name:'Fermer le relevé',exact:true}).click();await page.getByRole('button',{name:'Liste',exact:true}).click();await assertButton(true);
  await expect.poll(async()=>JSON.parse(await page.locator('#versions').textContent())[invoice.id]).toBe(1);
  await page.getByRole('button',{name:'Contexte en attente',exact:true}).click();await trigger.click();await assertButton(true);await expect(dialog.getByRole('button',{name:'Modifier le relevé',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Modifier le relevé',exact:true}).click();await dialog.getByLabel('Travail effectué 1',{exact:true}).fill('Mission complétée');await dialog.getByRole('button',{name:'Enregistrer et voir le relevé',exact:true}).click();await expect(page.locator('#saves')).toHaveText('2');await dialog.getByRole('button',{name:'Fermer le relevé',exact:true}).click();await assertButton(true);
  await expect.poll(async()=>JSON.parse(await page.locator('#versions').textContent())[invoice.id]).toBe(2);await page.getByRole('button',{name:'Remonter la vue',exact:true}).click();await assertButton(true);
  // Reusing the component for a different invoice cannot reuse the previous saved flag.
  await trigger.click();await expect(dialog.getByRole('button',{name:'Modifier le relevé',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Fermer le relevé',exact:true}).click();await page.getByRole('button',{name:'Facture importée',exact:true}).click();await assertButton(false);
  await trigger.click();await expect(dialog.getByLabel('Date du relevé',{exact:true})).toBeEnabled();if(!await dialog.getByLabel('Intitulé intervention 1',{exact:true}).count())await dialog.getByRole('button',{name:'Ajouter une ligne',exact:false}).click();await dialog.getByLabel('Intitulé intervention 1',{exact:true}).fill('Accompagnement');await dialog.getByLabel('Travail effectué 1',{exact:true}).fill('Contrôle des pièces');await dialog.getByLabel('Nombre de jours 1',{exact:true}).fill('2');
  const download=page.waitForEvent('download',{timeout:10000}).catch(async e=>{throw new Error(e.message+'; dialog='+await dialog.innerText());});await dialog.getByRole('button',{name:'Télécharger le relevé',exact:true}).click();await download;await assertButton(true);await expect(page.locator('#saves')).toHaveText('3');await dialog.getByRole('button',{name:'Fermer le relevé',exact:true}).click();await page.getByRole('button',{name:'Détail',exact:true}).click();await assertButton(true);
  await expect.poll(async()=>JSON.parse(await page.locator('#versions').textContent())['imported:report-legacy']).toBe(1);await page.getByRole('button',{name:'Remonter la vue',exact:true}).click();await assertButton(true);
  const native=await(await f.call('/documents/'+invoice.id+'/intervention-report')).json(),imported=await(await f.call('/imported-invoices/report-legacy/intervention-report')).json();assert.equal(native.version,2);assert.equal(native.rows[0].description,'Mission complétée');assert.equal(imported.version,1);assert.equal(imported.rows[0].description,'Contrôle des pièces');assert.deepEqual(errors,[]);
 }finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await ctx.worker.dispose();}
});
