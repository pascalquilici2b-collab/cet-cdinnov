import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';

delete process.env.MARCHES_TEST_WORKER;
process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const machineKey='synthetic-machine-key-'.repeat(3),upstream=[];
let mode='json',checks=0;
const ctx=await testEnvironment({bindings:{BILLING_PDF_SERVICE_URL:'https://converter.invalid',BILLING_PDF_SERVICE_KEY:machineKey},outboundService:async request=>{
  upstream.push({url:request.url,method:request.method,headers:Object.fromEntries(request.headers),body:await request.text()});
  if(mode==='redirect')return new Response(null,{status:302,headers:{Location:'https://untrusted.invalid'}});
  if(mode==='large')return new Response('large',{headers:{'Content-Length':String(64*1024*1024+1)}});
  if(mode==='stream')return new Response('{"completed":1}\n{"valid":true}\n',{headers:{'Content-Type':'application/x-ndjson'}});
  return Response.json({ready:true,valid:true},{headers:{'Set-Cookie':'do-not-forward=synthetic','Authorization':'do-not-forward','Access-Control-Allow-Origin':'*','Location':'https://untrusted.invalid'}});
}});
const call=(session,path='/api/v1/session',method='GET',body,extra={})=>ctx.worker.dispatchFetch('https://app.cdinnov.eu'+path,{method,headers:{Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1',...(session?{Cookie:session.cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...extra},...(body===undefined?{}:{body})});
const check=async(name,fn)=>{await fn();checks++;console.log('OK '+name);};
const publicClaims=cookie=>JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[0],'base64url').toString());
const signed=claims=>{const body=Buffer.from(JSON.stringify(claims)).toString('base64url');return '__Host-cdi_session='+body+'.'+createHmac('sha256',ctx.sessionSecret).update(body).digest('base64url');};
try{
  let admin=await ctx.login(users[0]),staff=await ctx.login(users[1]);
  await check('Public metadata cannot authenticate; all bearer-only requests fail',async()=>{
    assert.deepEqual(Object.keys(admin).sort(),['cookie','email','expiresAt','sessionId']);
    for(const token of [admin.cookie.split('=')[1],admin.sessionId])assert.equal((await call(null,undefined,'GET',undefined,{Authorization:'Bearer '+token})).status,401);
    assert.equal((await call({cookie:'__Host-cdi_session='+admin.sessionId})).status,401);
    assert.equal((await call({cookie:signed({...publicClaims(admin.cookie),aud:'cdinnov-budgets'})})).status,401);
    const response=await call(admin);assert.equal(response.status,200);assert.equal((await response.json()).sessionId,admin.sessionId);
  });
  await check('State changes require allowed Origin and custom request header',async()=>{
    for(const headers of [{Origin:''},{Origin:'null'},{Origin:'https://other.invalid'},{'X-CDInnov-Request':''},{'X-CDInnov-Request':'0'},{'Sec-Fetch-Site':'cross-site'}]){
      const response=await call(admin,undefined,'DELETE',undefined,headers);assert.equal(response.status,403);assert.equal(response.headers.has('set-cookie'),false);
    }
    assert.equal((await call(admin)).status,200,'Rejected forgery did not revoke the valid session');
    for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await call(admin,'/api/v1/portal',method,'{}',{'X-CDInnov-Request':''})).status,403);
  });
  await check('Logout immediately revokes the cookie across portal and compatibility routes',async()=>{
    const response=await call(admin,undefined,'DELETE');assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
    for(const path of ['/api/v1/session','/budgets/session','/api/v1/portal','/api/v1/billing/context','/api/v1/dashboard','/budgets/workspace','/budgets/markets','/budgets/agenda','/sheets/session','/sheets/state','/api/v1/facturx/health'])assert.equal((await call(admin,path)).status,401,path);
    assert.equal((await call(admin,undefined,'DELETE')).status,200);
    admin=await ctx.login(users[0]);
    const expired={cookie:signed({...publicClaims(admin.cookie),exp:Date.now()-1})};
    const expiredLogout=await call(expired,undefined,'DELETE');assert.equal(expiredLogout.status,200);assert.match(expiredLogout.headers.get('set-cookie'),/Max-Age=0/);
  });
  await check('Replacement login revokes the prior cookie and preserves only the new identity',async()=>{
    const c=await(await call(null,undefined,'POST',JSON.stringify({email:users[1],action:'challenge'}))).json();
    const proof=createHmac('sha256',Buffer.from(ctx.accounts[users[1]].hash,'hex')).update(c.challenge).digest('hex');
    const response=await call(admin,undefined,'POST',JSON.stringify({email:users[1],action:'verify',challenge:c.challenge,proof}));assert.equal(response.status,200);
    const metadata=await response.json();assert.equal(metadata.email,users[1]);assert.equal(metadata.token,undefined);
    assert.equal((await call(admin)).status,401);staff={...metadata,cookie:response.headers.get('set-cookie').split(';')[0]};admin=await ctx.login(users[0]);
  });
  await check('Live module and administrator permissions apply to existing cookies',async()=>{
    const original={auth:{accounts:ctx.accounts,allowed:users}};
    assert.equal((await call(staff,'/api/v1/facturx/health')).status,403);
    await ctx.setPortal(JSON.stringify({auth:{allowed:users,accounts:{...ctx.accounts,[users[0]]:{...ctx.accounts[users[0]],role:'collaborator',access:{facturier:false}},[users[1]]:{...ctx.accounts[users[1]],access:{facturier:true}}}}}));
    const changed=await(await call(admin)).json();assert.equal(changed.admin,false);assert.equal(changed.access.facturier,false);
    assert.equal((await call(admin,'/api/v1/facturx/health')).status,403);
    assert.equal((await call(staff,'/api/v1/facturx/health')).status,200);
    assert.equal((await call(admin,'/api/v1/portal/invite','POST',JSON.stringify({email:'test@example.invalid'}))).status,403);
    await ctx.setPortal(JSON.stringify(original));
  });
  await check('Factur-X authenticates centrally and exposes no machine credentials',async()=>{
    const before=upstream.length;
    assert.equal((await call(null,'/api/v1/facturx/health')).status,401);
    assert.equal((await call(staff,'/api/v1/facturx/health')).status,403);assert.equal(upstream.length,before);
    const response=await call(admin,'/api/v1/facturx/health','GET',undefined,{Authorization:'Bearer browser-forgery','X-API-Key':'browser-forgery'});
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{ready:true,valid:true});
    const forwarded=upstream.at(-1);assert.equal(forwarded.url,'https://converter.invalid/api/health');assert.equal(forwarded.headers['x-api-key'],machineKey);
    for(const name of ['cookie','authorization','origin'])assert.equal(forwarded.headers[name],undefined);
    for(const name of ['set-cookie','authorization','location'])assert.equal(response.headers.has(name),false);
    assert.equal(response.headers.get('access-control-allow-origin'),'https://app.cdinnov.eu');
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  });
  await check('Proxy allowlist excludes issuance, stamping, auth, unknown parameters and oversized bodies',async()=>{
    const before=upstream.length;
    for(const path of ['/billing/generate-issued','/stamping/process','/auth/login','/static/app.js','/unknown'])assert.equal((await call(admin,'/api/v1/facturx'+path,'POST','{}')).status,404,path);
    assert.equal((await call(admin,'/api/v1/facturx/health','POST','{}')).status,405);
    for(const path of ['/health?target=https://untrusted.invalid','/invoices/preview-pdf?page=-1','/invoices/preview-pdf?page=0&page=1','/facturx/generate?output=unexpected'])assert.equal((await call(admin,'/api/v1/facturx'+path,path.startsWith('/health')?'GET':'POST',path.startsWith('/health')?undefined:'{}')).status,400,path);
    assert.equal((await call(admin,'/api/v1/facturx/recipients/search','POST','{}',{'Content-Type':'text/plain'})).status,415);
    assert.equal((await call(admin,'/api/v1/facturx/recipients/search','POST','x'.repeat(16385))).status,413);
    assert.equal(upstream.length,before);
  });
  await check('Proxy preserves conversion streams and rejects redirects and oversized responses',async()=>{
    mode='stream';const boundary='test-boundary';
    const response=await call(admin,'/api/v1/facturx/facturx/generate?output=stream','POST','--'+boundary+'--',{'Content-Type':'multipart/form-data; boundary='+boundary});
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/x-ndjson');assert.equal(await response.text(),'{"completed":1}\n{"valid":true}\n');
    assert.equal(upstream.at(-1).url,'https://converter.invalid/api/facturx/generate?output=stream');
    mode='redirect';assert.equal((await call(admin,'/api/v1/facturx/health')).status,502);
    mode='large';assert.equal((await call(admin,'/api/v1/facturx/health')).status,502);
  });
  console.log(checks+' cookie/CSRF/convergence scenarios passed; temporary D1 and synthetic local service only.');
}finally{await ctx.worker.dispose();}
