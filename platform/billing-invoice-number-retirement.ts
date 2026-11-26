import type {Database} from './contracts';
import type {BillingDocument} from './billing-contracts';
import {invoiceReservationJSON,invoiceNumberingPolicyReady} from './billing-invoice-finalization-number-schema.mjs';
const fail=(status:number,message:string):never=>{throw Object.assign(Error(message),{status});};
export async function retireInvoiceDraftNumber(db:Database,record:BillingDocument,version:number,input:{notTransmitted:unknown;reason:unknown},user:string){
 if(record.data.kind!=='invoice'||record.issuance)return fail(409,'Seule une ancienne réservation de facture encore en brouillon peut être régularisée.');
 if(record.regularization)return fail(409,'Ce brouillon a déjà été régularisé avec son devis. La décision de conservation de son numéro est enregistrée.');
 if(!await invoiceNumberingPolicyReady(db))return fail(503,'La mise à jour de la numérotation est en cours. Le brouillon est conservé ; réessayez dans quelques instants.');
 if(record.version!==version)return fail(409,'La facture a changé. Actualisez-la avant de régulariser son numéro.');
 if(input.notTransmitted!==true||typeof input.reason!=='string'||input.reason.trim().length<10||input.reason.trim().length>2000)return fail(422,'Confirmez la non-transmission et indiquez une raison de 10 à 2 000 caractères.');
 const reason=input.reason.trim();
 const find=()=>db.prepare('SELECT document_version,reason FROM billing_invoice_number_retirements WHERE document_id=?').bind(record.id).first<{document_version:number;reason:string}>();
 const same=(row:{document_version:number;reason:string})=>row.document_version===version&&row.reason===reason;
 const existing=await find();if(existing){if(same(existing))return;return fail(409,'Cette réservation possède déjà une régularisation auditée.');}
 const evidence=JSON.stringify({policy:'invoice-number-on-finalization-v1',notTransmitted:true,untrackedDraftPdfsPossible:true});
 try{
  const row=await db.prepare(`INSERT INTO billing_invoice_number_retirements(document_id,document_version,reservation_json,reason,evidence_json,retired_at,retired_by)
  SELECT d.id,d.version,${invoiceReservationJSON('n')},?,?,?,? FROM billing_documents d JOIN billing_draft_numbers n ON n.document_id=d.id
  WHERE d.id=? AND d.version=? AND d.kind='invoice'
  AND NOT EXISTS(SELECT 1 FROM billing_issuances i WHERE i.document_id=d.id)
  AND NOT EXISTS(SELECT 1 FROM billing_email_deliveries e WHERE e.document_id=d.id AND e.state IN('sending','sent','unknown'))
  RETURNING document_id`).bind(reason,evidence,new Date().toISOString(),user,record.id,version).first();
  if(row)return;
 }catch(error){const replay=await find();if(replay&&same(replay))return;if(!/BILLING_NUMBER_RETIREMENT_CONFLICT|UNIQUE constraint/.test(String(error)))throw error;}
 return fail(409,'Régularisation impossible : réservation absente, document modifié, déjà finalisé ou transmission enregistrée. Vérifiez les anciens PDF et les envois.');
}
