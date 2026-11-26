import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {paymentFixtureTools} from './billing-payments-fixture.mjs';
import {billingToday} from './billing-quote-domain.ts';
import {assertBillingMailDocument} from './billing-mail-policy.ts';
import {sendMicrosoftMail} from './billing-microsoft-send.ts';

// Bundle the same helper used by the Worker; its native imports omit suffixes.
const bundle=await build({entryPoints:[fileURLToPath(new URL('./billing-delivery.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {billingEmail}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const reply=(status,value)=>Response.json(value,{status});
const ledger=id=>({id,recipient:'recipient@example.invalid',subject:'Document entièrement fictif',message:'Simulation locale, aucun message réel.'});

test('email dispatch rechecks current state atomically after private PDF reads',async t=>{
 const ctx=await testEnvironment({outboundService:()=>{throw Error('Unexpected outbound request in email state tests');}});
 const savedFetch=globalThis.fetch;
 try{
  await migrateBilling(ctx.db);const cookie=(await ctx.login(users[0])).cookie,f=await paymentFixtureTools(ctx,cookie),bucket=await ctx.worker.getR2Bucket('CET_FILES');
  let submissions=[];
  const provider=async(url,init)=>{assert.equal(String(url),'https://api.brevo.com/v3/smtp/email');submissions.push(JSON.parse(init.body));return Response.json({messageId:'fictitious-ack'},{status:201});};
  globalThis.fetch=provider;
  const send=(doc,input=ledger(randomUUID()),privateBucket=bucket)=>billingEmail(new Request('https://local.invalid/email',{method:'POST',headers:{'Content-Type':'application/json','If-Match':String(doc.version)},body:JSON.stringify(input)}),ctx.db,{BREVO_API_KEY:'fictitious-no-network',NOTIFY_FROM:'sender@example.invalid',CET_FILES:privateBucket},doc,users[0],reply);
  const read=async doc=>(await f.call('/documents/'+doc.id)).json();
  await t.test('trash, refusal and quote revision during R2 reads prevent every submission',async()=>{
   for(const mutation of ['trash','refused','revised']){
    submissions=[];const doc=mutation==='trash'?await f.create():await f.quoteCreate(),entered=deferred(),release=deferred(),input=ledger(randomUUID());
    const delayed={get:async key=>{entered.resolve();await release.promise;return bucket.get(key);},put:()=>{throw Error('Unexpected write');}};
    const pending=send(doc,input,delayed);await entered.promise;
    const response=mutation==='trash'?await f.call('/documents/'+doc.id,'DELETE',undefined,{'If-Match':String(doc.version)}):mutation==='refused'?
     await f.call('/documents/'+doc.id+'/quote-events','POST',{id:randomUUID(),documentVersion:doc.version,action:'refused',occurredOn:billingToday(),note:'Refus fictif concurrent'},{'If-Match':String(doc.quote.version)}):
     await f.call('/documents/'+doc.id+'/revise','POST',{id:randomUUID(),reason:'Révision fictive concurrente',familyVersion:doc.quote.revision.familyVersion},{'If-Match':String(doc.version)});
    assert.equal(response.status,mutation==='trash'?200:201,await response.clone().text());release.resolve();
    assert.equal((await pending).status,409);assert.equal(submissions.length,0);
    assert.equal(await ctx.db.prepare('SELECT id FROM billing_email_deliveries WHERE id=?').bind(input.id).first(),null);
   }
  });
  await t.test('simultaneous identical requests and later replay dispatch exactly once',async()=>{
   const doc=await f.create(),input=ledger(randomUUID()),entered=deferred(),release=deferred();submissions=[];
   globalThis.fetch=async(...args)=>{entered.resolve();await release.promise;return provider(...args);};
   const requests=[send(doc,input),send(doc,input)];await entered.promise;
   const pendingReplay=await Promise.race(requests);assert.equal(pendingReplay.status,200);assert.equal((await pendingReplay.json()).delivery.state,'sending');
   release.resolve();const responses=await Promise.all(requests);assert.ok(responses.every(r=>r.status===200));assert.equal(submissions.length,1);
   globalThis.fetch=provider;assert.equal((await send(doc,input)).status,200);assert.equal(submissions.length,1);
   assert.equal((await send(doc,{...input,message:'Different fictitious message'})).status,409);assert.equal(submissions.length,1);
  });
  await t.test('unknown and explicitly failed provider outcomes are replayed without resubmission',async()=>{
   const doc=await f.create();
   for(const state of ['unknown','failed']){
    let calls=0;globalThis.fetch=async url=>{assert.equal(String(url),'https://api.brevo.com/v3/smtp/email');calls++;return new Response(null,{status:state==='unknown'?503:403});};
    const input=ledger(randomUUID());assert.equal((await(await send(doc,input)).json()).delivery.state,state);
    assert.equal((await(await send(doc,input)).json()).delivery.state,state);assert.equal(calls,1);
   }
   globalThis.fetch=provider;
  });
  await t.test('missing, corrupted, mistyped or incomplete archived PDFs fail before dispatch and journal insertion',async()=>{
   const doc=await f.create();
   for(const fault of ['missing','bytes','type','size']){
    submissions=[];const input=ledger(randomUUID()),broken={get:async key=>{
     const value=await bucket.get(key);if(fault==='missing')return null;
     const bytes=new Uint8Array(await value.arrayBuffer());if(fault==='bytes')bytes[0]^=1;
     return {size:value.size+(fault==='size'?1:0),httpMetadata:{contentType:fault==='type'?'application/octet-stream':'application/pdf'},body:new Response(bytes).body};
    },put:()=>{throw Error('Unexpected write');}};
    await assert.rejects(()=>send(doc,input,broken),e=>e.status===503);assert.equal(submissions.length,0);
    assert.equal(await ctx.db.prepare('SELECT id FROM billing_email_deliveries WHERE id=?').bind(input.id).first(),null);
   }
  });
  await t.test('the current Outlook pre-send policy rejects refused, previous, abandoned, replaced and stale documents',async()=>{
   const doc=await f.quoteCreate();
   const refused=await f.call('/documents/'+doc.id+'/quote-events','POST',{id:randomUUID(),documentVersion:doc.version,action:'refused',occurredOn:billingToday(),note:'Refus fictif'},{'If-Match':String(doc.quote.version)});assert.equal(refused.status,201);
   const current=await read(doc),cases=[current,{...doc,version:doc.version+1},{...doc,rectification:{replacementId:randomUUID()}},
    {...doc,quote:{...doc.quote,revision:{...doc.quote.revision,currentId:randomUUID()}}},
    {...doc,quote:{...doc.quote,revision:{...doc.quote.revision,abandoned:true}}}];
   for(const record of cases){
    let draftPosts=0,dispatches=0;const fetcher=async(url,init={})=>{assert.equal(new URL(url).origin,'https://graph.microsoft.com');if(init.method==='POST')draftPosts++;if(String(url).endsWith('/send'))dispatches++;return Response.json({id:'fictitious-owner',mail:users[0],userPrincipalName:users[0]});};
    const data=new Map();
    await assert.rejects(()=>sendMicrosoftMail({token:'fictitious-only',email:users[0],documentId:doc.id+':'+doc.version,recipient:'recipient@example.invalid',subject:'Devis fictif',message:'Aucun envoi réel',attachments:[{filename:'Fictitious.pdf',blob:new Blob(['%PDF-1.7\nSynthetic'])}],currentEmail:async()=>users[0],confirmed:true,storage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},fetcher,beforeSend:async()=>assertBillingMailDocument(record,doc.version)}));
    assert.equal(draftPosts,0);assert.equal(dispatches,0);
   }
   assert.doesNotThrow(()=>assertBillingMailDocument(doc,doc.version));
  });
 }finally{globalThis.fetch=savedFetch;await ctx.worker.dispose();}
});
