import {checkedAttachments,attachmentName,attachmentType,bytes64,type MailAttachment} from './billing-mail-attachments.ts';
import {validateMail,type MailContent} from './billing-mail-content.ts';
/** A local, unsent MIME message. No mail provider is contacted and no sent status is inferred. */
export async function outlookMessage(input:MailContent&{filename?:string;pdf?:Blob;attachments?:MailAttachment[]}):Promise<Blob>{
 const recipients=validateMail(input);
 const files=await checkedAttachments(input),b64=bytes64;
 const utf8=(s:string)=>b64(new TextEncoder().encode(s));
 const wrapped=(s:string)=>s.match(/.{1,76}/g)?.join('\r\n')||'';
 // Fold encoded headers at Unicode character boundaries (RFC 2047).
 const encoded=(s:string)=>{const chunks:string[]=[];let part='';for(const c of s){if(new TextEncoder().encode(part+c).length>42){chunks.push('=?UTF-8?B?'+utf8(part)+'?=');part='';}part+=c;}if(part)chunks.push('=?UTF-8?B?'+utf8(part)+'?=');return chunks.join('\r\n ');};
 const boundary='cdinnov_'+crypto.randomUUID().replaceAll('-','');
 const name=(input.recipientName||'').replace(/[\r\n]/g,' ').slice(0,160);
 const lines=['X-Unsent: 1','MIME-Version: 1.0',...(recipients.cc.length?['Cc: '+recipients.cc.join(', ')]:[]),...(recipients.bcc.length?['Bcc: '+recipients.bcc.join(', ')]:[]),'To: '+(name&&recipients.to.length===1?encoded(name)+' <'+recipients.to[0]+'>':recipients.to.join(', ')),'Subject: '+encoded(input.subject),'Content-Type: multipart/'+(input.html?'related':'mixed')+'; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/'+(input.html?'html':'plain')+'; charset=UTF-8','Content-Transfer-Encoding: base64','',wrapped(utf8((input.html||input.message).replace(/\r?\n/g,'\r\n'))),''];
 for(const file of files){const filename=attachmentName(file.filename);lines.push('--'+boundary,'Content-Type: '+attachmentType(file.blob)+'; name="'+filename+'"','Content-Disposition: '+(file.isInline?'inline':'attachment')+'; filename="'+filename+'"',...(file.isInline?['Content-ID: <'+file.contentId+'>']:[]),'Content-Transfer-Encoding: base64','',wrapped(b64(new Uint8Array(await file.blob.arrayBuffer()))),'');}
 lines.push('--'+boundary+'--','');
 return new Blob([lines.join('\r\n')],{type:'message/rfc822'});
}
