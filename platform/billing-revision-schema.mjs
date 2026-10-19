export const revisionRoot=column=>`coalesce((SELECT root_document_id FROM billing_quote_revisions WHERE document_id=${column}),${column})`;
export const familyHasInvoice=root=>`EXISTS(SELECT 1 FROM billing_documents fi WHERE fi.source_document_id=${root} OR fi.source_document_id IN (SELECT document_id FROM billing_quote_revisions WHERE root_document_id=${root}))`;
export const revisionInactive=column=>`(EXISTS(SELECT 1 FROM billing_quote_families WHERE root_document_id=${revisionRoot(column)} AND current_document_id<>${column}) OR EXISTS(SELECT 1 FROM billing_quote_revisions WHERE document_id=${column} AND abandoned_at IS NOT NULL))`;
/** Revisions are separate documents. The family selects the current commercial proposal. */
export const billingRevisionSchema=[
 `CREATE TABLE IF NOT EXISTS billing_quote_families (
  root_document_id TEXT PRIMARY KEY REFERENCES billing_documents(id),current_document_id TEXT NOT NULL REFERENCES billing_documents(id),
  version INTEGER NOT NULL CHECK(version>=1),next_ordinal INTEGER NOT NULL CHECK(next_ordinal>=2),updated_at TEXT NOT NULL,updated_by TEXT NOT NULL
 )`,
 `CREATE TABLE IF NOT EXISTS billing_quote_revisions (
  document_id TEXT PRIMARY KEY REFERENCES billing_documents(id),root_document_id TEXT NOT NULL REFERENCES billing_quote_families(root_document_id),
  parent_document_id TEXT NOT NULL REFERENCES billing_documents(id),parent_document_version INTEGER NOT NULL,
  base_family_version INTEGER NOT NULL CHECK(base_family_version>=1),ordinal INTEGER NOT NULL CHECK(ordinal>=2),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),request_hash TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL,
  abandoned_id TEXT UNIQUE,abandoned_at TEXT,abandoned_by TEXT,abandon_reason TEXT,abandon_hash TEXT,
  UNIQUE(root_document_id,ordinal),FOREIGN KEY(parent_document_id,parent_document_version) REFERENCES billing_document_versions(document_id,version),
  CHECK((abandoned_at IS NULL AND abandoned_id IS NULL AND abandoned_by IS NULL AND abandon_reason IS NULL AND abandon_hash IS NULL)
   OR (abandoned_at IS NOT NULL AND abandoned_id IS NOT NULL AND abandoned_by IS NOT NULL AND length(trim(abandon_reason)) BETWEEN 1 AND 2000 AND abandon_hash IS NOT NULL))
 )`,
 `CREATE TABLE IF NOT EXISTS billing_quote_family_history (
  root_document_id TEXT NOT NULL REFERENCES billing_quote_families(root_document_id),version INTEGER NOT NULL,current_document_id TEXT NOT NULL,
  next_ordinal INTEGER NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,PRIMARY KEY(root_document_id,version)
 )`,
 `CREATE TRIGGER IF NOT EXISTS billing_family_initial BEFORE INSERT ON billing_quote_families BEGIN
  SELECT CASE WHEN NEW.root_document_id<>NEW.current_document_id OR NEW.version<>1 OR NEW.next_ordinal<>2
   OR EXISTS(SELECT 1 FROM billing_quote_revisions WHERE document_id=NEW.root_document_id)
   OR NOT EXISTS(SELECT 1 FROM billing_documents d JOIN billing_issuances i ON i.document_id=d.id JOIN billing_issue_jobs j ON j.issuance_id=i.id WHERE d.id=NEW.root_document_id AND d.kind='quote' AND j.state='ready')
   OR ${familyHasInvoice('NEW.root_document_id')} THEN RAISE(ABORT,'BILLING_REVISION_CONFLICT') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_revision_initial BEFORE INSERT ON billing_quote_revisions BEGIN
  SELECT CASE WHEN NEW.abandoned_at IS NOT NULL OR NEW.document_id IN (NEW.parent_document_id,NEW.root_document_id)
   OR EXISTS(SELECT 1 FROM billing_quote_families WHERE root_document_id=NEW.document_id)
   OR NOT EXISTS(SELECT 1 FROM billing_documents d WHERE d.id=NEW.document_id AND d.kind='quote' AND d.version=1 AND d.source_document_id IS NULL)
   OR EXISTS(SELECT 1 FROM billing_issuances WHERE document_id=NEW.document_id)
   OR NOT EXISTS(SELECT 1 FROM billing_quote_families f JOIN billing_documents p ON p.id=f.current_document_id JOIN billing_issuances i ON i.document_id=p.id JOIN billing_issue_jobs j ON j.issuance_id=i.id
    WHERE f.root_document_id=NEW.root_document_id AND f.version=NEW.base_family_version AND f.next_ordinal=NEW.ordinal
    AND p.id=NEW.parent_document_id AND p.version=NEW.parent_document_version AND p.kind='quote' AND j.state='ready')
   OR ${familyHasInvoice('NEW.root_document_id')} THEN RAISE(ABORT,'BILLING_REVISION_CONFLICT') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_revision_insert AFTER INSERT ON billing_quote_revisions BEGIN
  UPDATE billing_quote_families SET current_document_id=NEW.document_id,version=version+1,next_ordinal=next_ordinal+1,updated_at=NEW.created_at,updated_by=NEW.created_by WHERE root_document_id=NEW.root_document_id;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_revision_abandon_guard BEFORE UPDATE ON billing_quote_revisions BEGIN
  SELECT CASE WHEN NEW.document_id<>OLD.document_id OR NEW.root_document_id<>OLD.root_document_id OR NEW.parent_document_id<>OLD.parent_document_id OR NEW.parent_document_version<>OLD.parent_document_version
   OR NEW.base_family_version<>OLD.base_family_version OR NEW.ordinal<>OLD.ordinal OR NEW.reason<>OLD.reason OR NEW.request_hash<>OLD.request_hash OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by
   OR OLD.abandoned_at IS NOT NULL OR NEW.abandoned_at IS NULL
   OR NOT EXISTS(SELECT 1 FROM billing_quote_families WHERE root_document_id=OLD.root_document_id AND current_document_id=OLD.document_id)
   OR EXISTS(SELECT 1 FROM billing_issuances WHERE document_id=OLD.document_id) OR ${familyHasInvoice('OLD.root_document_id')}
   THEN RAISE(ABORT,'BILLING_REVISION_CONFLICT') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_revision_abandon AFTER UPDATE ON billing_quote_revisions BEGIN
  UPDATE billing_quote_families SET current_document_id=NEW.parent_document_id,version=version+1,updated_at=NEW.abandoned_at,updated_by=NEW.abandoned_by WHERE root_document_id=NEW.root_document_id;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_family_guard BEFORE UPDATE ON billing_quote_families BEGIN
  SELECT CASE WHEN NEW.root_document_id<>OLD.root_document_id OR NEW.version<>OLD.version+1 OR NOT (
   (NEW.next_ordinal=OLD.next_ordinal+1 AND EXISTS(SELECT 1 FROM billing_quote_revisions WHERE document_id=NEW.current_document_id AND root_document_id=OLD.root_document_id AND parent_document_id=OLD.current_document_id AND base_family_version=OLD.version AND ordinal=OLD.next_ordinal AND abandoned_at IS NULL))
   OR (NEW.next_ordinal=OLD.next_ordinal AND EXISTS(SELECT 1 FROM billing_quote_revisions WHERE document_id=OLD.current_document_id AND root_document_id=OLD.root_document_id AND parent_document_id=NEW.current_document_id AND abandoned_at IS NOT NULL)))
   THEN RAISE(ABORT,'BILLING_FAMILY_IMMUTABLE') END;
 END`,
 ...['INSERT','UPDATE'].map(op=>`CREATE TRIGGER IF NOT EXISTS billing_family_history_${op.toLowerCase()} AFTER ${op} ON billing_quote_families BEGIN INSERT INTO billing_quote_family_history VALUES(NEW.root_document_id,NEW.version,NEW.current_document_id,NEW.next_ordinal,NEW.updated_at,NEW.updated_by); END`),
 `CREATE TRIGGER IF NOT EXISTS billing_revision_event_guard BEFORE INSERT ON billing_quote_events WHEN ${revisionInactive('NEW.document_id')} OR ${familyHasInvoice(revisionRoot('NEW.document_id'))} BEGIN SELECT RAISE(ABORT,'BILLING_REVISION_INACTIVE'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_revision_conversion_guard BEFORE INSERT ON billing_documents WHEN NEW.source_document_id IS NOT NULL AND EXISTS(SELECT 1 FROM billing_quote_families WHERE root_document_id=${revisionRoot('NEW.source_document_id')}) AND (${revisionInactive('NEW.source_document_id')} OR ${familyHasInvoice(revisionRoot('NEW.source_document_id'))}) BEGIN SELECT RAISE(ABORT,'BILLING_REVISION_INACTIVE'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_revision_issuance_guard BEFORE INSERT ON billing_issuances WHEN ${revisionInactive('NEW.document_id')} BEGIN SELECT RAISE(ABORT,'BILLING_REVISION_INACTIVE'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_abandoned_document_guard BEFORE UPDATE ON billing_documents WHEN EXISTS(SELECT 1 FROM billing_quote_revisions WHERE document_id=OLD.id AND abandoned_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'BILLING_REVISION_INACTIVE'); END`,
 ...['billing_quote_families','billing_quote_revisions','billing_quote_family_history'].map(table=>`CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'BILLING_REVISION_HISTORY'); END`),
 `CREATE TRIGGER IF NOT EXISTS billing_family_history_no_update BEFORE UPDATE ON billing_quote_family_history BEGIN SELECT RAISE(ABORT,'BILLING_REVISION_HISTORY'); END`
];
