import {checkedAttachments,attachmentName,attachmentType,bytes64,type MailAttachment} from './billing-mail-attachments.ts';
import {validateMail,type MailContent} from './billing-mail-content.ts';
export interface MicrosoftProfile {id:string;mail:string|null;userPrincipalName:string;displayName:string;}
export interface MicrosoftDraft {id:string;webLink:string;isDraft:boolean;hasAttachments:boolean;}
type Fetcher=(url:string,init?:RequestInit)=>Promise<Response>;
export const microsoftOwnerMatches=(email:string,profile:MicrosoftProfile)=>!!profile.id&&[profile.mail,profile.userPrincipalName].some(v=>v?.trim().toLowerCase()===email.trim().toLowerCase());
export async function graph<T>(token:string,path:string,method='GET',body?:unknown,fetcher:Fetcher=fetch,bodyType:'text'|'html'='text'):Promise<T>{
 if(!/^\/me(?:\/|\?|$)/.test(path))throw Error('Accès Outlook non autorisé.');
 const url=new URL('https://graph.microsoft.com/v1.0'+path);
 if(!/^\/v1\.0\/me(?:\/|$)/.test(url.pathname))throw Error('Accès Outlook non autorisé.');
 const response=await fetcher(url.href,{method,cache:'no-store',signal:AbortSignal.timeout(45000),headers:{Authorization:'Bearer '+token,Accept:'application/json',Prefer:'IdType="ImmutableId", outlook.body-content-type="'+bodyType+'"',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw Object.assign(Error(response.status===401?'Reconnectez votre compte Outlook.':response.status===403?'Microsoft n’a pas autorisé la création de brouillons pour ce compte.':response.status===429?'Outlook est momentanément occupé. Réessayez dans quelques instants.':'Outlook n’a pas confirmé l’opération.'),{status:response.status});
 return response.json() as Promise<T>;
}
export const microsoftProfile=(token:string,fetcher?:Fetcher)=>graph<MicrosoftProfile>(token,'/me?$select=id,mail,userPrincipalName,displayName','GET',undefined,fetcher);
export function outlookWebLink(value:string){try{const url=new URL(value);if(url.protocol==='https:'&&['outlook.office.com','outlook.office365.com'].includes(url.hostname)&&!url.username&&!url.password)return url.href;}catch{}throw Error('Le lien Outlook reçu n’est pas valide.');}
const propertyId='String {90679e7a-9a0c-4e15-9506-4b3d292cb0f9} Name CDInnovDraft';
export const documentPropertyId='String {90679e7a-9a0c-4e15-9506-4b3d292cb0f9} Name CDInnovDocument';
/** Atomic draft + attachment. An uncertain POST is never blindly retried. */
export async function createMicrosoftDraft(input:MailContent&{token:string;email:string;documentId:string;filename?:string;pdf?:Blob;attachments?:MailAttachment[];currentEmail:()=>Promise<string>;storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;fetcher?:Fetcher}):Promise<MicrosoftDraft>{
 const {token,storage}=input,fetcher=input.fetcher||fetch;
 const assertSession=async()=>{if((await input.currentEmail()).trim().toLowerCase()!==input.email.trim().toLowerCase())throw Error('La session CDInnov a changé. Rouvrez le document dans votre session.');};
 await assertSession();const owner=await microsoftProfile(token,fetcher);if(!microsoftOwnerMatches(input.email,owner))throw Error('Ce compte Outlook ne correspond pas à votre session CDInnov. Connectez votre propre compte.');
 const files=await checkedAttachments(input);
 if(files.reduce((n,f)=>n+f.blob.size,0)>=3*1024*1024)throw Error('Les pièces jointes dépassent 3 Mo. Utilisez le bouton de téléchargement du message pour les ouvrir dans Outlook.');
 const recipients=validateMail(input);
 const attachments=await Promise.all(files.map(async f=>({'@odata.type':'#microsoft.graph.fileAttachment',name:attachmentName(f.filename),contentType:attachmentType(f.blob),contentBytes:bytes64(new Uint8Array(await f.blob.arrayBuffer())),...(f.isInline?{isInline:true,contentId:f.contentId}:{})})));
 const signature=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([recipients,input.subject,input.message,input.html||null,attachments]))));
 const key='cdi-outlook-draft:'+owner.id+':'+input.documentId+':'+Array.from(signature,x=>x.toString(16).padStart(2,'0')).join('');
 let attempt:{id:string;posted:boolean}|null=null;try{attempt=JSON.parse(storage.getItem(key)||'null');}catch{}if(!attempt||!/^[0-9a-f-]{36}$/.test(attempt.id))attempt={id:crypto.randomUUID(),posted:false};
 const query=new URLSearchParams({'$filter':"singleValueExtendedProperties/Any(ep: ep/id eq '"+propertyId+"' and ep/value eq '"+attempt.id+"')",'$select':'id,webLink,isDraft,hasAttachments','$top':'2'});
 const found=await graph<{value:MicrosoftDraft[]}>(token,'/me/mailFolders/drafts/messages?'+query,'GET',undefined,fetcher);
 const validate=(draft:MicrosoftDraft)=>{if(!draft.id||!draft.isDraft||(files.some(f=>!f.isInline)&&!draft.hasAttachments))throw Error('Le brouillon doit être vérifié dans Outlook avant de continuer.');return {...draft,webLink:outlookWebLink(draft.webLink)};};
 if(found.value.length===1)return validate(found.value[0]);
 if(found.value.length>1||attempt.posted)throw Error('Le résultat précédent est incertain. Vérifiez le dossier Brouillons dans Outlook ; aucun nouveau message n’a été créé.');
 await assertSession();
 const address=(address:string)=>({emailAddress:{address}});
 const data={...(recipients.cc.length?{ccRecipients:recipients.cc.map(address)}:{}),...(recipients.bcc.length?{bccRecipients:recipients.bcc.map(address)}:{}),subject:input.subject,body:{contentType:input.html?'HTML':'Text',content:input.html||input.message},toRecipients:recipients.to.map(address),attachments,singleValueExtendedProperties:[{id:propertyId,value:attempt.id},{id:documentPropertyId,value:input.documentId}]};
 attempt.posted=true;storage.setItem(key,JSON.stringify(attempt));
 try{return validate(await graph<MicrosoftDraft>(token,'/me/messages','POST',data,fetcher));}catch(error){const status=(error as {status?:number}).status;if(status&&status<500)storage.removeItem(key);throw error;}
}
