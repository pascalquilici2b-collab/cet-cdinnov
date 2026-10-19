import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {blankDraft} from './billing-domain.ts';

test('PDF brouillon : identité, version figée, clé privée et erreurs sans mutation',async t=>{
 const requests=[],key='synthetic-service-key-'.repeat(2);let mode='pdf';
 const ctx=await testEnvironment({bindings:{BILLING_PDF_SERVICE_URL:'https://pdf-service.test',BILLING_PDF_SERVICE_KEY:key},outboundService:async request=>{
  requests.push({url:request.url,headers:Object.fromEntries(request.headers),body:await request.json()});
  if(mode==='error')return Response.json({secret:'upstream-private',detail:'secret'}, {status:500});
  if(mode==='invalid')return new Response('wrong',{headers:{'Content-Type':'application/pdf'}});
  if(mode==='validation')return Response.json({detail:'private-input'}, {status:422});
  if(mode==='redirect')return new Response(null,{status:302,headers:{Location:'https://other.test'}});
  if(mode==='html')return new Response('<html>',{headers:{'Content-Type':'text/html'}});
  return new Response('%PDF-1.7\nsynthetic upstream fixture\n%%EOF',{headers:{'Content-Type':'application/pdf'}});
 }});
 try{
  await migrateBilling(ctx.db);const admin=await ctx.login(users[0]),consultant=await ctx.login(users[1]),id=randomUUID(),data=blankDraft('invoice');
  const headers={Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+admin.token,'Content-Type':'application/json'};
  const create=await ctx.worker.dispatchFetch('https://preview.example/api/v1/billing/documents',{method:'POST',headers,body:JSON.stringify({id,data})});assert.equal(create.status,201);
  const pdf=(version='1',overrides={},method='GET')=>ctx.worker.dispatchFetch('https://preview.example/api/v1/billing/documents/'+id+'/preview.pdf',{method,headers:{...headers,...(version===null?{}:{'If-Match':version}),...overrides}});
  for(const [token,status] of [['',401],['Bearer '+consultant.token,403]])assert.equal((await pdf('1',{Authorization:token})).status,status);
  assert.equal((await pdf('1',{Origin:'https://evil.test'})).status,403);
  assert.equal((await pdf(null)).status,428);assert.equal((await pdf('0')).status,400);assert.equal((await pdf('2')).status,409);assert.equal((await pdf('1',{},'POST')).status,405);assert.equal(requests.length,0);
  const response=await pdf();assert.equal(response.status,200,(await response.clone().text())+'; outbound requests: '+requests.length);assert.equal(response.headers.get('content-type'),'application/pdf');assert.equal(response.headers.get('access-control-allow-origin'),'https://app.cdinnov.eu');assert.equal(response.headers.get('cache-control'),'no-store');
  assert.match(response.headers.get('content-disposition'),new RegExp(id+'-v1\\.pdf'));assert.match(await response.text(),/^%PDF-/);
  assert.equal(requests[0].url,'https://pdf-service.test/api/billing/preview-pdf');assert.equal(requests[0].headers['x-api-key'],key);assert.equal(requests[0].headers.authorization,undefined);
  assert.deepEqual(requests[0].body,{document:data});
  for(const [value,status] of [['error',503],['validation',422],['invalid',502],['html',502],['redirect',503]]){
   mode=value;const result=await pdf();assert.equal(result.status,status,await result.clone().text());assert.doesNotMatch(await result.text(),/upstream-private|private-input|synthetic-service-key/);
  }
  assert.equal((await ctx.db.prepare('SELECT count(*) AS n FROM billing_document_versions WHERE document_id=?').bind(id).first()).n,1);
  assert.equal((await ctx.db.prepare('SELECT status FROM billing_documents WHERE id=?').bind(id).first()).status,'draft');
 }finally{await ctx.worker.dispose();}
});
