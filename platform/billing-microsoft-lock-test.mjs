import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sendMicrosoftMail,MicrosoftMailContentConflict} from './billing-microsoft-send.ts';
import {sendMicrosoftTestMail} from './billing-microsoft-send-testmail.ts';

function fixture(pilot=false){
 const values=new Map(),messages=new Map(),calls=[];let sequence=0,mode='sent';
 const fetcher=async(url,init={})=>{
  const u=new URL(url);assert.equal(u.origin,'https://graph.microsoft.com');calls.push({path:u.pathname,method:init.method||'GET'});
  if(u.pathname==='/v1.0/me')return Response.json({id:'fictitious-owner',mail:'employee@example.invalid',userPrincipalName:'employee@example.invalid'});
  if(u.pathname.endsWith('/drafts/messages'))return Response.json({value:[]});
  if(u.pathname==='/v1.0/me/messages'&&init.method==='POST'){
   const id='fictitious-message-'+(++sequence),message={...JSON.parse(init.body),id,webLink:'https://outlook.office.com/mail/fictitious',isDraft:true,hasAttachments:true};messages.set(id,message);return Response.json(message,{status:201});
  }
  const message=messages.get(u.pathname.split('/')[4]);assert.ok(message);
  if(u.pathname.endsWith('/send')){if(mode==='uncertain')throw Error('Fictitious lost response');message.isDraft=false;message.sentDateTime='2026-11-26T10:00:00Z';return new Response(null,{status:202});}
  return Response.json(message);
 };
 const input={token:'fictitious-local-only',email:'employee@example.invalid',documentId:'fictitious-document:1',recipient:pilot?'employee@example.invalid':'customer@example.invalid',subject:'Audit entièrement fictif',message:'Aucun message réel',attachments:[{filename:'Fictitious.pdf',blob:new Blob(['%PDF-1.7\nSynthetic'])}],currentEmail:async()=>'employee@example.invalid',confirmed:true,fetcher,storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}};
 return {input,calls,values,set mode(v){mode=v;}};
}
async function withoutWebLocks(run){const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');try{Object.defineProperty(globalThis,'navigator',{configurable:true,value:undefined});return await run();}finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}}
for(const [name,send,pilot] of [['document',sendMicrosoftMail,false],['self-addressed pilot',sendMicrosoftTestMail,true]]){
 test(name+': concurrent callers share a dispatch lock and submit once',async()=>{
  assert.ok(navigator.locks,'This test uses the runtime Web Locks implementation');const f=fixture(pilot);
  const receipts=await Promise.all([send(f.input),send(f.input)]);assert.ok(receipts.every(r=>r.state==='sent'));assert.equal(receipts[0].id,receipts[1].id);
  assert.equal(f.calls.filter(c=>c.method==='POST'&&c.path==='/v1.0/me/messages').length,1);assert.equal(f.calls.filter(c=>c.path.endsWith('/send')).length,1);
 });
 test(name+': no Web Locks refuses fresh sends without a draft, dispatch or receipt',async()=>{
  const f=fixture(pilot);await withoutWebLocks(async()=>{
   const results=await Promise.allSettled([send(f.input),send(f.input)]);assert.ok(results.every(r=>r.status==='rejected'&&/brouillon Outlook|téléchargez le message/.test(r.reason.message)));
  });
  assert.ok(f.calls.every(c=>c.method==='GET'));assert.equal(f.values.size,0);
 });
 test(name+': an uncertain receipt remains observable without locks and is never resubmitted',async()=>{
  const f=fixture(pilot);f.mode='uncertain';const receipt=await send(f.input);assert.equal(receipt.state,'uncertain');f.calls.length=0;
  await withoutWebLocks(async()=>{const observed=await send(f.input);assert.equal(observed.state,'uncertain');assert.equal(observed.id,receipt.id);});
  assert.ok(f.calls.every(c=>c.method==='GET'));assert.ok(f.calls.some(c=>c.path.includes('/messages/')));
 });
}

test('different simultaneous document intentions conflict and retain access to the single original receipt',async()=>{
 const f=fixture(),results=await Promise.allSettled([sendMicrosoftMail(f.input),sendMicrosoftMail({...f.input,recipient:'different-customer@example.invalid',message:'Different intended content'})]);
 const success=results.find(r=>r.status==='fulfilled'),conflict=results.find(r=>r.status==='rejected');
 assert.ok(success);assert.ok(conflict?.reason instanceof MicrosoftMailContentConflict);assert.equal(conflict.reason.receipt.id,success.value.id);
 assert.equal(f.calls.filter(c=>c.path.endsWith('/send')).length,1);
});

test('changed sent or uncertain document intentions never rewrite the original dispatch fingerprint',async()=>{
 for(const state of ['sent','uncertain']){
  const f=fixture();f.mode=state;const first=await sendMicrosoftMail(f.input),original=[...f.values];
  for(const change of [{recipient:'different-customer@example.invalid'},{subject:'Different subject'},{message:'Different content'},{attachments:[{filename:'Other.pdf',blob:new Blob(['%PDF-1.7\nOther entirely fictitious bytes'])}]}]){
   const before=f.calls.length;
   await assert.rejects(()=>sendMicrosoftMail({...f.input,...change}),error=>{
    assert.ok(error instanceof MicrosoftMailContentConflict);assert.equal(error.receipt.id,first.id);assert.equal(error.receipt.state,state);assert.match(error.message,/Aucun nouveau message n’a été envoyé/);return true;
   });
   assert.deepEqual([...f.values],original);assert.ok(f.calls.slice(before).every(c=>c.method==='GET'));
  }
  assert.equal(f.calls.filter(c=>c.path.endsWith('/send')).length,1);
  assert.equal((await sendMicrosoftMail(f.input)).id,first.id);
 }
});
