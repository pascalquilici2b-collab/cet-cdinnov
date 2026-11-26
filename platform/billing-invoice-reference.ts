import {createHash} from 'node:crypto';
import type {Database} from './contracts';
import type {BillingDocument,BillingRegularizationReference} from './billing-contracts';
import {checkInvoiceNumberPlan} from './billing-invoice-quote-number';
import {selectedSeries} from './billing-invoice-regularization';
import {invoiceQuoteIdSQL} from './billing-invoice-regularization-schema.mjs';
import {invoiceReservationJSON} from './billing-invoice-finalization-number-schema.mjs';
import {knownReferenceSQL,referenceCurrentPrefixSQL,referenceInvoiceStemSQL} from './billing-invoice-reference-schema.mjs';
const fail=(status:number,message:string):never=>{throw Object.assign(Error(message),{status});};
const externalId=(issuer:string,prefix:string)=>{const h=createHash('sha256').update('cdinnov-external-invoice-series-v1:'+issuer+':'+prefix).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
type Plan={documentVersion:number;quoteNumber:string;invoiceNumber:string;blockedReason?:string;reservationAction?:'preserve'|'release';seriesId?:string;baseSeriesId?:string;issuerSiren?:string;prefix?:string;width?:number;sequence?:number;createSeries?:boolean};
async function planReference(db:Database,record:BillingDocument):Promise<Plan>{
 const quoteNumber=record.data.references.quoteNumber||'',out:Plan={documentVersion:record.version,quoteNumber,invoiceNumber:''};
 const blocked=(message:string)=>({...out,blockedReason:message});
 if(record.data.kind!=='invoice'||record.issuance)return blocked('La régularisation concerne une facture encore en brouillon.');
 if(record.regularization)return blocked('Ce brouillon possède déjà une régularisation confirmée.');
 if(!await db.prepare('SELECT 1 FROM billing_draft_numbers WHERE document_id=?').bind(record.id).first())return blocked('La régularisation est réservée aux anciens brouillons possédant une réservation de numéro.');
 if(!quoteNumber)return blocked('Renseignez puis enregistrez la référence du devis dans « Affaire, marché et références ».');
 if((await db.prepare(`SELECT ${invoiceQuoteIdSQL('?')} quote_id`).bind(record.id).first<{quote_id:string|null}>())?.quote_id)return blocked('Cette facture possède déjà un devis d’origine. Utilisez la régularisation en rattachant le devis correspondant.');
 if((await db.prepare(`SELECT ${knownReferenceSQL('?')} present`).bind(quoteNumber,quoteNumber,quoteNumber,quoteNumber).first<{present:number}>())?.present)return blocked('Ce devis existe déjà dans le logiciel. Utilisez la régularisation en rattachant le devis correspondant.');
 const base=await selectedSeries(db,record.data);if(!base)return blocked('Configurez la série de numérotation des factures avant de poursuivre.');
 const policy=await db.prepare(`SELECT s.issuer_siren,s.width,${referenceInvoiceStemSQL('s')} stem,${referenceCurrentPrefixSQL('s','?')} current_prefix FROM billing_number_series s WHERE s.id=?`).bind(record.data.issueDate,record.data.issueDate,base.id).first<{issuer_siren:string;width:number;stem:string;current_prefix:string}>();
 if(!policy)return blocked('La série de facturation a changé. Rechargez le brouillon.');
 const suffix=quoteNumber.startsWith('DEV-')?quoteNumber.slice(4):quoteNumber;
 out.invoiceNumber=policy.stem+suffix;
 const own=await db.prepare(`SELECT n.*,s.next_value,s.last_issue_date,s.prefix,s.width FROM billing_draft_numbers n JOIN billing_number_series s ON s.id=n.series_id WHERE n.document_id=? AND n.issuer_siren=? AND n.number=?`).bind(record.id,policy.issuer_siren,out.invoiceNumber).first<{series_id:string;sequence_value:number;next_value:number;last_issue_date:string|null;prefix:string;width:number}>();
 // A six-digit prefix is an opaque historical namespace, not a date.
 const match=suffix.match(/^(\d{6})(\d{3,9})$/)||suffix.match(/^(\d{4}-|\d{8}-)(\d{3,9})$/);
 if(!own&&!match)return blocked('La référence doit être un numéro numérique, par exemple 260318004 ou DEV-202611004, sans espace.');
 let sequence=own?.sequence_value??Number(match![2]),prefix=own?.prefix??(policy.stem+match![1]);
 if(!own&&(sequence<1||sequence>999999999||String(sequence).padStart(policy.width,'0')!==match![2]))return blocked('Le rang final du devis doit être un entier positif au format de la série de facturation.');
 if(out.invoiceNumber.length>35||prefix.length>26)return blocked('Le numéro de facture issu de cette référence est trop long.');
 let seriesId=base.id,createSeries=false,last=base.last_issue_date,next=base.next_value,width=policy.width;
 if(own){seriesId=own.series_id;sequence=own.sequence_value;next=own.next_value;last=own.last_issue_date;prefix=own.prefix;width=own.width;}
 else if(prefix!==policy.current_prefix){
  const existing=await db.prepare(`SELECT s.*,EXISTS(SELECT 1 FROM billing_external_number_series x WHERE x.series_id=s.id) external FROM billing_number_series s WHERE s.issuer_siren=? AND s.prefix=?`).bind(policy.issuer_siren,prefix).first<{id:string;external:number;next_value:number;last_issue_date:string|null;width:number}>();
  if(existing&&!existing.external)return blocked('Ce préfixe appartient déjà à une autre série de facturation. Son historique doit être vérifié avant la régularisation.');
  if(existing&&existing.width!==width)return blocked('Le format de cette référence diffère de la série historique existante.');
  seriesId=existing?.id||externalId(policy.issuer_siren,prefix);createSeries=!existing;next=existing?.next_value??sequence;last=existing?.last_issue_date??null;
 }
 const checked=await checkInvoiceNumberPlan(db,record.id,record.data.issueDate,{quote_id:null,quote_number:quoteNumber,sequence_value:sequence,number:out.invoiceNumber,series_id:seriesId,next_value:next,last_issue_date:last},policy.issuer_siren);
 return {...out,seriesId,baseSeriesId:base.id,issuerSiren:policy.issuer_siren,prefix,width,sequence,createSeries,reservationAction:checked.reservationAction,...(checked.blockedReason?{blockedReason:checked.blockedReason}:{})};
}
export async function regularizationReference(db:Database,record:BillingDocument):Promise<BillingRegularizationReference>{
 const {documentVersion,quoteNumber,invoiceNumber,blockedReason,reservationAction}=await planReference(db,record);
 return {documentVersion,quoteNumber,invoiceNumber,...(blockedReason?{blockedReason}:{}),...(reservationAction?{reservationAction}:{})};
}
export async function regularizeInvoiceReference(db:Database,record:BillingDocument,version:number,input:{quoteNumber:unknown;referenceConfirmed:unknown;reason?:unknown},user:string){
 if(typeof input.quoteNumber!=='string'||input.referenceConfirmed!==true||input.reason!==undefined&&(typeof input.reason!=='string'||input.reason.length>2000))return fail(400,'Confirmez explicitement la référence du devis enregistrée dans cette facture.');
 const reason=String(input.reason||'').trim(),find=()=>db.prepare('SELECT * FROM billing_invoice_reference_regularizations WHERE document_id=?').bind(record.id).first<{document_version:number;quote_number:string;reason:string}>();
 const same=(r:{document_version:number;quote_number:string;reason:string})=>r.document_version===version&&r.quote_number===input.quoteNumber&&r.reason===reason;
 const previous=await find();if(previous){if(same(previous))return;return fail(409,'Cette facture possède déjà une référence confirmée.');}
 if(record.version!==version||record.data.references.quoteNumber!==input.quoteNumber)return fail(409,'La facture ou la référence du devis a changé. Enregistrez puis rechargez le document.');
 const plan=await planReference(db,record);if(plan.blockedReason)return fail(409,plan.blockedReason);
 const stamp=new Date().toISOString(),original=await db.prepare('SELECT data_json FROM billing_documents WHERE id=?').bind(record.id).first<{data_json:string}>();
 const statements=[];
 if(plan.createSeries)statements.push(db.prepare(`INSERT INTO billing_external_number_series(series_id,issuer_siren,prefix,width,first_value,base_series_id,document_id,document_version,quote_number,created_at,created_by) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM billing_external_number_series WHERE series_id=?)`).bind(plan.seriesId!,plan.issuerSiren!,plan.prefix!,plan.width!,plan.sequence!,plan.baseSeriesId!,record.id,version,input.quoteNumber,stamp,user,plan.seriesId!));
 statements.push(db.prepare(`INSERT INTO billing_invoice_reference_regularizations(document_id,document_version,quote_number,reference_confirmed,client_json,base_series_id,invoice_series_id,invoice_number,sequence_value,reservation_action,reservation_json,reason,regularized_at,regularized_by)
 VALUES(?,?,?,1,(SELECT json_object('clientId',json_extract(data_json,'$.clientId'),'siren',json_extract(data_json,'$.buyer.siren'),'siret',json_extract(data_json,'$.buyer.siret')) FROM billing_documents WHERE id=? AND version=? AND data_json=?),?,?,?,?,?,(SELECT ${invoiceReservationJSON('n')} FROM billing_draft_numbers n WHERE n.document_id=?),?,?,?)`).bind(record.id,version,input.quoteNumber,record.id,version,original?.data_json||'',plan.baseSeriesId!,plan.seriesId!,plan.invoiceNumber,plan.sequence!,plan.reservationAction!,record.id,reason,stamp,user));
 statements.push(db.prepare('UPDATE billing_documents SET version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=?').bind(stamp,user,record.id,version));
 try{await db.batch(statements);}catch(error){const replay=await find();if(replay&&same(replay))return;if(/BILLING_EXTERNAL_|BILLING_REGULARIZATION|BILLING_QUOTE_REFERENCE|UNIQUE constraint|NOT NULL constraint/.test(String(error)))return fail(409,'La facture, la référence ou la disponibilité du numéro a changé. Rechargez le brouillon.');throw error;}
 const result=await find();if(!result||!same(result))return fail(409,'La régularisation n’a pas été enregistrée. Rechargez le brouillon.');
}
