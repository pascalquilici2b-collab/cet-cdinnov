/** Mutable commercial tracking is separate from immutable issued PDFs. */
export const billingFollowupSchema=[
`CREATE TABLE IF NOT EXISTS billing_document_followup(document_id TEXT PRIMARY KEY REFERENCES billing_documents(id),version INTEGER NOT NULL,title TEXT,link_json TEXT CHECK(link_json IS NULL OR json_valid(link_json)),updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS billing_document_followup_history(document_id TEXT NOT NULL,version INTEGER NOT NULL,title TEXT,link_json TEXT,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,PRIMARY KEY(document_id,version))`,
...['UPDATE','DELETE'].map(action=>`CREATE TRIGGER IF NOT EXISTS billing_followup_history_no_${action.toLowerCase()} BEFORE ${action} ON billing_document_followup_history BEGIN SELECT RAISE(ABORT,'BILLING_FOLLOWUP_HISTORY_IMMUTABLE'); END`),
`CREATE VIEW IF NOT EXISTS billing_link_roots AS WITH RECURSIVE ancestry(id,parent_id,depth) AS (
 SELECT id,id,0 FROM billing_documents UNION ALL SELECT a.id,r.original_id,a.depth+1 FROM ancestry a JOIN billing_invoice_rectifications r ON r.replacement_id=a.parent_id WHERE a.depth<32
) SELECT a.id,coalesce(d.source_document_id,d.id) root_id FROM ancestry a JOIN billing_documents d ON d.id=a.parent_id WHERE NOT EXISTS(SELECT 1 FROM billing_invoice_rectifications r WHERE r.replacement_id=a.parent_id)`,
...['INSERT','UPDATE'].map(action=>`CREATE TRIGGER IF NOT EXISTS billing_followup_history_${action.toLowerCase()} AFTER ${action} ON billing_document_followup BEGIN INSERT INTO billing_document_followup_history VALUES(NEW.document_id,NEW.version,NEW.title,NEW.link_json,NEW.updated_at,NEW.updated_by); END`),
`CREATE TRIGGER IF NOT EXISTS billing_followup_version BEFORE UPDATE ON billing_document_followup WHEN NEW.document_id<>OLD.document_id OR NEW.version<>OLD.version+1 BEGIN SELECT RAISE(ABORT,'BILLING_FOLLOWUP_VERSION'); END`,
...['INSERT','UPDATE'].map(action=>`CREATE TRIGGER IF NOT EXISTS billing_followup_capacity_${action.toLowerCase()} AFTER ${action} ON billing_document_followup WHEN NEW.link_json IS NOT NULL BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM billing_order_limits l WHERE l.market_id=json_extract(NEW.link_json,'$.marketId') AND l.order_id=json_extract(NEW.link_json,'$.orderId') AND l.limit_minor IS NOT NULL AND coalesce((SELECT sum(a.amount_minor) FROM billing_order_allocations a WHERE a.market_id=l.market_id AND a.order_id=l.order_id),0)>l.limit_minor) THEN RAISE(ABORT,'BILLING_ORDER_LIMIT') END;
 END`)
];
