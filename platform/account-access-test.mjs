import assert from 'node:assert/strict';
import {billingPreview} from './billing-preview.mjs';
import {users} from '../marches/test.mjs';
const preview=await billingPreview(),{ctx,sessions:[admin,staff]}=preview;
const keys=['dashboard','mouvements','salaries','notesfrais','agenda','tamponnage','facturier','budgetsprojets','sheets'];
const denied=Object.fromEntries(keys.map(k=>[k,false]));
const call=(s,path,body,version,method=body?'POST':'GET')=>ctx.worker.dispatchFetch('https://test'+path,{method,headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+s.token,'Content-Type':'application/json',...(version!==undefined?{'If-Match':String(version)}:{})},...(body?{body:JSON.stringify(body)}:{})});
const portal=async(s=admin)=>(await call(s,'/api/v1/portal')).json();
const set=async(access,email=users[1],s=admin,version)=>(await call(s,'/api/v1/portal/accounts',{action:'access',email,access},version??(await portal()).version));
try{
 const portalSeed=JSON.parse((await preview.ctx.db.prepare("SELECT payload FROM app_portal_workspace WHERE id='shared'").first()).payload);
 await preview.ctx.setPortal(JSON.stringify({params:{anneeSuivi:2026},types:[],mouvements:[],...portalSeed}));
 const original=JSON.parse((await ctx.db.prepare("SELECT payload FROM app_portal_workspace WHERE id='shared'").first()).payload);
 const initial=(await call(staff,'/api/v1/session').then(r=>r.json())).access;
 assert.deepEqual(initial,{dashboard:true,mouvements:true,salaries:false,notesfrais:true,agenda:true,tamponnage:false,facturier:false,budgetsprojets:true,sheets:true});
 assert.equal((await set(denied,users[1],staff)).status,403);
 assert.equal((await set({...denied,secret:true})).status,400);
 assert.equal((await set({...denied,agenda:'true'})).status,400);
 assert.equal((await set(denied,users[0])).status,409,'admins always have access');
 const version=(await portal()).version;assert.equal((await set(denied)).status,200);assert.equal((await set(initial,users[1],admin,version)).status,409);
 assert.deepEqual((await call(staff,'/api/v1/session').then(r=>r.json())).access,denied,'old session receives revocation');
 for(const path of ['/api/v1/billing/context','/api/v1/billing/documents','/api/v1/stamping/batches','/api/v1/dashboard','/budgets/workspace','/api/v1/budget-records','/budgets/markets','/budgets/agenda','/sheets/state','/sheets/session','/api/v1/projects'])assert.equal((await call(staff,path)).status,403,path);
 for(const path of ['/budgets/workspace','/sheets/state'])for(const method of ['PUT','PATCH'])assert.equal((await call(staff,path,{changes:[]},1,method)).status,403,path+' '+method);
 let view=await portal(staff);for(const key of ['mouvements','conges','notesFrais','factures','codesAffaires'])assert.deepEqual(view.workspace[key],[],key);
 assert.equal(view.workspace.salaries.find(s=>s.matricule==='004')?.payslip,undefined);
 assert.equal(view.workspace.auth.accessHistory,undefined);
 for(const key of ['mouvements','conges','notesFrais','factures']){
  const p=structuredClone(view.workspace);p[key].push({id:'forged',matricule:'004',statut:'En attente'});
  assert.equal((await call(staff,'/api/v1/portal',p,view.version,'PUT')).status,403,'deny write '+key);
 }
 console.log('OK revoked modules reject direct URLs, reads, writes and portal data; no self-grants or stale updates');
 // Explicit billing access enables the complete commercial module, without HR/admin powers.
 assert.equal((await set({...denied,facturier:true})).status,200);
 for(const path of ['/api/v1/billing/context','/api/v1/billing/documents','/budgets/markets','/api/v1/projects'])assert.equal((await call(staff,path)).status,200,path);
 view=await portal(staff);assert.equal(view.workspace.factures.length,original.factures.length);assert.deepEqual(view.workspace.notesFrais,[]);
 assert.equal((await call(staff,'/api/v1/portal/backup')).status,403);
 const edit=structuredClone(view.workspace);edit.factures[0].label='Libellé corrigé';assert.equal((await call(staff,'/api/v1/portal',edit,view.version,'PUT')).status,200);
 const forged=await portal(staff);forged.workspace.salaries[0].coutJour=9;assert.equal((await call(staff,'/api/v1/portal',forged.workspace,forged.version,'PUT')).status,403);
 console.log('OK delegated billing includes imported invoices and markets without granting payroll or account administration');
 assert.equal((await set({...denied,dashboard:true})).status,200);
 const dashboard=await call(staff,'/api/v1/dashboard').then(r=>r.json());assert.equal(dashboard.invoices,null);assert.deepEqual(dashboard.expenses,[]);assert.deepEqual(dashboard.leaves,[]);assert.deepEqual(dashboard.trips,[]);
 assert.equal((await set({...denied,sheets:true,budgetsprojets:true,agenda:true})).status,200);
 for(const path of ['/sheets/session','/sheets/state','/budgets/workspace','/budgets/agenda'])assert.equal((await call(staff,path)).status,200,path);
 assert.equal((await call(staff,'/api/v1/billing/context')).status,403);
 // Reset/enrol and restoration must never discard or escalate configured permissions.
 const grant={...denied,notesfrais:true};await set(grant);
 const invitation=await call(admin,'/api/v1/portal/accounts',{action:'reset',email:users[1]}).then(r=>r.json());
 assert.equal((await call(staff,'/api/v1/session')).status,401);
 const account=ctx.accounts[users[1]];
 const enrol=await ctx.worker.dispatchFetch('https://test/api/v1/portal/enrol',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://app.cdinnov.eu'},body:JSON.stringify({email:users[1],token:invitation.token,name:'Consultant',salt:account.salt,hash:account.hash,iter:150000})});assert.equal(enrol.status,200);
 const renewed=await ctx.login(users[1]);assert.deepEqual((await call(renewed,'/api/v1/session').then(r=>r.json())).access,grant);
 assert.equal((await call(admin,'/api/v1/portal/restore',{auth:{accounts:{}}},(await portal()).version,'PUT')).status,200);
 assert.deepEqual((await call(renewed,'/api/v1/session').then(r=>r.json())).access,grant);
 const saved=JSON.parse((await ctx.db.prepare("SELECT payload FROM app_portal_workspace WHERE id='shared'").first()).payload);
 assert.deepEqual(saved.salaries,original.salaries);assert.deepEqual(saved.notesFrais,original.notesFrais);
 assert.ok(saved.auth.accessHistory.length>=5);assert.equal(saved.auth.accounts[users[0]].hash,original.auth.accounts[users[0]].hash);
 console.log('OK dashboard projection, restored access, reset/enrol continuity, private audit and employee records preserved');
}finally{await preview.close();}
