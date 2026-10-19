import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,pbkdf2Sync} from 'node:crypto';
import {load} from './load-ts.mjs';
const api=await load('api.ts');
const session=email=>({email,t:Date.now(),budgets:{email,token:'synthetic-test-token',expiresAt:Date.now()+3600000}});
function setup(t){
 const values=new Map(),saved={window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
 globalThis.window=new EventTarget();globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 t.after(()=>Object.assign(globalThis,saved));return values;
}
test('Existing challenge-response login remains compatible and never sends the password',async t=>{
 const values=setup(t),password='synthetic-password-only',salt='0123456789abcdef0123456789abcdef',challenge='test-challenge',requests=[];
 globalThis.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);requests.push(body);assert.equal(body.email,'qa@example.invalid');assert.ok(!JSON.stringify(body).includes(password));
  if(body.action==='challenge')return Response.json({salt,iter:100000,challenge});
  assert.equal(body.proof,createHmac('sha256',pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256')).update(challenge).digest('hex'));
  return Response.json({token:'synthetic-session-token',expiresAt:Date.now()+3600000});
 };
 await api.signIn(' QA@EXAMPLE.INVALID ',password);assert.equal(requests.length,2);assert.equal(api.readSession().email,'qa@example.invalid');assert.ok(values.has(api.sessionKey));
});
test('A changed or expired account cannot read or save another mounted workspace',async t=>{
 const values=setup(t);values.set(api.sessionKey,JSON.stringify(session('a@example.invalid')));let requests=0;
 globalThis.fetch=async()=>{requests++;values.set(api.sessionKey,JSON.stringify(session('b@example.invalid')));return Response.json({revision:1,state:{}})};
 await assert.rejects(api.requestState({},'a@example.invalid'),/session a changé/);
 await assert.rejects(api.requestState({method:'PUT',body:'{}'},'a@example.invalid'),/Reconnectez-vous/);assert.equal(requests,1);
 api.signOut();await assert.rejects(api.requestState(),/Reconnectez-vous/);assert.equal(requests,1);assert.equal(api.readSession(),null);
});
