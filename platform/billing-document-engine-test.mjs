/** Metadata only: real authentication/Worker/D1, fictitious configuration,
 * and an outbound handler that rejects every unexpected network request. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {testEnvironment,users} from '../marches/test.mjs';

test('document engine metadata is authorized, strict, secret-free and read-only for every configuration',async()=>{
 const dir='.private/billing-document-engine-test';await mkdir(dir,{recursive:true});
 const compiled=(await build({entryPoints:['platform/worker.ts'],bundle:true,platform:'node',format:'esm',write:false})).outputFiles[0].text;
 const exported=compiled.match(/(\w+) as default/);assert.ok(exported);
 // Configuration overrides exist only in this local test wrapper, never in the
 // production route. One authenticated session can test all configuration cases.
 const script=compiled.replace(exported[0],'engine_test_wrapper as default').replace('export {',`const engine_test_wrapper={...${exported[1]},fetch(request,env,ctx){return ${exported[1]}.fetch(request,{...env,...JSON.parse(request.headers.get('X-Test-Engine-Config')||'{}')},ctx);}};\nexport {`);
 await writeFile(dir+'/worker.mjs',script);
 const previous=process.env.MARCHES_TEST_WORKER;process.env.MARCHES_TEST_WORKER=dir+'/worker.mjs';
 let outbound=0,ctx;
 try{
  ctx=await testEnvironment({outboundService:()=>{outbound++;throw new Error('External requests forbidden');}});
 }finally{if(previous===undefined)delete process.env.MARCHES_TEST_WORKER;else process.env.MARCHES_TEST_WORKER=previous;}
 try{
  const admin=await ctx.login(users[0]),reader=await ctx.login(users[1]);
  const key='SYNTHETIC-PRIVATE-MACHINE-KEY-NEVER-RETURN',valid={BILLING_PDF_SERVICE_URL:'https://fictional-engine.onrender.com',BILLING_PDF_SERVICE_KEY:key};
  const call=(config=valid,{method='GET',query='',headers={}}={})=>ctx.worker.dispatchFetch('https://local/api/v1/billing/document-engine'+query,{method,headers:{Cookie:admin.cookie,Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1','X-Test-Engine-Config':JSON.stringify(config),...headers}});
  const read=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
  const snapshot=async()=>{
   const tables=(await ctx.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results;
   return Object.fromEntries(await Promise.all(tables.map(async r=>[r.name,(await ctx.db.prepare('SELECT * FROM '+r.name+' ORDER BY rowid').all()).results])));
  };
  const before=await snapshot();
  for(const [cookie,status] of [['',401],['__Host-cdi_session=invalid',401],[reader.cookie,403]])await read(await call(valid,{headers:{Cookie:cookie}}),status);
  await read(await call(valid,{headers:{Origin:'https://evil.test'}}),403);
  await read(await call(valid,{headers:{'Sec-Fetch-Site':'cross-site'}}),403);
  for(const method of ['POST','PUT','DELETE','HEAD'])assert.equal((await call(valid,{method})).status,405);
  for(const query of ['?url=https://evil.test','?wakeUrl=https://127.0.0.1','?key=CLIENT-SUPPLIED'])await read(await call(valid,{query}),400);
  const response=await call();assert.deepEqual(await read(response),{wakeUrl:'https://fictional-engine.onrender.com/api/health'});
  assert.match(response.headers.get('Cache-Control'),/no-store/);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://app.cdinnov.eu');assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
  assert.deepEqual(await read(await call({...valid,BILLING_PDF_SERVICE_URL:'https://FICTIONAL-ENGINE.onrender.com/'})),{wakeUrl:'https://fictional-engine.onrender.com/api/health'});
  for(const base of ['https://pdf-fixture.test','https://localhost/','https://127.0.0.1','https://[::1]/','https://not-onrender.com','https://fictional.onrender.com.evil.test','https://onrender.com'])assert.deepEqual(await read(await call({...valid,BILLING_PDF_SERVICE_URL:base})),{wakeUrl:null});
  const invalidURLs=['','not-a-url','http://fictional.onrender.com','javascript:alert(1)','//fictional.onrender.com','https://private-user:private-password@fictional.onrender.com','https://fictional.onrender.com:443','https://fictional.onrender.com:8443','https://fictional.onrender.com/api/health','https://fictional.onrender.com/api/../','https://fictional.onrender.com?key=PRIVATE-URL-QUERY','https://fictional.onrender.com?','https://fictional.onrender.com#PRIVATE-FRAGMENT','https://fictional.onrender.com#','https://fictional..onrender.com','https://fictional.onrender.com.','https://fictional.onrender.com\\evil',' https://fictional.onrender.com'];
  for(const base of invalidURLs){const result=await read(await call({...valid,BILLING_PDF_SERVICE_URL:base}),503);assert.deepEqual(result,{error:'Le moteur documentaire doit être configuré par l’administrateur.'});assert.doesNotMatch(JSON.stringify(result),/PRIVATE|private-password|fictional|localhost/);}
  for(const invalidKey of [undefined,null,'','short',' '.repeat(40),' '+key,key+'\r\nInjected: value']){
   const result=await read(await call({...valid,BILLING_PDF_SERVICE_KEY:invalidKey}),503);assert.deepEqual(result,{error:'Le moteur documentaire doit être configuré par l’administrateur.'});assert.ok(!JSON.stringify(result).includes(key));
  }
  assert.deepEqual(await read(await call({}),503),{error:'Le moteur documentaire doit être configuré par l’administrateur.'});
  assert.deepEqual(await snapshot(),before);assert.equal(outbound,0);
  assert.equal((await ctx.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE 'billing_%'").first()).n,0,'Metadata never creates billing schema or reads a business document');
 }finally{await ctx.worker.dispose();}
});
