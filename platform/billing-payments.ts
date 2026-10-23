import {createHash} from 'node:crypto';
import type {Database,Reply} from './contracts';
import type {BillingDocument,BillingPaymentEntry} from './billing-contracts';
import {boundedBody} from './portal';
import {billingToday} from './billing-quote-domain';
import {normalizePaymentOperation} from './billing-payments-domain';

const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
/** Values interpolated here are only local calendar values and static SQL. Amounts stay decimal strings on the wire. */
export function settlementJSON(){
 const net="coalesce(p.balance_minor,0)",gross="CAST(json_extract(billing_documents.totals_json,'$.grossMinor') AS INTEGER)";
 return `(SELECT CASE WHEN billing_documents.kind='invoice' AND j.state='ready' AND NOT EXISTS(SELECT 1 FROM billing_invoice_rectifications r WHERE r.original_id=billing_documents.id AND NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=r.replacement_id)) THEN json_object(
  'version',coalesce(p.version,0),'receivedMinor',CAST(coalesce(p.received_minor,0) AS TEXT),'refundedMinor',CAST(coalesce(p.refunded_minor,0) AS TEXT),
  'netPaidMinor',CAST(${net} AS TEXT),'dueMinor',CAST(max(${gross}-${net},0) AS TEXT),'overpaidMinor',CAST(max(${net}-${gross},0) AS TEXT),
  'state',CASE WHEN ${net}>${gross} THEN 'overpaid' WHEN ${net}=${gross} THEN 'paid' WHEN ${net}=0 THEN 'unpaid' ELSE 'partial' END,
  'overdue',json(CASE WHEN ${net}<${gross} AND coalesce(nullif(json_extract(billing_documents.data_json,'$.dueDate'),''),date(json_extract(billing_documents.data_json,'$.issueDate'),'+30 days'))<'${billingToday()}' THEN 'true' ELSE 'false' END)) ELSE NULL END
  FROM billing_issuances i JOIN billing_issue_jobs j ON j.issuance_id=i.id LEFT JOIN billing_payment_accounts p ON p.document_id=i.document_id WHERE i.document_id=billing_documents.id)`;
}
export async function billingPaymentRoute(request:Request,db:Database,record:BillingDocument,email:string,reply:Reply,read:()=>Promise<BillingDocument>):Promise<Response>{
 if(record.data.kind!=='invoice')return fail(400,'Les règlements concernent les factures.');
 if(request.method==='GET'){
  const params=new URL(request.url).searchParams,before=params.get('before');
  if([...params.keys()].some(k=>k!=='before')||params.getAll('before').length>1||(before!==null&&(!/^[1-9]\d*$/.test(before)||!Number.isSafeInteger(Number(before)))))return fail(400,'Page de règlements invalide.');
  const rows=(await db.prepare(`SELECT e.id,e.version,e.kind,CAST(e.amount_minor AS TEXT) AS amountMinor,CAST(e.delta_minor AS TEXT) AS deltaMinor,
   CAST(e.balance_after_minor AS TEXT) AS balanceAfterMinor,e.occurred_on AS occurredOn,e.method,e.reference,e.note,e.reason,e.recorded_at AS recordedAt,e.recorded_by AS recordedBy,
   e.reversal_of AS reversalOf,(SELECT id FROM billing_payment_entries WHERE reversal_of=e.id) AS reversedBy,e.replacement_for AS replacementFor
   FROM billing_payment_entries e WHERE e.document_id=? AND e.version<? ORDER BY e.version DESC LIMIT 51`).bind(record.id,before===null?Number.MAX_SAFE_INTEGER:Number(before)).all<BillingPaymentEntry>()).results;
  return reply(200,{entries:rows.slice(0,50),nextBefore:rows.length>50?rows[49].version:null});
 }
 if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
 const expected=request.headers.get('if-match');
 if(expected===null)return fail(428,'La version des règlements est requise.');
 if(!/^(0|[1-9]\d*)$/.test(expected)||!Number.isSafeInteger(Number(expected)))return fail(400,'Version des règlements invalide.');
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return fail(415,'Format JSON requis.');
 const bytes=await boundedBody(request,18000);let raw;
 try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return fail(400,'Opération de règlement invalide.');}
 const today=billingToday(),input=normalizePaymentOperation(raw,today),version=Number(expected),hash=createHash('sha256').update(JSON.stringify([record.id,version,input])).digest('hex');
 const existing=()=>db.prepare('SELECT document_id,request_hash FROM billing_payment_operations WHERE id=?').bind(input.id).first<{document_id:string;request_hash:string}>();
 const replay=await existing();
 if(replay){if(replay.document_id!==record.id||replay.request_hash!==hash)return fail(409,'Cet identifiant de règlement est déjà utilisé.');return reply(200,await read());}
 if(record.status!=='issued'||!record.settlement)return fail(409,'Finalisez la facture avant d’enregistrer un règlement.');
 if(record.version!==input.documentVersion||record.settlement.version!==version)return fail(409,'Les règlements ont changé dans une autre session. Votre saisie est conservée ; actualisez les règlements.');
 try{
  await db.prepare(`INSERT INTO billing_payment_operations(id,document_id,document_version,expected_version,kind,target_id,amount_minor,occurred_on,method,reference,note,reason,correction_date,request_hash,recorded_at,recorded_by)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(input.id,record.id,input.documentVersion,version,input.kind,input.targetId,input.amountMinor===null?null:Number(input.amountMinor),input.occurredOn,input.method,input.reference,input.note,input.reason,today,hash,new Date().toISOString(),email).run();
 }catch(error){
  const retry=await existing();if(retry?.document_id===record.id&&retry.request_hash===hash)return reply(200,await read());
  if(String(error).includes('BILLING_RECTIFICATION_CONFLICT'))return fail(409,'Cette facture fait l’objet d’une rectification. Ouvrez sa version actuelle.');
  if(String(error).includes('BILLING_PAYMENT_BALANCE'))return fail(422,'Cette opération dépasserait les sommes reçues. Corrigez d’abord le mouvement concerné ou réduisez le remboursement.');
  if(/BILLING_PAYMENT_CONFLICT|BILLING_PAYMENT_TARGET|UNIQUE constraint/.test(String(error)))return fail(409,'Les règlements ont changé ou cette saisie a déjà été corrigée. Actualisez les règlements ; vos valeurs sont conservées.');
  throw error;
 }
 return reply(201,await read());
}
