import {invoiceQuoteNumberPlan} from './billing-invoice-quote-number.ts';
export {invoiceQuoteNumberPlan} from './billing-invoice-quote-number.ts';
import type {Database} from './contracts';
import type {BillingDocument,BillingDraft,BillingRegularizationQuote} from './billing-contracts';
import {normalizeDraft,inspectDraft,billingId} from './billing-domain';
import {clientFilterProjection} from './billing-client-filter-projection';
import {invoiceReservationJSON} from './billing-invoice-finalization-number-schema.mjs';
import {invoiceQuoteIdSQL} from './billing-invoice-regularization-schema.mjs';
import {revisionInactive} from './billing-revision-schema.mjs';

const fail=(status:number,message:string):never=>{throw Object.assign(Error(message),{status});};
const digits=(value:string|undefined)=>String(value||'').replace(/[\s.\-]/g,'');
const siren=(data:BillingDraft)=>digits(data.buyer.siren)||digits(data.buyer.siret).slice(0,9);
const issuer=(data:BillingDraft)=>digits(data.seller.siren)||digits(data.seller.siret).slice(0,9);
type QuoteRow={id:string;version:number;data_json:string;number:string;sequence_value:number;stem:string};
type LinkRow={document_id:string;document_version:number;quote_id:string;quote_version:number;quote_number:string;reason:string;regularized_at:string};
const normalizeQuery=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
export const regularizationJSON=`(SELECT json_object('quoteId',r.quote_id,'quoteNumber',r.quote_number,'regularizedAt',r.regularized_at,'invoiceNumber',r.invoice_number,'reservationAction',r.reservation_action) FROM billing_invoice_regularizations r WHERE r.document_id=billing_documents.id)`;

