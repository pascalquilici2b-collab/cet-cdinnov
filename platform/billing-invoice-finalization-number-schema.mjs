import {billingNumberSQL} from './billing-monthly-number-schema.mjs';

/** Final policy, installed after all historical numbering migrations. No data
 * retirement is automatic: each old invoice allocation needs its own audit. */
const quoteAllocation=`EXISTS(SELECT 1 FROM billing_draft_numbers n WHERE n.document_id=NEW.document_id AND n.series_id=s.id AND n.issuer_siren=NEW.issuer_siren AND n.sequence_value=NEW.sequence_value AND n.number=NEW.number)`;
const fresh=`NEW.sequence_value=s.next_value AND NEW.number=${billingNumberSQL('NEW.issue_date')} AND NOT EXISTS(SELECT 1 FROM billing_retired_series r WHERE r.series_id=s.id)`;
export const invoiceReservationJSON=(alias='n')=>`json_object('documentId',${alias}.document_id,'seriesId',${alias}.series_id,'issuerSiren',${alias}.issuer_siren,'sequenceValue',${alias}.sequence_value,'number',${alias}.number,'numberDate',${alias}.number_date,'createdAt',${alias}.created_at,'createdBy',${alias}.created_by)`;
export const billingInvoiceFinalizationNumberSchema=[
 `CREATE TABLE IF NOT EXISTS billing_invoice_number_retirements(
 document_id TEXT PRIMARY KEY REFERENCES billing_draft_numbers(document_id),document_version INTEGER NOT NULL,
 reservation_json TEXT NOT NULL CHECK(json_valid(reservation_json)),reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 2000),
 evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND coalesce(json_type(evidence_json,'$.notTransmitted')='true',0)),
 retired_at TEXT NOT NULL,retired_by TEXT NOT NULL,
 FOREIGN KEY(document_id,document_version) REFERENCES billing_document_versions(document_id,version))`,
 `CREATE TRIGGER IF NOT EXISTS billing_invoice_number_retirement_guard BEFORE INSERT ON billing_invoice_number_retirements BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_documents d JOIN billing_draft_numbers n ON n.document_id=d.id
 WHERE d.id=NEW.document_id AND d.kind='invoice' AND d.version=NEW.document_version
 AND NEW.reservation_json=${invoiceReservationJSON('n')}
 AND NOT EXISTS(SELECT 1 FROM billing_issuances i WHERE i.document_id=d.id)
 AND NOT EXISTS(SELECT 1 FROM billing_email_deliveries e WHERE e.document_id=d.id AND e.state IN('sending','sent','unknown')))
 THEN RAISE(ABORT,'BILLING_NUMBER_RETIREMENT_CONFLICT') END; END`,
 ...['UPDATE','DELETE'].map(op=>`CREATE TRIGGER IF NOT EXISTS billing_invoice_number_retirement_no_${op.toLowerCase()} BEFORE ${op} ON billing_invoice_number_retirements BEGIN SELECT RAISE(ABORT,'BILLING_NUMBER_RETIREMENT_IMMUTABLE'); END`),
 `CREATE TABLE IF NOT EXISTS billing_invoice_number_policy(id INTEGER PRIMARY KEY CHECK(id=1),activated_at TEXT NOT NULL)`,
 ...['UPDATE','DELETE'].map(op=>`CREATE TRIGGER IF NOT EXISTS billing_invoice_number_policy_no_${op.toLowerCase()} BEFORE ${op} ON billing_invoice_number_policy BEGIN SELECT RAISE(ABORT,'BILLING_NUMBER_POLICY_IMMUTABLE'); END`),
 'DROP TRIGGER IF EXISTS billing_draft_number_guard',
 `CREATE TRIGGER IF NOT EXISTS billing_draft_number_guard BEFORE INSERT ON billing_draft_numbers BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_documents d JOIN billing_number_series s ON s.id=NEW.series_id
 WHERE d.id=NEW.document_id AND d.kind='quote' AND s.kind='quote' AND NEW.issuer_siren=s.issuer_siren
 AND NEW.sequence_value=s.next_value AND NEW.sequence_value<=999999999
 AND coalesce(nullif(replace(json_extract(d.data_json,'$.seller.siren'),' ',''),''),substr(replace(json_extract(d.data_json,'$.seller.siret'),' ',''),1,9))=s.issuer_siren
 AND NEW.number_date BETWEEN s.start_date AND s.end_date
 AND NEW.number=${billingNumberSQL('NEW.number_date')}
 AND NOT EXISTS(SELECT 1 FROM billing_retired_series r WHERE r.series_id=s.id)
 AND NOT EXISTS(SELECT 1 FROM billing_issuances i WHERE i.document_id=d.id OR (i.issuer_siren=NEW.issuer_siren AND i.number=NEW.number)))
 THEN RAISE(ABORT,'BILLING_DRAFT_NUMBER_CONFLICT') END; END`,
 'DROP TRIGGER IF EXISTS billing_draft_number_document_guard',
 `CREATE TRIGGER IF NOT EXISTS billing_draft_number_document_guard BEFORE UPDATE ON billing_documents WHEN EXISTS(SELECT 1 FROM billing_draft_numbers n WHERE n.document_id=OLD.id AND NOT EXISTS(SELECT 1 FROM billing_invoice_number_retirements r WHERE r.document_id=n.document_id)) BEGIN
 SELECT CASE WHEN coalesce(nullif(replace(json_extract(NEW.data_json,'$.seller.siren'),' ',''),''),substr(replace(json_extract(NEW.data_json,'$.seller.siret'),' ',''),1,9))<>(SELECT issuer_siren FROM billing_draft_numbers WHERE document_id=OLD.id)
 THEN RAISE(ABORT,'BILLING_DRAFT_NUMBER_ISSUER') END; END`,
 'DROP TRIGGER IF EXISTS billing_issuance_guard',
 `CREATE TRIGGER IF NOT EXISTS billing_issuance_guard BEFORE INSERT ON billing_issuances BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_documents d JOIN billing_number_series s ON s.id=NEW.series_id
 WHERE d.id=NEW.document_id AND d.version=NEW.document_version AND d.status='draft' AND d.data_json=NEW.source_json
 AND d.kind=s.kind AND NEW.issuer_siren=s.issuer_siren
 AND coalesce(nullif(replace(json_extract(NEW.snapshot_json,'$.seller.siren'),' ',''),''),substr(replace(json_extract(NEW.snapshot_json,'$.seller.siret'),' ',''),1,9))=s.issuer_siren
 AND json_extract(NEW.snapshot_json,'$.kind')=d.kind AND json_extract(NEW.snapshot_json,'$.issueDate')=NEW.issue_date
 AND NEW.sequence_value<=999999999 AND (s.last_issue_date IS NULL OR NEW.issue_date>=s.last_issue_date)
 AND ((d.kind='quote' AND (${quoteAllocation} OR (NOT EXISTS(SELECT 1 FROM billing_draft_numbers n WHERE n.document_id=d.id) AND ${fresh})))
 OR (d.kind='invoice' AND ${fresh}
 AND NOT EXISTS(SELECT 1 FROM billing_draft_numbers n WHERE n.document_id=d.id AND NOT EXISTS(SELECT 1 FROM billing_invoice_number_retirements r WHERE r.document_id=n.document_id))))
 AND ((d.kind='quote' AND ${quoteAllocation}) OR NEW.issue_date BETWEEN s.start_date AND s.end_date)
 AND NOT EXISTS(SELECT 1 FROM billing_draft_numbers n WHERE n.issuer_siren=NEW.issuer_siren AND n.number=NEW.number AND NOT(d.kind='quote' AND n.document_id=d.id AND ${quoteAllocation})))
 THEN RAISE(ABORT,'BILLING_RESERVATION_CONFLICT') END; END`,
 'DROP TRIGGER IF EXISTS billing_issuance_insert',
 `CREATE TRIGGER IF NOT EXISTS billing_issuance_insert AFTER INSERT ON billing_issuances BEGIN
 UPDATE billing_number_series SET next_value=next_value+1,version=version+1,last_issue_date=NEW.issue_date
 WHERE id=NEW.series_id AND ((SELECT kind FROM billing_documents WHERE id=NEW.document_id)='invoice' OR NOT EXISTS(SELECT 1 FROM billing_draft_numbers WHERE document_id=NEW.document_id));
 INSERT INTO billing_issue_jobs(issuance_id,state,version,attempts,updated_at,updated_by) VALUES(NEW.id,'pending',1,0,NEW.created_at,NEW.created_by); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_rectified_invoice_delivery_guard BEFORE INSERT ON billing_email_deliveries
 WHEN NEW.state IN('sending','sent','unknown') AND EXISTS(SELECT 1 FROM billing_invoice_rectifications r WHERE r.original_id=NEW.document_id AND NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=r.replacement_id))
 BEGIN SELECT RAISE(ABORT,'BILLING_RECTIFICATION_CONFLICT'); END`,
 `INSERT OR IGNORE INTO billing_invoice_number_policy(id,activated_at) VALUES(1,datetime('now'))`
];
// Prepare before deploying a Worker whose SELECTs read the audit table. The
// remaining statements switch policy atomically; no financial rows are edited.
const activationStart=billingInvoiceFinalizationNumberSchema.indexOf('DROP TRIGGER IF EXISTS billing_draft_number_guard');
export const billingInvoiceFinalizationNumberPrepareSchema=billingInvoiceFinalizationNumberSchema.slice(0,activationStart);
export const billingInvoiceFinalizationNumberActivateSchema=billingInvoiceFinalizationNumberSchema.slice(activationStart);
export async function invoiceNumberingPolicyReady(db){return !!await db.prepare('SELECT 1 FROM billing_invoice_number_policy WHERE id=1').first();}
