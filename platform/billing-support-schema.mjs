/** Ancillary reports and client commitments never mutate issued document snapshots. */
export const billingSupportSchema = [
 `CREATE TABLE IF NOT EXISTS billing_quote_engagements (
  document_id TEXT PRIMARY KEY REFERENCES billing_documents(id), document_version INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('order','signed_quote')), filename TEXT NOT NULL,
  content_type TEXT NOT NULL, size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 10485760),
  object_key TEXT NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL
 )`,
 `CREATE TABLE IF NOT EXISTS billing_intervention_reports (
  document_key TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version>=1),
  data_json TEXT NOT NULL CHECK(json_valid(data_json)), updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
 )`,
 `CREATE TABLE IF NOT EXISTS billing_intervention_report_versions (
  document_key TEXT NOT NULL, version INTEGER NOT NULL, data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, PRIMARY KEY(document_key,version)
 )`,
 `CREATE TRIGGER IF NOT EXISTS billing_report_insert AFTER INSERT ON billing_intervention_reports BEGIN
  INSERT INTO billing_intervention_report_versions VALUES(NEW.document_key,NEW.version,NEW.data_json,NEW.updated_at,NEW.updated_by); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_report_update AFTER UPDATE ON billing_intervention_reports BEGIN
  INSERT INTO billing_intervention_report_versions VALUES(NEW.document_key,NEW.version,NEW.data_json,NEW.updated_at,NEW.updated_by); END`
];
