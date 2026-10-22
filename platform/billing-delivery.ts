import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import type {Database,Environment,Reply} from './contracts';
import type {BillingDocument} from './billing-contracts';
import {boundedBody} from './portal';
import {issuedFile} from './billing-generation';
import {billingToday} from './billing-quote-domain';
export interface EmailInput {id:string;recipient:string;subject:string;message:string;}
export interface EmailDelivery {id:string;recipient:string;subject:string;state:'sending'|'sent'|'failed'|'unknown';created_at:string;provider_id:string|null;}
const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const email=(s:unknown):s is string=>typeof s==='string'&&s.length<=254&&/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(s);
export async function billingEmail(request:Request,db:Database,env:Environment,doc:BillingDocument,user:string,reply:Reply){
 const list=()=>db.prepare('SELECT id,recipient,subject,state,created_at,provider_id FROM billing_email_deliveries WHERE document_id=? ORDER BY created_at DESC LIMIT 50').bind(doc.id).all<EmailDelivery>();
 if(request.method==='GET')return reply(200,{deliveries:(await list()).results});
 if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
 if(request.headers.get('if-match')!==String(doc.version))return reply(409,{error:'Le document a changé. Rechargez-le avant l’envoi.'});
 if(doc.status!=='issued'||!doc.issuance)return reply(409,{error:'Finalisez le document avant de l’envoyer.'});
 if(doc.data.issueDate>billingToday())return reply(409,{error:'La date du document est future.'});
 if(doc.quote&&(doc.quote.revision.abandoned||doc.quote.revision.currentId!==doc.id||doc.quote.state==='refused'))return reply(409,{error:'Utilisez le devis en cours avant de l’envoyer.'});
 if(typeof env.BREVO_API_KEY!=='string'||!env.BREVO_API_KEY||!email(env.NOTIFY_FROM))return reply(503,{error:'Le service d’envoi doit être raccordé par l’administrateur.'});
 let p:EmailInput;try{p=JSON.parse(new TextDecoder().decode(await boundedBody(request,18000)));}catch{return reply(400,{error:'Message invalide.'});}
 if(!p||Object.keys(p).some(k=>!['id','recipient','subject','message'].includes(k))||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.id)||!email(p.recipient)||typeof p.subject!=='string'||!p.subject.trim()||p.subject.length>200||/[\r\n\x00-\x1f]/.test(p.subject)||typeof p.message!=='string'||!p.message.trim()||p.message.length>10000)return reply(400,{error:'Vérifiez le destinataire, l’objet et le message.'});
 const hash=sha(JSON.stringify([doc.id,doc.version,p.recipient,p.subject,p.message]));
 const previous=await db.prepare('SELECT * FROM billing_email_deliveries WHERE id=?').bind(p.id).first<EmailDelivery&{request_hash:string}>();
 if(previous)return previous.request_hash===hash?reply(200,{delivery:previous}):reply(409,{error:'Cet envoi correspond déjà à un autre message.'});
 const response=await issuedFile(db,env,doc.issuance.id,'pdf',reply),bytes=await boundedBody(response,12*1024*1024),stamp=new Date().toISOString();
 const inserted=await db.prepare(`INSERT INTO billing_email_deliveries(id,document_id,document_version,request_hash,recipient,subject,message,state,attachment_sha256,created_at,updated_at,created_by) VALUES(?,?,?,?,?,?,?,'sending',?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id`).bind(p.id,doc.id,doc.version,hash,p.recipient,p.subject,p.message,sha(bytes),stamp,stamp,user).first();
 if(!inserted)return reply(409,{error:'Cet envoi est déjà en cours. Consultez l’historique.'});
 let state:EmailDelivery['state']='unknown',provider:string|null=null;
 try{
  const result=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',redirect:'manual',headers:{'api-key':env.BREVO_API_KEY,'Content-Type':'application/json',accept:'application/json'},body:JSON.stringify({sender:{email:env.NOTIFY_FROM,name:'CDINNOV'},to:[{email:p.recipient}],replyTo:{email:'cdi@cdinnov.com',name:'CDINNOV'},subject:p.subject,textContent:p.message,attachment:[{name:doc.issuance.number.replace(/[^a-z0-9_-]/gi,'-')+'.pdf',content:Buffer.from(bytes).toString('base64')}],headers:{idempotencyKey:p.id}}),signal:AbortSignal.timeout(15000)});
  if(result.status===201){const data=await result.json() as {messageId?:string};if(typeof data.messageId==='string'){provider=data.messageId.slice(0,500);state='sent';}}
  else if(result.status>=400&&result.status<500)state='failed';
 }catch{/* An ambiguous outcome must never trigger a second submission automatically. */}
 const updates=[db.prepare('UPDATE billing_email_deliveries SET state=?,provider_id=?,updated_at=? WHERE id=?').bind(state,provider,new Date().toISOString(),p.id)];
 if(state==='sent'&&doc.data.kind==='quote'&&doc.data.issueDate<=billingToday()){
  updates.push(db.prepare(`INSERT INTO billing_quote_events(id,document_id,document_version,version,action,occurred_on,note,request_hash,recorded_at,recorded_by)
   SELECT ?,?,?,1,'sent',?,'Envoi avec PDF par e-mail',?,?,? WHERE NOT EXISTS(SELECT 1 FROM billing_quote_events WHERE document_id=?) AND NOT EXISTS(SELECT 1 FROM billing_documents WHERE source_document_id=?)`).bind(p.id,doc.id,doc.version,billingToday(),sha(p.id),stamp,user,doc.id,doc.id));
 }
 // A failed follow-up write must not lose the provider acknowledgement.
 try{await db.batch(updates);}catch{await updates[0].run();}
 return reply(200,{delivery:{id:p.id,recipient:p.recipient,subject:p.subject,state,provider_id:provider,created_at:stamp}});
}
