import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright'),root=fileURLToPath(new URL('../',import.meta.url)).replace(/[\\/]$/,'');
const out=process.env.PORTAL_QA;assert.ok(out,'Private PORTAL_QA is required');await mkdir(out,{recursive:true});
const periods=[{id:'P1',label:'Période 1',start:'2026-01-01',end:'2026-06-30'},{id:'P2',label:'Période 2',start:'2026-07-01',end:'2026-12-31'}];
const workspace={demo:false,clients:[{id:'c1',name:'Client fictif',accounts:[]}],projects:Array.from({length:4},(_,i)=>({id:'p'+i,clientId:'c1',acronym:'PROJET '+(i+1),name:'Programme de vérification locale',start:'2026-01-01',end:'2026-12-31',periods,eligibleBudget:10000,federRate:80,advance:{requested:false,received:false,rate:25,recoveryPeriod:'P2',firstRecoveryRate:60},rules:{realRate:80,hrMode:'réel',hrRate:0,missionMode:'réel',missionRate:0,officeMode:'réel',officeRate:0}})),budgetLines:[{id:'b1',projectId:'p0',category:'Expertise externe',description:'Accompagnement de test',amount:10000,allocations:{P1:4000,P2:6000},subExpenses:[]}],expenses:[],drs:[],imports:[]};
const fixture={workspaces:[{id:'w1',name:'Espace de vérification',folders:[]}],sheets:[{id:'s1',name:'Suivi de vérification',workspaceId:'w1',folderId:null,favorite:false,columns:[{id:'task',title:'Tâche',type:'text',width:330},{id:'status',title:'Statut',type:'dropdown',width:150,options:['À faire','En cours','Terminé']},{id:'start',title:'Début',type:'date',width:130},{id:'end',title:'Fin',type:'date',width:130}],rows:[{id:'r1',cells:{task:'Préparer le rapport',status:'En cours',start:'2026-10-19',end:'2026-10-23'}}],comments:[],forms:[],automations:[],lastView:'grid',createdAt:'2026-10-19T10:00:00Z',updatedAt:'2026-10-19T10:00:00Z'}],dashboards:[],activity:[],settings:{},sampleData:false};
let sheetState=structuredClone(fixture),revision=1;const writes=[];
const host=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><iframe id="budget" title="Outil budgets" src="/budgets-projets/" style="border:0;width:100%;height:100vh"></iframe><script>window.workspace=${JSON.stringify(workspace)};window.saved=[];let version=1;addEventListener('message',e=>{if(e.source!==document.querySelector('iframe').contentWindow||e.origin!==location.origin)return;const m=e.data;if(m.type==='cdi-budget-request'){if(m.method==='PUT'){window.workspace=m.workspace;window.saved.push(m.workspace);version++}e.source.postMessage({type:'cdi-budget-response',id:m.id,result:{workspace:window.workspace,version}},location.origin)}if(m.type==='cdi-budget-fullscreen')e.source.postMessage({type:'cdi-budget-fullscreen',fullscreen:!!m.fullscreen},location.origin)});</script></body></html>`;
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{let pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/budget-test'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(host);return}if(pathname.endsWith('/'))pathname+='index.html';const file=resolve(root,'.'+decodeURIComponent(pathname));assert(file.startsWith(root+sep));res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],checks=[];
async function audit(page,frame,name,width){
 await page.setViewportSize({width,height:1000});await page.waitForTimeout(120);
 const result=await frame.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,font:getComputedStyle(document.body).fontFamily,icons:[...document.querySelectorAll('svg.lucide,svg.cdi-icon')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({name:e.getAttribute('class'),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})).filter(e=>e.w>34||e.h>34)}));
 checks.push({name,...result});assert.ok(result.scroll<=result.width+1,`${name} overflow at ${width}: ${result.scroll}`);assert.deepEqual(result.icons,[],`${name} oversized icons at ${width}`);assert.match(result.font,/Manrope/);
 if([1920,390].includes(width))await page.screenshot({path:join(out,`${name}-${width}.png`),fullPage:false});
}
try{
 const context=await browser.newContext({viewport:{width:1920,height:1000},locale:'fr-FR'});
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===base)return route.continue();if(u.pathname==='/sheets/session')return route.fulfill({json:{ok:true}});if(u.pathname==='/sheets/state'){if(route.request().method()==='GET')return route.fulfill({json:{revision,state:sheetState}});const body=route.request().postDataJSON();writes.push(body);sheetState=body.state||body;revision++;return route.fulfill({json:{ok:true,revision,state:sheetState}})}return route.abort()});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/budget-test');const frame=page.frameLocator('#budget');await frame.getByRole('button',{name:'Ouvrir le projet PROJET 1',exact:true}).waitFor();
 const budget=page.frames().find(f=>f.url().includes('/budgets-projets/'));
 for(const width of [2560,1920,1024,768,390,320])await audit(page,budget,'budgets-projets',width);
 await page.setViewportSize({width:1920,height:1000});await frame.getByRole('button',{name:'Ouvrir le projet PROJET 1',exact:true}).click();
 await frame.locator('[role=tab]').first().waitFor();const tabs=await frame.locator('[role=tab]').evaluateAll(ns=>ns.map(n=>({name:n.textContent,value:n.getAttribute('id')})));await writeFile(join(out,'budget-tabs.json'),JSON.stringify(tabs,null,2));
 for(const width of [1920,768,390,320]){await page.setViewportSize({width,height:1000});for(const tab of tabs){await frame.locator('[role=tab]').filter({hasText:tab.name}).click();await audit(page,budget,'budgets-'+tab.name.replace(/[^a-zA-Z]/g,'').slice(0,20),width);}}
 assert.deepEqual(await page.evaluate(()=>window.workspace),workspace,'Viewing all budget tabs does not mutate workspace');
 await page.setViewportSize({width:390,height:1000});
 await frame.getByRole('button',{name:'Exporter le budget prévisionnel'}).click();
 await frame.getByLabel('Année de l’export client').selectOption('2026');
 await frame.getByRole('link',{name:'Télécharger le BP 2026'}).waitFor();
 const href=await frame.getByRole('link',{name:'Télécharger le BP 2026'}).getAttribute('href');
 const book=XLSX.read(Buffer.from(href.split(',')[1],'base64'),{type:'buffer'});
 assert.equal(book.SheetNames.length,4);assert.ok(book.SheetNames.some(n=>/Rattachement/.test(n)));
 assert.ok(book.SheetNames.some(n=>JSON.stringify(XLSX.utils.sheet_to_json(book.Sheets[n],{header:1})).includes('Accompagnement de test')));
 await audit(page,budget,'budgets-export',390);await frame.getByRole('button',{name:'Fermer',exact:true}).click();
 await page.goto(base+'/feuilles/');await page.locator('.cloud-login input[type=email]').waitFor();for(const width of [1920,390,320])await audit(page,page,'smartsheet-connexion',width);
 await page.evaluate(()=>localStorage.setItem('cet_auth_session',JSON.stringify({email:'qa@example.invalid',t:Date.now(),budgets:{email:'qa@example.invalid',token:'local-fixture-only',expiresAt:Date.now()+3600000}})));
 await page.reload();await page.locator('.home-hero').waitFor();for(const width of [2560,1920,1024,768,390,320])await audit(page,page,'smartsheet-accueil',width);
 await page.evaluate(()=>location.hash='/sheet/s1');await page.locator('.sv-root').waitFor();for(const width of [1920,768,390,320])await audit(page,page,'smartsheet-feuille',width);
 await writeFile(join(out,'sheets-controls.json'),JSON.stringify(await page.getByRole('button').evaluateAll(ns=>ns.filter(n=>n.getBoundingClientRect().width).map(n=>({text:n.textContent,label:n.getAttribute('aria-label'),title:n.title}))),null,2));
 await page.setViewportSize({width:1920,height:1000});
 await page.locator('[data-grid-cell][data-row-id="r1"][data-column-id="task"]').dblclick();
 await page.locator('.sv-cell-editor').fill('Rapport vérifié localement');await page.locator('.sv-cell-editor').press('Enter');
 await page.waitForResponse(r=>r.url().endsWith('/sheets/state')&&r.request().method()!=='GET');
 assert.ok(writes.length);assert.equal(sheetState.sheets[0].rows[0].cells.task,'Rapport vérifié localement');
 assert.deepEqual(sheetState.sheets[0].rows[0].cells,{...fixture.sheets[0].rows[0].cells,task:'Rapport vérifié localement'});
 assert.deepEqual(sheetState.sheets[0].columns,fixture.sheets[0].columns);
 await page.reload();await page.locator('.sv-cell-text').filter({hasText:'Rapport vérifié localement'}).waitFor();
 for(const view of ['Gantt','Tableau','Agenda','Table']){
   await page.locator('.sv-view-button').click();await page.locator('.sv-menu').getByText(view==='Table'?/^Table\s*Nouveau$/:view,{exact:true}).click();
   for(const width of [1920,390,320])await audit(page,page,'smartsheet-'+view.toLowerCase(),width);
 }
 await page.setViewportSize({width:390,height:1000});await page.locator('.cdi-app-home').click();await page.locator('.home-hero').waitFor();assert.ok(page.url().endsWith('#/home'));
 assert.deepEqual(errors,[]);await writeFile(join(out,'applications-checks.json'),JSON.stringify({checks,errors,writes},null,2));console.log('PASS: budget tabs and Excel export, Smartsheet login/home/table/Gantt/board/calendar, edit-save-reload preserving cells and columns; widths 320–2560, bounded icons and local font.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
