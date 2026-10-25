import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const root=resolve('.'),out=resolve('platform/.private/sheets-workflow-20261023c');await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const server=createServer(async(req,res)=>{try{let name=new URL(req.url,'http://local').pathname;if(name.endsWith('/'))name+='index.html';const file=resolve(root,'.'+name);assert.ok(file.startsWith(root+sep)&&!file.includes('.private'));res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await require('playwright').chromium.launch({channel:'msedge',headless:true});
const sheet={id:'s1',name:'Suivi de projet',workspaceId:'w1',favorite:false,folderId:null,columns:[{id:'task',title:'Tâche',type:'text',width:330}],rows:[{id:'r1',cells:{task:'Préparer le rapport'}}],comments:[],forms:[],automations:[],lastView:'grid',createdAt:'2026-10-20',updatedAt:'2026-10-20'};
const fixture={version:1,workspaces:[{id:'w1',name:'Espace de test',folders:[]}],sheets:[sheet],dashboards:[],activity:[],settings:{},profile:{name:'Équipe de test'},sampleData:false};
try{
 const context=await browser.newContext({viewport:{width:1440,height:950}});let release,releaseWorkspace;const hold=new Promise(r=>release=r),workspaceHold=new Promise(r=>releaseWorkspace=r);
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===base)return route.continue();if(url.pathname==='/sheets/session'){await hold;return route.fulfill({json:{ok:true}});}if(url.pathname==='/sheets/state'){assert.equal(route.request().method(),'GET');await workspaceHold;return route.fulfill({json:{revision:1,state:fixture}});}return route.abort();});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
 await page.goto(base+'/feuilles/');await page.locator('.cloud-login').waitFor();assert.equal(await page.locator('.cloud-login .cdi-sheets-brand').innerText(),'CDInnovSheets');
 await page.evaluate(()=>{localStorage.setItem('cdinnov-color-scheme','dark');localStorage.setItem('cet_auth_session',JSON.stringify({email:'test@example.invalid',t:Date.now(),budgets:{email:'test@example.invalid',token:'synthetic',expiresAt:Date.now()+3600000}}));});
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('.cdi-loading-screen').waitFor();
 assert.match(await page.locator('.cdi-bolt').evaluate(e=>getComputedStyle(e).backgroundImage),/cdinnov-sheets-symbol/);
 assert.equal(await page.locator('.cdi-app-header').evaluate(e=>getComputedStyle(e).visibility),'hidden');assert.equal(await page.locator('.cloud-login').count(),0);await page.screenshot({path:out+'/sheets-loading.png'});
 assert.equal(await page.locator('.cdi-loading--auth .cdi-bolt').evaluate(e=>getComputedStyle(e).animationName),'cdi-bolt-pulse');release();await page.locator('.cdi-loading-screen:not(.cdi-loading--auth) .cdi-bolt').waitFor();assert.equal(await page.locator('.cdi-loading-screen:not(.cdi-loading--auth) .cdi-bolt').evaluate(e=>getComputedStyle(e).animationName),'cdi-bolt-rotate');releaseWorkspace();await page.locator('.home-hero').waitFor();assert.match(await page.title(),/CDInnovSheets/);
 for(const theme of ['light','dark']){await page.evaluate(t=>CDITheme.set(t),theme);await page.screenshot({path:out+'/sheets-home-'+theme+'.png'});assert.equal(await page.locator('.cdi-sheets-brand img').first().evaluate(e=>e.complete&&e.naturalWidth>0),true);}
 await page.evaluate(()=>location.hash='/sheet/s1');await page.locator('.sv-root').waitFor();assert.equal(await page.locator('.workspace-brand .cdi-sheets-brand').innerText(),'CDInnovSheets');await page.screenshot({path:out+'/sheets-workspace.png'});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.locator('.cdi-app-home img').isVisible(),true);await page.screenshot({path:out+'/sheets-mobile-'+width+'.png'});}
 assert.deepEqual(errors,[]);console.log('OK CDInnovSheets: login, green loader, hidden chrome during session check, home, workspace, light/dark, 390/320 px. No writes.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
