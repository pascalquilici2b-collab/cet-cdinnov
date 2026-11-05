import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './frontend-worker.mjs';
test('Every HTML entry receives effective HTTP protection and keeps same-origin frames',async()=>{
 for(const path of ['/','/feuilles/','/budgets-projets/','/platform/outlook-callback.html']){
  const response=await worker.fetch(new Request('https://app.cdinnov.eu'+path),{ASSETS:{fetch:async()=>new Response('<!doctype html>',{headers:{'Content-Type':'text/html'}})}});
  assert.equal(response.status,200);assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'self'/);
  assert.equal(response.headers.get('X-Frame-Options'),'SAMEORIGIN');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');assert.equal(response.headers.get('Cache-Control'),'no-cache');
  assert.equal(response.headers.get('Strict-Transport-Security'),'max-age=31536000');
 }
});
test('Static assets never receive credentials and PDF worker keeps its own runtime policy',async()=>{
 const response=await worker.fetch(new Request('https://app.cdinnov.eu/marches/vendor/pdf.worker.mjs',{headers:{Cookie:'private=1',Authorization:'Bearer private'}}),{ASSETS:{fetch:async request=>{assert.equal(request.headers.get('Cookie'),null);assert.equal(request.headers.get('Authorization'),null);return new Response('export const x=1',{headers:{'Content-Type':'application/javascript'}});}}});
 assert.equal(response.headers.get('Content-Security-Policy'),null);
});
test('API binding retains origin, anti-CSRF headers and HttpOnly Set-Cookie without caching',async()=>{
 for(const path of ['/api/v1/session','/budgets/session','/sheets/state','/files/item','/notify']){
  const request=new Request('https://app.cdinnov.eu'+path,{method:'POST',headers:{Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1',Cookie:'__Host-cdi_session=example'},body:'{}'});
  const response=await worker.fetch(request,{CET_API:{fetch:async req=>{assert.equal(req.url,request.url);assert.equal(req.headers.get('Cookie'),'__Host-cdi_session=example');assert.equal(req.headers.get('X-CDInnov-Request'),'1');return new Response('{}',{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':'__Host-cdi_session=new; Secure; HttpOnly; SameSite=Strict; Path=/'}});}}});
  assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('Set-Cookie'),/HttpOnly/);
 }
});
test('Missing service fails closed and non-API mutations cannot reach public assets',async()=>{
 assert.equal((await worker.fetch(new Request('https://app.cdinnov.eu/api/v1/session'),{})).status,503);
 assert.equal((await worker.fetch(new Request('https://app.cdinnov.eu/index.html',{method:'POST'}),{})).status,405);
});
