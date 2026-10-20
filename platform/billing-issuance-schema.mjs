/** Reservation ledger, independent of the editable draft schema. Never run from an HTTP request. */
export const billingIssuanceSchema = [
 `CREATE TABLE IF NOT EXISTS billing_number_series (
  id TEXT PRIMARY KEY, issuer_siren TEXT NOT NULL CHECK(length(issuer_siren)=9 AND issuer_siren NOT GLOB '*[^0-9]*'),
  kind TEXT NOT NULL CHECK(kind IN ('invoice','quote')), prefix TEXT NOT NULL CHECK(length(prefix) BETWEEN 1 AND 26),
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 9), first_value INTEGER NOT NULL CHECK(first_value BETWEEN 1 AND 999999999),
  next_value INTEGER NOT NULL CHECK(next_value BETWEEN first_value AND 1000000000),
  start_date TEXT NOT NULL,end_date TEXT NOT NULL CHECK(end_date>=start_date),last_issue_date TEXT,
  version INTEGER NOT NULL CHECK(version>=1),created_at TEXT NOT NULL,created_by TEXT NOT NULL,
  UNIQUE(issuer_siren,prefix)
 )`,
 `CREATE TABLE IF NOT EXISTS billing_issuances (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL UNIQUE REFERENCES billing_documents(id),
  document_version INTEGER NOT NULL,series_id TEXT NOT NULL REFERENCES billing_number_series(id),
  issuer_siren TEXT NOT NULL,sequence_value INTEGER NOT NULL,number TEXT NOT NULL CHECK(length(number) BETWEEN 1 AND 35),
  issue_date TEXT NOT NULL,source_json TEXT NOT NULL CHECK(json_valid(source_json)),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),totals_json TEXT NOT NULL CHECK(json_valid(totals_json)),
  snapshot_sha256 TEXT NOT NULL CHECK(length(snapshot_sha256)=64 AND snapshot_sha256 NOT GLOB '*[^a-f0-9]*'),
  created_at TEXT NOT NULL,created_by TEXT NOT NULL,
  UNIQUE(series_id,sequence_value),UNIQUE(issuer_siren,number),
  FOREIGN KEY(document_id,document_version) REFERENCES billing_document_versions(document_id,version)
 )`,
 `CREATE TABLE IF NOT EXISTS billing_issue_jobs (
  issuance_id TEXT PRIMARY KEY REFERENCES billing_issuances(id),
  state TEXT NOT NULL CHECK(state IN ('pending','rendering','failed','ready')),
  version INTEGER NOT NULL CHECK(version>=1),attempts INTEGER NOT NULL CHECK(attempts>=0),
  lease_token TEXT,lease_until INTEGER,error_code TEXT,manifest_json TEXT,
  updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,
  CHECK((state='rendering' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR (state<>'rendering' AND lease_token IS NULL AND lease_until IS NULL)),
  CHECK((state='failed' AND error_code IS NOT NULL) OR (state<>'failed' AND error_code IS NULL)),
  CHECK((state='ready' AND manifest_json IS NOT NULL AND json_valid(manifest_json)) OR (state<>'ready' AND manifest_json IS NULL))
 )`,
 `CREATE TABLE IF NOT EXISTS billing_issue_events (
  issuance_id TEXT NOT NULL REFERENCES billing_issuances(id),version INTEGER NOT NULL,state TEXT NOT NULL,
  attempts INTEGER NOT NULL,error_code TEXT,manifest_json TEXT,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,
  PRIMARY KEY(issuance_id,version)
 )`,
 `CREATE TABLE IF NOT EXISTS billing_issue_attempts (
  lease_token TEXT PRIMARY KEY,issuance_id TEXT NOT NULL REFERENCES billing_issuances(id),
  attempt INTEGER NOT NULL,started_at TEXT NOT NULL,started_by TEXT NOT NULL,UNIQUE(issuance_id,attempt)
 )`,
 `CREATE TRIGGER IF NOT EXISTS billing_series_initial BEFORE INSERT ON billing_number_series BEGIN
  SELECT CASE WHEN NEW.next_value<>NEW.first_value OR NEW.version<>1 OR NEW.last_issue_date IS NOT NULL
   THEN RAISE(ABORT,'BILLING_SERIES_INITIAL') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM billing_number_series WHERE issuer_siren=NEW.issuer_siren AND kind=NEW.kind
   AND start_date<=NEW.end_date AND end_date>=NEW.start_date) THEN RAISE(ABORT,'BILLING_SERIES_OVERLAP') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_series_counter_guard BEFORE UPDATE ON billing_number_series BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.issuer_siren<>OLD.issuer_siren OR NEW.kind<>OLD.kind OR NEW.prefix<>OLD.prefix
   OR NEW.width<>OLD.width OR NEW.first_value<>OLD.first_value OR NEW.start_date<>OLD.start_date OR NEW.end_date<>OLD.end_date
   OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by OR NEW.version<>OLD.version+1 OR NEW.next_value<>OLD.next_value+1
   OR NOT EXISTS(SELECT 1 FROM billing_issuances WHERE series_id=OLD.id AND sequence_value=OLD.next_value AND issue_date=NEW.last_issue_date)
   THEN RAISE(ABORT,'BILLING_SERIES_IMMUTABLE') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_series_no_delete BEFORE DELETE ON billing_number_series BEGIN SELECT RAISE(ABORT,'BILLING_SERIES_IMMUTABLE'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_issuance_guard BEFORE INSERT ON billing_issuances BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_documents d JOIN billing_number_series s ON s.id=NEW.series_id
   WHERE d.id=NEW.document_id AND d.version=NEW.document_version AND d.status='draft' AND d.data_json=NEW.source_json
   AND d.kind=s.kind AND NEW.issuer_siren=s.issuer_siren
   AND coalesce(nullif(replace(json_extract(NEW.snapshot_json,'$.seller.siren'),' ',''),''),substr(replace(json_extract(NEW.snapshot_json,'$.seller.siret'),' ',''),1,9))=s.issuer_siren
   AND json_extract(NEW.snapshot_json,'$.kind')=d.kind AND json_extract(NEW.snapshot_json,'$.issueDate')=NEW.issue_date
   AND NEW.sequence_value=s.next_value AND NEW.sequence_value<=999999999
   AND NEW.number=s.prefix||printf('%0*d',s.width,s.next_value)
   AND NEW.issue_date BETWEEN s.start_date AND s.end_date AND (s.last_issue_date IS NULL OR NEW.issue_date>=s.last_issue_date))
   THEN RAISE(ABORT,'BILLING_RESERVATION_CONFLICT') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_issuance_insert AFTER INSERT ON billing_issuances BEGIN
  UPDATE billing_number_series SET next_value=next_value+1,version=version+1,last_issue_date=NEW.issue_date WHERE id=NEW.series_id;
  INSERT INTO billing_issue_jobs(issuance_id,state,version,attempts,updated_at,updated_by) VALUES(NEW.id,'pending',1,0,NEW.created_at,NEW.created_by);
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_issuance_no_update BEFORE UPDATE ON billing_issuances BEGIN SELECT RAISE(ABORT,'BILLING_ISSUANCE_IMMUTABLE'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_issuance_no_delete BEFORE DELETE ON billing_issuances BEGIN SELECT RAISE(ABORT,'BILLING_ISSUANCE_IMMUTABLE'); END`,
 // Replace in the linked-credit allocation migration, only after its guards exist.
 `CREATE TRIGGER IF NOT EXISTS billing_credit_unavailable_guard BEFORE INSERT ON billing_issuances
  WHEN json_extract(NEW.source_json,'$.schemaVersion')=3 OR json_extract(NEW.snapshot_json,'$.schemaVersion')=3
   OR json_type(NEW.source_json,'$.creditNote') IS NOT NULL OR json_type(NEW.snapshot_json,'$.creditNote') IS NOT NULL
  BEGIN SELECT RAISE(ABORT,'BILLING_CREDIT_UNAVAILABLE'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_reserved_document_no_update BEFORE UPDATE ON billing_documents
  WHEN EXISTS(SELECT 1 FROM billing_issuances WHERE document_id=OLD.id) BEGIN SELECT RAISE(ABORT,'BILLING_DOCUMENT_RESERVED'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_reserved_document_no_delete BEFORE DELETE ON billing_documents
  WHEN EXISTS(SELECT 1 FROM billing_issuances WHERE document_id=OLD.id) BEGIN SELECT RAISE(ABORT,'BILLING_DOCUMENT_RESERVED'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_job_initial BEFORE INSERT ON billing_issue_jobs BEGIN
  SELECT CASE WHEN NEW.state<>'pending' OR NEW.version<>1 OR NEW.attempts<>0 THEN RAISE(ABORT,'BILLING_JOB_INITIAL') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_job_guard BEFORE UPDATE ON billing_issue_jobs BEGIN
  SELECT CASE WHEN NEW.issuance_id<>OLD.issuance_id OR NEW.version<>OLD.version+1 OR OLD.state='ready'
   OR NOT ((NEW.state='rendering' AND NEW.attempts=OLD.attempts+1 AND NEW.lease_token IS NOT OLD.lease_token)
     OR (OLD.state='rendering' AND NEW.state IN ('failed','ready') AND NEW.attempts=OLD.attempts))
   THEN RAISE(ABORT,'BILLING_JOB_TRANSITION') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_job_insert AFTER INSERT ON billing_issue_jobs BEGIN
  INSERT INTO billing_issue_events VALUES(NEW.issuance_id,NEW.version,NEW.state,NEW.attempts,NEW.error_code,NEW.manifest_json,NEW.updated_at,NEW.updated_by);
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_job_update AFTER UPDATE ON billing_issue_jobs BEGIN
  INSERT INTO billing_issue_attempts SELECT NEW.lease_token,NEW.issuance_id,NEW.attempts,NEW.updated_at,NEW.updated_by WHERE NEW.state='rendering';
  INSERT INTO billing_issue_events VALUES(NEW.issuance_id,NEW.version,NEW.state,NEW.attempts,NEW.error_code,NEW.manifest_json,NEW.updated_at,NEW.updated_by);
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_attempt_no_update BEFORE UPDATE ON billing_issue_attempts BEGIN SELECT RAISE(ABORT,'BILLING_JOB_IMMUTABLE'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_attempt_no_delete BEFORE DELETE ON billing_issue_attempts BEGIN SELECT RAISE(ABORT,'BILLING_JOB_IMMUTABLE'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_job_no_delete BEFORE DELETE ON billing_issue_jobs BEGIN SELECT RAISE(ABORT,'BILLING_JOB_IMMUTABLE'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_issue_event_no_update BEFORE UPDATE ON billing_issue_events BEGIN SELECT RAISE(ABORT,'BILLING_JOB_IMMUTABLE'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_issue_event_no_delete BEFORE DELETE ON billing_issue_events BEGIN SELECT RAISE(ABORT,'BILLING_JOB_IMMUTABLE'); END`
];
