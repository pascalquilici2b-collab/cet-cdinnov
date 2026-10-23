/** Reversible removal. Issued invoices, history, files and numbers are always retained. */
export const billingTrashSchema=[
 `CREATE TABLE IF NOT EXISTS billing_document_trash(document_id TEXT PRIMARY KEY REFERENCES billing_documents(id),document_version INTEGER NOT NULL,deleted_at TEXT NOT NULL,deleted_by TEXT NOT NULL)`,
 `DROP TRIGGER IF EXISTS billing_trash_guard`,
 `CREATE TRIGGER IF NOT EXISTS billing_trash_guard BEFORE INSERT ON billing_document_trash BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_documents WHERE id=NEW.document_id AND version=NEW.document_version)
 OR EXISTS(SELECT 1 FROM billing_issuances i JOIN billing_documents d ON d.id=i.document_id JOIN billing_issue_jobs j ON j.issuance_id=i.id WHERE i.document_id=NEW.document_id AND (d.kind<>'invoice' OR j.state<>'ready'))
 THEN RAISE(ABORT,'BILLING_TRASH_CONFLICT') END; END`,
 `CREATE TRIGGER IF NOT EXISTS billing_trash_no_update BEFORE UPDATE ON billing_document_trash BEGIN SELECT RAISE(ABORT,'BILLING_TRASH_CONFLICT'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_trashed_document_guard BEFORE UPDATE ON billing_documents WHEN EXISTS(SELECT 1 FROM billing_document_trash WHERE document_id=OLD.id) BEGIN SELECT RAISE(ABORT,'BILLING_TRASH_CONFLICT'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_trashed_issuance_guard BEFORE INSERT ON billing_issuances WHEN EXISTS(SELECT 1 FROM billing_document_trash WHERE document_id=NEW.document_id) BEGIN SELECT RAISE(ABORT,'BILLING_TRASH_CONFLICT'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_trashed_number_guard BEFORE INSERT ON billing_draft_numbers WHEN EXISTS(SELECT 1 FROM billing_document_trash WHERE document_id=NEW.document_id) BEGIN SELECT RAISE(ABORT,'BILLING_TRASH_CONFLICT'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_trashed_conversion_guard BEFORE INSERT ON billing_documents WHEN EXISTS(SELECT 1 FROM billing_document_trash WHERE document_id=NEW.source_document_id) BEGIN SELECT RAISE(ABORT,'BILLING_TRASH_CONFLICT'); END`
];
