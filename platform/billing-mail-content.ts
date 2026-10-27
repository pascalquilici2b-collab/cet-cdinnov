import type {MailAttachment} from './billing-mail-attachments.ts';
export interface MailSignature {text:string;imageData:string;imageName:string;}
export interface MailSignatureRecord {version:number;data:MailSignature;}
export interface MailContent {recipient:string;cc?:string;bcc?:string;recipientName?:string;subject:string;message:string;html?:string;}
export const emptySignature=():MailSignature=>({text:'',imageData:'',imageName:''});
export function mailAddresses(value:string,required=false):string[]{
 if(typeof value!=='string'||value.length>8000||/[\r\n<>():"\\]/.test(value))throw Error('Vérifiez les adresses des destinataires.');
 const addresses=[...new Set(value.split(/[;,]/).map(s=>s.trim().toLowerCase()).filter(Boolean))];
 if((required&&!addresses.length)||addresses.length>50||addresses.some(a=>a.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)))throw Error('Vérifiez les adresses des destinataires (séparées par un point-virgule).');
 return addresses;
}
export function mailRecipients(input:MailContent){const to=mailAddresses(input.recipient,true),cc=mailAddresses(input.cc||'').filter(a=>!to.includes(a)),bcc=mailAddresses(input.bcc||'').filter(a=>!to.includes(a)&&!cc.includes(a));if(to.length+cc.length+bcc.length>50)throw Error('Limite de 50 destinataires par message.');return {to,cc,bcc};}
export function validateMail(input:MailContent){const recipients=mailRecipients(input);if(!input.subject.trim()||input.subject.length>200||/[\r\n]/.test(input.subject)||input.message.length>15000||(input.html?.length||0)>100000)throw Error('Vérifiez l’objet et le message.');return recipients;}
export function normalizeSignature(value:unknown):MailSignature{
 const v=value as MailSignature;if(!v||typeof v.text!=='string'||v.text.length>4000||typeof v.imageData!=='string'||typeof v.imageName!=='string'||v.imageName.length>200||v.imageData.length>700000)throw Error('Signature invalide.');
 if(v.imageData){if(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(v.imageData))throw Error('Utilisez une image PNG ou JPEG pour la signature.');const bytes=atob(v.imageData.split(',')[1]);if(v.imageData.startsWith('data:image/png;')?!bytes.startsWith('\x89PNG\r\n\x1a\n'):!bytes.startsWith('\xff\xd8\xff'))throw Error('Image de signature invalide.');}
 return {text:v.text.trim(),imageData:v.imageData,imageName:v.imageName};
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function signedMail(message:string,signature:MailSignature,enabled:boolean):{message:string;html?:string;inline:MailAttachment[]}{
 const s=normalizeSignature(signature);if(!enabled||!s.text&&!s.imageData)return {message,inline:[]};
 const imageId='cdinnov-signature',inline:MailAttachment[]=[];
 if(s.imageData){const raw=atob(s.imageData.split(',')[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),mime=s.imageData.startsWith('data:image/png')?'image/png':'image/jpeg';inline.push({filename:mime==='image/png'?'Signature.png':'Signature.jpg',blob:new Blob([bytes],{type:mime}),contentId:imageId,isInline:true});}
 // Exactly two line breaks separate the last sentence from either a text or image signature.
 const signatureHTML=escape(s.text).replace(/\r?\n/g,'<br>')+(s.imageData?(s.text?'<br>':'')+'<img src="cid:'+imageId+'" width="320" style="max-width:320px;height:auto;vertical-align:top" alt="">':'');
 return {message:[message.trim(),s.text].filter(Boolean).join('\n\n'),html:'<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#202124">'+escape(message.trim()).replace(/\r?\n/g,'<br>')+'<br><br>'+signatureHTML+'</div>',inline};
}
/** Compare rendered content after Exchange has wrapped/reformatted the HTML. */
export function comparableMailBody(body:{contentType:string;content:string}){
 let text=body.content;let images:string[]=[],links:string[]=[];
 if(body.contentType.toLowerCase()==='html'){
  if(typeof DOMParser!=='undefined'){const root=new DOMParser().parseFromString(text,'text/html');images=Array.from(root.images,i=>i.getAttribute('src')||'');links=Array.from(root.querySelectorAll('a'),a=>a.getAttribute('href')||'');root.querySelectorAll('head,style,script').forEach(e=>e.remove());root.querySelectorAll('br,p,div').forEach(e=>e.prepend(' '));text=root.body.textContent||'';}
  else {images=[...text.matchAll(/<img\b[^>]*\bsrc=["']([^"']*)["']/gi)].map(m=>m[1]);links=[...text.matchAll(/<a\b[^>]*\bhref=["']([^"']*)["']/gi)].map(m=>m[1]);text=text.replace(/<(head|style|script)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<(br|p|div)\b[^>]*>/gi,' ').replace(/<[^>]*>/g,'').replace(/&(amp|lt|gt|quot|#39|nbsp);/g,(_,e)=>(({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'",nbsp:' '} as Record<string,string>)[e]!));}
 }
 return JSON.stringify([text.replace(/\s+/g,' ').trim(),images.sort(),links.sort()]);
}
