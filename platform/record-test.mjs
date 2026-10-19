import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {recordChanges,applyRecordChanges} from './record-changes.ts';
import {storageEdits} from './record-writes.ts';
import {createBudgetTransport} from './client/workspace-client.ts';
import {testEnvironment,users} from '../marches/test.mjs';
process.env.MARCHES_TEST_WORKER=fileURLToPath(new URL('../.build/entry.mjs',import.meta.url));
process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const ctx=await testEnvironment();let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log('OK '+name);};
const call=(path,session,options={})=>ctx.worker.dispatchFetch('https://test'+path,{...options,headers:{Origin:'https://app.cdinnov.eu','Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{}),...options.headers}});
const patch=(path,session,changes)=>call(path,session,{method:'PATCH',body:JSON.stringify({changes})});
const ok=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
try{
 await check('Change protocol round trips insertions, deletions, order, nested and unknown fields',async()=>{
  let seed=7;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
  for(let i=0;i<400;i++){
   const before={rows:Array.from({length:8},(_,n)=>({id:String(n),cells:{x:n},future:{null:null,bool:true}})),extension:[{noId:1},{noId:2}]};
   const after=structuredClone(before);after.rows=after.rows.filter(()=>rand()>.2);after.rows.splice(Math.floor(rand()*after.rows.length),0,{id:'new',cells:{x:42}});
   if(rand()>.5)after.rows.reverse();if(after.rows[0])after.rows[0].cells.x=99;if(rand()>.5)after.extension.reverse();
   assert.deepEqual(applyRecordChanges(before,recordChanges(before,after)),after);
  }
  const a={rows:[{id:'duplicate',x:1},{id:'duplicate',x:2}],future:{'quoted"key':true}};const b=structuredClone(a);b.rows[1].x=3;b.future['quoted"key']=false;
  assert.deepEqual(applyRecordChanges(a,recordChanges(a,b)),b);
  assert.deepEqual(applyRecordChanges({optional:'old',cells:[1]},recordChanges({optional:'old',cells:[1]},{optional:undefined,cells:[undefined]})),{cells:[null]});
  assert.throws(()=>applyRecordChanges({},[{path:['__proto__','polluted'],value:true}]),e=>e.status===400);assert.equal({}.polluted,undefined);
 });
 const portal={params:{anneeSuivi:2026},types:[],salaries:[{matricule:'001',nom:'Direction'},{matricule:'004',nom:'Consultant'}],conges:[],mouvements:[],notesFrais:[{id:'note1',matricule:'004',statut:'Brouillon',objet:'Mission',lignes:[]},{id:'note2',matricule:'001',statut:'Brouillon',objet:'Autre',lignes:[]}],codesAffaires:[],factures:[],extension:{retained:true},auth:{accounts:ctx.accounts,allowed:users}};
 await ctx.setPortal(JSON.stringify(portal));const admin=await ctx.login(users[0]),staff=await ctx.login(users[1]);
 const getPortal=async s=>(await ok(await call('/api/v1/portal',s))).workspace;
 await check('Portal accepts two independent stale edits and preserves credentials and unknown fields',async()=>{
  const base=await getPortal(admin),a=structuredClone(base),b=structuredClone(base);a.notesFrais[0].objet='A';b.notesFrais[1].objet='B';
  const responses=await Promise.all([patch('/api/v1/portal',admin,recordChanges(base,a)),patch('/api/v1/portal',admin,recordChanges(base,b))]);for(const r of responses)await ok(r);
  const saved=await getPortal(admin);assert.deepEqual(saved.notesFrais.map(n=>n.objet),['A','B']);assert.deepEqual(saved.extension,portal.extension);
  const raw=JSON.parse((await ctx.db.prepare("SELECT payload FROM app_portal_workspace WHERE id='shared'").first()).payload);assert.deepEqual(raw.auth,portal.auth);
 });
 await check('Same-field conflict is atomic, including the other changes in that save',async()=>{
  const base=await getPortal(admin),a=structuredClone(base),b=structuredClone(base);a.notesFrais[0].objet='Winner';b.notesFrais[0].objet='Loser';b.extension.retained=false;
  await ok(await patch('/api/v1/portal',admin,recordChanges(base,a)));assert.equal((await patch('/api/v1/portal',admin,recordChanges(base,b))).status,409);
  assert.equal((await getPortal(admin)).extension.retained,true);
 });
 await check('PATCH does not bypass roles, paid lock, file ownership, account security or CORS',async()=>{
  const base=await getPortal(staff);
  for(const mutate of [p=>p.salaries[0].nom='forged',p=>p.notesFrais[0].statut='Payée',p=>p.notesFrais[0].lignes.push({justificatif:'https://test/files/guessed.pdf'}),p=>p.auth.allowed.push('attacker@example.invalid')]){
   const next=structuredClone(base);mutate(next);assert.equal((await patch('/api/v1/portal',staff,recordChanges(base,next))).status,403);
  }
  for(const path of ['/api/v1/portal','/budgets/workspace','/sheets/state'])assert.equal((await patch(path,null,[])).status,401);
  assert.equal((await call('/api/v1/portal',admin,{method:'PATCH',headers:{Origin:'https://evil.invalid'},body:'{"changes":[]}'})).status,403);
  const valid=structuredClone(base);valid.conges.push({id:'own-leave',matricule:'004',date:'2026-12-01',statut:'En attente'});await ok(await patch('/api/v1/portal',staff,recordChanges(base,valid)));
 });
 const budget={demo:false,clients:[{id:'c1',name:'Client 1',logo:'data:image/png;base64,'+'a'.repeat(800000)},{id:'c2',name:'Client 2'}],projects:[{id:'p1',clientId:'c1',name:'Project'}],budgetLines:[{id:'b1',projectId:'p1',amount:10},{id:'b2',projectId:'p1',amount:20}],expenses:[],drs:[],imports:[],partnerReports:[{id:'duplicate',x:1},{id:'duplicate',x:2}],reportExpenseLinks:[{noId:'preserved'}],future:{bool:true,null:null}};
 await ok(await call('/budgets/workspace',admin,{method:'PUT',headers:{'If-Match':'0'},body:JSON.stringify(budget)}));
 const getBudget=async()=>(await ok(await call('/budgets/workspace',admin))).workspace;
 await check('Budget edit transfers only changed fields and SQLite updates no untouched projection rows',async()=>{
  await ctx.db.prepare('CREATE TABLE test_record_events(collection TEXT,id TEXT)').run();
  await ctx.db.prepare("CREATE TRIGGER test_record_update AFTER UPDATE ON budget_clients BEGIN INSERT INTO test_record_events VALUES('clients',NEW.business_id); END").run();
  const next=structuredClone(budget);next.clients[0].name='Renamed';const changes=recordChanges(budget,next),edits=storageEdits(budget,next);
  assert.ok(JSON.stringify(changes).length<200);assert.ok(JSON.stringify(edits).length<100);
  await ok(await patch('/budgets/workspace',admin,changes));assert.deepEqual(await getBudget(),next);
  assert.deepEqual((await ctx.db.prepare('SELECT * FROM test_record_events').all()).results,[{collection:'clients',id:'c1'}]);
 });
 await check('Budget independent edits, same-field conflict and repeat delivery are safe',async()=>{
  const base=await getBudget(),a=structuredClone(base),b=structuredClone(base);a.budgetLines[0].amount=11;b.budgetLines[1].amount=22;
  for(const r of await Promise.all([patch('/budgets/workspace',admin,recordChanges(base,a)),patch('/budgets/workspace',staff,recordChanges(base,b))]))await ok(r);
  assert.deepEqual((await getBudget()).budgetLines.map(r=>r.amount),[11,22]);
  await ok(await patch('/budgets/workspace',admin,recordChanges(base,a)));
  const conflict=structuredClone(base);conflict.budgetLines[0].amount=99;assert.equal((await patch('/budgets/workspace',admin,recordChanges(base,conflict))).status,409);
 });
 await check('Replacing an existing large inline logo keeps the former document capacity',async()=>{
  const before=await getBudget(),next=structuredClone(before);next.clients[0].logo='data:image/png;base64,'+'b'.repeat(800000);
  await ok(await patch('/budgets/workspace',admin,recordChanges(before,next)));assert.deepEqual(await getBudget(),next);
  const special=structuredClone(next);special.future['quoted"key']=true;special.future['slash\\key']=false;
  await ok(await patch('/budgets/workspace',admin,recordChanges(next,special)));
  const modified=structuredClone(special);modified.future['quoted"key']=false;modified.future['slash\\key']=true;
  await ok(await patch('/budgets/workspace',admin,recordChanges(special,modified)));assert.deepEqual(await getBudget(),modified);
 });
 await check('Concurrent insertions and queued browser edits preserve all colleagues’ changes',async()=>{
  const send=(url,o)=>ctx.worker.dispatchFetch(url,{...o,headers:{...o.headers,Origin:'https://app.cdinnov.eu'}}),a=createBudgetTransport(send),b=createBudgetTransport(send),url='https://test/budgets/workspace';
  const sa={email:users[0],token:admin.token},sb={email:users[1],token:staff.token};
  const ba=await a.request(url,sa,'GET'),bb=await b.request(url,sb,'GET');ba.workspace.clients.push({id:'ca',name:'A'});bb.workspace.clients.push({id:'cb',name:'B'});
  await Promise.all([a.request(url,sa,'PUT',ba.workspace),b.request(url,sb,'PUT',bb.workspace)]);
  ba.workspace.clients[0].name='Next local edit';await a.request(url,sa,'PUT',ba.workspace);
  const result=await getBudget();assert.ok(result.clients.find(r=>r.id==='ca'));assert.ok(result.clients.find(r=>r.id==='cb'));assert.equal(result.clients[0].name,'Next local edit');
 });
 await check('Concurrent project deletion cannot orphan a newly added budget line',async()=>{
  const base=await getBudget(),removed=structuredClone(base),added=structuredClone(base);removed.projects=[];removed.budgetLines=[];added.budgetLines.push({id:'new-line',projectId:'p1',amount:30});
  await ok(await patch('/budgets/workspace',admin,recordChanges(base,added)));assert.equal((await patch('/budgets/workspace',admin,recordChanges(base,removed))).status,409);
  assert.equal((await getBudget()).projects.length,1);
 });
 await check('Multi-record imports, booleans, nulls and non-keyed extensions remain exact',async()=>{
  const before=await getBudget(),next=structuredClone(before);next.demo=true;next.future={bool:false,null:null,number:1,text:'quoted " text',object:{enabled:true}};next.partnerReports[1].x=9;
  next.budgetLines.push(...Array.from({length:150},(_,i)=>({id:'bulk'+i,projectId:'p1',amount:i})));
  await ok(await patch('/budgets/workspace',admin,recordChanges(before,next)));assert.deepEqual(await getBudget(),next);
 });
 await check('Projection failure rolls back the whole multi-record write',async()=>{
  await ctx.db.prepare("CREATE TRIGGER test_record_failure BEFORE UPDATE ON budget_lines WHEN NEW.business_id='b2' BEGIN SELECT RAISE(ABORT,'failure'); END").run();
  const before=await getBudget(),next=structuredClone(before);next.budgetLines[0].amount=777;next.budgetLines[1].amount=888;
  assert.equal((await patch('/budgets/workspace',admin,recordChanges(before,next))).status,503);assert.deepEqual(await getBudget(),before);await ctx.db.prepare('DROP TRIGGER test_record_failure').run();
 });
 const now='2026-10-19T08:00:00.000Z';
 const sheets={version:1,sampleData:false,profile:{name:'Test',organization:'CDInnov'},workspaces:[{id:'w1',name:'Workspace',folders:[]}],sheets:[{id:'s1',name:'Sheet',workspaceId:'w1',folderId:null,favorite:false,columns:[{id:'col',title:'Name',type:'text',width:200}],rows:[{id:'r1',parentId:null,cells:{col:'One'}},{id:'r2',parentId:null,cells:{col:'Two'}}],comments:[],forms:[],automations:[],lastView:'grid',createdAt:now,updatedAt:now}],dashboards:[],activity:[]};
 await ok(await call('/sheets/state',admin,{method:'PUT',body:JSON.stringify({state:sheets,revision:1})}));
 const getSheets=async()=>(await ok(await call('/sheets/state',admin))).state;
 await check('Smartsheet edits independent rows with shared sheet timestamps and keeps both activities',async()=>{
  const base=await getSheets(),a=structuredClone(base),b=structuredClone(base);a.sheets[0].rows[0].cells.col='First';b.sheets[0].rows[1].cells.col='Second';a.sheets[0].updatedAt='2026-10-19T09:00:00.000Z';b.sheets[0].updatedAt='2026-10-19T10:00:00.000Z';a.activity.unshift({id:'a',text:'A',createdAt:now});b.activity.unshift({id:'b',text:'B',createdAt:now});
  for(const r of await Promise.all([patch('/sheets/state',admin,recordChanges(base,a)),patch('/sheets/state',staff,recordChanges(base,b))]))await ok(r);
  const next=await getSheets();assert.deepEqual(next.sheets[0].rows.map(r=>r.cells.col),['First','Second']);assert.equal(next.activity.length,2);
  const conflict=structuredClone(base);conflict.sheets[0].rows[0].cells.col='Conflict';assert.equal((await patch('/sheets/state',admin,recordChanges(base,conflict))).status,409);
 });
 await check('Smartsheet hierarchy, order, deletion and old versioned clients stay compatible',async()=>{
  const base=await getSheets(),next=structuredClone(base);next.sheets[0].rows.reverse();next.sheets[0].rows.push({id:'r3',parentId:'r2',cells:{col:'Child'}});
  await ok(await patch('/sheets/state',admin,recordChanges(base,next)));assert.deepEqual(await getSheets(),next);
  const bad=structuredClone(next);bad.sheets[0].rows=bad.sheets[0].rows.filter(r=>r.id!=='r2');assert.equal((await patch('/sheets/state',admin,recordChanges(next,bad))).status,400);assert.deepEqual(await getSheets(),next);
  assert.equal((await call('/sheets/state',admin,{method:'PUT',body:JSON.stringify({state:base,revision:2})})).status,409);
 });
 console.log(checks+' record-write scenarios passed');
}finally{await ctx.worker.dispose();}
