import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,pbkdf2Sync,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {testEnvironment,users} from '../../marches/test.mjs';
import {migrateBilling} from '../billing-schema.mjs';
import {migrateStamping} from '../stamping-schema.mjs';
import {quoteFixtureTools,quoteFixture} from '../billing-quote-fixture.mjs';
import {emptyMarket} from '../../marches/domain.mjs';
import {accessModules} from '../access.ts';

delete process.env.MARCHES_TEST_WORKER;
process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const prove=process.argv.includes('--prove-session-binding-before-fix');
const privateDir=new URL('../.private/security-audit-20261030/',import.meta.url);
const request=(ctx,session,path,method='GET',body,version,origin='https://app.cdinnov.eu')=>ctx.worker.dispatchFetch('https://local'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{}),...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const decode=token=>JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString());
const signed=(claims,secret)=>{const body=Buffer.from(JSON.stringify(claims)).toString('base64url');return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');};
const permissions=value=>Object.fromEntries(accessModules.map(m=>[m.key,value]));
const seed=ctx=>({params:{},types:[],mouvements:[],conges:[],notesFrais:[],codesAffaires:[],factures:[],salaries:[{matricule:'001',email:users[0],nom:'Direction fictive',salaire:7000},{matricule:'004',email:users[1],nom:'Collaborateur fictif',salaire:4000}],auth:{accounts:structuredClone(ctx.accounts),allowed:users}});

test('session claims hide the password verifier; legacy bindings are refused and revocation/password changes stay enforced',async()=>{
 const ctx=await testEnvironment();try{
  const portal=seed(ctx);await ctx.setPortal(JSON.stringify(portal));
  const session=await ctx.login(users[1]);
  assert.equal((await request(ctx,session,'/api/v1/session','DELETE')).status,200);
  assert.equal((await request(ctx,session,'/api/v1/session')).status,401);
  const challenge=await(await request(ctx,null,'/api/v1/session','POST',{email:users[1],action:'challenge'})).json();
  const guesses=['not-the-password',ctx.password,'also-wrong'];
  const matches=guesses.filter(password=>{const hash=pbkdf2Sync(password,Buffer.from(challenge.salt,'hex'),challenge.iter,32,'sha256').toString('hex');return createHash('sha256').update(JSON.stringify([challenge.salt,challenge.iter,hash])).digest('hex')===decode(session.token).fingerprint;});
  await mkdir(privateDir,{recursive:true});await writeFile(new URL(prove?'session-binding-before.json':'session-binding-after.json',privateDir),JSON.stringify({fixtureOnly:true,sessionRevoked:true,candidates:guesses.length,matchingCandidates:matches.length,verificationRequests:0}));
  assert.equal(matches.length,prove?1:0,'A revoked session must not disclose a reusable offline password verifier');
  if(prove)return;
  const active=await ctx.login(users[1]),account=portal.auth.accounts[users[1]],raw=createHash('sha256').update(JSON.stringify([account.salt,account.iter,account.hash])).digest('hex');
  assert.notEqual(decode(active.token).fingerprint,decode(challenge.challenge).fingerprint,'Challenge and session bindings use separate domains');
  const other=await ctx.login(users[0]);assert.notEqual(decode(active.token).fingerprint,decode(other.token).fingerprint,'Equal synthetic credentials on two accounts do not share a binding');
  const legacy={token:signed({aud:'cdinnov-budgets',email:users[1],exp:Date.now()+60000,fingerprint:raw,nonce:randomBytes(16).toString('hex')},ctx.sessionSecret)};
  assert.equal((await request(ctx,legacy,'/api/v1/session')).status,401,'Old verifier-based session claims must require a fresh login');
  portal.auth.accounts[users[1]].hash='a'.repeat(64);await ctx.setPortal(JSON.stringify(portal));
  for(const s of [active,legacy])assert.equal((await request(ctx,s,'/api/v1/session')).status,401,'Changing the password verifier revokes old and new sessions');
 }finally{await ctx.worker.dispose();}
});

test('live ACL revocation protects module collections, object routes, exports, roles and personal writes',{skip:prove?'Before-fix proof mode only':false},async()=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);await migrateStamping(ctx.db);
  const portal=seed(ctx);portal.auth.accounts[users[1]].access=permissions(true);await ctx.setPortal(JSON.stringify(portal));
  const admin=await ctx.login(users[0]),staff=await ctx.login(users[1]),f=await quoteFixtureTools(ctx,admin.token,{kind:'invoice',prefix:'SEC-'}),draft={...quoteFixture('Audit synthétique'),kind:'invoice',validUntil:''},invoice=await f.create(draft);
  const marketId=randomUUID(),batchId=randomUUID(),tripId=randomUUID(),now=Date.now();
  await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(marketId,JSON.stringify({...emptyMarket(),title:'Marché synthétique',reference:'AUDIT'}),new Date().toISOString(),users[0]).run();
  await ctx.db.prepare('INSERT INTO stamp_batches VALUES(?,?,?,1,?,?,?)').bind(batchId,users[0],'Lot fictif','{}',now,now+86400000).run();
  await ctx.db.prepare('INSERT INTO agenda_trips(id,owner,payload,version,updated_at) VALUES(?,?,?,1,?)').bind(tripId,users[0],JSON.stringify({id:tripId,title:'Mission fictive',start:'2026-10-30',end:'2026-10-30',participants:[users[0]]}),new Date().toISOString()).run();
  const protectedPaths=['/api/v1/billing/context','/api/v1/billing/documents','/api/v1/billing/documents/'+invoice.id,'/api/v1/billing/documents/'+invoice.id+'/files/pdf','/api/v1/billing/documents/'+invoice.id+'/intervention-report','/api/v1/billing/clients','/api/v1/billing/engagements','/api/v1/projects','/budgets/markets','/budgets/markets/'+marketId,'/budgets/agenda','/budgets/agenda/'+tripId,'/budgets/workspace','/api/v1/budget-records','/sheets/state','/sheets/session','/api/v1/dashboard','/api/v1/stamping/batches','/api/v1/stamping/batches/'+batchId,'/api/v1/stamping/profiles'];
  for(const path of protectedPaths)assert.equal((await request(ctx,null,path)).status,401,'anonymous '+path);
  for(const path of ['/api/v1/billing/documents/'+invoice.id,'/api/v1/billing/documents/'+invoice.id+'/files/pdf','/budgets/markets/'+marketId,'/api/v1/stamping/batches/'+batchId])assert.equal((await request(ctx,staff,path)).status,200,'authorized shared record '+path);
  assert.equal((await request(ctx,staff,'/api/v1/stamping/batches/'+batchId,'DELETE')).status,403,'Shared lot visibility does not grant ownership');
  assert.equal((await request(ctx,staff,'/budgets/agenda/'+tripId,'DELETE',undefined,1)).status,403,'A colleague cannot delete another trip');
  for(const path of ['/api/v1/data-export','/api/v1/data-export?action=data&table=portal_accounts','/api/v1/data-export?action=files','/api/v1/data-export?action=file&key=private','/api/v1/data-export?action=market-file&id=private','/api/v1/portal/backup'])assert.equal((await request(ctx,staff,path)).status,403,'admin-only export '+path);
  assert.equal((await request(ctx,staff,'/api/v1/portal/accounts','POST',{action:'role',email:users[1],role:'admin'},1)).status,403,'No self-promotion');
  const staffPortal=await(await request(ctx,staff,'/api/v1/portal')).json();assert.equal(staffPortal.workspace.salaries.find(s=>s.matricule==='001').salaire,undefined);
  const forged=structuredClone(staffPortal.workspace);forged.salaries[0].salaire=1;assert.equal((await request(ctx,staff,'/api/v1/portal','PUT',forged,staffPortal.version)).status,403,'Employee writes cannot escape their scope');
  const before=await(await request(ctx,admin,'/api/v1/portal')).json();
  assert.equal((await request(ctx,admin,'/api/v1/portal/accounts','POST',{action:'access',email:users[1],access:permissions(false)},before.version)).status,200);
  for(const path of protectedPaths)assert.equal((await request(ctx,staff,path)).status,403,'revoked existing token '+path);
  for(const path of ['/budgets/workspace','/sheets/state','/api/v1/projects','/api/v1/billing/documents/'+invoice.id])for(const method of ['PUT','PATCH'])assert.equal((await request(ctx,staff,path,method,{changes:[]},1)).status,403,'revoked mutation '+method+' '+path);
  for(const path of ['/api/v1/billing/context','/budgets/markets','/sheets/state'])assert.equal((await request(ctx,admin,path,'GET',undefined,undefined,'https://untrusted.invalid')).status,403,'Foreign origin '+path);
  for(const path of ['/files%2Fbilling%2Fprivate','/%61pi/v1/billing/context','//budgets/markets'])assert.equal((await request(ctx,staff,path)).status,410,'Encoded legacy alias stays closed '+path);
  assert.equal((await request(ctx,staff,'/api/v1/session','DELETE')).status,200);for(const path of protectedPaths)assert.equal((await request(ctx,staff,path)).status,401,'logged out '+path);
  await mkdir(privateDir,{recursive:true});await writeFile(new URL('access-matrix.json',privateDir),JSON.stringify({fixtureOnly:true,protectedRoutes:protectedPaths.length,anonymous:true,sharedReadsAuthorized:true,ownershipGuards:true,exportsAdminOnly:true,existingTokenRevoked:true,logout:true}));
 }finally{await ctx.worker.dispose();}
});
