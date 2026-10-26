import {createHash} from 'node:crypto';
import type {Database,Reply} from './contracts';
import type {BillingDocument} from './billing-contracts';
import {boundedBody} from './portal';
import {validateMail} from './billing-mail-content';
import {graph,microsoftProfile,microsoftOwnerMatches,documentPropertyId} from './billing-microsoft-draft';
import {billingToday} from './billing-quote-domain';
import type {SentGraphMessage} from './billing-microsoft-send';
export const sentAtSQL="(SELECT max(created_at) FROM billing_email_deliveries WHERE document_id=billing_documents.id AND state='sent')";
/** Direct sends are verified in the employee's Sent Items; manual attestations stay explicit. Tokens are transient, never stored. */
export async function confirmOutlookSent(request:Request,db:Database,doc:BillingDocument,user:string,reply:Reply,reload:()=>Promise<BillingDocument>){
 if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
 if(request.headers.get('if-match')!==String(doc.version))return reply(409,{error:'Le document a changé. Actualisez-le.'});
 if(doc.status!=='issued'||doc.rectification?.replacementId)return reply(409,{error:'Seul un document finalisé en cours peut être marqué envoyé.'});
 let p;try{p=JSON.parse(new TextDecoder().decode(await boundedBody(request,80000)));}catch{return reply(400,{error:'Confirmation invalide.'});}
 if(!p||Array.isArray(p)||Object.keys(p).some(k=>!['recipient','subject','message','graph'].includes(k))||typeof p.recipient!=='string'||typeof p.subject!=='string'||typeof p.message!=='string')return reply(400,{error:'Confirmation invalide.'});
 try{validateMail(p);}catch{return reply(400,{error:'Vérifiez le destinataire et le message.'});}
 let provider='outlook-manual-confirmation',stamp=new Date().toISOString(),recipient=p.recipient,subject=p.subject,message=p.message;
 if(p.graph){
  if(typeof p.graph.accessToken!=='string'||p.graph.accessToken.length<10||p.graph.accessToken.length>20000||typeof p.graph.messageId!=='string'||!p.graph.messageId||p.graph.messageId.length>1500)return reply(400,{error:'Preuve Outlook invalide.'});
  try{
   const token=p.graph.accessToken,profile=await microsoftProfile(token);if(!microsoftOwnerMatches(user,profile))return reply(403,{error:'La boîte Outlook ne correspond pas à votre compte CDInnov.'});
   const query=new URLSearchParams({'$select':'id,isDraft,sentDateTime,subject,body,toRecipients','$expand':"singleValueExtendedProperties($filter=id eq '"+documentPropertyId+"')"});
   const sent=await graph<SentGraphMessage&{singleValueExtendedProperties?:{id:string;value:string}[]}>(token,'/me/messages/'+encodeURIComponent(p.graph.messageId)+'?'+query);
   if(sent.isDraft||!sent.sentDateTime||!Number.isFinite(Date.parse(sent.sentDateTime)))return reply(409,{error:'Outlook n’a pas encore confirmé l’envoi. Vérifiez à nouveau dans quelques instants.'});
   if(!sent.singleValueExtendedProperties?.some(v=>v.id===documentPropertyId&&v.value==='direct:'+doc.id+':'+doc.version))return reply(409,{error:'Ce message Outlook ne correspond pas à cette version du document.'});
   provider='outlook-graph:'+profile.id+':'+sent.id;stamp=sent.sentDateTime;recipient=sent.toRecipients.map(r=>r.emailAddress.address).join('; ');subject=sent.subject;message=sent.body.content.slice(0,15000);
  }catch{return reply(502,{error:'L’envoi est à vérifier dans Outlook. Actualisez sa confirmation ; aucun nouveau message ne sera envoyé.'});}
 }
 const hash=createHash('sha256').update(JSON.stringify([doc.id,doc.version,provider,...(p.graph?[]:[recipient,subject,message])])).digest('hex'),id='outlook-'+hash;
 const insert=db.prepare(`INSERT INTO billing_email_deliveries(id,document_id,document_version,request_hash,recipient,subject,message,state,provider_id,attachment_sha256,created_at,updated_at,created_by)
 SELECT ?,id,version,?,?,?,?,'sent',?,'',?,?,? FROM billing_documents WHERE id=? AND version=?
 AND NOT EXISTS(SELECT 1 FROM billing_invoice_rectifications r WHERE r.original_id=billing_documents.id AND NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=r.replacement_id))
 AND NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=billing_documents.id)
 ON CONFLICT(id) DO NOTHING`).bind(id,hash,recipient,subject,message,provider,stamp,stamp,user,doc.id,doc.version);
 const operations=[insert];
 // Preserve accepted/refused states and all pre-existing quote history.
 if(doc.data.kind==='quote'&&!doc.quote?.invoice&&!doc.quote?.revision.abandoned&&doc.quote?.revision.currentId===doc.id){
  operations.push(db.prepare(`INSERT INTO billing_quote_events(id,document_id,document_version,version,action,occurred_on,note,request_hash,recorded_at,recorded_by)
   SELECT ?,?,?,1,'sent',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM billing_email_deliveries WHERE id=?)
   AND NOT EXISTS(SELECT 1 FROM billing_quote_events WHERE document_id=?)
   AND NOT EXISTS(SELECT 1 FROM billing_documents WHERE source_document_id=?)`).bind(id,doc.id,doc.version,billingToday(),p.graph?'Envoi confirmé par Microsoft Outlook.':'Envoi confirmé depuis Outlook.',hash,stamp,user,id,doc.id,doc.id));
 }
 try{await db.batch(operations);}catch(e){if(/BILLING_QUOTE_TRANSITION|BILLING_REVISION_INACTIVE/.test(String(e)))return reply(409,{error:'Le suivi du devis a changé. Actualisez la confirmation de l’envoi.'});throw e;}
 if(!await db.prepare('SELECT id FROM billing_email_deliveries WHERE id=?').bind(id).first())return reply(409,{error:'Le document a changé. Actualisez-le.'});
 return reply(200,await reload());
}
