import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac,pbkdf2Sync,webcrypto} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual classic portal functions. All responses and accounts below
// are synthetic; no browser, external service or production account is used.
const source=await readFile(new URL('./client/portal-compat.js',import.meta.url),'utf8');
const ast=ts.createSourceFile('portal-compat.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const names=new Set(['budgetsApi','portalAuthJSON','budgetsSignIn','portalReconnect']);
const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const email='qa@example.invalid',password='synthetic-password-only';
const challenge={salt:'0123456789abcdef0123456789abcdef',iter:100000,challenge:'local-one-time-challenge'};
const session={email,sessionId:'synthetic-session-metadata',expiresAt:Date.now()+3600000};
const html='<html> <head><title>synthetic-private-output</title></head></html>';
const json=(body,status=200,type='application/json')=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':type}});

function harness(responses){
  const calls=[],accepted=[],stored=[];
  const sandbox={location:{origin:'https://app.cdinnov.eu'},AbortSignal,Headers,URL,TextEncoder,crypto:webcrypto,
    portalLogoutPending:false,portalSigninPending:null,portalLoginAttempt:0,portalReconnecting:false,portalSuspendedUser:email,
    AUTH_USER:email,budgetsSession:null,normEmail:value=>value.trim().toLowerCase(),
    pbkdf2:async(value,salt,iter)=>pbkdf2Sync(value,Buffer.from(salt,'hex'),iter,32,'sha256').toString('hex'),
    _bytes:hex=>new Uint8Array(Buffer.from(hex,'hex')),_hex:bytes=>Buffer.from(bytes).toString('hex'),
    setSession:value=>stored.push(value),window:{CDISession:{accept:value=>accepted.push(value)}},
    portalForgetUser:()=>assert.fail('Same-account test must retain the current screen'),
    cloudLoad:async()=>assert.fail('Same-account reconnect must retain pending edits'),
    unlockApp:()=>assert.fail('Same-account reconnect must retain the mounted screen'),
    fetch:async(url,options={})=>{
      calls.push({url,options});assert.ok(responses.length,'Unexpected retry or extra request');
      const next=responses.shift();return typeof next==='function'?next(url,options):next;
    }
  };
  vm.createContext(sandbox);vm.runInContext(functions,sandbox);
  return {sandbox,calls,accepted,stored};
}
function safeError(error,status,code){
  assert.equal(error.status,status);assert.equal(error.code,code);
  assert.ok(!error.message.includes('<'));assert.ok(!error.message.includes('synthetic-private-output'));
  assert.equal(error.cause,undefined,'No parser error containing raw response snippets is retained');
  return true;
}
function requestContract(call){
  assert.equal(call.url,'https://app.cdinnov.eu/budgets/session');
  assert.equal(call.options.method,'POST');assert.equal(call.options.credentials,'same-origin');assert.equal(call.options.cache,'no-store');
  const headers=new Headers(call.options.headers);assert.equal(headers.get('Accept'),'application/json');
  assert.equal(headers.get('Content-Type'),'application/json');assert.equal(headers.get('X-CDInnov-Request'),'1');assert.equal(headers.get('Authorization'),null);
  assert.ok(!call.options.body.includes(password));
}

for(const status of [200,404,405,502]){
  test(`HTML HTTP ${status} during challenge reports its status without leaking the page or retrying`,async()=>{
    const h=harness([new Response(html,{status,headers:{'Content-Type':'text/html; charset=utf-8'}})]);
    await assert.rejects(h.sandbox.budgetsSignIn(email,password,false),error=>{
      safeError(error,status,'AUTH_RESPONSE_TYPE');assert.equal(error.contentType,'text/html');assert.match(error.message,/page inattendue/);return true;
    });
    assert.equal(h.calls.length,1);requestContract(h.calls[0]);assert.equal(h.accepted.length,0);assert.equal(h.stored.length,0);assert.equal(h.sandbox.portalSigninPending,null);
  });
}
for(const status of [401,403,429]){
  test(`JSON HTTP ${status} preserves the authentication or access error and does not retry verification`,async()=>{
    const message=({401:'Connexion invalide.',403:'Accès refusé pour ce compte.',429:'Trop de tentatives. Réessayez plus tard.'})[status];
    const h=harness([json(challenge),json({error:message},status,'application/problem+json')]);
    await assert.rejects(h.sandbox.budgetsSignIn(email,password,false),error=>{
      safeError(error,status,'AUTH_HTTP_ERROR');assert.equal(error.message,message);return true;
    });
    assert.equal(h.calls.length,2);h.calls.forEach(requestContract);assert.equal(JSON.parse(h.calls[1].options.body).action,'verify');assert.equal(h.accepted.length,0);assert.equal(h.sandbox.portalSigninPending,null);
  });
}
test('HTML received during verify is not retried and does not commit a session',async()=>{
  const h=harness([json(challenge),new Response(html,{status:502,headers:{'Content-Type':'text/html'}})]);
  await assert.rejects(h.sandbox.budgetsSignIn(email,password),error=>safeError(error,502,'AUTH_RESPONSE_TYPE'));
  assert.equal(h.calls.length,2);assert.equal(h.accepted.length,0);assert.equal(h.stored.length,0);
});
for(const status of [200,502]){
  test(`Malformed JSON HTTP ${status} keeps status and never echoes its body`,async()=>{
    const h=harness([new Response('{"private":"synthetic-private-output",',{status,headers:{'Content-Type':'application/json'}})]);
    await assert.rejects(h.sandbox.budgetsSignIn(email,password,false),error=>safeError(error,status,'AUTH_RESPONSE_JSON'));
    assert.equal(h.calls.length,1);
  });
}
test('Missing or non-JSON content types and non-object payloads are rejected',async()=>{
  for(const type of [null,'text/plain','application/jsonp']){
    const h=harness([new Response('{}',{headers:type?{'Content-Type':type}:{}})]);
    await assert.rejects(h.sandbox.budgetsSignIn(email,password,false),error=>safeError(error,200,'AUTH_RESPONSE_TYPE'));
  }
  for(const body of [null,[],42,'synthetic-private-output']){
    const h=harness([json(body)]);
    await assert.rejects(h.sandbox.budgetsSignIn(email,password,false),error=>safeError(error,200,'AUTH_RESPONSE_SHAPE'));
  }
  const h=harness([json({error:html},403)]);
  await assert.rejects(h.sandbox.budgetsSignIn(email,password,false),error=>safeError(error,403,'AUTH_HTTP_ERROR'));
});
test('A connection or body-transfer failure retains its original error',async()=>{
  for(const stage of ['fetch','body']){
    const failure=new TypeError('Connexion interrompue pendant le transfert.');
    const response=stage==='fetch'?()=>{throw failure;}:{headers:new Headers({'Content-Type':'application/json'}),status:200,url:'https://app.cdinnov.eu/budgets/session',redirected:false,json:async()=>{throw failure;}};
    const h=harness([response]);await assert.rejects(h.sandbox.budgetsSignIn(email,password,false),error=>error===failure);assert.equal(h.calls.length,1);
  }
});
test('Successful JSON/+json challenge and HMAC verification commit metadata once',async()=>{
  const h=harness([json(challenge,200,'Application/JSON; charset=utf-8'),(_url,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.email,email);assert.equal(body.action,'verify');assert.equal(body.challenge,challenge.challenge);
    const key=pbkdf2Sync(password,Buffer.from(challenge.salt,'hex'),challenge.iter,32,'sha256');
    assert.equal(body.proof,createHmac('sha256',key).update(challenge.challenge).digest('hex'));
    return json({...session,token:'must-not-be-persisted'},200,'application/vnd.cdinnov.session+json');
  }]);
  const result=await h.sandbox.budgetsSignIn(' QA@EXAMPLE.INVALID ',password);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),session);assert.equal(h.calls.length,2);h.calls.forEach(requestContract);
  assert.deepEqual(h.stored,[email]);assert.equal(h.accepted.length,1);assert.equal(h.accepted[0].token,undefined);assert.equal(h.sandbox.portalSigninPending,null);
});
test('Reconnect identity HTML is reported safely with status; GET requests JSON without cache',async()=>{
  const h=harness([json(challenge),json(session),new Response(html,{status:200,headers:{'Content-Type':'text/html'}})]);
  await assert.rejects(h.sandbox.portalReconnect(email,password),error=>safeError(error,200,'AUTH_RESPONSE_TYPE'));
  assert.equal(h.calls.length,3);const get=h.calls[2];assert.equal(get.url,'/api/v1/session');assert.equal(get.options.cache,'no-store');assert.equal(get.options.credentials,'same-origin');assert.equal(new Headers(get.options.headers).get('Accept'),'application/json');assert.equal(h.sandbox.portalReconnecting,false);
});
test('Reconnect identity preserves JSON access errors and accepts valid identity data',async()=>{
  const denied=harness([json(challenge),json(session),json({error:'Accès retiré.'},403)]);
  await assert.rejects(denied.sandbox.portalReconnect(email,password),error=>{safeError(error,403,'AUTH_HTTP_ERROR');assert.equal(error.message,'Accès retiré.');return true;});
  const allowed=harness([json(challenge),json(session),json({email},200,'application/vnd.cdinnov.identity+json')]);
  assert.deepEqual(JSON.parse(JSON.stringify(await allowed.sandbox.portalReconnect(email,password))),session);assert.equal(allowed.calls.length,3);assert.equal(allowed.sandbox.portalReconnecting,false);
});
