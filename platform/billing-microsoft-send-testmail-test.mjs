import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sendMicrosoftTestMail} from './billing-microsoft-send-testmail.ts';
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
function harness(email='pascal@example.test'){
 let message=null,posts=0,sendCount=0,mode='ok';
 const fetcher=async(url,options={})=>{const u=new URL(url);assert.ok(u.pathname.startsWith('/v1.0/me'));assert.ok(!u.pathname.includes('/users/'));
  if(u.pathname==='/v1.0/me')return Response.json({id:'owner-'+email,mail:email,userPrincipalName:email,displayName:'Demo'});
  if(u.pathname.endsWith('/drafts/messages'))return Response.json({value:message?.isDraft?[message]:[]});
  if(options.method==='POST'&&u.pathname==='/v1.0/me/messages'){posts++;const input=JSON.parse(options.body);assert.equal(input.from,undefined);assert.equal(input.sender,undefined);message={...input,id:'draft-immutable',webLink:'https://outlook.office.com/mail/deeplink/read/test',isDraft:true,hasAttachments:input.attachments.length>0};return Response.json(message,{status:201});}
  if(options.method==='POST'&&u.pathname.endsWith('/send')){sendCount++;if(mode==='refuse')return new Response(null,{status:403});if(mode==='uncertain')throw Error('connection reset');message={...message,isDraft:false,sentDateTime:'2026-10-26T14:00:00Z'};if(mode==='lost')throw Error('lost response');return new Response(null,{status:202});}
  if(mode==='mutate')return Response.json({...message,toRecipients:[{emailAddress:{address:'other@example.test'}}]});
  if(mode==='attachment')return Response.json({...message,attachments:[]});
  return Response.json({...message,body:{contentType:message.body.contentType.toLowerCase(),content:message.body.content},ccRecipients:message.ccRecipients||[],bccRecipients:[]});
 };
 const input={token:'test-only',email,recipient:email,documentId:'pilot',subject:'Test CDI',message:'Bonjour,\nTest.',attachments:[{filename:'Test-CDI.pdf',blob:new Blob(['%PDF-1.7 demonstration'],{type:'application/pdf'})}],currentEmail:async()=>email,storage:memory(),fetcher,confirmed:true};
 return {input,get posts(){return posts},get sends(){return sendCount},set mode(v){mode=v}};
}
test('pilot sends through each own mailbox and confirms Sent Items without duplication',async()=>{
 for(const email of ['pascal@example.test','albert@example.test','david@example.test']){const h=harness(email),sent=await sendMicrosoftTestMail(h.input);assert.equal(sent.state,'sent');assert.equal(h.posts,1);assert.equal(h.sends,1);assert.equal((await sendMicrosoftTestMail(h.input)).state,'sent');assert.equal(h.sends,1);}
});
test('a test cannot target a client, include copies, bypass confirmation or switch accounts',async()=>{
 const h=harness();for(const patch of [{recipient:'client@example.test'},{cc:'cdi@cdinnov.com'},{confirmed:false},{email:'other@example.test',recipient:'other@example.test',currentEmail:async()=>'other@example.test'}])await assert.rejects(sendMicrosoftTestMail({...h.input,...patch}));assert.equal(h.posts,0);assert.equal(h.sends,0);
 let reads=0;await assert.rejects(sendMicrosoftTestMail({...h.input,currentEmail:async()=>++reads>3?'other@example.test':h.input.email}),/session/);assert.equal(h.sends,0);
});
test('uncertain sends are read back, never resent; explicit refusals remain retryable',async()=>{
 const h=harness();h.mode='uncertain';assert.equal((await sendMicrosoftTestMail(h.input)).state,'uncertain');h.mode='ok';assert.equal((await sendMicrosoftTestMail(h.input)).state,'uncertain');assert.equal(h.sends,1);
 const lost=harness();lost.mode='lost';assert.equal((await sendMicrosoftTestMail(lost.input)).state,'sent');assert.equal(lost.sends,1);
 const denied=harness();denied.mode='refuse';await assert.rejects(sendMicrosoftTestMail(denied.input),/autorisé/);denied.mode='ok';assert.equal((await sendMicrosoftTestMail(denied.input)).state,'sent');assert.equal(denied.posts,1);assert.equal(denied.sends,2);
});
test('modified draft or attachments cannot be sent without a fresh review',async()=>{
 for(const mode of ['mutate','attachment']){const h=harness();h.mode=mode;await assert.rejects(sendMicrosoftTestMail(h.input),/modifié/);assert.equal(h.sends,0);}
});
