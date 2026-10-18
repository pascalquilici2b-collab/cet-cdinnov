import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {testEnvironment,users} from './test.mjs';
import {emptyMarket} from './domain.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const probe=process.env.MARCHES_AI_PROBE?JSON.parse(await readFile(process.env.MARCHES_AI_PROBE,'utf8')):null;
const env=await testEnvironment(probe?{ai:async input=>{const r=await fetch(probe.url,{method:'POST',headers:{Authorization:'Bearer '+probe.key,'Content-Type':'application/json'},body:JSON.stringify(input)});if(!r.ok)throw new Error('Qwen HTTP '+r.status);return r.json();}}:{});
const sessions=await Promise.all(users.map(env.login));
const adminHeaders={Authorization:'Bearer '+sessions[0].token};
let seeded=null;
if(process.env.MARCHES_PILOT){
 const p=JSON.parse(await readFile(process.env.MARCHES_PILOT,'utf8'));
 const initial={...emptyMarket(),title:p.market.title,clientName:p.market.clientName,reference:p.market.reference};
 let r=await env.call('markets',{method:'POST',headers:adminHeaders,body:JSON.stringify({id:p.id,market:initial})});
 if(!r.ok)throw new Error(await r.text());
 const sources={};
 for(const d of p.documents){
  const form=new FormData();form.append('file',new Blob([await readFile(d.path)],{type:'application/pdf'}),path.basename(d.path));form.append('kind',d.kind);
  if(d.textPath)form.append('text',await readFile(d.textPath,'utf8'));
  r=await env.call('markets/'+p.id+'/documents',{method:'POST',headers:adminHeaders,body:form});if(!r.ok)throw new Error(await r.text());
  sources[d.key]=(await r.json()).document.id;
 }
 for(const list of ['prices','ceilings','periods','issues'])for(const item of p.market[list])if(item.source?.documentId)item.source.documentId=sources[item.source.documentId];
 r=await env.call('markets/'+p.id,{method:'PUT',headers:{...adminHeaders,'If-Match':'1'},body:JSON.stringify(p.market)});
 if(!r.ok)throw new Error(await r.text());seeded=p.id;
}
if(process.env.MARCHES_QA_READINGS){
 const cache=JSON.parse(await readFile(process.env.MARCHES_QA_READINGS,'utf8'));
 for(const r of cache.readings){const doc=await env.db.prepare('SELECT id FROM market_documents WHERE name=?').bind(r.name).first();if(doc)await env.db.prepare('INSERT INTO market_document_readings(document_id,text,method,complete,pages,warnings,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)').bind(doc.id,r.text,r.method,r.complete,r.pages,r.warnings,new Date().toISOString(),'Test OCR isolé').run();}
}
let host=await readFile(path.join(root,'index.html'),'utf8');
host=host.replace(/const CLOUD_ENDPOINT\s*=\s*[^;]+;/,"const CLOUD_ENDPOINT='http://127.0.0.1:5196/api';")
.replace(/const CLOUD_TOKEN\s*=\s*[^;]+;/,"const CLOUD_TOKEN='preview-only';")
.replace(/const STORE_KEY\s*=\s*[^;]+;/,"const STORE_KEY='cdi-markets-isolated-preview';")
.replace(/const AUTH_SESSION_KEY\s*=\s*[^;]+;/,"const AUTH_SESSION_KEY='cdi-markets-preview-session';")
.replace('function cloudEnabled(){','function cloudEnabled(){return false;')
.replaceAll('https://cdinnov-facturx.onrender.com','http://127.0.0.1:5196/disabled');
const boot="state=freshState();state.auth={accounts:"+JSON.stringify(env.accounts)+",allowed:"+JSON.stringify(users)+"};\n"+
"AUTH_USER=new URLSearchParams(location.search).get('role')==='consultant'?"+JSON.stringify(users[1])+":"+JSON.stringify(users[0])+";setSession(AUTH_USER);\n"+
"budgetsWarmPromise=budgetsSignIn(AUTH_USER,"+JSON.stringify(env.password)+").then(()=>{budgetsWarmPromise=null;unlockApp(AUTH_USER);setView('marches');}).catch(e=>document.getElementById('content').textContent=e.message);";
host=host.replace('\nbootAuth();','\n'+boot).replace('<body>','<body><div style="background:#193d66;color:white;padding:8px;text-align:center;font:12px Segoe UI">APERÇU LOCAL · base isolée · pièces CCIC en préparation · aucune facture émise</div>');
const server=createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1:5196');
  if(u.pathname.startsWith('/api/budgets/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const r=await env.worker.dispatchFetch('https://preview.example'+u.pathname.slice(4)+u.search,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
   res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;
  }
  if(u.pathname==='/qa/analysis'&&req.method==='GET'){const jobs=await env.db.prepare('SELECT * FROM market_analysis_runs').all();const readings=await env.db.prepare('SELECT * FROM market_document_readings').all();res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jobs:jobs.results,readings:readings.results}));return;}
  if(u.pathname==='/'||u.pathname==='/index.html'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'});res.end(host);return;}
  if(/^\/marches\/(reader\.mjs|vendor\/[a-zA-Z0-9_./-]+)$/.test(u.pathname)&&!u.pathname.includes('..')){res.writeHead(200,{'Content-Type':u.pathname.endsWith('.gz')?'application/gzip':u.pathname.endsWith('.wasm')?'application/wasm':'text/javascript'});res.end(await readFile(path.join(root,u.pathname)));return;}
  if(u.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  res.writeHead(404);res.end('Aperçu marchés uniquement.');
 }catch(e){res.writeHead(500);res.end(e.message);}
});
server.listen(5196,'127.0.0.1',()=>console.log('Aperçu isolé http://127.0.0.1:5196 — pilote '+(seeded||'absent')));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();env.worker.dispose().then(()=>process.exit(0));});
