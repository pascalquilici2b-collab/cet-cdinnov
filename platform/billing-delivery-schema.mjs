export const billingDeliverySchema=[`CREATE TABLE IF NOT EXISTS billing_email_deliveries(
 id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES billing_documents(id),document_version INTEGER NOT NULL,
 request_hash TEXT NOT NULL,recipient TEXT NOT NULL,subject TEXT NOT NULL,message TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('sending','sent','failed','unknown')),provider_id TEXT,attachment_sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,created_by TEXT NOT NULL
)`,`CREATE INDEX IF NOT EXISTS billing_email_document ON billing_email_deliveries(document_id,created_at DESC)`];
