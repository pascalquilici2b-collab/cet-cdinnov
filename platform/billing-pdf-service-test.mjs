import assert from 'node:assert/strict';
import {test} from 'node:test';
import {requestBillingPDF} from './billing-pdf-service.ts';

test('a hosting startup page wakes the renderer without allocating a document or changing its payload',async t=>{
 const calls=[],payload={document:{title:'Fictional document'}},key='fictional-private-machine-key';
 let awake=false;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  calls.push({url:String(url),...options});
  assert.equal(options.redirect,'manual');assert.equal(options.headers['X-API-Key'],key);
  if(new URL(url).pathname==='/api/health'){
   assert.equal(options.method,'GET');assert.equal(options.body,undefined);awake=true;
   return Response.json({ready:true});
  }
  assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),payload);
  return awake?Response.json({valid:true}):new Response('<html>Starting service</html>',{status:503,headers:{'Content-Type':'text/html'}});
 });
 const signal=AbortSignal.timeout(5000),response=await requestBillingPDF(new URL('https://renderer.test/api/billing/preflight-pdf'),key,payload,signal);
 assert.equal(response.status,200);
 assert.deepEqual(calls.map(c=>[new URL(c.url).pathname,c.method]),[['/api/billing/preflight-pdf','POST'],['/api/health','GET'],['/api/billing/preflight-pdf','POST']]);
 assert.ok(calls.every(c=>new URL(c.url).origin==='https://renderer.test'&&c.signal===signal));
 assert.equal(calls[0].body,calls[2].body);
});

test('a successful wake does not bypass document validation or follow redirects',async t=>{
 let posts=0,gets=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(options.redirect,'manual');
  if(options.method==='GET'){gets++;return new Response(null,{status:302,headers:{Location:'https://unrelated.test'}});}
  posts++;
  return posts===1?new Response('Starting',{status:503}):Response.json({detail:'Invalid fictional document'},{status:422});
 });
 const result=await requestBillingPDF(new URL('https://renderer.test/api/billing/preflight-pdf'),'fictional-key',{document:{}},AbortSignal.timeout(5000));
 assert.equal(result.status,422);assert.equal(posts,2);assert.equal(gets,1);
});

test('a gateway 429 page wakes the sleeping service and preserves the request',async t=>{
 let awake=false;const requests=[],payload={document:{title:'Fictional quote',references:{quoteNumber:'DEV-FICTITIOUS'}}};
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  requests.push({url:String(url),...options});
  if(options.method==='GET'){awake=true;return Response.json({ready:true});}
  return awake?new Response('%PDF-fixture',{headers:{'Content-Type':'application/pdf'}}):new Response('<html>Starting</html>',{status:429,headers:{'Content-Type':'text/html'}});
 });
 const url=new URL('https://renderer.test/api/billing/preview-pdf'),signal=AbortSignal.timeout(5000);
 const result=await requestBillingPDF(url,'synthetic-private-key',payload,signal);
 assert.equal(result.status,200);assert.equal(await result.text(),'%PDF-fixture');
 assert.deepEqual(requests.map(r=>r.method),['POST','GET','POST']);
 assert.equal(requests[0].body,requests[2].body);assert.deepEqual(JSON.parse(requests[2].body),payload);
 assert.ok(requests.every(r=>new URL(r.url).origin===url.origin&&r.redirect==='manual'&&r.signal===signal));
});

test('JSON application backpressure retries without a hosting wake',async t=>{
 const methods=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  methods.push(options.method);
  return methods.length===1?Response.json({detail:'Busy'},{status:429}):Response.json({valid:true});
 });
 const response=await requestBillingPDF(new URL('https://renderer.test/api/billing/preflight-pdf'),'synthetic-key',{document:{}},AbortSignal.timeout(5000));
 assert.equal(response.status,200);assert.deepEqual(methods,['POST','POST']);
});

test('a transient network failure can wake and retry the same read-only render',async t=>{
 const calls=[],payload={document:{title:'Synthetic invoice'}};
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  calls.push({url:String(url),...options});
  if(calls.length===1)throw new TypeError('Synthetic connection reset');
  return Response.json(options.method==='GET'?{ready:true}:{valid:true});
 });
 const response=await requestBillingPDF(new URL('https://renderer.test/api/billing/preflight-pdf'),'synthetic-key',payload,AbortSignal.timeout(5000));
 assert.equal(response.status,200);assert.deepEqual(calls.map(r=>r.method),['POST','GET','POST']);
 assert.equal(calls[0].body,calls[2].body);assert.deepEqual(JSON.parse(calls[2].body),payload);
});

test('a cancelled request stops before another render or wake',async t=>{
 const controller=new AbortController();let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;controller.abort();throw controller.signal.reason;});
 t.mock.method(console,'warn',()=>{});
 await assert.rejects(()=>requestBillingPDF(new URL('https://renderer.test/api/billing/preview-pdf'),'synthetic-key',{document:{}},controller.signal),error=>error===controller.signal.reason);
 assert.equal(calls,1);
});
