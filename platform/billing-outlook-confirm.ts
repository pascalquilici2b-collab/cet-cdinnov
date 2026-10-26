import {createHash} from 'node:crypto';
import type {Database,Reply} from './contracts';
import type {BillingDocument} from './billing-contracts';
import {boundedBody} from './portal';
export const sentAtSQL="(SELECT max(created_at) FROM billing_email_deliveries WHERE document_id=billing_documents.id AND state='sent')";
/** User attestation of an Outlook send; never calls a mail provider. */
export async function confirmOutlookSent(request:Request,db:Database,doc:BillingDocument,user:string,reply:Reply,reload:()=>Promise<BillingDocument>){
 if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
 if(request.headers.get('if-match')!==String(doc.version))return reply(409,{error:'La facture a changé. Actualisez-la.'});
 if(doc.status!=='issued'||doc.data.kind!=='invoice'||doc.rectification?.replacementId)return reply(409,{error:'Seule une facture finalisée en cours peut être marquée envoyée.'});
 let p;try{p=JSON.parse(new TextDecoder().decode(await boundedBody(request,50000)));}catch{return reply(400,{error:'Confirmation invalide.'});}
 if(!p||Object.keys(p).sort().join()!=='message,recipient,subject'||typeof p.recipient!=='string'||p.recipient.length>254||!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(p.recipient)||typeof p.subject!=='string'||!p.subject.trim()||p.subject.length>200||/[\r\n]/.test(p.subject)||typeof p.message!=='string'||p.message.length>10000)return reply(400,{error:'Vérifiez le destinataire et le message.'});
 const stamp=new Date().toISOString(),hash=createHash('sha256').update(JSON.stringify([doc.id,doc.version,p])).digest('hex');
 const inserted=await db.prepare(`INSERT INTO billing_email_deliveries(id,document_id,document_version,request_hash,recipient,subject,message,state,provider_id,attachment_sha256,created_at,updated_at,created_by)
 SELECT ?,id,version,?,?,?,?,'sent','outlook-manual-confirmation','',?,?,? FROM billing_documents WHERE id=? AND version=?
 AND NOT EXISTS(SELECT 1 FROM billing_invoice_rectifications r WHERE r.original_id=billing_documents.id AND NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=r.replacement_id))
 AND NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=billing_documents.id)
 ON CONFLICT(id) DO NOTHING RETURNING id`).bind('outlook-'+hash,hash,p.recipient,p.subject,p.message,stamp,stamp,user,doc.id,doc.version).first();
 if(!inserted&&!await db.prepare('SELECT id FROM billing_email_deliveries WHERE id=?').bind('outlook-'+hash).first())return reply(409,{error:'La facture a changé. Actualisez-la.'});
 return reply(200,await reload());
}
