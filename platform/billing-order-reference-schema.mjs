/** Replayable safety guard; historical documents and their references remain intact.
 * Resolve exactly the same effective order as billing_order_allocations: the shared
 * follow-up/accepted quote takes precedence over the document's original references.
 * An issued snapshot remains immutable and retries never insert another issuance.
 */
export const billingOrderReferenceSafetySchema=[
 `CREATE TRIGGER IF NOT EXISTS billing_issuance_order_reference_guard BEFORE INSERT ON billing_issuances
 WHEN EXISTS(SELECT 1 FROM billing_documents d
 LEFT JOIN billing_link_roots roots ON roots.id=d.id
 LEFT JOIN billing_document_followup f ON f.document_id=roots.root_id
 LEFT JOIN billing_quote_engagements e ON e.document_id=roots.root_id AND e.kind='order'
 WHERE d.id=NEW.document_id AND d.kind='invoice' AND json_extract(d.data_json,'$.creditNote') IS NULL
 AND coalesce(json_extract(f.link_json,'$.orderId'),json_extract(e.metadata_json,'$.orderId'),json_extract(d.data_json,'$.references.orderId'),'')=''
 AND (SELECT count(*) FROM billing_order_limits l
 WHERE l.market_id=coalesce(json_extract(f.link_json,'$.marketId'),json_extract(e.metadata_json,'$.marketId'),json_extract(d.data_json,'$.references.marketId'))
 AND lower(trim(l.reference))=lower(trim(coalesce(json_extract(f.link_json,'$.reference'),json_extract(e.metadata_json,'$.reference'),json_extract(d.data_json,'$.references.orderReference')))))>1)
 BEGIN SELECT RAISE(ABORT,'BILLING_ORDER_AMBIGUOUS'); END`,
 ...['INSERT','UPDATE'].map(action=>`CREATE TRIGGER IF NOT EXISTS billing_imported_order_reference_${action.toLowerCase()} BEFORE ${action} ON portal_invoices
 WHEN coalesce(json_extract(NEW.data_json,'$.orderId'),'')=''
 ${action==='INSERT'?"AND NOT EXISTS(SELECT 1 FROM portal_invoices WHERE record_key=NEW.record_key)":`AND (json_extract(NEW.data_json,'$.ht') IS NOT json_extract(OLD.data_json,'$.ht') OR json_extract(NEW.data_json,'$.marketId') IS NOT json_extract(OLD.data_json,'$.marketId') OR json_extract(NEW.data_json,'$.orderId') IS NOT json_extract(OLD.data_json,'$.orderId') OR json_extract(NEW.data_json,'$.orderReference') IS NOT json_extract(OLD.data_json,'$.orderReference'))`}
 AND (SELECT count(*) FROM billing_order_limits l WHERE l.market_id=json_extract(NEW.data_json,'$.marketId') AND lower(trim(l.reference))=lower(trim(json_extract(NEW.data_json,'$.orderReference'))))>1
 BEGIN SELECT RAISE(ABORT,'BILLING_ORDER_AMBIGUOUS'); END`)
];
