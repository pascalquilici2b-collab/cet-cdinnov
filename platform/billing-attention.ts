import type {Database} from './contracts';
import type {BillingAttentionCounts} from './billing-contracts';
import {quoteJSON} from './billing-quote';
import {settlementJSON} from './billing-payments';
import {sentAtSQL} from './billing-outlook-confirm';

/** Counters need no client identity projection, document payloads or filter lists. */
export async function billingAttentionCounts(db:Database):Promise<BillingAttentionCounts>{
 const row=await db.prepare(`WITH summaries AS (
  SELECT id,kind,
   EXISTS(SELECT 1 FROM billing_issuances i JOIN billing_issue_jobs j ON j.issuance_id=i.id WHERE i.document_id=billing_documents.id AND j.state='ready') ready,
   ${sentAtSQL} sent_at,${settlementJSON()} settlement_json,${quoteJSON()} quote_json
  FROM billing_documents WHERE NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=billing_documents.id)
 ) SELECT
  coalesce(sum(kind='invoice' AND ready AND json_extract(settlement_json,'$.overdue')=1),0) overdue,
  coalesce(sum(kind='invoice' AND ready AND sent_at IS NULL AND json_extract(settlement_json,'$.state')='unpaid' AND json_extract(settlement_json,'$.overdue')=0),0) finalized,
  coalesce(sum(kind='quote' AND ready AND json_extract(quote_json,'$.state')='prepared' AND json_extract(quote_json,'$.revision.currentId')=id AND json_extract(quote_json,'$.revision.abandoned')=0),0) prepared
 FROM summaries`).first<BillingAttentionCounts>();
 return row||{overdue:0,finalized:0,prepared:0};
}
