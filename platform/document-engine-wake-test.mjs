import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setImmediate} from 'node:timers/promises';
import {ensureDocumentEngine} from './client/document-engine-wake.ts';
import {createBillingTransport} from './client/billing-api.ts';
const origin='https://application.example.test',wakeUrl='https://fictional-engine.onrender.com/api/health';
globalThis.location=new URL(origin+'/billing');globalThis.window=new EventTarget();
const ensure=(sessionId,signal=new AbortController().signal)=>ensureDocumentEngine({baseUrl:origin,sessionId,signal});
const drain=()=>setImmediate();

test('metadata stays authenticated on the app; the public wake carries no session, secret, body or referrer',async t=>{
 for(const ready of [true,false]){
  const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url:String(url),...options});return calls.length===1?Response.json({wakeUrl}):Response.json({ready});});
  await ensure('public-'+ready);assert.equal(calls.length,2);
  assert.equal(calls[0].url,origin+'/api/v1/billing/document-engine');assert.equal(calls[0].credentials,'same-origin');assert.equal(calls[0].headers['X-CDInnov-Request'],'1');
  assert.equal(calls[1].url,wakeUrl);assert.equal(calls[1].method,'GET');assert.equal(calls[1].credentials,'omit');assert.equal(calls[1].cache,'no-store');assert.equal(calls[1].redirect,'error');assert.equal(calls[1].referrerPolicy,'no-referrer');assert.equal(calls[1].headers,undefined);assert.equal(calls[1].body,undefined);
  assert.ok(!JSON.stringify(calls.map(({signal,...c})=>c)).includes('public-'+ready));
 }
});
test('non-Render metadata skips direct wake and neither success nor config is cached',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({wakeUrl:null});});
 await ensure('none');await ensure('none');assert.equal(calls,2);
});
test('unsafe URLs and invalid metadata never cause an external fetch',async t=>{
 const invalid=['http://fictional-engine.onrender.com/api/health','https://onrender.com/api/health','https://.onrender.com/api/health','https://fictional-engine.onrender.com.evil.test/api/health','https://u:p@fictional-engine.onrender.com/api/health','https://fictional-engine.onrender.com:443/api/health','https://fictional-engine.onrender.com:8443/api/health',wakeUrl+'?a=1',wakeUrl+'#fragment',wakeUrl+'?',wakeUrl+'#',wakeUrl+'/',wakeUrl.replace('/api/health','/api/generate'),wakeUrl.replace('/api/health','/api%2fhealth'),' '+wakeUrl];
 for(const [i,value] of invalid.entries()){let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({wakeUrl:value});});await assert.rejects(ensure('invalid-'+i),e=>e.status===503);assert.equal(calls,1,value);}
 for(const value of [{},null,[],{wakeUrl:17}]){let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(value);});await assert.rejects(ensure('bad-meta-'+JSON.stringify(value)));assert.equal(calls,1);}
});
test('public failures and malformed health stop the operation; only metadata401 denotes the app session',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const [i,health] of [()=>new Response('challenge',{status:429}),()=>new Response('<html>',{headers:{'Content-Type':'text/html'}}),()=>Response.json({ready:'true'}),()=>Response.json({}),()=>Response.json({ready:true,padding:'x'.repeat(17000)}),()=>new Response(null,{status:401})].entries()){
  let calls=0;t.mock.method(globalThis,'fetch',async()=>++calls===1?Response.json({wakeUrl}):health());const rejected=assert.rejects(ensure('health-'+i),e=>e.status===503);for(const delay of [500,1500,3500,6500,10500,16000,20000,10000]){await drain();t.mock.timers.tick(delay);}await rejected;assert.equal(calls,i===5?2:10);
 }
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({error:'private fixture'},{status:401});});await assert.rejects(ensure('meta401'),e=>e.status===401);assert.equal(calls,1);
});
test('concurrent callers share a wake; cancelling one does not cancel another and readiness is not retained',async t=>{
 const a=new AbortController(),b=new AbortController();let resolveHealth,healthSignal,metadata=0,health=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{if(String(url).startsWith(origin)){metadata++;return Response.json({wakeUrl});}health++;healthSignal=options.signal;return new Promise(resolve=>{resolveHealth=resolve;});});
 const first=ensure('shared',a.signal),firstRejected=assert.rejects(first,e=>e.name==='AbortError'),second=ensure('shared',b.signal);await drain();assert.equal(metadata,1);assert.equal(health,1);a.abort();await firstRejected;assert.equal(healthSignal.aborted,false);resolveHealth(Response.json({ready:false}));await second;
 const third=ensure('shared');await drain();assert.equal(metadata,2);assert.equal(health,2);resolveHealth(Response.json({ready:true}));await third;
});
test('all cancelled subscribers release the flight; a late old completion does not remove its replacement',async t=>{
 const a=new AbortController();let metadata=0;const pending=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>String(url).startsWith(origin)?(metadata++,Response.json({wakeUrl})):new Promise(resolve=>pending.push({resolve,signal:options.signal})));
 const first=ensure('replace',a.signal),rejected=assert.rejects(first,e=>e.name==='AbortError');await drain();a.abort();await rejected;assert.equal(pending[0].signal.aborted,true);
 const second=ensure('replace');await drain();assert.equal(metadata,2);pending[0].resolve(Response.json({ready:true}));await drain();const third=ensure('replace');await drain();assert.equal(metadata,2);pending[1].resolve(Response.json({ready:true}));await Promise.all([second,third]);
});
test('sessionB cannot inherit a delayed metadata401 from sessionA',async t=>{
 let oldMetadata,calls=0;t.mock.method(globalThis,'fetch',async url=>{if(String(url)===wakeUrl)return Response.json({ready:true});calls++;return calls===1?new Promise(resolve=>{oldMetadata=resolve;}):Response.json({wakeUrl});});
 const old=ensure('session-A'),rejected=assert.rejects(old,e=>e.status===401);await drain();await ensure('session-B');oldMetadata(Response.json({error:'old session'},{status:401}));await rejected;assert.equal(calls,2);
});
test('the complete wake deadline aborts at75 seconds',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let healthSignal;
 t.mock.method(globalThis,'fetch',async(url,options)=>String(url).startsWith(origin)?Response.json({wakeUrl}):new Promise((resolve,reject)=>{healthSignal=options.signal;options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});}));
 const operation=ensure('deadline'),rejected=assert.rejects(operation,e=>e.name==='TimeoutError');await drain();assert.ok(healthSignal);t.mock.timers.tick(75000);await rejected;assert.equal(healthSignal.aborted,true);
});
test('transport gates renderer routes but keeps R2 downloads and ordinary writes independent',async t=>{
 const events=[];let ready=false;
 t.mock.method(globalThis,'fetch',async(url,options)=>{url=String(url);events.push({url,...options});if(url.endsWith('/document-engine')){ready=false;return Response.json({wakeUrl});}if(url===wakeUrl){ready=true;return Response.json({ready:true});}if(/(?:preview\.pdf|\/issue|\/finalize|intervention-report\.pdf)$/.test(url))assert.equal(ready,true);return options.method==='PUT'?Response.json({data:{kind:'invoice',seller:{siren:'',siret:''}}}):/\.pdf$|\/files\/pdf$/.test(url)?new Response('%PDF-fixture',{headers:{'Content-Type':'application/pdf'}}):Response.json({});});
 const transport=createBillingTransport({baseUrl:origin,getSession:async()=>'transport',isActive:()=>true});
 await transport.previewDraft({},'document');await transport.previewPDF('document',1);await transport.issue('document',1,'attempt','automatic');await transport.finalize('document',1);await transport.reportPDF('document');await transport.previewReport('document',{});assert.equal(events.filter(e=>e.url.endsWith('/document-engine')).length,6);
 const before=events.length;await transport.issuedFile('document','pdf');await transport.save('document',1,{});await transport.report('document');assert.equal(events.length,before+3);transport.dispose();
});
test('dispose, session replacement and metadata401 block private calls with the existing expiry identity',async t=>{
 let healthResolve,privateCalls=0;const expired=[];const onExpired=e=>expired.push(e.detail.sessionId);window.addEventListener('cdinnov-session-expired',onExpired);t.after(()=>window.removeEventListener('cdinnov-session-expired',onExpired));
 t.mock.method(globalThis,'fetch',async url=>{if(String(url).endsWith('/document-engine'))return Response.json({wakeUrl});if(String(url)===wakeUrl)return new Promise(resolve=>{healthResolve=resolve;});privateCalls++;return Response.json({});});
 let session='original';const transport=createBillingTransport({baseUrl:origin,getSession:async()=>session,isActive:()=>true});const operation=transport.finalize('document',1),rejected=assert.rejects(operation,/session ou la page/);await drain();session='replacement';healthResolve(Response.json({ready:true}));await rejected;assert.equal(privateCalls,0);transport.dispose();
 const disposed=createBillingTransport({baseUrl:origin,getSession:async()=>'dispose',isActive:()=>true}),work=disposed.finalize('document',1),cancelled=assert.rejects(work,/session ou la page/);await drain();disposed.dispose();await cancelled;healthResolve(Response.json({ready:true}));assert.equal(privateCalls,0);
 t.mock.method(globalThis,'fetch',async()=>Response.json({error:'expired'},{status:401}));const old=createBillingTransport({baseUrl:origin,getSession:async()=>'expired-A',isActive:()=>true});await assert.rejects(old.finalize('document',1),e=>e.status===401);assert.deepEqual(expired,['expired-A']);old.dispose();
});

