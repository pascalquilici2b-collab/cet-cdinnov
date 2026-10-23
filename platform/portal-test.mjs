import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHmac,pbkdf2Sync} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
process.env.MARCHES_TEST_WORKER=fileURLToPath(new URL('../.build/entry.mjs',import.meta.url));
process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const ctx=await testEnvironment();let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log('OK '+name);};
const file='https://test/files/private.pdf',receipt='https://test/files/receipt.pdf';
const source={params:{anneeSuivi:2026},types:[],salaries:[{matricule:'001',nom:'Direction',photo:'https://test/files/portrait.png',payslip:file,salaire:9999},{matricule:'004',nom:'Consultant',payslip:'https://test/files/own-pay.pdf',salaire:1234}],conges:[{id:'leave',matricule:'001',date:'2026-11-01',statut:'Validé',commentaire:'private'}],mouvements:[],notesFrais:[{id:'n1',matricule:'004',statut:'Brouillon',lignes:[{justificatif:receipt}]}],codesAffaires:[],factures:[{id:'f1',pdfUrl:file}],extension:{untouched:true},auth:{accounts:ctx.accounts,allowed:users}};
const call=(path,options={},session)=>ctx.worker.dispatchFetch('https://test'+path,{...options,headers:{Origin:'https://app.cdinnov.eu','Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{}),...options.headers}});
let admin,staff;
const get=session=>call('/api/v1/portal',{},session).then(r=>r.json());
const put=(data,version,session=admin)=>call('/api/v1/portal',{method:'PUT',headers:{'If-Match':String(version)},body:JSON.stringify(data)},session);
try{
 await ctx.setPortal(JSON.stringify(source));const originalKV=await ctx.kv.get('markets-test');admin=await ctx.login(users[0]);staff=await ctx.login(users[1]);
 await check('Old URLs, anonymous portal/files/notification routes are closed',async()=>{
   for(const path of ['/markets-test','/unknown','/%6darkets-test'])for(const method of ['GET','PUT'])assert.equal((await call(path,{method,...(method==='PUT'?{body:'{}'}:{})})).status,410);
   for(const path of ['/api/v1/portal','/files/private.pdf','/notify'])assert.equal((await call(path)).status,401);
   assert.equal((await call('/api/v1/portal',{headers:{Origin:'https://evil.example'}},admin)).status,403);
 });
 await check('Migration keeps exact legacy data; normal reads never expose password verifiers',async()=>{
   const row=await ctx.db.prepare("SELECT * FROM app_portal_workspace WHERE id='shared'").first();assert.equal(row.payload,originalKV);
   const a=await get(admin),s=await get(staff);assert.deepEqual(a.workspace.extension,source.extension);assert.deepEqual(Object.keys(a.workspace.auth.accounts[users[0]]),['name','role']);
   assert.equal(s.workspace.salaries[0].salaire,undefined);assert.equal(s.workspace.salaries[0].payslip,undefined);assert.equal(s.workspace.salaries[1].salaire,1234);assert.deepEqual(s.workspace.factures,[]);assert.equal(s.workspace.extension,undefined);assert.equal(s.workspace.conges[0].commentaire,undefined);
   assert.doesNotMatch(JSON.stringify(s),/"hash"|"salt"|9999|private.pdf/);
 });
 await check('Role checks prevent other employees, account changes, validation and payment forgery',async()=>{
   const s=await get(staff);
   for(const mutate of [p=>p.salaries[0].nom='hacked',p=>p.auth.accounts[users[0]]={name:'hacked'},p=>p.conges[0].statut='En attente',p=>p.conges.push({id:'fake',matricule:'004',statut:'Validé'}),p=>p.notesFrais[0].statut='Payée']){
     const p=structuredClone(s.workspace);mutate(p);assert.equal((await put(p,s.version,staff)).status,403);
   }
   const p=structuredClone(s.workspace);p.conges.push({id:'mine',matricule:'004',date:'2026-12-01',statut:'En attente'});assert.equal((await put(p,s.version,staff)).status,200);
   const a=await get(admin);assert.deepEqual(a.workspace.extension,source.extension);assert.equal(a.workspace.conges.length,2);assert.deepEqual((await ctx.db.prepare("SELECT payload FROM app_portal_workspace WHERE id='shared'").first()).payload.includes('"hash"'),true);
 });
 await check('Two concurrent writes have one winner; missing versions and oversized bodies fail',async()=>{
   const a=await get(admin),data={...a.workspace,extension:{untouched:true,new:'kept'}};
   const r=await Promise.all([put(data,a.version),put({...data,majBy:'other'},a.version)]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);
   assert.equal((await call('/api/v1/portal',{method:'PUT',body:JSON.stringify(data)},admin)).status,428);
   assert.equal((await put({...data,huge:'x'.repeat(1500001)},(await get(admin)).version)).status,413);
 });
 const bucket=await ctx.worker.getR2Bucket('CET_FILES');
 for(const key of ['private.pdf','receipt.pdf','own-pay.pdf','portrait.png'])await bucket.put(key,'%PDF-'+key,{httpMetadata:{contentType:'application/pdf'}});
 await check('Existing and draft files keep private reads, immutable uploads and safe deletion',async()=>{
   assert.equal((await call('/files/private.pdf',{},staff)).status,403);
   for(const key of ['receipt.pdf','own-pay.pdf','portrait.png'])assert.equal((await call('/files/'+key,{},staff)).status,200);
   const upload=await call('/files/draft.pdf',{method:'PUT',body:'%PDF-draft'},staff);assert.equal(upload.status,200,await upload.clone().text());
   assert.equal((await call('/files/draft.pdf',{},staff)).status,200);
   assert.equal((await call('/files/draft.pdf',{method:'PUT',body:'overwrite'},admin)).status,409);
   assert.equal((await call('/files/receipt.pdf',{method:'DELETE'},staff)).status,409);
   assert.equal((await call('/files/draft.pdf',{method:'DELETE'},staff)).status,200);
   const s=await get(staff);s.workspace.notesFrais[0].lignes.push({justificatif:file});assert.equal((await put(s.workspace,s.version,staff)).status,403,'Cannot attach a guessed URL to grant oneself access');
   const r=await call('/files/private.pdf',{},admin);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(await r.text(),'%PDF-private.pdf');
 });
 await check('Notifications require an identity and cannot relay to an arbitrary recipient',async()=>{
   assert.equal((await call('/notify',{method:'POST',body:JSON.stringify({subject:'test',html:'test',to:'external@example.invalid'})},admin)).status,403);
 });
 await check('Admin backup retains account recovery data; business restore preserves live access',async()=>{
   assert.equal((await call('/api/v1/portal/backup',{},staff)).status,403);
   const backup=await(await call('/api/v1/portal/backup',{},admin)).json();assert.deepEqual(backup.auth,source.auth);
   const r=await call('/api/v1/portal/restore',{method:'PUT',headers:{'If-Match':String((await get(admin)).version)},body:JSON.stringify({params:{anneeSuivi:2027},auth:{accounts:{},allowed:[]}})},admin);assert.equal(r.status,200);
   assert.equal((await call('/api/v1/session',{},admin)).status,200);assert.deepEqual((await get(admin)).workspace.extension,{untouched:true,new:'kept'});
 });
 await check('Invitation links are single use; resets revoke old sessions immediately',async()=>{
   const action=body=>call('/api/v1/portal/accounts',{method:'POST',body:JSON.stringify(body)},admin);
   assert.equal((await call('/api/v1/portal/accounts',{method:'POST',body:JSON.stringify({email:'new@example.invalid',action:'invite'})},staff)).status,403);
   const invitation=await(await action({email:'new@example.invalid',action:'invite'})).json();
   const enrol=token=>call('/api/v1/portal/enrol',{method:'POST',body:JSON.stringify({email:invitation.email,token,name:'New test',salt:ctx.accounts[users[0]].salt,iter:150000,hash:ctx.accounts[users[0]].hash})});
   assert.equal((await enrol('wrong')).status,403);assert.equal((await enrol(invitation.token)).status,200);assert.equal((await enrol(invitation.token)).status,403);
   const newLogin=await ctx.login(invitation.email);assert.equal((await call('/api/v1/session',{},newLogin)).status,200);
   const reset=await action({email:users[1],action:'reset'});assert.equal(reset.status,200);
   for(const path of ['/api/v1/portal','/api/v1/session','/budgets/workspace','/sheets/session','/files/receipt.pdf'])assert.equal((await call(path,{},staff)).status,401,path);
 });
 await check('Logout revokes the bearer across all services without changing the legacy snapshot',async()=>{
   assert.equal((await call('/api/v1/session',{method:'DELETE'},admin)).status,200);
   assert.equal((await call('/api/v1/portal',{},admin)).status,401);assert.equal((await ctx.call('workspace',{headers:{Authorization:'Bearer '+admin.token}})).status,401);
   assert.equal(await ctx.kv.get('markets-test'),originalKV);
 });
 console.log(checks+' secure portal checks passed');
}finally{await ctx.worker.dispose();}
