import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {testEnvironment,users} from './test.mjs';
import {emptyMarket} from './domain.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env=await testEnvironment();
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
  if(u.pathname==='/'||u.pathname==='/index.html'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'});res.end(host);return;}
  if(/^\/marches\/vendor\/(pdf\.mjs|pdf\.worker\.mjs)$/.test(u.pathname)){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await readFile(path.join(root,u.pathname)));return;}
  if(u.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  res.writeHead(404);res.end('Aperçu marchés uniquement.');
 }catch(e){res.writeHead(500);res.end(e.message);}
});
server.listen(5196,'127.0.0.1',()=>console.log('Aperçu isolé http://127.0.0.1:5196 — pilote '+(seeded||'absent')));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();env.worker.dispose().then(()=>process.exit(0));});
