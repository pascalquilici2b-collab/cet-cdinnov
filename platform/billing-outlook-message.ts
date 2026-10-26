import {checkedAttachments,attachmentName,attachmentType,bytes64,type MailAttachment} from './billing-mail-attachments.ts';
/** A local, unsent MIME message. No mail provider is contacted and no sent status is inferred. */
export async function outlookMessage(input:{recipient:string;cc?:'cdi@cdinnov.com';recipientName?:string;subject:string;message:string;filename?:string;pdf?:Blob;attachments?:MailAttachment[]}):Promise<Blob>{
 if(input.recipient.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipient)||/[\r\n<>(),;:"\\]/.test(input.recipient))throw Error('Vérifiez l’adresse du destinataire.');
 if(!input.subject.trim()||input.subject.length>200||/[\r\n]/.test(input.subject)||input.message.length>10000)throw Error('Vérifiez l’objet et le message.');
 const files=await checkedAttachments(input),b64=bytes64;
 const utf8=(s:string)=>b64(new TextEncoder().encode(s));
 const wrapped=(s:string)=>s.match(/.{1,76}/g)?.join('\r\n')||'';
 // Fold encoded headers at Unicode character boundaries (RFC 2047).
 const encoded=(s:string)=>{const chunks:string[]=[];let part='';for(const c of s){if(new TextEncoder().encode(part+c).length>42){chunks.push('=?UTF-8?B?'+utf8(part)+'?=');part='';}part+=c;}if(part)chunks.push('=?UTF-8?B?'+utf8(part)+'?=');return chunks.join('\r\n ');};
 const boundary='cdinnov_'+crypto.randomUUID().replaceAll('-','');
 const name=(input.recipientName||'').replace(/[\r\n]/g,' ').slice(0,160);
 const lines=['X-Unsent: 1','MIME-Version: 1.0',...(input.cc?['Cc: cdi@cdinnov.com']:[]),'To: '+(name?encoded(name)+' <'+input.recipient+'>':input.recipient),'Subject: '+encoded(input.subject),'Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',wrapped(utf8(input.message.replace(/\r?\n/g,'\r\n'))),''];
 for(const file of files){const filename=attachmentName(file.filename);lines.push('--'+boundary,'Content-Type: '+attachmentType(file.blob)+'; name="'+filename+'"','Content-Disposition: attachment; filename="'+filename+'"','Content-Transfer-Encoding: base64','',wrapped(b64(new Uint8Array(await file.blob.arrayBuffer()))),'');}
 lines.push('--'+boundary+'--','');
 return new Blob([lines.join('\r\n')],{type:'message/rfc822'});
}
