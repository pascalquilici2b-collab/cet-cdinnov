import assert from 'node:assert/strict';
import {createHash,createHmac,pbkdf2Sync,randomBytes} from 'node:crypto';
import {testEnvironment,users} from '../../marches/test.mjs';
delete process.env.MARCHES_TEST_WORKER;
process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const ctx=await testEnvironment();
const call=(path,session,method='GET',body,version)=>ctx.worker.dispatchFetch('https://test'+path,{method,headers:{Origin:'https://app.cdinnov.eu','Content-Type':'application/json','cf-connecting-ip':'192.0.2.111',...(session?{Authorization:'Bearer '+session.token}:{}),...(version?{'If-Match':String(version)}:{})},...(body?{body:JSON.stringify(body)}:{})});
const challenge=async email=>(await call('/api/v1/session',null,'POST',{email,action:'challenge'})).json();
const decode=token=>JSON.parse(Buffer.from(token.split('.')[0],'base64url'));
const encode=claims=>{const body=Buffer.from(JSON.stringify(claims)).toString('base64url');return body+'.'+createHmac('sha256',ctx.sessionSecret).update(body).digest('base64url');};
const source={params:{},types:[],salaries:[{matricule:'001',nom:'Synthetic admin'},{matricule:'004',nom:'Synthetic staff'}],mouvements:[],conges:[],notesFrais:[{id:'own-note',matricule:'004',statut:'Brouillon',lignes:[]}],codesAffaires:[],factures:[],auth:{accounts:ctx.accounts,allowed:users}};
try{
 await ctx.setPortal(JSON.stringify(source));
 const unknown1=await challenge('absent-a@example.invalid'),unknown2=await challenge('absent-a@example.invalid'),unknown3=await challenge('absent-b@example.invalid');
 assert.equal(unknown1.salt,unknown2.salt);assert.notEqual(unknown1.salt,unknown3.salt);assert.notEqual(decode(unknown1.challenge).nonce,decode(unknown2.challenge).nonce);
 const known=await challenge(users[1]),account=ctx.accounts[users[1]],oldFingerprint=createHash('sha256').update(JSON.stringify([account.salt,account.iter,account.hash])).digest('hex');
 assert.notEqual(decode(known.challenge).fingerprint,oldFingerprint);
 const proof=createHmac('sha256',pbkdf2Sync(ctx.password,Buffer.from(known.salt,'hex'),known.iter,32,'sha256')).update(known.challenge).digest('hex');
 assert.equal((await call('/api/v1/session',null,'POST',{email:users[1],action:'verify',challenge:known.challenge,proof})).status,200);
 assert.equal((await call('/api/v1/session',null,'POST',{email:users[1],action:'verify',challenge:known.challenge,proof})).status,401);
 const oldChallenge=encode({aud:'cdinnov-budget-login',email:users[1],exp:Date.now()+60000,fingerprint:oldFingerprint,nonce:randomBytes(24).toString('hex')});
 const oldProof=createHmac('sha256',Buffer.from(account.hash,'hex')).update(oldChallenge).digest('hex');
 assert.equal((await call('/api/v1/session',null,'POST',{email:users[1],action:'verify',challenge:oldChallenge,proof:oldProof})).status,401);
 const oldSession={token:encode({aud:'cdinnov-budgets',email:users[1],exp:Date.now()+60000,fingerprint:oldFingerprint,nonce:randomBytes(16).toString('hex')})};
 assert.equal((await call('/api/v1/session',oldSession)).status,200,'pre-fix sessions stay usable');
 console.log('PASS: stable fake salts differ by email; fresh nonces; public fingerprint opaque; proof replay and old challenges refused; old sessions preserved');
 // A historical invalid field in another employee record must not disable all
 // unrelated portal writes. Clients now encode/validate these values on read.
 const historical=structuredClone(source);historical.notesFrais.push({id:'historic-note',matricule:'001',statut:'Ancien statut',dateNote:'31/12/2025',lignes:[]});
 await ctx.setPortal(JSON.stringify(historical));
 const before=await(await call('/api/v1/portal',oldSession)).json();const next=structuredClone(before.workspace);next.notesFrais[0].objet='Unrelated safe change';
 const response=await call('/api/v1/portal',oldSession,'PUT',next,before.version);
 assert.equal(response.status,200,'an unchanged legacy record must not block another employee');
 const now=await(await call('/api/v1/portal',oldSession)).json();const malformed=structuredClone(now.workspace);malformed.notesFrais[0].lignes={invalid:true};
 assert.equal((await call('/api/v1/portal',oldSession,'PUT',malformed,now.version)).status,400,'malformed line collection must be a validation failure');
 console.log('PASS: historical data compatibility; malformed expense line collection rejected');
}finally{await ctx.worker.dispose();}