async function identities(db:Database){return (await clientFilterProjection(db,null,false)).native;}
function compatible(invoice:BillingDocument,quote:QuoteRow,identity:Awaited<ReturnType<typeof identities>>){
 const data=normalizeDraft(JSON.parse(quote.data_json)),a=siren(invoice.data),b=siren(data);
 if(a&&b&&a!==b)return false;
 if(issuer(invoice.data)!==issuer(data))return false;
 if(invoice.data.clientId&&invoice.data.clientId===data.clientId)return true;
 const left=identity.find(x=>x.id===invoice.id)?.value,right=identity.find(x=>x.id===quote.id)?.value;
 if(left&&left===right&&!left.startsWith('name:'))return true;
 const as=digits(invoice.data.buyer.siret),bs=digits(data.buyer.siret);
 return !!(as&&as===bs||a&&a===b&&(!as||!bs));
}
async function selectedSeries(db:Database,data:BillingDraft){
 return db.prepare(`SELECT s.id,s.prefix,s.next_value,s.last_issue_date FROM billing_number_series s
 WHERE s.issuer_siren=? AND s.kind='invoice' AND NOT EXISTS(SELECT 1 FROM billing_retired_series r WHERE r.series_id=s.id)
 ORDER BY EXISTS(SELECT 1 FROM billing_default_series p WHERE p.series_id=s.id) DESC,s.created_at DESC LIMIT 1`).bind(issuer(data)).first<{id:string;prefix:string;next_value:number;last_issue_date:string|null}>();
}
export async function regularizationQuotes(db:Database,record:BillingDocument,query=''):Promise<{items:BillingRegularizationQuote[];total:number}>{
 if(record.data.kind!=='invoice'||record.issuance)return fail(409,'Le rattachement concerne une facture encore en brouillon.');
 if(!await db.prepare('SELECT 1 FROM billing_draft_numbers WHERE document_id=?').bind(record.id).first())return fail(409,'La régularisation est réservée aux anciens brouillons possédant une réservation de numéro.');
 if(query.length>200)return fail(400,'Recherche trop longue.');
 const [identity,series,source]=await Promise.all([identities(db),selectedSeries(db,record.data),db.prepare(`SELECT ${invoiceQuoteIdSQL('?')} quote_id`).bind(record.id).first<{quote_id:string|null}>()]);
 const rows=(await db.prepare(`SELECT d.id,d.version,d.data_json,n.number,n.sequence_value,n.stem FROM billing_documents d JOIN billing_quote_number_sources n ON n.document_id=d.id
 WHERE d.kind='quote' AND (? IS NULL AND NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=d.id) AND NOT ${revisionInactive('d.id')} OR d.id=?) ORDER BY d.created_at DESC,d.id DESC`).bind(source?.quote_id||null,source?.quote_id||null).all<QuoteRow>()).results;
 const matches=rows.filter(row=>{if(!compatible(record,row,identity))return false;const d=normalizeDraft(JSON.parse(row.data_json));return !query||normalizeQuery([row.number,d.title,d.buyer.name].join(' ')).includes(normalizeQuery(query));});
 const items:BillingRegularizationQuote[]=[];
 for(const row of matches.slice(0,100)){
  const d=normalizeDraft(JSON.parse(row.data_json));
  const plan=series?await invoiceQuoteNumberPlan(db,record.id,series.id,record.data.issueDate,row.id):null;
  items.push({id:row.id,version:row.version,number:row.number,title:d.title,issueDate:d.issueDate,clientName:d.buyer.name,invoiceNumber:plan?.number||'',reservationAction:plan?.reservationAction,...(source?.quote_id===row.id?{selectedSource:true}:{}),...(plan?.blockedReason?{blockedReason:plan.blockedReason}:!series?{blockedReason:'Configurez la série de numérotation des factures avant de poursuivre.'}:{})});
 }
 return {items,total:matches.length};
}
export async function regularizeInvoice(db:Database,record:BillingDocument,version:number,input:{quoteId:unknown;quoteVersion:unknown;reason?:unknown},user:string){
 if(record.data.kind!=='invoice'||record.issuance)return fail(409,'Seule une facture encore en brouillon peut être régularisée.');
 if(!billingId(input.quoteId)||!Number.isSafeInteger(input.quoteVersion)||(input.quoteVersion as number)<1||input.reason!==undefined&&(typeof input.reason!=='string'||input.reason.length>2000))return fail(400,'Devis, version ou motif de régularisation invalide.');
 const quoteId=(input.quoteId as string).toLowerCase(),reason=String(input.reason||'').trim(),find=()=>db.prepare('SELECT * FROM billing_invoice_regularizations WHERE document_id=?').bind(record.id).first<LinkRow>();
 const same=(r:LinkRow)=>r.document_version===version&&r.quote_id===quoteId&&r.quote_version===input.quoteVersion&&r.reason===reason;
 const existing=await find();if(existing){if(same(existing))return;return fail(409,'Ce brouillon possède déjà un rattachement audité à son devis.');}
 if(record.version!==version)return fail(409,'La facture a changé. Rechargez-la avant de la régulariser.');
 const candidates=await regularizationQuotes(db,record,(await db.prepare('SELECT number FROM billing_quote_number_sources WHERE document_id=?').bind(quoteId).first<{number:string}>())?.number||''),selected=candidates.items.find(q=>q.id===quoteId);
 if(!selected)return fail(422,'Choisissez un devis numéroté du même client, dans sa version en cours. Le devis d’origine est conservé pour une facture déjà liée.');
 if(selected.version!==input.quoteVersion)return fail(409,'Le devis a changé. Actualisez la liste avant de continuer.');
 if(selected.blockedReason)return fail(409,selected.blockedReason);
 const series=await selectedSeries(db,record.data);if(!series)return fail(409,'La série de factures a changé. Actualisez la page.');
 const data={...record.data,references:{...record.data.references,quoteNumber:selected.number}},stamp=new Date().toISOString();
 const original=await db.prepare('SELECT data_json FROM billing_documents WHERE id=?').bind(record.id).first<{data_json:string}>();
 try{
  await db.batch([
   db.prepare(`INSERT INTO billing_invoice_regularizations(document_id,document_version,quote_id,quote_version,quote_number,invoice_series_id,invoice_number,reservation_action,reservation_json,reason,regularized_at,regularized_by)
   SELECT d.id,d.version,q.id,q.version,?,?,?,?,(SELECT ${invoiceReservationJSON('n')} FROM billing_draft_numbers n WHERE n.document_id=d.id),?,?,? FROM billing_documents d JOIN billing_documents q ON q.id=?
   WHERE d.id=? AND d.version=? AND d.data_json=? AND q.version=?`).bind(selected.number,series.id,selected.invoiceNumber,selected.reservationAction||'release',reason,stamp,user,quoteId,record.id,version,original?.data_json||'',input.quoteVersion),
   db.prepare(`UPDATE billing_documents SET version=version+1,data_json=?,issues_json=?,updated_at=?,updated_by=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM billing_invoice_regularizations r WHERE r.document_id=billing_documents.id AND r.document_version=?)`).bind(JSON.stringify(data),JSON.stringify(inspectDraft(data)),stamp,user,record.id,version,version)
  ]);
 }catch(error){const retry=await find();if(retry&&same(retry))return;if(String(error).includes('BILLING_ORDER_LIMIT'))return fail(422,'Ce rattachement dépasserait le montant du bon de commande associé au devis.');if(/BILLING_REGULARIZATION_CONFLICT|BILLING_QUOTE_REFERENCE|UNIQUE constraint/.test(String(error)))return fail(409,'Le document ou le devis a changé, ou une transmission existe déjà. Rechargez le brouillon.');throw error;}
 const result=await find();if(!result||!same(result))return fail(409,'Le document ou le devis a changé. Actualisez la page avant de poursuivre.');
}
