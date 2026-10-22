import {revisionInactive} from '../platform/billing-revision-schema.mjs';
export async function quoteConsumption(db){
 const table=await db.prepare("SELECT name FROM sqlite_master WHERE name='billing_quote_events'").first();
 if(!table)return new Map();
 const rows=await db.prepare(`SELECT json_extract(data_json,'$.references.marketId') AS market_id,
 count(*) AS quote_count,coalesce(sum(CAST(json_extract(totals_json,'$.netMinor') AS INTEGER)),0) AS quoted_minor
 FROM billing_documents WHERE kind='quote'
 AND EXISTS(SELECT 1 FROM billing_issuances i JOIN billing_issue_jobs j ON j.issuance_id=i.id WHERE i.document_id=billing_documents.id AND j.state='ready')
 AND coalesce((SELECT action FROM billing_quote_events WHERE document_id=billing_documents.id ORDER BY version DESC LIMIT 1),'') IN('sent','accepted','reopened')
 AND NOT ${revisionInactive('billing_documents.id')}
 GROUP BY market_id`).all();
 return new Map(rows.results.map(r=>[r.market_id,{sentQuoteCount:r.quote_count,quotedMinor:r.quoted_minor}]));
}
