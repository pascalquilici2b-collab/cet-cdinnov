export const billingRectificationSchema=[
 `CREATE TABLE IF NOT EXISTS billing_invoice_rectifications (
 original_id TEXT PRIMARY KEY REFERENCES billing_documents(id),replacement_id TEXT NOT NULL UNIQUE REFERENCES billing_documents(id),
 original_version INTEGER NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL,CHECK(original_id<>replacement_id))`,
 `CREATE TRIGGER IF NOT EXISTS billing_rectification_guard BEFORE INSERT ON billing_invoice_rectifications BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_documents d JOIN billing_issuances i ON i.document_id=d.id JOIN billing_issue_jobs j ON j.issuance_id=i.id
 WHERE d.id=NEW.original_id AND d.kind='invoice' AND d.version=NEW.original_version AND j.state='ready'
 AND NOT EXISTS(SELECT 1 FROM billing_payment_accounts p WHERE p.document_id=d.id AND p.version>0)
 AND NOT EXISTS(SELECT 1 FROM billing_email_deliveries e WHERE e.document_id=d.id AND e.state IN ('sent','sending','unknown')))
 OR NOT EXISTS(SELECT 1 FROM billing_documents d WHERE d.id=NEW.replacement_id AND d.kind='invoice' AND NOT EXISTS(SELECT 1 FROM billing_issuances i WHERE i.document_id=d.id))
 THEN RAISE(ABORT,'BILLING_RECTIFICATION_CONFLICT') END; END`,
 `CREATE TRIGGER IF NOT EXISTS billing_rectification_no_update BEFORE UPDATE ON billing_invoice_rectifications BEGIN SELECT RAISE(ABORT,'BILLING_RECTIFICATION_HISTORY'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_rectification_no_delete BEFORE DELETE ON billing_invoice_rectifications BEGIN SELECT RAISE(ABORT,'BILLING_RECTIFICATION_HISTORY'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_payment_rectification_guard BEFORE INSERT ON billing_payment_operations WHEN EXISTS(
 SELECT 1 FROM billing_invoice_rectifications r WHERE r.original_id=NEW.document_id AND NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=r.replacement_id))
 BEGIN SELECT RAISE(ABORT,'BILLING_RECTIFICATION_CONFLICT'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_rectification_restore_guard BEFORE DELETE ON billing_document_trash WHEN EXISTS(
 SELECT 1 FROM billing_invoice_rectifications r WHERE r.replacement_id=OLD.document_id AND (
 EXISTS(SELECT 1 FROM billing_payment_accounts p WHERE p.document_id=r.original_id AND p.version>0)
 OR EXISTS(SELECT 1 FROM billing_email_deliveries e WHERE e.document_id=r.original_id AND e.state IN ('sent','sending','unknown'))))
 BEGIN SELECT RAISE(ABORT,'BILLING_RECTIFICATION_CONFLICT'); END`
];
