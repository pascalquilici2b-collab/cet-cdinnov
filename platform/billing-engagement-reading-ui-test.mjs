import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {dirname} from 'node:path';
import {build} from 'esbuild';
const runtimeRequire=createRequire(process.env.PLAYWRIGHT_NODEJS_PATH||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium,expect}=runtimeRequire('playwright/test');
const appRequire=createRequire(new URL('../package.json',import.meta.url));

test('engagement analysis respects incomplete readings, exposes OCR warnings and preserves manual linking',async()=>{
 const record={id:'synthetic-quote',version:1,data:{references:{orderReference:'BC-MANUEL',marketId:'market-a',marketReference:'M-A',projectId:'project-a',engagement:'ENG-MANUEL',serviceCode:'SERVICE-MANUEL',otherReference:''}},totals:{netMinor:'123400'},quote:{state:'accepted',revision:{currentId:'synthetic-quote',abandoned:false}},issuance:{number:'DEV-SYNTH'}};
 const context={businessCodes:[],markets:[{id:'market-a',reference:'M-A',clientName:'Client fictif',title:'Marché fictif',orders:[],projects:[{id:'project-a',name:'Projet fictif',orders:[]}]}]};
 const source=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{InvoiceFromQuote}from'./platform/client/billing-commitment';
 window.calls={analysis:[],uploads:[]};const transport={context:async()=>(${JSON.stringify(context)}),analyzeEngagement:async(text)=>{window.calls.analysis.push(text);return{fields:{reference:'BC-LU',date:'2026-11-07',amountMinor:98765,marketReference:'M-A',engagement:'ENG-LU',serviceCode:'SERVICE-LU'}}},uploadEngagement:async(id,version,kind,file,details)=>{window.calls.uploads.push({id,version,kind,name:file.name,details});return{...${JSON.stringify(record)},quote:{...${JSON.stringify(record.quote)},engagement:{filename:file.name}}}}};
 function App(){const[record,setRecord]=useState(${JSON.stringify(record)});return <InvoiceFromQuote record={record} disabled={false} transport={transport} onBusy={()=>{}} onDocument={setRecord} onConvert={async()=>{}}/>;}createRoot(document.getElementById('root')).render(<App/>);`;
 const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',alias:{react:dirname(appRequire.resolve('react/package.json')),'react-dom':dirname(appRequire.resolve('react-dom/package.json'))},external:['/platform/pdf-editor-font.ttf'],outfile:'bundle.js',logLevel:'silent'});
 const assets=new Map(bundle.outputFiles.map(f=>['/'+f.path.split(/[\\/]/).at(-1),f.contents]));
 // The document reader is isolated here: the regression concerns honoring its
 // quality contract, not Tesseract's recognition accuracy on a particular scan.
 const reader=`export async function readDocument(file,progress){progress('Reconnaissance du scan');return{text:'[Page 1] Bon de commande fictif BC-LU. Montant HT 987,65 EUR.',complete:file.name!=='incertain.pdf',warnings:file.name==='propre.pdf'?[]:[file.name==='incertain.pdf'?'Page 1 : reconnaissance incertaine, vérifier l’original.':'Les chiffres reconnus par OCR doivent être vérifiés dans l’original.']};}`;
 const server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="stylesheet" href="/bundle.css"><div id="root"></div><script type="module" src="/bundle.js"></script>');return;}const body=req.url==='/marches/reader.mjs'?reader:assets.get(req.url);res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'application/javascript');res.statusCode=body?200:404;res.end(body);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  await page.goto(base);await page.getByRole('button',{name:'Lier un engagement',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Lier un engagement',exact:true}),file=dialog.getByLabel('Pièce d’engagement'),reference=dialog.getByLabel('Référence du bon de commande'),amount=dialog.getByLabel('Montant engagé HT (€)'),project=dialog.getByLabel('Projet lié');
  await expect(project).toHaveValue('project-a');await reference.fill('BC-CORRIGE');
  await file.setInputFiles({name:'incertain.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-synthetic')});await dialog.getByRole('button',{name:'Analyse IA',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Lecture incomplète');await expect(dialog.getByRole('status',{name:'Points à vérifier dans la pièce'})).toContainText('reconnaissance incertaine');
  assert.deepEqual(await page.evaluate(()=>window.calls.analysis),[]);await expect(reference).toHaveValue('BC-CORRIGE');await expect(amount).toHaveValue('1234.00');await expect(project).toHaveValue('project-a');
  await dialog.getByRole('button',{name:'Joindre l’engagement',exact:true}).click();await expect(dialog).not.toBeVisible();
  const uploads=await page.evaluate(()=>window.calls.uploads);assert.equal(uploads.length,1);assert.deepEqual(uploads[0].details,{reference:'BC-CORRIGE',date:uploads[0].details.date,amountMinor:123400,marketId:'market-a',projectId:'project-a',marketReference:'M-A',engagement:'ENG-MANUEL',serviceCode:'SERVICE-MANUEL',otherReference:''});
  await page.reload();await page.getByRole('button',{name:'Lier un engagement',exact:true}).click();await file.setInputFiles({name:'avertissement.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-synthetic')});await dialog.getByRole('button',{name:'Analyse IA',exact:true}).click();
  await expect(reference).toHaveValue('BC-LU');await expect(amount).toHaveValue('987.65');await expect(dialog.getByLabel('N° d’engagement Chorus')).toHaveValue('ENG-LU');await expect(project).toHaveValue('project-a');await expect(dialog.getByRole('status',{name:'Points à vérifier dans la pièce'})).toContainText('chiffres reconnus par OCR');assert.equal(await page.evaluate(()=>window.calls.analysis.length),1);
  await file.setInputFiles({name:'propre.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-synthetic')});await expect(dialog.getByRole('status',{name:'Points à vérifier dans la pièce'})).toHaveCount(0);await dialog.getByRole('button',{name:'Analyse IA',exact:true}).click();await expect(reference).toHaveValue('BC-LU');await expect.poll(()=>page.evaluate(()=>window.calls.analysis.length)).toBe(2);assert.deepEqual(errors,[]);
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