test('the renderer HTTP budget starts after the browser wake completes',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let wakeResolve,privateSignal;
 t.mock.method(globalThis,'fetch',async(url,options)=>{if(String(url).endsWith('/document-engine'))return Response.json({wakeUrl});if(String(url)===wakeUrl)return new Promise(resolve=>{wakeResolve=resolve;});privateSignal=options.signal;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));});
 const transport=createBillingTransport({baseUrl:origin,getSession:async()=>'separate-budgets',isActive:()=>true}),operation=transport.previewDraft({},'document'),rejected=assert.rejects(operation,e=>e.name==='TimeoutError');await drain();t.mock.timers.tick(60000);wakeResolve(Response.json({ready:true}));await drain();assert.ok(privateSignal);assert.equal(privateSignal.aborted,false);t.mock.timers.tick(89999);assert.equal(privateSignal.aborted,false);t.mock.timers.tick(1);await rejected;assert.equal(privateSignal.aborted,true);transport.dispose();
});

test('public startup HTML and CORS errors poll until JSON is available, respecting cancellation',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let health=0;
 t.mock.method(globalThis,'fetch',async url=>{if(String(url).startsWith(origin))return Response.json({wakeUrl});health++;if(health===1)return new Response('Starting',{headers:{'Content-Type':'text/html'}});if(health===2)throw new TypeError('Synthetic CORS startup response');return Response.json({ready:false});});
 const pending=ensure('startup-pages');await drain();t.mock.timers.tick(500);await drain();t.mock.timers.tick(1500);await pending;assert.equal(health,3);
 const controller=new AbortController();health=0;const cancelled=assert.rejects(ensure('cancel-poll',controller.signal),e=>e.name==='AbortError');await drain();controller.abort();await cancelled;t.mock.timers.tick(75000);assert.equal(health,1);
});

test('public polling respects accessible Retry-After delta seconds and HTTP dates',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-11-27T07:00:00Z')});
 for(const [name,header,delay] of [['delta',()=> '2',2000],['date',()=>new Date(Date.now()+4000).toUTCString(),4000]]){
  let health=0;t.mock.method(globalThis,'fetch',async url=>{if(String(url).startsWith(origin))return Response.json({wakeUrl});health++;return health===1?new Response('Starting',{status:503,headers:{'Retry-After':header()}}):Response.json({ready:true});});
  const operation=ensure('retry-after-'+name);await drain();assert.equal(health,1);t.mock.timers.tick(delay-1);await drain();assert.equal(health,1);t.mock.timers.tick(1);await operation;assert.equal(health,2);
 }
});
