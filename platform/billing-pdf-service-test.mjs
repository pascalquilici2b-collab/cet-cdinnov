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
