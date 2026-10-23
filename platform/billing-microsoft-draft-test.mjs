import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMicrosoftDraft,microsoftOwnerMatches,outlookWebLink} from './billing-microsoft-draft.ts';
const pdf=new Blob(['%PDF-1.7\nsynthetic PDF']);
const owner=email=>({id:'owner-'+email,mail:email,userPrincipalName:email,displayName:email});
const ready={id:'message-1',webLink:'https://outlook.office.com/mail/deeplink/read/test',isDraft:true,hasAttachments:true};
const ledger=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
function harness(email='pascal@example.test'){
 let count=0,mode='ok',created=null,payload;const calls=[];
 const fetcher=async(url,init)=>{calls.push({url,init});const u=new URL(url);
  assert.ok(u.pathname.startsWith('/v1.0/me'));assert.ok(!/send|users/.test(u.pathname));
  if(u.pathname==='/v1.0/me')return Response.json(owner(email));
  if(u.pathname.endsWith('/drafts/messages'))return Response.json({value:created?[ready]:[]});
  assert.equal(init.method,'POST');assert.equal(u.pathname,'/v1.0/me/messages');count++;payload=JSON.parse(init.body);
  if(mode==='network')throw Error('Network disconnected');
  created=ready;if(mode==='lost-response')throw Error('Lost response');if(mode==='refused'){created=null;return new Response('{}',{status:403});}return Response.json(ready,{status:201});
 };
 const input={email,documentId:'document-1',token:'synthetic-token',recipient:'contact@example.test',recipientName:'Élodie',subject:'Projet européen',message:'Bonjour, voici le document.',filename:'Facture-1.pdf',pdf,currentEmail:async()=>email,storage:ledger(),fetcher};
 return {input,calls,get posts(){return count},get payload(){return payload},set mode(v){mode=v}};
}
test('each CDInnov account writes only to its own Microsoft mailbox',async()=>{
 for(const email of ['pascal@example.test','david@example.test','albert@example.test']){const h=harness(email);assert.equal((await createMicrosoftDraft(h.input)).id,ready.id);assert.equal(h.posts,1);assert.equal(h.payload.toRecipients[0].emailAddress.address,'contact@example.test');assert.equal(h.payload.attachments.length,1);assert.equal(Buffer.from(h.payload.attachments[0].contentBytes,'base64').toString(),await pdf.text());assert.ok(!h.payload.from&&!h.payload.sender);assert.equal((await createMicrosoftDraft(h.input)).id,ready.id);assert.equal(h.posts,1);}
});
test('reject another user, a portal session change, an unsafe link, or a header injection',async()=>{
 const h=harness();await assert.rejects(createMicrosoftDraft({...h.input,email:'david@example.test',currentEmail:async()=>'david@example.test'}),/ne correspond pas/);assert.equal(h.posts,0);
 let checks=0;await assert.rejects(createMicrosoftDraft({...h.input,currentEmail:async()=>++checks===1?h.input.email:'albert@example.test'}),/session CDInnov a changé/);assert.equal(h.posts,0);
 await assert.rejects(createMicrosoftDraft({...h.input,recipient:'x@example.test\r\nBcc:y@example.test'}),/destinataire/);assert.equal(h.posts,0);
 assert.equal(microsoftOwnerMatches('pascal@example.test',owner('david@example.test')),false);
 for(const bad of ['https://evil.test/mail','javascript:alert(1)','https://outlook.office.com@evil.test','https://evil@outlook.office.com/mail'])assert.throws(()=>outlookWebLink(bad));
});
test('recover a lost response without creating a second draft',async()=>{
 const h=harness();h.mode='lost-response';await assert.rejects(createMicrosoftDraft(h.input),/Lost response/);h.mode='ok';assert.equal((await createMicrosoftDraft(h.input)).id,ready.id);assert.equal(h.posts,1);
 const unknown=harness();unknown.mode='network';await assert.rejects(createMicrosoftDraft(unknown.input),/Network/);unknown.mode='ok';await assert.rejects(createMicrosoftDraft(unknown.input),/incertain/);assert.equal(unknown.posts,1);
});
test('explicit refusal can be retried; large PDFs fail before creating a partial draft',async()=>{
 const h=harness();h.mode='refused';await assert.rejects(createMicrosoftDraft(h.input),/autorisé/);h.mode='ok';await createMicrosoftDraft(h.input);assert.equal(h.posts,2);
 const large=harness();await assert.rejects(createMicrosoftDraft({...large.input,pdf:new Blob(['%PDF-',new Uint8Array(3*1024*1024)])}),/dépasse 3 Mo/);assert.equal(large.posts,0);
});
