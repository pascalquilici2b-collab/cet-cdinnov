import {createMicrosoftDraft,graph,microsoftProfile,microsoftOwnerMatches,outlookWebLink} from './billing-microsoft-draft.ts';
import {checkedAttachments,attachmentName,bytes64} from './billing-mail-attachments.ts';
import {validateMail,comparableMailBody} from './billing-mail-content.ts';
import type {MicrosoftSendReceipt} from './billing-microsoft-send-testmail.ts';
type Input=Parameters<typeof createMicrosoftDraft>[0]&{confirmed:boolean;beforeSend?:()=>Promise<void>};
type Recipient={emailAddress:{address:string}};
export interface SentGraphMessage {id:string;webLink:string;isDraft:boolean;sentDateTime?:string;subject:string;body:{contentType:string;content:string};toRecipients:Recipient[];ccRecipients:Recipient[];bccRecipients:Recipient[];attachments?:{name:string;contentBytes:string;isInline?:boolean;contentId?:string}[];}
const sha=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const lower=(s:string)=>s.trim().toLowerCase();
const fields='id,webLink,isDraft,sentDateTime,subject,body,toRecipients,ccRecipients,bccRecipients';
export const readGraphMessage=(token:string,id:string,fetcher?:Input['fetcher'],html=false)=>graph<SentGraphMessage>(token,'/me/messages/'+encodeURIComponent(id)+'?'+new URLSearchParams({'$select':fields,'$expand':'attachments'}),'GET',undefined,fetcher,html?'html':'text');
/** One dispatch per document/version/account. A lost response is read back, never resent. */
export async function sendMicrosoftMail(input:Input):Promise<MicrosoftSendReceipt>{
 if(!input.confirmed)throw Error('Vérifiez le message avant de confirmer son envoi.');
 const recipients=validateMail(input),session=async()=>{if(lower(await input.currentEmail())!==lower(input.email))throw Error('La session CDInnov a changé. Rouvrez le document.');};
 await session();const owner=await microsoftProfile(input.token,input.fetcher);if(!microsoftOwnerMatches(input.email,owner))throw Error('Connectez votre propre compte Outlook.');
 const files=await checkedAttachments(input),expected=await Promise.all(files.map(async f=>({name:attachmentName(f.filename),contentBytes:bytes64(new Uint8Array(await f.blob.arrayBuffer())),isInline:!!f.isInline,contentId:f.contentId||''})));
 const fingerprint=await sha(JSON.stringify([recipients,input.subject,input.message,input.html||null,expected])),key='cdi-outlook-send:'+owner.id+':'+input.documentId;
 const run=async()=>{
  const save=(receipt:MicrosoftSendReceipt)=>input.storage.setItem(key,JSON.stringify({...receipt,fingerprint}));
  let previous:(MicrosoftSendReceipt&{fingerprint:string})|null;try{previous=JSON.parse(input.storage.getItem(key)||'null');}catch{throw Error('Le suivi d’envoi est indisponible. Vérifiez votre boîte Outlook.');}
  const observe=async(receipt:MicrosoftSendReceipt)=>{await session();try{const m=await readGraphMessage(input.token,receipt.id,input.fetcher);if(!m.isDraft&&m.sentDateTime){receipt={...receipt,state:'sent',sentAt:m.sentDateTime,webLink:outlookWebLink(m.webLink)};save(receipt);}}catch(e){if((e as {status?:number}).status===401)throw e;}return receipt;};
  if(previous?.id){previous.webLink=outlookWebLink(previous.webLink);if(previous.state==='sent')return previous;return observe(previous);}
  await input.beforeSend?.();
  const draft=await createMicrosoftDraft({...input,documentId:'direct:'+input.documentId}),message=await readGraphMessage(input.token,draft.id,input.fetcher,!!input.html);
  const equalAddresses=(got:Recipient[]|undefined,want:string[])=>JSON.stringify((got||[]).map(r=>lower(r.emailAddress.address)).sort())===JSON.stringify([...want].sort());
  const fileList=(list:typeof message.attachments)=>JSON.stringify((list||[]).map(f=>[f.name,f.contentBytes,!!f.isInline,f.contentId||'']).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  if(!message.isDraft||message.subject!==input.subject||comparableMailBody(message.body)!==comparableMailBody({contentType:input.html?'html':'text',content:input.html||input.message})||!equalAddresses(message.toRecipients,recipients.to)||!equalAddresses(message.ccRecipients,recipients.cc)||!equalAddresses(message.bccRecipients,recipients.bcc)||fileList(message.attachments)!==fileList(expected))throw Error('Le brouillon Outlook a été modifié. Vérifiez-le dans Outlook avant de l’envoyer.');
  await session();await input.beforeSend?.();
  let receipt:MicrosoftSendReceipt={id:draft.id,webLink:outlookWebLink(draft.webLink),state:'uncertain'};save(receipt);
  let response:Response;
  try{response=await(input.fetcher||fetch)('https://graph.microsoft.com/v1.0/me/messages/'+encodeURIComponent(draft.id)+'/send',{method:'POST',headers:{Authorization:'Bearer '+input.token,Prefer:'IdType="ImmutableId"'},cache:'no-store',signal:AbortSignal.timeout(45000)});}catch{return observe(receipt);}
  if(response.status===202){receipt={...receipt,state:'accepted'};save(receipt);return observe(receipt);}
  if([400,401,403,413,429].includes(response.status)){input.storage.removeItem(key);throw Error(response.status===403?'Activez l’envoi Outlook pour votre compte.':response.status===401?'Reconnectez votre compte Outlook.':response.status===429?'Outlook est occupé. Réessayez dans quelques instants.':'Microsoft a refusé le message. Vérifiez les destinataires et les pièces jointes.');}
  return observe(receipt);
 };
 return typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request(key,run):run();
}
