import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,pbkdf2Sync} from 'node:crypto';
import {load} from './load-ts.mjs';
const api=await load('api.ts');
const session=email=>({email,t:Date.now(),budgets:{email,sessionId:'synthetic-id-'+email,expiresAt:Date.now()+3600000}});
function setup(t){
 const values=new Map(),saved={window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch};let expired=false;
 globalThis.window=new EventTarget();globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const read=()=>JSON.parse(values.get(api.sessionKey)||'null')?.budgets||null;
 window.CDISession={read:()=>expired?null:read(),current:read,accept:value=>{expired=false;values.set(api.sessionKey,JSON.stringify({email:value.email,t:Date.now(),budgets:value}));return value},expire:()=>{expired=true},logout:()=>{expired=false;values.delete(api.sessionKey)}};
 t.after(()=>Object.assign(globalThis,saved));return values;
}
test('Challenge-response login keeps the password local and persists only cookie session metadata',async t=>{
 const values=setup(t),password='synthetic-password-only',salt='0123456789abcdef0123456789abcdef',challenge='test-challenge',requests=[];
 globalThis.fetch=async(url,options)=>{
  assert.equal(options.credentials,'same-origin');
  if(url==='/sheets/session')return Response.json({ok:true});
  const body=JSON.parse(options.body);requests.push(body);assert.equal(options.headers['X-CDInnov-Request'],'1');assert.equal(body.email,'qa@example.invalid');assert.ok(!JSON.stringify(body).includes(password));
  if(body.action==='challenge')return Response.json({salt,iter:100000,challenge});
  assert.equal(body.proof,createHmac('sha256',pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256')).update(challenge).digest('hex'));
  return Response.json({sessionId:'synthetic-id',expiresAt:Date.now()+3600000,token:'MUST_NOT_PERSIST'});
 };
 await api.signIn(' QA@EXAMPLE.INVALID ',password);assert.equal(requests.length,2);assert.equal(api.readSession().email,'qa@example.invalid');assert.ok(values.has(api.sessionKey));assert.ok(!values.get(api.sessionKey).includes('MUST_NOT_PERSIST'));
});
test('Late responses and a changed account cannot update another mounted workspace or expire the new account',async t=>{
 const values=setup(t);values.set(api.sessionKey,JSON.stringify(session('a@example.invalid')));let requests=0;
 globalThis.fetch=async()=>{requests++;values.set(api.sessionKey,JSON.stringify(session('b@example.invalid')));return Response.json({revision:1,state:{}})};
 await assert.rejects(api.requestState({},'a@example.invalid'),/session a changé/);
 await assert.rejects(api.requestState({method:'PUT',body:'{}'},'a@example.invalid'),/session a changé/);assert.equal(requests,1);assert.equal(api.readSession().email,'b@example.invalid');
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/v1/session');assert.equal(options.method,'DELETE');assert.equal(options.headers['X-CDInnov-Request'],'1');return Response.json({ok:true});};
 await api.signOut();await assert.rejects(api.requestState(),/Reconnectez-vous/);assert.equal(api.readSession(),null);
});
test('Only 401 expires the session; mutations use same-origin cookies and the CSRF header',async t=>{
 const values=setup(t);values.set(api.sessionKey,JSON.stringify(session('a@example.invalid')));let status=403;
 globalThis.fetch=async(url,options)=>{assert.equal(options.credentials,'same-origin');assert.equal(options.headers.get('Authorization'),null);assert.equal(options.headers.get('X-CDInnov-Request'),'1');return Response.json({error:'test'},{status});};
 assert.equal((await api.requestState({method:'PATCH',body:'{}'})).status,403);assert.ok(api.readSession());status=401;assert.equal((await api.requestState({method:'PATCH',body:'{}'})).status,401);assert.equal(api.readSession(),null);
});
