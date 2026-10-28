import assert from 'node:assert/strict';
import {createHash,pbkdf2Sync} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';

// Bundle the current worker in memory; never use or replace deployment output.
delete process.env.MARCHES_TEST_WORKER;
process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const prove=process.argv.includes('--prove-before-fix');
const ctx=await testEnvironment();
const call=(path,body,session,method=body?'POST':'GET',version)=>ctx.worker.dispatchFetch('https://test'+path,{method,headers:{Origin:'https://app.cdinnov.eu','Content-Type':'application/json','cf-connecting-ip':'192.0.2.77',...(session?{Authorization:'Bearer '+session.token}:{}),...(version?{'If-Match':String(version)}:{})},...(body?{body:JSON.stringify(body)}:{})});
const getPortal=async session=>(await call('/api/v1/portal',null,session)).json();
const challenge=async email=>{const response=await call('/api/v1/session',{email,action:'challenge'});assert.equal(response.status,200);return response.json();};
const fingerprint=challenge=>JSON.parse(Buffer.from(challenge.challenge.split('.')[0],'base64url').toString()).fingerprint;
try {
  await ctx.setPortal(JSON.stringify({params:{},types:[],salaries:[{matricule:'001',nom:'Direction fictive'},{matricule:'004',nom:'Salarié fictif'}],mouvements:[],conges:[],notesFrais:[{id:'expense-safe',matricule:'004',statut:'Brouillon',lignes:[]}],codesAffaires:[],factures:[],auth:{accounts:ctx.accounts,allowed:users}}));
  const publicChallenge=await challenge(users[1]);
  const candidates=['an-incorrect-password',ctx.password,'another-incorrect-password'];
  const matches=candidates.filter(password=>{
    const verifier=pbkdf2Sync(password,Buffer.from(publicChallenge.salt,'hex'),publicChallenge.iter,32,'sha256').toString('hex');
    return createHash('sha256').update(JSON.stringify([publicChallenge.salt,publicChallenge.iter,verifier])).digest('hex')===fingerprint(publicChallenge);
  });
  assert.equal(matches.length,prove?1:0,'Public challenge must not verify offline password guesses');
  console.log(prove?'CONFIRMED: one public challenge identifies the right password in a local dictionary without any verification request':'PASS: public challenges no longer expose an offline password verifier');
  const unknown1=await challenge('absent@example.invalid'),unknown2=await challenge('absent@example.invalid');
  assert.equal(unknown1.salt===unknown2.salt,!prove,'Unknown accounts must not be distinguishable by a fresh salt on each request');
  console.log(prove?'CONFIRMED: repeated salts distinguish missing accounts':'PASS: repeated challenges use stable fake account parameters');
  const admin=await ctx.login(users[0]),staff=await ctx.login(users[1]);
  for(const [label,mutate] of [
    ['expense status',workspace=>workspace.notesFrais[0].statut="Envoyé');globalThis.__auditXss=1;//"],
    ['expense identity',workspace=>workspace.notesFrais[0].id="expense');globalThis.__auditXss=1;//"],
    ['leave date',workspace=>workspace.conges.push({id:'leave-safe',matricule:'004',date:"2026-11-01');globalThis.__auditXss=1;//",half:'AM',type:'Congés payés',statut:'En attente'})],
    ['receipt URL',workspace=>workspace.notesFrais[0].lignes.push({id:'line-safe',justificatif:'javascript:globalThis.__auditXss=1;void(0)'})],
    ['HTML data receipt',workspace=>workspace.notesFrais[0].lignes.push({id:'line-safe',justificatif:'data:text/html,<script>globalThis.__auditXss=1</script>'})]
  ]){
    const before=await getPortal(staff),next=structuredClone(before.workspace);mutate(next);
    const response=await call('/api/v1/portal',next,staff,'PUT',before.version);
    assert.equal(response.status,prove?200:400,label+' rejects unsafe values');
    if(prove){const shared=JSON.stringify((await getPortal(admin)).workspace);assert.ok(shared.includes('__auditXss'));}
    console.log((prove?'CONFIRMED: collaborator persisted script-shaped ':'PASS: rejected script-shaped ')+label);
    if(prove){const after=await getPortal(staff);await call('/api/v1/portal',before.workspace,staff,'PUT',after.version);}
  }
  if(!prove){
    const before=await getPortal(staff);
    for(const path of ['/api/v1/portal','/api/v1/portal/restore']){
      const current=await getPortal(admin),next=structuredClone(current.workspace);next.salaries[0].matricule="001');globalThis.__auditXss=1;//";
      assert.equal((await call(path,next,admin,'PUT',current.version)).status,400,'unsafe employee identity: '+path);
    }
    const patch={changes:[{path:['notesFrais',{key:'id',id:'expense-safe'},'statut'],before:'Brouillon',value:"Envoyé');globalThis.__auditXss=1;//"}]};
    assert.equal((await call('/api/v1/portal',patch,staff,'PATCH')).status,400,'PATCH enforces the same field validation');
    const next=structuredClone(before.workspace);next.notesFrais[0].lignes.push({id:'safe-image',date:'2026-10-28',justificatif:'data:image/png;base64,iVBORw0KGgo='});
    assert.equal((await call('/api/v1/portal',next,staff,'PUT',before.version)).status,200,'safe existing inline attachments remain supported');
    console.log('PASS: PATCH and restore validation; safe inline attachments retained');
  }
  // Existing compatibility URLs and requests without a bearer stay closed.
  for(const path of ['/api/v1/portal','/files/audit-private.pdf','/sheets/state','/budgets/workspace'])assert.equal((await call(path)).status,401,path);
  for(const path of ['/markets-test','/%6darkets-test','/files%2Faudit-private.pdf'])assert.equal((await call(path)).status,410,path);
  assert.equal((await call('/api/v1/portal/backup',null,staff)).status,403);
  const saved=JSON.parse((await ctx.db.prepare("SELECT payload FROM app_portal_workspace WHERE id='shared'").first()).payload);
  saved.auth.accounts[users[1]].access=Object.fromEntries(['dashboard','mouvements','salaries','notesfrais','agenda','tamponnage','facturier','budgetsprojets','sheets'].map(key=>[key,false]));
  await ctx.setPortal(JSON.stringify(saved));
  for(const path of ['/budgets/workspace','/api/v1/budget-records','/sheets/state','/sheets/session','/budgets/agenda','/budgets/markets','/api/v1/dashboard','/api/v1/billing/context','/api/v1/projects','/api/v1/stamping/batches'])assert.equal((await call(path,null,staff)).status,403,'revoked module: '+path);
  const filtered=await getPortal(staff);for(const key of ['conges','mouvements','notesFrais','factures','codesAffaires'])assert.deepEqual(filtered.workspace[key],[]);
  console.log('PASS: existing sessions immediately lose revoked modules and filtered portal records');
  assert.equal((await call('/api/v1/session',null,staff,'DELETE')).status,200);
  for(const path of ['/api/v1/session','/budgets/workspace','/sheets/session'])assert.equal((await call(path,null,staff)).status,401,path);
  console.log('PASS: anonymous and historical routes, admin backup, and logout revocation across modules');
} finally {await ctx.worker.dispose();}
