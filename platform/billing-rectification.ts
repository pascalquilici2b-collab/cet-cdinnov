import {linkedReferences} from './billing-link-sync';
import {budgetSQL,budgetBindings,checkOrderBudget,orderLimitMessage} from './billing-order-budget';
import {createHash,randomUUID} from 'node:crypto';
import type {Database} from './contracts';
import type {BillingDocument} from './billing-contracts';
import {normalizeDraft,billingId,calculateBilling,inspectDraft,addBillingDays} from './billing-domain';
import {billingToday} from './billing-quote-domain';
const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
export function rectificationJSON(){return `(SELECT json_object('parentId',parent.original_id,'parentNumber',pi.number,'replacementId',child.replacement_id,'replacementNumber',ci.number,
 'replacementState',CASE WHEN child.replacement_id IS NULL THEN NULL WHEN cj.state='ready' THEN 'issued' ELSE 'draft' END)
 FROM (SELECT 1) LEFT JOIN billing_invoice_rectifications parent ON parent.replacement_id=billing_documents.id
 LEFT JOIN billing_issuances pi ON pi.document_id=parent.original_id
 LEFT JOIN billing_invoice_rectifications child ON child.original_id=billing_documents.id AND NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=child.replacement_id)
 LEFT JOIN billing_issuances ci ON ci.document_id=child.replacement_id LEFT JOIN billing_issue_jobs cj ON cj.issuance_id=ci.id
 WHERE parent.original_id IS NOT NULL OR child.replacement_id IS NOT NULL)`;}
export async function rectifyInvoice(db:Database,record:BillingDocument,version:number,input:Record<string,unknown>,email:string){
 if(!billingId(input.id)||input.notTransmitted!==true)return fail(422,'Confirmez que la facture n’a pas été transmise au client.');
 if(record.data.kind!=='invoice'||record.status!=='issued'||record.data.creditNote)return fail(409,'Seule une facture finalisée peut être rectifiée.');
 if(record.version!==version)return fail(409,'La facture a changé. Actualisez-la avant de la rectifier.');
 if(record.settlement&&record.settlement.version>0)return fail(409,'Cette facture possède un historique de règlement. La rectification avant transmission est indisponible.');
 if(await db.prepare("SELECT 1 FROM billing_email_deliveries WHERE document_id=? AND state IN ('sent','sending','unknown')").bind(record.id).first())return fail(409,'Un envoi est enregistré pour cette facture. La rectification avant transmission est indisponible.');
 const existing=await db.prepare('SELECT replacement_id FROM billing_invoice_rectifications WHERE original_id=?').bind(record.id).first<{replacement_id:string}>();
 if(existing){try{await db.prepare('DELETE FROM billing_document_trash WHERE document_id=?').bind(existing.replacement_id).run();}catch(e){if(String(e).includes('BILLING_RECTIFICATION_CONFLICT'))return fail(409,'Un règlement ou un envoi empêche la reprise de cette rectification.');throw e;}return {id:existing.replacement_id,created:false};}
 const today=billingToday(),id=input.id.toLowerCase(),note='Remplace la facture '+record.issuance!.number+' non transmise au client.';
 const draft=normalizeDraft({...record.data,references:await linkedReferences(db,record.data.references,record.followup?.link),issueDate:today,dueDate:addBillingDays(today,30),lines:record.data.lines.map(l=>({...l,id:randomUUID()})),notes:[note,record.data.notes].filter(Boolean).join('\n\n')});
 const data=JSON.stringify(draft),stamp=new Date().toISOString();
 try{await db.batch([
 db.prepare(`INSERT INTO billing_documents(id,kind,status,version,data_json,totals_json,issues_json,create_hash,created_at,updated_at,created_by,updated_by) SELECT ?,'invoice','draft',1,?,?,?,?,?,?,?,? WHERE ${budgetSQL()}`).bind(id,data,JSON.stringify(calculateBilling(draft)),JSON.stringify(inspectDraft(draft)),createHash('sha256').update(data).digest('hex'),stamp,stamp,email,email,...budgetBindings(id,draft,record.id)),
 db.prepare('INSERT INTO billing_invoice_rectifications(original_id,replacement_id,original_version,created_at,created_by) VALUES(?,?,?,?,?)').bind(record.id,id,version,stamp,email),
 // A replacement keeps the completed work report as its own editable, audited copy.
 db.prepare('INSERT INTO billing_intervention_reports(document_key,version,data_json,updated_at,updated_by) SELECT ?,1,data_json,?,? FROM billing_intervention_reports WHERE document_key=?').bind(id,stamp,email,record.id)
 ]);}catch(e){const retry=await db.prepare('SELECT replacement_id FROM billing_invoice_rectifications WHERE original_id=?').bind(record.id).first<{replacement_id:string}>();if(retry)return {id:retry.replacement_id,created:false};const capacity=await checkOrderBudget(db,id,draft,record.id);if(capacity.blocked)return fail(422,capacity.message||orderLimitMessage);if(/BILLING_RECTIFICATION|UNIQUE constraint/.test(String(e)))return fail(409,'La facture ou son règlement a changé. Actualisez-la avant de poursuivre.');throw e;}
 return {id,created:true};
}
