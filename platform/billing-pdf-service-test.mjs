/** No network: fetch is mocked. Only retry intervals/GET timeout are shortened
 * in the imported source so bounded polling can be exercised in milliseconds.
 * Retry-After and the caller's AbortSignal retain their actual semantics.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformSync} from 'esbuild';
import {test} from 'node:test';
const source=await readFile(new URL('./billing-pdf-service.ts',import.meta.url),'utf8');
assert.match(source,/const healthTimeoutMs = 15000;/);
const accelerated=source.replace(/const retryDelays = \[[^\]]+\];/,'const retryDelays = [2,2,2,2,2,2,2,2];').replace('const healthTimeoutMs = 15000;','const healthTimeoutMs = 30;');
const {requestBillingPDF}=await import('data:text/javascript;base64,'+Buffer.from(transformSync(accelerated,{loader:'ts',format:'esm'}).code).toString('base64'));
const url=new URL('https://fictitious-engine.onrender.com/api/billing/preflight-pdf'),customURL=new URL('https://renderer.test/api/billing/preview-pdf');
const key='synthetic-private-key-never-log',payload={document:{title:'FICTITIOUS-DOCUMENT-NEVER-LOG'}};
function fixture(t,responses){
 const calls=[],logs=[];
 t.mock.method(console,'warn',value=>logs.push(value));t.mock.method(console,'info',value=>logs.push(value));
 t.mock.method(globalThis,'fetch',async(target,options)=>{
  calls.push({url:String(target),...options});assert.equal(options.redirect,'manual');
  if(options.method==='GET'){assert.equal(new URL(target).pathname,'/api/health');assert.equal(options.body,undefined);assert.equal(new Headers(options.headers).get('X-API-Key'),null);assert.equal(new Headers(options.headers).get('Authorization'),null);}
  else{assert.equal(new Headers(options.headers).get('X-API-Key'),key);assert.deepEqual(JSON.parse(options.body),payload);}
  return responses(target,options,calls.length);
 });
 return {calls,logs};
}
const ready=()=>Response.json({ready:true});
const asleep=(status=429,headers={})=>new Response('<html>Starting host</html>',{status,headers:{'Content-Type':'text/html',...headers}});

test('Render wakes with repeated public GETs before the first document POST',async t=>{
 let gets=0;
 const {calls,logs}=fixture(t,(_,options)=>options.method==='GET'?(++gets===1?asleep(429):gets===2?asleep(503):ready()):Response.json({valid:true}));
 assert.equal((await requestBillingPDF(url,key,payload,AbortSignal.timeout(1000))).status,200);
 assert.deepEqual(calls.map(c=>c.method),['GET','GET','GET','POST']);
 assert.ok(calls.every(c=>new URL(c.url).origin===url.origin));
 assert.deepEqual(logs.map(v=>JSON.parse(v).status),[429,503,200]);
 assert.ok(logs.every(v=>!v.includes(key)&&!v.includes(payload.document.title)&&!v.includes('Starting host')));
});

test('a hosting page after POST waits for confirmed FastAPI health before resending the exact payload',async t=>{
 let posts=0,gets=0;
 const {calls}=fixture(t,(_,options)=>options.method==='POST'?(++posts===1?asleep():new Response('%PDF-fixture',{headers:{'Content-Type':'application/pdf'}})):(++gets===1?asleep(503):gets===2?asleep():ready()));
 const result=await requestBillingPDF(customURL,key,payload,AbortSignal.timeout(1000));
 assert.equal(await result.text(),'%PDF-fixture');assert.deepEqual(calls.map(c=>c.method),['POST','GET','GET','GET','POST']);
 assert.equal(calls[0].body,calls.at(-1).body);assert.ok(calls.every(c=>new URL(c.url).origin===customURL.origin));
});

test('ready=false still permits ordinary PDF business validation and generation',async t=>{
 const {calls}=fixture(t,(_,options)=>options.method==='GET'?Response.json({ready:false,tools:{ghostscript:false,verapdf:false}}):new Response('%PDF-simple'));
 assert.equal(await(await requestBillingPDF(url,key,payload,AbortSignal.timeout(1000))).text(),'%PDF-simple');assert.deepEqual(calls.map(c=>c.method),['GET','POST']);
});

test('health must contain a JSON boolean, not a gateway200/202, string or malformed JSON',async t=>{
 const statuses=[asleep(200),asleep(202),Response.json({ready:'true'}),new Response('{',{headers:{'Content-Type':'application/json'}}),Response.json({other:true}),ready()];
 const {calls}=fixture(t,(_,options)=>options.method==='GET'?statuses.shift():Response.json({valid:true}));
 assert.equal((await requestBillingPDF(url,key,payload,AbortSignal.timeout(1000))).status,200);assert.deepEqual(calls.map(c=>c.method),['GET','GET','GET','GET','GET','GET','POST']);
});

test('health redirects or authentication refusals stop without sending secrets or a document',async t=>{
 for(const status of [302,401,403]){
  const {calls}=fixture(t,()=>new Response(null,{status,headers:{Location:'https://unrelated.test/private'}}));
  assert.equal((await requestBillingPDF(url,key,payload,AbortSignal.timeout(1000))).status,status);assert.equal(calls.length,1);assert.equal(calls[0].method,'GET');assert.equal(new URL(calls[0].url).origin,url.origin);
 }
});

test('POST authentication, validation, internal failures and redirects are logged without retries or body disclosure',async t=>{
 for(const status of [401,403,422,500,302]){
  const {calls,logs}=fixture(t,()=>Response.json({detail:'PRIVATE-UPSTREAM-BODY'},{status,headers:{Location:'https://unrelated.test'}}));
  assert.equal((await requestBillingPDF(customURL,key,payload,AbortSignal.timeout(1000))).status,status);assert.equal(calls.length,1);
  assert.deepEqual(logs.map(v=>({phase:JSON.parse(v).phase,status:JSON.parse(v).status})),[{phase:'post',status}]);assert.ok(logs.every(v=>!v.includes('PRIVATE-UPSTREAM-BODY')&&!v.includes(key)&&!v.includes(payload.document.title)));
 }
});

test('JSON application backpressure retries POST without an unnecessary health wake',async t=>{
 const {calls}=fixture(t,(_,__,attempt)=>attempt===1?Response.json({detail:'Busy'},{status:429}):Response.json({valid:true}));
 assert.equal((await requestBillingPDF(customURL,key,payload,AbortSignal.timeout(1000))).status,200);assert.deepEqual(calls.map(c=>c.method),['POST','POST']);assert.equal(calls[0].body,calls[1].body);
});

test('a transient POST network error and timed-out GET recover through public readiness polling',async t=>{
 let gets=0,posts=0;
 const {calls}=fixture(t,(_,options)=>{
  if(options.method==='POST'){if(++posts===1)throw new TypeError('Fictitious connection reset');return Response.json({valid:true});}
  if(++gets===1)return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
  return ready();
 });
 assert.equal((await requestBillingPDF(customURL,key,payload,AbortSignal.timeout(1000))).status,200);assert.deepEqual(calls.map(c=>c.method),['POST','GET','GET','POST']);assert.equal(calls[0].body,calls.at(-1).body);
});

test('unavailable health polling is bounded to nine GETs and sends no POST',async t=>{
 const {calls}=fixture(t,()=>asleep(503));assert.equal((await requestBillingPDF(url,key,payload,AbortSignal.timeout(1000))).status,503);assert.equal(calls.length,9);assert.ok(calls.every(c=>c.method==='GET'));
});

test('Retry-After seconds or HTTP dates and the global abort also govern health attempts',async t=>{
 for(const retryAfter of ['10',new Date(Date.now()+10000).toUTCString()]){
  const {calls}=fixture(t,()=>asleep(429,{'Retry-After':retryAfter})),signal=AbortSignal.timeout(40);
  await assert.rejects(()=>requestBillingPDF(url,key,payload,signal),error=>error===signal.reason);assert.equal(calls.length,1);assert.equal(calls[0].method,'GET');
 }
});

test('Retry-After on a POST hosting page applies before the next health GET',async t=>{
 const {calls}=fixture(t,()=>asleep(429,{'Retry-After':'10'})),signal=AbortSignal.timeout(40);
 await assert.rejects(()=>requestBillingPDF(customURL,key,payload,signal),error=>error===signal.reason);assert.equal(calls.length,1);assert.equal(calls[0].method,'POST');
});

test('global cancellation aborts the current health fetch and prevents any further render',async t=>{
 const controller=new AbortController();let cancelled=false;
 const {calls}=fixture(t,(_,options)=>new Promise((_,reject)=>{options.signal.addEventListener('abort',()=>{cancelled=true;reject(options.signal.reason);},{once:true});setTimeout(()=>controller.abort(new Error('Fictitious caller cancellation')),5);}));
 await assert.rejects(()=>requestBillingPDF(url,key,payload,controller.signal),error=>error===controller.signal.reason);assert.equal(calls.length,1);assert.equal(cancelled,true);
});

test('an already cancelled caller makes no request',async t=>{
 const {calls}=fixture(t,ready),controller=new AbortController();controller.abort();
 await assert.rejects(()=>requestBillingPDF(url,key,payload,controller.signal),error=>error===controller.signal.reason);assert.equal(calls.length,0);
});

test('discarding a gateway body whose cancel never settles cannot suspend readiness recovery',async t=>{
 for(const target of [url,customURL]){
  const body=new ReadableStream({cancel:()=>new Promise(()=>{})});let first=true;
  const {calls}=fixture(t,(_,options)=>{if(first){first=false;return new Response(body,{status:503,headers:{'Content-Type':'text/html'}});}return options.method==='GET'?ready():Response.json({valid:true});});
  assert.equal((await requestBillingPDF(target,key,payload,AbortSignal.timeout(500))).status,200);
  assert.deepEqual(calls.map(c=>c.method),target===url?['GET','GET','POST']:['POST','GET','POST']);
 }
});

test('global cancellation during a POST propagates unchanged and never starts a wake or another POST',async t=>{
 const controller=new AbortController();
 const {calls}=fixture(t,(_,options)=>new Promise((_,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});setTimeout(()=>controller.abort(new Error('Fictitious render cancellation')),5);}));
 await assert.rejects(()=>requestBillingPDF(customURL,key,payload,controller.signal),error=>error===controller.signal.reason);assert.equal(calls.length,1);assert.equal(calls[0].method,'POST');assert.equal(calls[0].signal,controller.signal);
});
