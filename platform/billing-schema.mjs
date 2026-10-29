import {billingFollowupSchema} from './billing-followup-schema.mjs';
import {clientEmployeesSchema} from './client-employees-schema.mjs';
import {billingOrderBudgetSchema} from './billing-order-budget-schema.mjs';
import {billingSupportSchema} from './billing-support-schema.mjs';
import {billingRectificationSchema} from './billing-rectification-schema.mjs';
import {billingTrashSchema} from './billing-trash-schema.mjs';
import {billingNumberingSchema} from './billing-numbering-schema.mjs';
import {billingIssuanceSchema} from './billing-issuance-schema.mjs';
import {billingDirectorySchema} from './billing-directory-schema.mjs';
import {billingQuoteSchema} from './billing-quote-schema.mjs';
import {billingPaymentSchema} from './billing-payments-schema.mjs';
import {billingRevisionSchema} from './billing-revision-schema.mjs';
import {projectsSchema} from './projects-schema.mjs';
import {billingDeliverySchema} from './billing-delivery-schema.mjs';
/** Explicit migration only: HTTP requests never create or alter billing tables. */
export const billingSchema = [
 `CREATE TABLE IF NOT EXISTS billing_mail_signatures(owner TEXT PRIMARY KEY,version INTEGER NOT NULL CHECK(version>=1),data_json TEXT NOT NULL CHECK(json_valid(data_json)),updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS billing_settings (
  id TEXT PRIMARY KEY CHECK(id='default'),version INTEGER NOT NULL CHECK(version>=1),
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),updated_at TEXT NOT NULL,updated_by TEXT NOT NULL
 )`,
 `CREATE TABLE IF NOT EXISTS billing_settings_versions (
  version INTEGER PRIMARY KEY,data_json TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL
 )`,
 `CREATE TRIGGER IF NOT EXISTS billing_settings_initial BEFORE INSERT ON billing_settings BEGIN
  SELECT CASE WHEN NEW.version<>1 THEN RAISE(ABORT,'BILLING_SETTINGS_INITIAL') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_settings_guard BEFORE UPDATE ON billing_settings BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.version<>OLD.version+1 THEN RAISE(ABORT,'BILLING_SETTINGS_VERSION') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_settings_insert AFTER INSERT ON billing_settings BEGIN
  INSERT INTO billing_settings_versions VALUES(NEW.version,NEW.data_json,NEW.updated_at,NEW.updated_by);
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_settings_update AFTER UPDATE ON billing_settings BEGIN
  INSERT INTO billing_settings_versions VALUES(NEW.version,NEW.data_json,NEW.updated_at,NEW.updated_by);
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_settings_no_delete BEFORE DELETE ON billing_settings BEGIN SELECT RAISE(ABORT,'BILLING_SETTINGS_HISTORY'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_settings_history_no_update BEFORE UPDATE ON billing_settings_versions BEGIN SELECT RAISE(ABORT,'BILLING_SETTINGS_HISTORY'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_settings_history_no_delete BEFORE DELETE ON billing_settings_versions BEGIN SELECT RAISE(ABORT,'BILLING_SETTINGS_HISTORY'); END`,
 `CREATE TABLE IF NOT EXISTS billing_documents (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('quote','invoice')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status='draft'),
  version INTEGER NOT NULL CHECK(version>=1),
  data_json TEXT NOT NULL CHECK(json_valid(data_json) AND json_extract(data_json,'$.kind')=kind),
  totals_json TEXT CHECK(totals_json IS NULL OR json_valid(totals_json)),
  issues_json TEXT NOT NULL CHECK(json_valid(issues_json)),
  create_hash TEXT NOT NULL, source_document_id TEXT REFERENCES billing_documents(id),
  source_version INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
  CHECK((source_document_id IS NULL AND source_version IS NULL) OR (kind='invoice' AND source_document_id IS NOT NULL AND source_version>=1))
 )`,
 `CREATE INDEX IF NOT EXISTS billing_quote_invoices ON billing_documents(source_document_id) WHERE source_document_id IS NOT NULL`,
 `CREATE INDEX IF NOT EXISTS billing_documents_kind_updated ON billing_documents(kind,updated_at DESC,id)`,
 `CREATE TABLE IF NOT EXISTS billing_document_versions (
  document_id TEXT NOT NULL REFERENCES billing_documents(id), version INTEGER NOT NULL,
  data_json TEXT NOT NULL, totals_json TEXT, issues_json TEXT NOT NULL,
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  PRIMARY KEY(document_id,version)
 )`,
 `CREATE TRIGGER IF NOT EXISTS billing_document_initial_version BEFORE INSERT ON billing_documents BEGIN
  SELECT CASE WHEN NEW.version<>1 THEN RAISE(ABORT,'BILLING_INITIAL_VERSION') END;
  SELECT CASE WHEN NEW.source_document_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM billing_documents WHERE id=NEW.source_document_id AND kind='quote' AND status='draft' AND version=NEW.source_version
  ) THEN RAISE(ABORT,'BILLING_SOURCE_VERSION') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_document_version_guard BEFORE UPDATE ON billing_documents BEGIN
  SELECT CASE WHEN NEW.version<>OLD.version+1 OR NEW.id<>OLD.id OR NEW.kind<>OLD.kind OR NEW.status<>OLD.status
   OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by OR NEW.create_hash<>OLD.create_hash
   OR NEW.source_document_id IS NOT OLD.source_document_id OR NEW.source_version IS NOT OLD.source_version
  THEN RAISE(ABORT,'BILLING_IMMUTABLE_IDENTITY') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_document_history_insert AFTER INSERT ON billing_documents BEGIN
  INSERT INTO billing_document_versions VALUES(NEW.id,NEW.version,NEW.data_json,NEW.totals_json,NEW.issues_json,NEW.updated_at,NEW.updated_by);
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_document_history_update AFTER UPDATE ON billing_documents BEGIN
  INSERT INTO billing_document_versions VALUES(NEW.id,NEW.version,NEW.data_json,NEW.totals_json,NEW.issues_json,NEW.updated_at,NEW.updated_by);
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_history_no_update BEFORE UPDATE ON billing_document_versions BEGIN SELECT RAISE(ABORT,'BILLING_HISTORY_IMMUTABLE'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_history_no_delete BEFORE DELETE ON billing_document_versions BEGIN SELECT RAISE(ABORT,'BILLING_HISTORY_IMMUTABLE'); END`
];
import {billingDraftNumberSchema} from './billing-draft-number-schema.mjs';
import {billingMonthlyNumberSchema} from './billing-monthly-number-schema.mjs';
import {billingPartialInvoicesSchema} from './billing-partial-invoices-schema.mjs';
import {billingSeriesPolicySchema} from './billing-series-policy-schema.mjs';
export async function migrateBilling(db) {
 // D1 batch is transactional: failure leaves neither half a schema nor a lost history trigger.
 await db.batch([...billingSchema,...billingIssuanceSchema,...billingNumberingSchema,...billingDraftNumberSchema,...billingSeriesPolicySchema,...billingMonthlyNumberSchema,...billingDirectorySchema,...billingQuoteSchema,...billingRevisionSchema,...billingPartialInvoicesSchema,...billingPaymentSchema,...projectsSchema,...billingDeliverySchema,...billingTrashSchema,...billingRectificationSchema,...billingSupportSchema,...billingFollowupSchema,...billingOrderBudgetSchema,...clientEmployeesSchema].map(sql=>db.prepare(sql)));
}
