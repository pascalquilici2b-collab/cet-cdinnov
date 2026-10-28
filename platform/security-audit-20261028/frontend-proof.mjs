import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const html=process.argv.includes('--baseline')?execFileSync('git',['show','531ea21:index.html'],{encoding:'utf8',cwd:new URL('../../',import.meta.url),maxBuffer:8*1024*1024}):await readFile(new URL('../../index.html',import.meta.url),'utf8');
const start=html.indexOf('>',html.lastIndexOf('<script',html.indexOf('function freshState()')))+1;
const ast=ts.createSourceFile('portal.js',html.slice(start,html.lastIndexOf('</script>')),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const names=new Set(['isRemoteFileURL','privateFileURL','privateFileFetch','safePrivateFileURL','nfJustifPreview','csvCell','halfCell','nfStatutPickerHTML','nfStatutNorm','nfStatutOptions','nfStatutBadge','facturxRowActions','inlineArg']);
const source=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
 const page=await browser.newPage();
 await page.route('**/*',r=>r.abort());
 await page.setContent('<style>.hf {width:100px;height:30px} #stpickList {display:block!important}</style><main id="output"></main>');
 await page.addScriptTag({content:`const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const CLOUD_ENDPOINT='https://worker.example.test';const AUTH_USER='admin@example.test';let portalEpoch=1;const portalBlobs=new Map();let nfDraft={lignes:[]};const nfSync=()=>{};const ic=()=>'';const isAlbert=()=>false;const congesAdmin=()=>true;const CONGES_TYPE_COLOR={};const modal=value=>document.querySelector('#output').innerHTML=value;const toast=value=>window.__rejected=value;const openFacturePdf=()=>{};const toggleHalf=()=>{};const stPickSelect=()=>{};${source}`});
 await page.evaluate(async()=>{nfDraft.lignes=[{justificatif:'javascript:window.__auditExecuted=1;void(0)',justName:'synthetic.pdf',justType:'application/pdf'}];await nfJustifPreview(0);});
 const link=page.getByRole('link',{name:'Télécharger'});
 if(await link.count())await link.click();
 const file=await page.evaluate(()=>({executed:window.__auditExecuted===1,rejected:!!window.__rejected}));
 const handlers=[];
 for(const name of ['halfCell','nfStatutPickerHTML','facturxRowActions']){
  await page.evaluate(name=>{window.__handlerExecuted=0;const payload="');window.__handlerExecuted=1;//";const markup=name==='halfCell'?halfCell(null,payload,'2026-10-28','AM'):name==='nfStatutPickerHTML'?nfStatutPickerHTML(payload):facturxRowActions({id:payload});document.querySelector('#output').innerHTML=markup;},name);
  await page.locator(name==='halfCell'?'.hf':name==='nfStatutPickerHTML'?'.salpick-item:last-child':'button').click();
  handlers.push({name,executed:await page.evaluate(()=>window.__handlerExecuted===1)});
 }
 const csv=await page.evaluate(()=>csvCell('=1+1'));
 const proof={file,handlers,csv};console.log(JSON.stringify(proof,null,2));
 if(process.argv.includes('--fixed')){assert.equal(file.executed,false);assert.equal(file.rejected,true);for(const item of handlers)assert.equal(item.executed,false,item.name);assert.equal(csv,'"\'=1+1"');}
} finally {await browser.close();}
