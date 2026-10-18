import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateLocal} from './migrations.mjs';
import {createBudgetTransport} from './client/workspace-client.ts';
process.env.MARCHES_TEST_WORKER ||= fileURLToPath(new URL('../.build/entry.mjs',import.meta.url));
process.env.MARCHES_TEST_COMPATIBILITY_DATE ||= '2026-06-09';
const ctx=await testEnvironment();
let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log('OK '+name)};
const workspace={demo:false,clients:[{id:'c1',name:'Client test',accounts:[],logo:'data:image/png;base64,'+'a'.repeat(900000)},{id:'c2',name:'Autre client',accounts:[]}],projects:[{id:'p1',name:'Projet test',clientId:'c1',unknownFuture:{keep:true}}],budgetLines:[{id:'l1',projectId:'p1',amount:123.45}],expenses:[],drs:[],imports:[],partnerReports:[{id:'r1',anything:'preserved'}],reportExpenseLinks:[{noId:'keep'}],unknownNull:null,unknownString:'future field',unknownFlag:true};
try{
 const login=await ctx.login(users[0]),other=await ctx.login(users[1]);
 const headers={Authorization:'Bearer '+login.token};
 const call=(route,options={})=>ctx.call(route,{...options,headers:{...headers,...options.headers}});
 const put=(data,version)=>call('workspace',{method:'PUT',headers:{'If-Match':String(version)},body:JSON.stringify(data)});
 await check('Routes privées et CORS restent protégés',async()=>{
  assert.equal((await ctx.call('workspace')).status,401);
  assert.equal((await ctx.worker.dispatchFetch('https://test/api/v1/budget-records')).status,401);
  assert.equal((await call('workspace',{headers:{Origin:'https://evil.example'}})).status,403);
  const r=await call('workspace',{method:'OPTIONS',headers:{'Access-Control-Request-Headers':'If-None-Match'}});
  assert.equal(r.status,204);assert.match(r.headers.get('Access-Control-Allow-Headers'),/If-None-Match/);
 });
 await check('Sauvegarde historique et projection atomique',async()=>{
  assert.equal((await put(workspace,0)).status,200);
  const raw=await ctx.db.prepare("SELECT payload FROM budgets_workspace WHERE id='shared'").first();assert.deepEqual(JSON.parse(raw.payload),workspace);
  const rows=(await ctx.db.prepare('SELECT collection,payload FROM app_budget_records ORDER BY collection,position').all()).results;
  for(const key of ['clients','projects','budgetLines','expenses','drs','imports','partnerReports'])assert.deepEqual(rows.filter(r=>r.collection===key).map(r=>JSON.parse(r.payload)),workspace[key]);
 });
 await check('Migration rejouable sans changer la source',async()=>{await migrateLocal(ctx.db);assert.deepEqual((await(await call('workspace')).json()).workspace,workspace);});
 let tag;
 await check('Lecture identique et 304 sans corps',async()=>{
  const r=await call('workspace');assert.equal(r.status,200);tag=r.headers.get('ETag');assert.equal(tag,'"budgets-1"');assert.deepEqual((await r.json()).workspace,workspace);
  const unchanged=await call('workspace',{headers:{'If-None-Match':tag}});assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');
 });
 const page=async(query,session=login)=>ctx.worker.dispatchFetch('https://test/api/v1/budget-records?'+query,{headers:{Authorization:'Bearer '+session.token,Origin:'https://app.cdinnov.eu'}});
 await check('Pagination stable pour les utilisateurs déjà habilités',async()=>{
  const a=await(await page('collection=clients&limit=1',other)).json();assert.equal(a.items[0].id,'c1');assert.deepEqual(a.next,{after:0,version:1});
  const b=await(await page('collection=clients&limit=1&after=0&version=1')).json();assert.equal(b.items[0].id,'c2');assert.equal(b.next,null);
  assert.equal((await page('limit=1000')).status,400);assert.equal((await page('collection=auth')).status,400);assert.equal((await page('after=0')).status,428);
 });
 await check('Un seul gagnant pour deux modifications concurrentes',async()=>{
  const next=structuredClone(workspace);next.clients=[next.clients[1]];next.projects[0].name='Modifié';
  const results=await Promise.all([put(next,1),put({...next,unknownString:'other'},1)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const actual=(await(await call('workspace')).json()).workspace;
  const projected=(await ctx.db.prepare("SELECT payload FROM app_budget_records WHERE collection='clients'").all()).results;
  assert.deepEqual(projected.map(r=>JSON.parse(r.payload)),actual.clients);
  assert.equal((await page('after=0&version=1')).status,409);
  assert.equal((await call('workspace',{headers:{'If-None-Match':tag}})).status,200);
 });
 await check('Ajout de clients préserve tous les autres champs et relations',async()=>{
  const before=(await(await call('workspace')).json()).workspace;
  const r=await call('clients',{method:'POST',body:JSON.stringify({names:['Nouveau client de test']})});assert.equal(r.status,200);
  const after=(await(await call('workspace')).json()).workspace;
  assert.deepEqual({...after,clients:before.clients},before);assert.equal(after.clients.length,2);
  const count=await ctx.db.prepare("SELECT count(*) n FROM app_budget_records WHERE collection='clients'").first();assert.equal(count.n,2);
  const same=await(await call('clients',{method:'POST',body:JSON.stringify({names:['Nouveau client de test']})})).json();assert.equal(same.version,3);
 });
 await check('Projections conservées après réordonnancement et extensions sans id',async()=>{
  const data=(await(await call('workspace')).json()).workspace;data.clients.reverse();data.partnerReports.push({id:'r1',anything:'duplicate optional preserved'});
  assert.equal((await put(data,3)).status,200);
  const projected=(await ctx.db.prepare("SELECT payload FROM app_budget_records WHERE collection='partnerReports' ORDER BY position").all()).results;
  assert.deepEqual(projected.map(r=>JSON.parse(r.payload)),data.partnerReports);
  assert.deepEqual((await(await call('workspace')).json()).workspace.reportExpenseLinks,data.reportExpenseLinks);
 });
 await check('Échec de projection annule aussi la sauvegarde source',async()=>{
  await ctx.db.prepare("CREATE TRIGGER test_failure BEFORE INSERT ON app_budget_records WHEN NEW.record_id='reject-test' BEGIN SELECT RAISE(ABORT,'test failure'); END").run();
  const before=await(await call('workspace')).json();const data=structuredClone(before.workspace);data.clients.push({id:'reject-test',name:'Failure'});
  assert.equal((await put(data,before.version)).status,503);
  assert.deepEqual(await(await call('workspace')).json(),before);
  await ctx.db.prepare('DROP TRIGGER test_failure').run();
 });
 await check('Cache navigateur valide les versions et isole les sessions',async()=>{
  const transport=createBudgetTransport((url,options)=>ctx.worker.dispatchFetch(url,{...options,headers:{...options.headers,Origin:'https://app.cdinnov.eu'}}));
  const url='https://test/budgets/workspace',session={email:users[0],token:login.token};
  const a=await transport.request(url,session,'GET');a.workspace.clients=[];
  const b=await transport.request(url,session,'GET');assert.equal(b.workspace.clients.length,2);
  transport.clear();const c=await transport.request(url,{email:users[1],token:other.token},'GET');assert.equal(c.version,b.version);
  const changed=structuredClone(c.workspace);changed.unknownString='saved';await transport.request(url,session,'PUT',changed,c.version);
  assert.equal((await transport.request(url,session,'GET')).workspace.unknownString,'saved');
 });
 await check('Déconnexion annule une réponse de cache en vol',async()=>{
  let finish;const transport=createBudgetTransport(()=>new Promise(r=>{finish=r}));
  const pending=transport.request('https://test',{email:'test',token:'test'},'GET');transport.clear();finish(Response.json({workspace:{},version:1}));
  await assert.rejects(()=>pending,/session ou le budget a changé/);
 });
 await check('Smartsheet conserve lecture, sauvegarde et protection contre les écrasements',async()=>{
  await ctx.db.prepare('CREATE TABLE cdinnov_sheets_workspace(id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)').run();
  const sheets=(options={})=>ctx.worker.dispatchFetch('https://test/sheets/state',{...options,headers:{Origin:'https://app.cdinnov.eu','Content-Type':'application/json',...headers,...options.headers}});
  const initial=await(await sheets()).json();assert.equal(initial.revision,1);assert.equal(initial.state.sheets.length,0);
  const saved=await sheets({method:'PUT',body:JSON.stringify({state:initial.state,revision:1})});assert.equal(saved.status,200);
  const concurrent=await Promise.all([sheets({method:'PUT',body:JSON.stringify({state:initial.state,revision:2})}),sheets({method:'PUT',body:JSON.stringify({state:initial.state,revision:2})})]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
 });
 await check('Portail historique, fichiers R2 et agenda conservés',async()=>{
  const portal=await ctx.worker.dispatchFetch('https://test/markets-test');assert.equal(portal.status,200);assert.deepEqual((await portal.json()).auth.accounts,ctx.accounts);
  const putFile=await ctx.worker.dispatchFetch('https://test/files/synthetic.pdf',{method:'PUT',headers:{'Content-Type':'application/pdf','Content-Length':'19'},body:'%PDF-synthetic-only'});assert.equal(putFile.status,200,(await putFile.clone().text()).slice(0,1000));
  assert.equal(await(await ctx.worker.dispatchFetch('https://test/files/synthetic.pdf')).text(),'%PDF-synthetic-only');
  assert.equal((await ctx.worker.dispatchFetch('https://test/files/synthetic.pdf',{method:'DELETE'})).status,200);
  assert.equal((await ctx.worker.dispatchFetch('https://test/files/synthetic.pdf')).status,404);
  assert.equal((await call('agenda')).status,200);
 });
 await check('Révocation du compte appliquée même en présence du cache',async()=>{
  const account=ctx.accounts[users[0]];await ctx.kv.put('markets-test',JSON.stringify({auth:{allowed:users,accounts:{...ctx.accounts,[users[0]]:{...account,hash:'a'.repeat(64)}}}}));
  assert.equal((await call('workspace',{headers:{'If-None-Match':tag}})).status,401);
 });
 console.log(checks+' scénarios plateforme validés.');
}finally{await ctx.worker.dispose();}
