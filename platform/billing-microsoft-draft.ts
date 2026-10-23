export interface MicrosoftProfile {id:string;mail:string|null;userPrincipalName:string;displayName:string;}
export interface MicrosoftDraft {id:string;webLink:string;isDraft:boolean;hasAttachments:boolean;}
type Fetcher=(url:string,init?:RequestInit)=>Promise<Response>;
export const microsoftOwnerMatches=(email:string,profile:MicrosoftProfile)=>!!profile.id&&[profile.mail,profile.userPrincipalName].some(v=>v?.trim().toLowerCase()===email.trim().toLowerCase());
export async function graph<T>(token:string,path:string,method='GET',body?:unknown,fetcher:Fetcher=fetch):Promise<T>{
 if(!path.startsWith('/me'))throw Error('Accès Outlook non autorisé.');
 const response=await fetcher('https://graph.microsoft.com/v1.0'+path,{method,cache:'no-store',signal:AbortSignal.timeout(45000),headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw Object.assign(Error(response.status===401?'Reconnectez votre compte Outlook.':response.status===403?'Microsoft n’a pas autorisé la création de brouillons pour ce compte.':response.status===429?'Outlook est momentanément occupé. Réessayez dans quelques instants.':'Outlook n’a pas confirmé l’opération.'),{status:response.status});
 return response.json() as Promise<T>;
}
export const microsoftProfile=(token:string,fetcher?:Fetcher)=>graph<MicrosoftProfile>(token,'/me?$select=id,mail,userPrincipalName,displayName','GET',undefined,fetcher);
export function outlookWebLink(value:string){try{const url=new URL(value);if(url.protocol==='https:'&&['outlook.office.com','outlook.office365.com'].includes(url.hostname)&&!url.username&&!url.password)return url.href;}catch{}throw Error('Le lien Outlook reçu n’est pas valide.');}
const propertyId='String {90679e7a-9a0c-4e15-9506-4b3d292cb0f9} Name CDInnovDraft';
/** Atomic draft + attachment. An uncertain POST is never blindly retried. */
export async function createMicrosoftDraft(input:{token:string;email:string;documentId:string;recipient:string;bcc?:'cdi@cdinnov.com';recipientName?:string;subject:string;message:string;filename:string;pdf:Blob;currentEmail:()=>Promise<string>;storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;fetcher?:Fetcher}):Promise<MicrosoftDraft>{
 const {token,pdf,storage}=input,fetcher=input.fetcher||fetch;
 const assertSession=async()=>{if((await input.currentEmail()).trim().toLowerCase()!==input.email.trim().toLowerCase())throw Error('La session CDInnov a changé. Rouvrez le document dans votre session.');};
 await assertSession();const owner=await microsoftProfile(token,fetcher);if(!microsoftOwnerMatches(input.email,owner))throw Error('Ce compte Outlook ne correspond pas à votre session CDInnov. Connectez votre propre compte.');
 if(pdf.size>=3*1024*1024)throw Error('Ce PDF dépasse 3 Mo. Utilisez « Télécharger le message » pour l’ouvrir dans Outlook avec sa pièce jointe.');
 if(await pdf.slice(0,5).text()!=='%PDF-')throw Error('Le PDF définitif est indisponible.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipient)||/[\r\n<>(),;:"\\]/.test(input.recipient)||input.recipient.length>254||!input.subject.trim()||input.subject.length>200||/[\r\n]/.test(input.subject)||input.message.length>10000)throw Error('Vérifiez le destinataire et le message.');
 const bytes=new Uint8Array(await pdf.arrayBuffer()),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 const signature=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([input.recipient,input.bcc||null,input.subject,input.message,input.filename,Array.from(digest)]))));
 const key='cdi-outlook-draft:'+owner.id+':'+input.documentId+':'+Array.from(signature,x=>x.toString(16).padStart(2,'0')).join('');
 let attempt:{id:string;posted:boolean}|null=null;try{attempt=JSON.parse(storage.getItem(key)||'null');}catch{}if(!attempt||!/^[0-9a-f-]{36}$/.test(attempt.id))attempt={id:crypto.randomUUID(),posted:false};
 const query=new URLSearchParams({'$filter':"singleValueExtendedProperties/Any(ep: ep/id eq '"+propertyId+"' and ep/value eq '"+attempt.id+"')",'$select':'id,webLink,isDraft,hasAttachments','$top':'2'});
 const found=await graph<{value:MicrosoftDraft[]}>(token,'/me/mailFolders/drafts/messages?'+query,'GET',undefined,fetcher);
 const validate=(draft:MicrosoftDraft)=>{if(!draft.id||!draft.isDraft||!draft.hasAttachments)throw Error('Le brouillon doit être vérifié dans Outlook avant de continuer.');return {...draft,webLink:outlookWebLink(draft.webLink)};};
 if(found.value.length===1)return validate(found.value[0]);
 if(found.value.length>1||attempt.posted)throw Error('Le résultat précédent est incertain. Vérifiez le dossier Brouillons dans Outlook ; aucun nouveau message n’a été créé.');
 await assertSession();let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const data={...(input.bcc?{bccRecipients:[{emailAddress:{address:'cdi@cdinnov.com'}}]}:{}),subject:input.subject,body:{contentType:'Text',content:input.message},toRecipients:[{emailAddress:{address:input.recipient,...(input.recipientName?{name:input.recipientName}:{})}}],attachments:[{'@odata.type':'#microsoft.graph.fileAttachment',name:input.filename.replace(/[^a-zA-Z0-9._-]/g,'_'),contentType:'application/pdf',contentBytes:btoa(binary)}],singleValueExtendedProperties:[{id:propertyId,value:attempt.id}]};
 attempt.posted=true;storage.setItem(key,JSON.stringify(attempt));
 try{return validate(await graph<MicrosoftDraft>(token,'/me/messages','POST',data,fetcher));}catch(error){const status=(error as {status?:number}).status;if(status&&status<500)storage.removeItem(key);throw error;}
}
