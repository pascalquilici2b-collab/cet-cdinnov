import {createHash} from 'node:crypto';
import type {Database,Reply} from './contracts';
import type {BillingDocument} from './billing-contracts';
import {boundedBody} from './portal';
import {validBillingDate} from './billing-domain';
import {billingToday} from './billing-quote-domain';

/** A manual declaration records an already completed transmission; it never sends email. */
export async function declareInvoiceSent(request:Request,db:Database,doc:BillingDocument,user:string,reply:Reply,reload:()=>Promise<BillingDocument>){
 if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
 if(request.headers.get('if-match')!==String(doc.version))return reply(409,{error:'Le document a changé. Actualisez-le.'});
 if(doc.data.kind!=='invoice'||doc.status!=='issued'||doc.rectification?.replacementId)return reply(409,{error:'Seule une facture finalisée en cours peut être déclarée envoyée.'});
 let input;try{input=JSON.parse(new TextDecoder().decode(await boundedBody(request,2048)));}catch{return reply(400,{error:'Confirmation invalide.'});}
 if(!input||Array.isArray(input)||Object.keys(input).length!==2||input.confirmed!==true||typeof input.sentOn!=='string'||!validBillingDate(input.sentOn)||input.sentOn<doc.data.issueDate||input.sentOn>billingToday())return reply(422,{error:'Confirmez l’envoi et indiquez sa date, entre la date de facture et aujourd’hui.'});
 if(doc.sentAt)return reply(200,await reload());
 const id='invoice-sent-'+doc.id+':'+doc.version,hash=createHash('sha256').update(JSON.stringify([id,input.sentOn])).digest('hex'),stamp=input.sentOn+'T12:00:00.000Z',now=new Date().toISOString();
 await db.prepare(`INSERT INTO billing_email_deliveries(id,document_id,document_version,request_hash,recipient,subject,message,state,provider_id,attachment_sha256,created_at,updated_at,created_by)
 SELECT ?,id,version,?,?,?,'Envoi déclaré manuellement.','sent','manual-invoice-confirmation','',?,?,? FROM billing_documents
 WHERE id=? AND version=?
 AND EXISTS(SELECT 1 FROM billing_issuances i JOIN billing_issue_jobs j ON j.issuance_id=i.id WHERE i.document_id=billing_documents.id AND j.state='ready')
 AND NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=billing_documents.id)
 AND NOT EXISTS(SELECT 1 FROM billing_invoice_rectifications r WHERE r.original_id=billing_documents.id AND NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=r.replacement_id))
 AND NOT EXISTS(SELECT 1 FROM billing_email_deliveries d WHERE d.document_id=billing_documents.id AND d.state='sent')
 ON CONFLICT(id) DO NOTHING`).bind(id,hash,doc.data.buyer.email||'',doc.issuance?.number||'',stamp,now,user,doc.id,doc.version).run();
 const result=await reload();
 if(!result.sentAt)return reply(409,{error:'La facture a changé. Actualisez-la avant de confirmer son envoi.'});
 return reply(200,result);
}
