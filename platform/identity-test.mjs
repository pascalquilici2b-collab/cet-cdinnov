import assert from 'node:assert/strict';
import {createHash,createHmac,pbkdf2Sync,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {testEnvironment,users} from '../marches/test.mjs';
import {sessionIdentity} from './identity.ts';

process.env.MARCHES_TEST_WORKER=fileURLToPath(new URL('../.build/entry.mjs',import.meta.url));
process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const ctx=await testEnvironment();let checks=0;
const check=async(name,fn)=>{await fn();console.log('OK '+name);checks++;};
const external='employee@example.invalid',accounting='boulanger.albert@cdinnov.com';
const accounts={...ctx.accounts,[external]:{...ctx.accounts[users[1]],name:'External test'},[accounting]:{...ctx.accounts[users[0]],name:'Accounting test'}};
const portal={auth:{accounts,allowed:[...users,external,accounting]},salaries:[{matricule:'004',nom:'Private employee',salaire:4000}],privateUnknown:{preserved:true}};
const call=(path='/api/v1/session',options={})=>ctx.worker.dispatchFetch('https://test'+path,{...options,headers:{Origin:'https://app.cdinnov.eu','Content-Type':'application/json','cf-connecting-ip':'192.0.2.1',...options.headers}});
const post=(body,path='/api/v1/session',headers={})=>call(path,{method:'POST',headers,body:JSON.stringify(body)});
const get=(token,path='/api/v1/session')=>call(path,{headers:{Authorization:'Bearer '+token}});
const proof=c=>createHmac('sha256',pbkdf2Sync(ctx.password,Buffer.from(c.salt,'hex'),c.iter,32,'sha256')).update(c.challenge).digest('hex');
const challenge=async(email=users[0],path='/api/v1/session')=>{
  const r=await post({email,action:'challenge'},path);assert.equal(r.status,200);return r.json();
};
const verify=(c,email=users[0],path='/api/v1/session',p=proof(c))=>post({email,action:'verify',challenge:c.challenge,proof:p},path);
const resetLimits=()=>ctx.db.prepare('DELETE FROM budgets_login_limits').run();
const signed=data=>{const body=Buffer.from(JSON.stringify(data)).toString('base64url');return body+'.'+createHmac('sha256',ctx.sessionSecret).update(body).digest('base64url');};
const oldClaims=email=>({aud:'cdinnov-budgets',email,exp:Date.now()+60000,fingerprint:createHash('sha256').update(JSON.stringify([accounts[email].salt,accounts[email].iter,accounts[email].hash])).digest('hex'),nonce:randomBytes(16).toString('hex')});

try {
  await ctx.kv.put('markets-test',JSON.stringify(portal));
  const before=await ctx.kv.get('markets-test');
  await check('Anonymous access, CORS, methods and malformed login bodies rejected',async()=>{
    assert.equal((await call()).status,401);
    assert.equal((await call(undefined,{method:'OPTIONS'})).status,204);
    assert.equal((await call(undefined,{headers:{Origin:'https://other.invalid'}})).status,403);
    assert.equal((await call(undefined,{method:'DELETE'})).status,405);
    for(const body of [null,[],{},42,{email:{},action:'challenge'},{email:users[0],action:[]},{email:users[0],action:['challenge']},{email:'invalid',action:'challenge'}])assert.equal((await post(body)).status,400);
    assert.equal((await call(undefined,{method:'POST',body:'{'})).status,400);
    assert.equal((await call(undefined,{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status,415);
    assert.equal((await post({email:users[0],action:'challenge',extra:'a'.repeat(4096)})).status,413);
  });
  let adminSession,employeeSession;
  await check('Old and new login routes exchange challenges and keep the existing protocol',async()=>{
    const old=await challenge(users[0],'/budgets/session');
    const result=await verify(old);assert.equal(result.status,200);adminSession=await result.json();
    assert.deepEqual(Object.keys(adminSession).sort(),['expiresAt','token']);
    assert.ok(adminSession.expiresAt>Date.now()+7.9*3600000 && adminSession.expiresAt<=Date.now()+8*3600000);
    const modern=await challenge(users[1]);
    const second=await verify(modern,users[1],'/budgets/session');assert.equal(second.status,200);employeeSession=await second.json();
  });
  await check('Identity response discloses only the connected account summary',async()=>{
    for(const [session,email,admin] of [[adminSession,users[0],true],[employeeSession,users[1],false]]) {
      const response=await get(session.token),data=await response.json();
      assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
      assert.deepEqual(data,{email,name:accounts[email].name,expiresAt:session.expiresAt,admin});
      assert.ok(!JSON.stringify(data).includes(accounts[email].hash));
    }
    const data=await(await get((await ctx.login(accounting)).token)).json();assert.equal(data.admin,true);
  });
  await check('Tokens issued before migration remain accepted by every existing authenticated module',async()=>{
    const token=signed(oldClaims(users[0]));
    for(const path of ['/api/v1/session','/budgets/workspace','/budgets/markets','/budgets/agenda','/sheets/session','/api/v1/dashboard','/api/v1/budget-records?collection=clients'])assert.equal((await get(token,path)).status,200,path);
    assert.equal((await get(employeeSession.token,'/budgets/markets')).status,403);
    assert.equal((await get(employeeSession.token,'/sheets/session')).status,200);
  });
  await check('Strict token parsing rejects forged, incomplete, expired and wrong-audience claims',async()=>{
    const base=oldClaims(users[0]);
    for(const data of [null,[],{}, {...base,exp:undefined},{...base,exp:null},{...base,exp:String(base.exp)},{...base,exp:0},{...base,exp:1.1},{...base,aud:'cdinnov-budget-login'},{...base,nonce:undefined},{...base,nonce:''},{...base,email:'wrong@example.invalid'},{...base,fingerprint:'😀'.repeat(32)}])assert.equal((await get(signed(data))).status,401);
    for(const token of [adminSession.token+'.',adminSession.token+'x','a.é','a.b',''])assert.equal((await get(token)).status,401);
    assert.equal((await call(undefined,{headers:{Authorization:adminSession.token}})).status,401);
    assert.equal((await call(undefined,{headers:{Authorization:'bearer '+adminSession.token}})).status,200);
  });
  await check('Single-use challenges allow exactly one concurrent login',async()=>{
    const c=await challenge();const responses=await Promise.all([verify(c),verify(c)]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,401]);
    const fresh=await challenge();assert.equal((await verify(fresh,users[0],'/api/v1/session','0'.repeat(64))).status,401);
    assert.equal((await verify(fresh)).status,401);
    const cross=await challenge();assert.equal((await verify(cross,users[1])).status,401);
  });
  await check('Expired or invalid challenges cannot issue a session',async()=>{
    const c=await challenge();const claims=JSON.parse(Buffer.from(c.challenge.split('.')[0],'base64url').toString());
    for(const data of [{...claims,exp:Date.now()-1},{...claims,exp:null},{...claims,nonce:undefined},{...claims,aud:'cdinnov-budgets'}]) {
      const changed={...c,challenge:signed(data)};assert.equal((await verify(changed)).status,401);
    }
  });
  await check('Unknown accounts get a challenge-shaped response without account details',async()=>{
    const c=await challenge('unknown@example.invalid');assert.deepEqual(Object.keys(c).sort(),['challenge','iter','salt']);
    assert.match(c.salt,/^[a-f0-9]{32}$/);assert.equal(c.iter,150000);
    assert.equal((await verify(c,'unknown@example.invalid')).status,401);
  });
  await check('Rate limits are shared by both login routes, by email and by IP',async()=>{
    await resetLimits();
    for(let i=0;i<20;i++)assert.equal((await post({email:users[0],action:'challenge'},i%2?'/budgets/session':'/api/v1/session',{'cf-connecting-ip':'192.0.2.'+(i+2)})).status,200);
    assert.equal((await post({email:users[0],action:'challenge'},'/api/v1/session',{'cf-connecting-ip':'192.0.2.99'})).status,429);
    await resetLimits();
    for(let i=0;i<20;i++)assert.equal((await post({email:'person'+i+'@example.invalid',action:'challenge'})).status,200);
    assert.equal((await post({email:'person21@example.invalid',action:'challenge'},'/budgets/session')).status,429);
    await resetLimits();
  });
  await check('Account removal and credential changes invalidate existing sessions on the next request',async()=>{
    const custom=await ctx.login(external);
    await ctx.kv.put('markets-test',JSON.stringify({...portal,auth:{...portal.auth,allowed:users}}));
    assert.equal((await get(custom.token)).status,401);
    await ctx.kv.put('markets-test',JSON.stringify({...portal,auth:{...portal.auth,accounts:{...accounts,[users[1]]:{...accounts[users[1]],hash:'f'.repeat(64)}}}}));
    for(const path of ['/api/v1/session','/budgets/workspace','/sheets/session','/api/v1/dashboard'])assert.equal((await get(employeeSession.token,path)).status,401,path);
    assert.equal((await get(adminSession.token)).status,200);
    const removed={...accounts};delete removed[users[0]];
    await ctx.kv.put('markets-test',JSON.stringify({...portal,auth:{...portal.auth,accounts:removed}}));
    assert.equal((await get(adminSession.token)).status,401);
    await ctx.kv.put('markets-test',before);
  });
  await check('Session lookup uses one KV read, zero SQL writes and never shares an identity cache',async()=>{
    let reads=0;let current=structuredClone(portal);
    const env={BUDGETS_SESSION_SECRET:ctx.sessionSecret,CET_WORKSPACE_KEY:'test',CET_KV:{get:async()=>{reads++;return current;}}};
    const req=new Request('https://test',{headers:{Authorization:'Bearer '+adminSession.token}});
    assert.equal((await sessionIdentity(req,env)).email,users[0]);assert.equal(reads,1);
    current.auth.accounts[users[0]].hash='0'.repeat(64);
    assert.equal(await sessionIdentity(req,env),null);assert.equal(reads,2);
    assert.equal(await sessionIdentity(req,env,adminSession.expiresAt),null);assert.equal(reads,2);
    await assert.rejects(()=>sessionIdentity(req,{...env,BUDGETS_SESSION_SECRET:'short'}),e=>e.status===503);
    assert.equal(await ctx.kv.get('markets-test'),before);
  });
  console.log(checks+' identity scenarios passed; synthetic data only, no external notifications.');
}finally{await ctx.worker.dispose();}
