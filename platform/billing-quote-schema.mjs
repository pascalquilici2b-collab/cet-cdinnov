/** Commercial events never modify the document or its issued PDF. */
export const billingQuoteSchema=[
 `CREATE TABLE IF NOT EXISTS billing_quote_events (
  id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES billing_documents(id),document_version INTEGER NOT NULL,
  version INTEGER NOT NULL CHECK(version>=1),action TEXT NOT NULL CHECK(action IN ('sent','accepted','refused','reopened')),
  occurred_on TEXT NOT NULL CHECK(length(occurred_on)=10 AND coalesce(date(occurred_on,'+0 days')=occurred_on,0)),note TEXT NOT NULL CHECK(length(note)<=2000),
  request_hash TEXT NOT NULL,recorded_at TEXT NOT NULL,recorded_by TEXT NOT NULL,
  UNIQUE(document_id,version),FOREIGN KEY(document_id,document_version) REFERENCES billing_document_versions(document_id,version)
 )`,
 `CREATE TRIGGER IF NOT EXISTS billing_quote_event_guard BEFORE INSERT ON billing_quote_events BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_documents d JOIN billing_issuances i ON i.document_id=d.id
   JOIN billing_issue_jobs j ON j.issuance_id=i.id WHERE d.id=NEW.document_id AND d.kind='quote' AND d.version=NEW.document_version AND j.state='ready')
   OR NEW.version<>coalesce((SELECT max(version) FROM billing_quote_events WHERE document_id=NEW.document_id),0)+1
   OR EXISTS(SELECT 1 FROM billing_documents WHERE source_document_id=NEW.document_id)
   OR (NEW.action='sent' AND NEW.version<>1)
   OR (NEW.action IN ('accepted','refused') AND coalesce((SELECT action FROM billing_quote_events WHERE document_id=NEW.document_id ORDER BY version DESC LIMIT 1),'sent') NOT IN ('sent','reopened'))
   OR (NEW.action='reopened' AND coalesce((SELECT action FROM billing_quote_events WHERE document_id=NEW.document_id ORDER BY version DESC LIMIT 1),'') NOT IN ('accepted','refused'))
   OR (NEW.action<>'sent' AND length(trim(NEW.note))=0)
   OR NEW.occurred_on < (SELECT json_extract(data_json,'$.issueDate') FROM billing_documents WHERE id=NEW.document_id)
   OR (NEW.action='accepted' AND NEW.occurred_on > (SELECT json_extract(data_json,'$.validUntil') FROM billing_documents WHERE id=NEW.document_id))
   OR (NEW.action<>'reopened' AND NEW.occurred_on < (SELECT occurred_on FROM billing_quote_events WHERE document_id=NEW.document_id AND action='sent'))
   THEN RAISE(ABORT,'BILLING_QUOTE_TRANSITION') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_quote_event_no_update BEFORE UPDATE ON billing_quote_events BEGIN SELECT RAISE(ABORT,'BILLING_QUOTE_HISTORY'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_quote_event_no_delete BEFORE DELETE ON billing_quote_events BEGIN SELECT RAISE(ABORT,'BILLING_QUOTE_HISTORY'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_quote_conversion_guard BEFORE INSERT ON billing_documents
  WHEN NEW.source_document_id IS NOT NULL AND EXISTS(SELECT 1 FROM billing_issuances WHERE document_id=NEW.source_document_id) BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_issuances i JOIN billing_issue_jobs j ON j.issuance_id=i.id
   WHERE i.document_id=NEW.source_document_id AND j.state='ready')
   OR coalesce((SELECT action FROM billing_quote_events WHERE document_id=NEW.source_document_id ORDER BY version DESC LIMIT 1),'')<>'accepted'
   THEN RAISE(ABORT,'BILLING_QUOTE_ACCEPTANCE_REQUIRED') END;
 END`
];
