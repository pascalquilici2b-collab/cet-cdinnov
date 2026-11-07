import{test}from'node:test';import assert from'node:assert/strict';import{createOcrPageClient}from'./ocr-page-client.mjs';
test('visual page client uses same-origin session, bounds lifetime and preserves authorization failures',async()=>{
 const original=globalThis.fetch;let unauthorized=0,calls=0,active=true;
 const client=createOcrPageClient({getSession:async()=>({sessionId:'synthetic-cookie-session'}),isActive:()=>active,onUnauthorized:session=>{assert.equal(session.sessionId,'synthetic-cookie-session');unauthorized++;}});
 const input={image:'data:image/jpeg;base64,ZmFrZQ==',page:1,width:100,height:100,embeddedText:'Données fictives'};
 try{
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'/api/v1/ai/ocr-page');assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.equal(options.headers['X-CDInnov-Request'],'1');assert.equal(options.headers.Authorization,undefined);assert.deepEqual(JSON.parse(options.body),input);assert.ok(options.signal);return Response.json({text:'Texte lu',complete:true,warnings:[]});};
  assert.equal((await client(input)).complete,true);
  globalThis.fetch=async()=>{calls++;return Response.json({error:'Session expirée'},{status:401});};await assert.rejects(()=>client(input),error=>error.status===401);assert.equal(unauthorized,1);
  active=false;await assert.rejects(()=>client(input),error=>error.name==='AbortError');assert.equal(calls,2);
  active=true;globalThis.fetch=async()=>{active=false;return Response.json({text:'Réponse périmée',complete:true,warnings:[]});};await assert.rejects(()=>client(input),error=>error.name==='AbortError');
 }finally{globalThis.fetch=original;}
});
