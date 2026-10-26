export interface MailAttachment {filename:string;blob:Blob;isInline?:boolean;contentId?:string;}
export async function checkedAttachments(input:{filename?:string;pdf?:Blob;attachments?:MailAttachment[]}){
 const files=input.attachments??(input.pdf?[{filename:input.filename||'Document.pdf',blob:input.pdf}]:[]);
 if(files.length>12||files.reduce((n,f)=>n+f.blob.size,0)>20*1024*1024)throw Error('Limite de 12 pièces jointes et 20 Mo par message.');
 for(const f of files){if(!f.filename||f.filename.length>200||/[\r\n]/.test(f.filename)||!f.blob.size||f.isInline&&(!/^[a-zA-Z0-9_-]{1,100}$/.test(f.contentId||'')||!['image/png','image/jpeg'].includes(f.blob.type)))throw Error('Pièce jointe invalide.');if(/\.pdf$/i.test(f.filename)&&await f.blob.slice(0,5).text()!=='%PDF-')throw Error('Pièce jointe PDF invalide.');}
 return files;
}
export function attachmentName(name:string){return name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,200);}
export function attachmentType(blob:Blob){return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(blob.type)?blob.type:'application/octet-stream';}
export function bytes64(bytes:Uint8Array){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);}
