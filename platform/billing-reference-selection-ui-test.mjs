import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {dirname} from 'node:path';
import {build} from 'esbuild';
const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium,expect}=require('playwright/test');
const appRequire=createRequire(new URL('../package.json',import.meta.url));

test('invoice reference UI fills and clears Chorus references and supports global purchase orders',async()=>{
 const global={id:'global',reference:'BC-GLOBAL',serviceCode:'00123',engagement:'ENG-GLOBAL',otherReference:'REF-GLOBAL'},blank={id:'blank',reference:'BC-BLANK'},local={id:'local',reference:'BC-PROJECT',serviceCode:'00456',engagement:'ENG-PROJECT',otherReference:'REF-PROJECT'};
 const context={businessCodes:[],markets:[{id:'market-a',reference:'M-A',clientName:'Client A',title:'Marché A',orders:[global,blank],projects:[{id:'project',name:'Projet test',orders:[local,global,blank]}]},{id:'market-b',reference:'M-B',clientName:'Client B',title:'Marché B',orders:[],projects:[]}]};
 const initial={marketId:'market-a',marketReference:'M-A',projectId:'',project:'',orderId:'',orderReference:'',serviceCode:'OLD',engagement:'OLD',otherReference:'OLD',businessCode:''};
 const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ReferenceFields} from './platform/client/billing-references-ui';function App(){const [value,setValue]=useState(${JSON.stringify(initial)});return <><ReferenceFields kind="invoice" value={value} context={${JSON.stringify(context)}} transport={{}} onChange={setValue} onRefresh={()=>{}} onMarkets={()=>{}}/><pre id="state">{JSON.stringify(value)}</pre></>;}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',alias:{react:dirname(appRequire.resolve('react/package.json')),'react-dom':dirname(appRequire.resolve('react-dom/package.json'))},external:['/platform/pdf-editor-font.ttf'],outfile:'bundle.js',logLevel:'silent'});
 const assets=new Map(bundle.outputFiles.map(f=>['/'+f.path.split(/[\\/]/).at(-1),f.contents]));
 const server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="stylesheet" href="/bundle.css"><div id="root"></div><script type="module" src="/bundle.js"></script>');return;}const body=assets.get(req.url);res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'application/javascript');res.statusCode=body?200:404;res.end(body);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&& !r.url().endsWith('/favicon.ico'))errors.push(r.status()+' '+r.url());});await page.goto('http://127.0.0.1:'+server.address().port);
  await expect(page.locator('#state')).toBeAttached().catch(async e=>{throw new Error(e.message+'; errors='+JSON.stringify(errors)+'; assets='+JSON.stringify([...assets.keys()])+'; body='+await page.locator('body').innerText());});
  const order=page.getByLabel('Bon de commande du projet'),service=page.getByLabel('Service / n° de service',{exact:true});
  await expect(order).toBeVisible();await page.locator('summary').click();
  await order.selectOption('global');await expect(service).toHaveValue('00123');await expect(page.getByLabel('N° d’engagement',{exact:true})).toHaveValue('ENG-GLOBAL');
  await order.selectOption('blank');await expect(service).toHaveValue('');await expect(page.getByLabel('N° d’engagement',{exact:true})).toHaveValue('');await expect(page.getByLabel('Autre référence',{exact:true})).toHaveValue('');
  await order.selectOption('global');await page.getByLabel('Projet du marché',{exact:true}).click();await page.getByRole('option',{name:'Projet test',exact:true}).click();
  await expect(order).toHaveValue('global');await expect(service).toHaveValue('00123');
  await page.getByLabel('Projet du marché',{exact:true}).click();await page.getByRole('option',{name:'Sans projet lié',exact:true}).click();
  await expect(order).toHaveValue('global');await expect(service).toHaveValue('00123');
  await page.getByLabel('Projet du marché',{exact:true}).click();await page.getByRole('option',{name:'Projet test',exact:true}).click();
  await order.selectOption('local');await expect(service).toHaveValue('00456');
  await page.getByLabel('Projet du marché',{exact:true}).click();await page.getByRole('option',{name:'Sans projet lié',exact:true}).click();
  await expect(order).toHaveValue('');await expect(service).toHaveValue('');
  await order.selectOption('global');await page.getByLabel('Marché ou contrat',{exact:true}).click();await page.getByRole('option',{name:/Client B/}).click();
  await expect(order).toHaveValue('');await expect(service).toHaveValue('');await expect(page.getByLabel('Autre référence',{exact:true})).toHaveValue('');
  const state=JSON.parse(await page.locator('#state').textContent());assert.equal(state.marketId,'market-b');assert.equal(state.engagement,'');assert.deepEqual(errors,[]);
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
