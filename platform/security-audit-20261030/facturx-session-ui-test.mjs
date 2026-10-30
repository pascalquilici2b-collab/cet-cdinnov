import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';

// Execute the actual portal adapter. All transport is synthetic and local;
// token verification itself is covered by the Python service tests.
const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('const FACTURX_SERVICE_URL ='),html.indexOf('function fvInitPdfForm('))+
 html.slice(html.indexOf('async function facturxApi('),html.indexOf('function facturxDigest('));
assert.ok(source.includes('function facturxAuthSession()'));
const email='audit@example.invalid',key='synthetic-key-only-'.repeat(4);
function session(version){
 const now=Math.floor(Date.now()/1000),claims={...(version===2?{v:2}:{}),email,iat:now,exp:now+28800,account:'a'.repeat(64),nonce:'b'.repeat(24)};
 const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');
 return {email,expires_at:claims.exp,token:payload+'.'+createHmac('sha256',key).update('cdi-facturx-session-v'+version+':'+payload).digest('hex')};
}

test('actual Factur-X frontend accepts opaque v2 sessions and purges rejected old tokens',async()=>{
 const stored=new Map(),v2=session(2),v1=session(1),calls=[];let protectedStatus=200;
 const sandbox=createContext({AUTH_USER:email,Headers,AbortSignal,document:{getElementById:()=>null},
  sessionStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)},
  fetch:async(url,options)=>{assert.ok(url.startsWith('https://cdinnov-facturx.onrender.com/api/'));calls.push({url,authorization:options.headers instanceof Headers?options.headers.get('Authorization'):null});
   return url.endsWith('/auth/login')?Response.json(v2):new Response('',{status:protectedStatus});}
 });
 runInContext(source,sandbox);
 const signed=await sandbox.facturxSignIn(email,'synthetic-password');assert.equal(signed.token,v2.token);
 assert.equal(sandbox.facturxAuthSession().token,v2.token);
 assert.equal((await sandbox.facturxApi('/api/invoice-schema')).status,200);
 assert.equal(calls.at(-1).authorization,'Bearer '+v2.token);
 sandbox.facturxForgetAuth();stored.set('cdi_facturx_session_v1',JSON.stringify({...v1,service:'https://cdinnov-facturx.onrender.com'}));
 protectedStatus=401;
 await assert.rejects(()=>sandbox.facturxApi('/api/invoice-schema'),/session Factur-X a expiré/);
 assert.equal(calls.at(-1).authorization,'Bearer '+v1.token);
 assert.equal(sandbox.facturxAuthSession(),null);assert.equal(stored.size,0);
 protectedStatus=200;await sandbox.facturxSignIn(email,'synthetic-password');assert.equal((await sandbox.facturxApi('/api/invoice-schema')).status,200);
 sandbox.facturxForgetAuth();sandbox.AUTH_USER=null;
 await assert.rejects(()=>sandbox.facturxSignIn(email,'synthetic-password'),/session de l’application a changé/);
 assert.equal(stored.size,0,'A late service login cannot resurrect a logged-out session');
});
