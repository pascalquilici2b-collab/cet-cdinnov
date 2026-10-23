/** A local, unsent MIME message. No mail provider is contacted and no sent status is inferred. */
export async function outlookMessage(input:{recipient:string;bcc?:'cdi@cdinnov.com';recipientName?:string;subject:string;message:string;filename:string;pdf:Blob}):Promise<Blob>{
 if(input.recipient.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipient)||/[\r\n<>(),;:"\\]/.test(input.recipient))throw Error('Vérifiez l’adresse du destinataire.');
 if(!input.subject.trim()||input.subject.length>200||/[\r\n]/.test(input.subject)||input.message.length>10000)throw Error('Vérifiez l’objet et le message.');
 if(input.pdf.size>20*1024*1024||await input.pdf.slice(0,5).text()!=='%PDF-')throw Error('La pièce jointe PDF est indisponible.');
 const b64=(bytes:Uint8Array)=>{let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);};
 const utf8=(s:string)=>b64(new TextEncoder().encode(s));
 const wrapped=(s:string)=>s.match(/.{1,76}/g)?.join('\r\n')||'';
 // Fold encoded headers at Unicode character boundaries (RFC 2047).
 const encoded=(s:string)=>{const chunks:string[]=[];let part='';for(const c of s){if(new TextEncoder().encode(part+c).length>42){chunks.push('=?UTF-8?B?'+utf8(part)+'?=');part='';}part+=c;}if(part)chunks.push('=?UTF-8?B?'+utf8(part)+'?=');return chunks.join('\r\n ');};
 const boundary='cdinnov_'+crypto.randomUUID().replaceAll('-',''),filename=input.filename.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100).replace(/\.pdf$/i,'')+'.pdf';
 const name=(input.recipientName||'').replace(/[\r\n]/g,' ').slice(0,160);
 const lines=['X-Unsent: 1','MIME-Version: 1.0',...(input.bcc?['Bcc: cdi@cdinnov.com']:[]),'To: '+(name?encoded(name)+' <'+input.recipient+'>':input.recipient),'Subject: '+encoded(input.subject),'Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',wrapped(utf8(input.message.replace(/\r?\n/g,'\r\n'))),'','--'+boundary,'Content-Type: application/pdf; name="'+filename+'"','Content-Disposition: attachment; filename="'+filename+'"','Content-Transfer-Encoding: base64','',wrapped(b64(new Uint8Array(await input.pdf.arrayBuffer()))),'','--'+boundary+'--',''];
 return new Blob([lines.join('\r\n')],{type:'message/rfc822'});
}
