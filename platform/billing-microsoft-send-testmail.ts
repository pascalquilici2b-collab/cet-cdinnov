import {createMicrosoftDraft,graph,microsoftProfile,microsoftOwnerMatches,outlookWebLink} from './billing-microsoft-draft.ts';
import {checkedAttachments,attachmentName,bytes64} from './billing-mail-attachments.ts';

type DraftInput=Parameters<typeof createMicrosoftDraft>[0];
export interface MicrosoftSendReceipt {id:string;webLink:string;state:'sent'|'accepted'|'uncertain';sentAt?:string;}
type Message={id:string;webLink:string;isDraft:boolean;sentDateTime?:string;subject:string;body:{contentType:string;content:string};toRecipients:{emailAddress:{address:string}}[];ccRecipients:unknown[];bccRecipients:unknown[];attachments:{name:string;contentBytes:string;isInline?:boolean}[]};
const normalize=(s:string)=>s.trim().toLowerCase();
const text=(s:string)=>s.replace(/\r\n/g,'\n').trim();
const sha=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const fields='id,webLink,isDraft,sentDateTime,subject,body,toRecipients,ccRecipients,bccRecipients';
async function readMessage(input:DraftInput,id:string){return graph<Message>(input.token,'/me/messages/'+encodeURIComponent(id)+'?'+new URLSearchParams({'$select':fields,'$expand':'attachments'}),'GET',undefined,input.fetcher);}

/** Pilot: only the current employee can send to their own mailbox; never a customer.
 * The local journal stores opaque IDs only. An uncertain send is never retried.
 */
export async function sendMicrosoftTestMail(input:DraftInput&{confirmed:boolean}):Promise<MicrosoftSendReceipt>{
 if(!input.confirmed)throw Error('Confirmez l’envoi du message de test.');
 if(normalize(input.recipient)!==normalize(input.email)||input.cc||input.bcc)throw Error('Ce test est réservé à votre propre adresse Outlook, sans copie.');
 const session=async()=>{if(normalize(await input.currentEmail())!==normalize(input.email))throw Error('La session CDInnov a changé. Rouvrez le test.');};
 await session();const owner=await microsoftProfile(input.token,input.fetcher);if(!microsoftOwnerMatches(input.email,owner))throw Error('Connectez le compte Outlook correspondant à votre session CDInnov.');
 const files=await checkedAttachments(input),expected=await Promise.all(files.map(async f=>({name:attachmentName(f.filename),contentBytes:bytes64(new Uint8Array(await f.blob.arrayBuffer()))})));
 const signature=await sha(JSON.stringify([input.subject,input.message,expected])),key='cdi-outlook-send-test:'+owner.id+':'+signature;
 const run=async()=>{
 const save=(value:MicrosoftSendReceipt)=>input.storage.setItem(key,JSON.stringify(value));
 let previous:MicrosoftSendReceipt|null=null;
 try{previous=JSON.parse(input.storage.getItem(key)||'null');}catch{throw Error('Le suivi local du test est indisponible. Ouvrez Outlook pour vérifier l’envoi.');}
 const observe=async(receipt:MicrosoftSendReceipt)=>{await session();try{const message=await readMessage(input,receipt.id);if(!message.isDraft&&message.sentDateTime){receipt={...receipt,state:'sent' as const,sentAt:message.sentDateTime,webLink:outlookWebLink(message.webLink)};save(receipt);}}catch(e){if((e as {status?:number}).status===401)throw e;}return receipt;};
 if(previous?.id){previous.webLink=outlookWebLink(previous.webLink);if(previous.state==='sent')return previous;return observe(previous);}
 const draft=await createMicrosoftDraft({...input,documentId:'test-send-'+signature});
 const message=await readMessage(input,draft.id),got=message.attachments||[];
 const recipients=message.toRecipients||[];
 const fileList=(list:{name:string;contentBytes:string}[])=>JSON.stringify(list.map(f=>[f.name,f.contentBytes]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
 if(!message.isDraft||message.subject!==input.subject||message.body?.contentType.toLowerCase()!=='text'||text(message.body.content)!==text(input.message)||recipients.length!==1||normalize(recipients[0].emailAddress.address)!==normalize(input.email)||(message.ccRecipients||[]).length||(message.bccRecipients||[]).length||got.some(f=>f.isInline)||fileList(got)!==fileList(expected))throw Error('Le brouillon Outlook a été modifié. Vérifiez-le dans Outlook avant de poursuivre. Aucun envoi automatique effectué.');
 await session();
 let receipt:MicrosoftSendReceipt={id:draft.id,webLink:outlookWebLink(draft.webLink),state:'uncertain'};
 save(receipt); // Persist before the request; failure must prevent an untracked send.
 let response:Response;
 try{response=await(input.fetcher||fetch)('https://graph.microsoft.com/v1.0/me/messages/'+encodeURIComponent(draft.id)+'/send',{method:'POST',headers:{Authorization:'Bearer '+input.token,Prefer:'IdType="ImmutableId"'},cache:'no-store',signal:AbortSignal.timeout(45000)});}catch{return observe(receipt);}
 if(response.status===202){receipt={...receipt,state:'accepted'};save(receipt);return observe(receipt);}
 // Explicit refusals are safe to correct and retry manually. Other outcomes are uncertain.
 if([400,401,403,413,429].includes(response.status)){input.storage.removeItem(key);throw Error(response.status===403?'Microsoft n’a pas autorisé l’envoi. Activez l’envoi Outlook pour ce compte.':response.status===401?'Reconnectez votre compte Outlook.':response.status===429?'Outlook est occupé. Attendez avant de relancer le test.':'Microsoft a refusé le message de test. Vérifiez son contenu et ses pièces jointes.');}
 return observe(receipt);
 };
 return typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request(key,run):run();
}
