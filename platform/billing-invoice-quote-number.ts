import type {Database} from './contracts';
import {invoiceQuoteNumberSQL,regularizedQuoteIdSQL} from './billing-invoice-regularization-schema.mjs';
const fail=(status:number,message:string):never=>{throw Object.assign(Error(message),{status});};
export async function invoiceQuoteNumberPlan(db:Database,documentId:string,seriesId:string,issueDate:string,quoteId?:string){
 if(!quoteId){
  const external=await db.prepare(`SELECT a.invoice_series_id series_id,a.invoice_number number,a.sequence_value,a.quote_number,NULL quote_id,s.next_value,s.last_issue_date FROM billing_invoice_reference_regularizations a JOIN billing_number_series s ON s.id=a.invoice_series_id WHERE a.document_id=?`).bind(documentId).first<InvoiceNumberPlan>();
  if(external){if(external.series_id!==seriesId)return fail(409,'La série de régularisation et le numéro confirmé sont conservés.');return checkInvoiceNumberPlan(db,documentId,issueDate,external);}
 }
 const qid=quoteId||((await db.prepare(`SELECT ${regularizedQuoteIdSQL('?')} quote_id`).bind(documentId).first<{quote_id:string|null}>())?.quote_id);
 if(!qid)return null;
 if(!quoteId){const registered=await db.prepare('SELECT invoice_series_id FROM billing_invoice_regularizations WHERE document_id=?').bind(documentId).first<{invoice_series_id:string}>();if(registered&&registered.invoice_series_id!==seriesId)return fail(409,'La série de facturation a changé depuis la régularisation. Le numéro prévu et son historique sont conservés.');}
 const plan=await db.prepare(`SELECT q.document_id quote_id,q.number quote_number,q.sequence_value,${invoiceQuoteNumberSQL()} number,s.id series_id,s.last_issue_date,s.next_value
 FROM billing_quote_number_sources q JOIN billing_number_series s ON s.id=? WHERE q.document_id=? AND s.issuer_siren=q.issuer_siren AND s.kind='invoice'`).bind(seriesId,qid).first<{quote_id:string;quote_number:string;sequence_value:number;number:string;series_id:string;last_issue_date:string|null;next_value:number}>();
 if(!plan)return fail(409,'Le devis lié ne possède pas de numéro compatible avec la série de factures.');
 return checkInvoiceNumberPlan(db,documentId,issueDate,plan);
}
export type InvoiceNumberPlan={quote_id:string|null;quote_number:string;sequence_value:number;number:string;series_id:string;last_issue_date:string|null;next_value:number};
export async function checkInvoiceNumberPlan(db:Database,documentId:string,issueDate:string,plan:InvoiceNumberPlan,issuerSiren?:string){
 const seriesId=plan.series_id;
 let blockedReason='';
 if(await db.prepare('SELECT 1 FROM billing_retired_series WHERE series_id=?').bind(seriesId).first())blockedReason='La série prévue pour cette régularisation est archivée. Son numéro ne peut pas être émis dans une autre série.';
 if(plan.number.length>35)blockedReason='Le numéro de facture issu de ce devis dépasse la longueur autorisée.';
 let reservationAction:'preserve'|'release'='release';
 const used=await db.prepare(`SELECT document_id,number,series_id,sequence_value,'issuance' origin,0 retired FROM billing_issuances WHERE issuer_siren=coalesce(?,(SELECT issuer_siren FROM billing_number_series WHERE id=?)) AND (number=? OR (series_id=? AND sequence_value=?))
 UNION ALL SELECT document_id,number,series_id,sequence_value,'reservation' origin,EXISTS(SELECT 1 FROM billing_invoice_number_retirements r WHERE r.document_id=n.document_id) retired FROM billing_draft_numbers n WHERE issuer_siren=coalesce(?,(SELECT issuer_siren FROM billing_number_series WHERE id=?)) AND number=? LIMIT 1`).bind(issuerSiren??null,seriesId,plan.number,seriesId,plan.sequence_value,issuerSiren??null,seriesId,plan.number).first<{document_id:string;number:string;series_id:string;sequence_value:number;origin:string;retired:number}>();
 if(used&&used.document_id!==documentId)blockedReason='Le numéro '+plan.number+' est déjà utilisé ou réservé dans l’historique d’une autre facture. Aucun second numéro identique ne peut être créé.';
 else if(used){
  if(used.origin==='reservation'&&!used.retired&&used.series_id===seriesId&&used.sequence_value===plan.sequence_value)reservationAction='preserve';
  else blockedReason='Le numéro '+plan.number+' figure déjà dans l’historique de cette facture et ne peut pas être réattribué : sa réservation a été retirée ou appartient à une autre série.';
 }
 if(!blockedReason&&plan.sequence_value>plan.next_value)blockedReason='Le numéro '+plan.number+' créerait un saut dans la numérotation des factures. Le prochain rang disponible est '+plan.next_value+' ; aucun numéro intermédiaire ne sera ignoré.';
 const chronology=await db.prepare(`SELECT issue_date,sequence_value FROM billing_issuances WHERE series_id=? AND (issue_date>? OR (sequence_value>? AND issue_date<?)) LIMIT 1`).bind(seriesId,issueDate,plan.sequence_value,issueDate).first();
 if(!blockedReason&&(chronology||plan.last_issue_date&&issueDate<plan.last_issue_date))blockedReason='La date de cette facture et le numéro du devis ne respectent pas l’ordre des factures déjà finalisées. Vérifiez le devis et la date du brouillon.';
 return {...plan,blockedReason,reservationAction};
}
