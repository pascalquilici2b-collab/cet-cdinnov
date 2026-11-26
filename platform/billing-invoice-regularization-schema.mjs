import {billingInvoiceFinalizationNumberSchema,invoiceReservationJSON} from './billing-invoice-finalization-number-schema.mjs';
import {billingDraftNumberSchema} from './billing-draft-number-schema.mjs';
import {billingRevisionSchema} from './billing-revision-schema.mjs';
import {revisionInactive} from './billing-revision-schema.mjs';

// Administrative linking is a separate audit. It never asserts that an old PDF
// was not transmitted, and never rewrites the earlier attestation ledger.
export const invoiceQuoteIdSQL=id=>`(SELECT q.id FROM billing_link_roots l JOIN billing_documents q ON q.id=l.root_id AND q.kind='quote' WHERE l.id=${id})`;
export const regularizedQuoteIdSQL=id=>`(SELECT quote_id FROM billing_invoice_regularizations WHERE document_id=${id})`;
// A review may preserve the same active allocation or retire an obsolete one.
// Resolving that review does not itself mean that the old number was retired.
export const invoiceLegacyNumberResolvedSQL=id=>`(EXISTS(SELECT 1 FROM billing_invoice_number_retirements r WHERE r.document_id=${id}) OR EXISTS(SELECT 1 FROM billing_invoice_regularizations r WHERE r.document_id=${id}) OR EXISTS(SELECT 1 FROM billing_invoice_reference_regularizations r WHERE r.document_id=${id}))`;
export const invoiceQuoteNumberSQL=(series='s',quote='q')=>`(CASE WHEN EXISTS(SELECT 1 FROM billing_monthly_series m WHERE m.series_id=${series}.id) THEN substr(${series}.prefix,1,4) ELSE ${series}.prefix END)||substr(${quote}.number,length(${quote}.stem)+1)`;
const pick=(schema,name)=>schema.find(sql=>sql.startsWith('CREATE TRIGGER IF NOT EXISTS '+name+' '));
const oldReleased='EXISTS(SELECT 1 FROM billing_invoice_number_retirements r WHERE r.document_id=n.document_id)';
const linked=`EXISTS(SELECT 1 FROM billing_quote_number_sources q JOIN billing_invoice_regularizations a ON a.document_id=d.id AND a.quote_id=q.document_id WHERE q.document_id=${regularizedQuoteIdSQL('d.id')} AND q.issuer_siren=s.issuer_siren AND a.invoice_series_id=s.id AND a.invoice_number=NEW.number AND NEW.sequence_value=q.sequence_value AND q.sequence_value<=s.next_value AND NEW.number=${invoiceQuoteNumberSQL()} AND NOT EXISTS(SELECT 1 FROM billing_retired_series r WHERE r.series_id=s.id))`;
const oldFresh="NEW.sequence_value=s.next_value AND NEW.number=";
let issuanceGuard=pick(billingInvoiceFinalizationNumberSchema,'billing_issuance_guard').replaceAll(oldReleased,invoiceLegacyNumberResolvedSQL('n.document_id'));
// Only the invoice branch changes. Quote reservations retain their own rules.
const invoiceStart=issuanceGuard.indexOf("OR (d.kind='invoice' AND ");
const invoiceEnd=issuanceGuard.indexOf('\n AND NOT EXISTS(SELECT 1 FROM billing_draft_numbers',invoiceStart);
const originalFresh=issuanceGuard.slice(invoiceStart+"OR (d.kind='invoice' AND ".length,invoiceEnd);
if(!originalFresh.startsWith(oldFresh))throw Error('Invoice numbering policy guard changed');
issuanceGuard=issuanceGuard.slice(0,invoiceStart)+"OR (d.kind='invoice' AND (("+regularizedQuoteIdSQL('d.id')+" IS NULL AND "+originalFresh+") OR "+linked+")"+issuanceGuard.slice(invoiceEnd);
const ownQuote="d.kind='quote' AND n.document_id=d.id AND ";
const preserveAllocation=`d.kind='invoice' AND n.document_id=d.id AND n.series_id=NEW.series_id AND n.issuer_siren=NEW.issuer_siren AND n.sequence_value=NEW.sequence_value AND EXISTS(SELECT 1 FROM billing_invoice_regularizations a WHERE a.document_id=d.id AND a.reservation_action='preserve' AND a.invoice_series_id=n.series_id AND a.invoice_number=n.number) AND NOT EXISTS(SELECT 1 FROM billing_invoice_number_retirements r WHERE r.document_id=d.id)`;
const collisionStart=issuanceGuard.lastIndexOf('AND NOT EXISTS(SELECT 1 FROM billing_draft_numbers n WHERE n.issuer_siren=');
issuanceGuard=issuanceGuard.slice(0,collisionStart)+issuanceGuard.slice(collisionStart).replace('AND NOT('+ownQuote,'AND NOT(('+preserveAllocation+') OR '+ownQuote);
const counter=pick(billingDraftNumberSchema,'billing_series_counter_guard').replace('OR NEW.next_value<>OLD.next_value+1','OR NEW.next_value<OLD.next_value').replace(
 'EXISTS(SELECT 1 FROM billing_issuances WHERE series_id=OLD.id AND sequence_value=OLD.next_value AND issue_date=NEW.last_issue_date)',
 'EXISTS(SELECT 1 FROM billing_issuances WHERE series_id=OLD.id AND NEW.next_value=max(OLD.next_value,sequence_value+1) AND issue_date=NEW.last_issue_date)').replace('NEW.last_issue_date IS OLD.last_issue_date AND EXISTS','NEW.next_value=OLD.next_value+1 AND NEW.last_issue_date IS OLD.last_issue_date AND EXISTS');
const familyLinked=`EXISTS(SELECT 1 FROM billing_invoice_quote_links fi WHERE fi.quote_id=`;

export const billingInvoiceRegularizationPrepareSchema=[
 `CREATE TABLE IF NOT EXISTS billing_invoice_regularizations(
 document_id TEXT PRIMARY KEY REFERENCES billing_documents(id),document_version INTEGER NOT NULL,
 quote_id TEXT NOT NULL REFERENCES billing_documents(id),quote_version INTEGER NOT NULL,quote_number TEXT NOT NULL,
 invoice_series_id TEXT NOT NULL REFERENCES billing_number_series(id),invoice_number TEXT NOT NULL CHECK(length(invoice_number) BETWEEN 1 AND 35),
 reservation_action TEXT NOT NULL CHECK(reservation_action IN('preserve','release')),
 reservation_json TEXT CHECK(reservation_json IS NULL OR json_valid(reservation_json)),reason TEXT NOT NULL CHECK(length(reason)<=2000),
 regularized_at TEXT NOT NULL,regularized_by TEXT NOT NULL,
 FOREIGN KEY(document_id,document_version) REFERENCES billing_document_versions(document_id,version),
 FOREIGN KEY(quote_id,quote_version) REFERENCES billing_document_versions(document_id,version))`,
 ...['UPDATE','DELETE'].map(op=>`CREATE TRIGGER IF NOT EXISTS billing_invoice_regularization_no_${op.toLowerCase()} BEFORE ${op} ON billing_invoice_regularizations BEGIN SELECT RAISE(ABORT,'BILLING_REGULARIZATION_IMMUTABLE'); END`),
 `CREATE VIEW IF NOT EXISTS billing_invoice_quote_links AS SELECT id document_id,source_document_id quote_id,source_version quote_version FROM billing_documents WHERE source_document_id IS NOT NULL
 UNION ALL SELECT r.document_id,r.quote_id,r.quote_version FROM billing_invoice_regularizations r JOIN billing_documents d ON d.id=r.document_id WHERE d.source_document_id IS NULL`,
 `CREATE VIEW IF NOT EXISTS billing_quote_number_sources AS SELECT d.id document_id,coalesce(i.number,n.number) number,coalesce(i.sequence_value,n.sequence_value) sequence_value,s.id series_id,s.issuer_siren,
 CASE WHEN EXISTS(SELECT 1 FROM billing_monthly_series m WHERE m.series_id=s.id) THEN substr(s.prefix,1,4) WHEN s.prefix GLOB '[0-9]*' THEN '' ELSE s.prefix END stem
 FROM billing_documents d LEFT JOIN billing_issuances i ON i.document_id=d.id LEFT JOIN billing_draft_numbers n ON n.document_id=d.id JOIN billing_number_series s ON s.id=coalesce(i.series_id,n.series_id) WHERE d.kind='quote'`
];
export const billingInvoiceRegularizationActivateSchema=[
 `DROP VIEW IF EXISTS billing_link_roots`,
 `CREATE VIEW billing_link_roots AS WITH RECURSIVE ancestry(id,parent_id,depth) AS (
 SELECT id,id,0 FROM billing_documents UNION ALL SELECT a.id,r.original_id,a.depth+1 FROM ancestry a JOIN billing_invoice_rectifications r ON r.replacement_id=a.parent_id WHERE a.depth<32
 ) SELECT a.id,coalesce(l.quote_id,d.id) root_id FROM ancestry a JOIN billing_documents d ON d.id=a.parent_id LEFT JOIN billing_invoice_quote_links l ON l.document_id=d.id WHERE NOT EXISTS(SELECT 1 FROM billing_invoice_rectifications r WHERE r.replacement_id=a.parent_id)`,
 `CREATE TRIGGER IF NOT EXISTS billing_invoice_regularization_guard BEFORE INSERT ON billing_invoice_regularizations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_documents d JOIN billing_documents q ON q.id=NEW.quote_id JOIN billing_quote_number_sources n ON n.document_id=q.id
 WHERE d.id=NEW.document_id AND d.version=NEW.document_version AND d.kind='invoice' AND q.version=NEW.quote_version AND q.kind='quote' AND NEW.quote_number=n.number
 AND EXISTS(SELECT 1 FROM billing_draft_numbers old WHERE old.document_id=d.id)
 AND EXISTS(SELECT 1 FROM billing_number_series s JOIN billing_quote_number_sources qn ON qn.document_id=q.id WHERE s.id=NEW.invoice_series_id AND s.issuer_siren=qn.issuer_siren AND s.kind='invoice' AND qn.sequence_value<=s.next_value AND NEW.invoice_number=${invoiceQuoteNumberSQL('s','qn')})
 AND (d.source_document_id IS NULL OR d.source_document_id=q.id)
 AND (${invoiceQuoteIdSQL('d.id')} IS NULL OR ${invoiceQuoteIdSQL('d.id')}=q.id)
 AND (${invoiceQuoteIdSQL('d.id')}=q.id OR (NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=q.id) AND NOT ${revisionInactive('q.id')}))
 AND NOT EXISTS(SELECT 1 FROM billing_retired_series retired WHERE retired.series_id=NEW.invoice_series_id)
 AND NOT EXISTS(SELECT 1 FROM billing_issuances used WHERE used.issuer_siren=n.issuer_siren AND (used.number=NEW.invoice_number OR (used.series_id=NEW.invoice_series_id AND used.sequence_value=n.sequence_value)))
 AND ((NEW.reservation_action='release' AND NOT EXISTS(SELECT 1 FROM billing_draft_numbers used WHERE used.issuer_siren=n.issuer_siren AND used.number=NEW.invoice_number))
 OR (NEW.reservation_action='preserve' AND EXISTS(SELECT 1 FROM billing_draft_numbers own WHERE own.document_id=d.id AND own.series_id=NEW.invoice_series_id AND own.issuer_siren=n.issuer_siren AND own.sequence_value=n.sequence_value AND own.number=NEW.invoice_number) AND NOT EXISTS(SELECT 1 FROM billing_invoice_number_retirements retired WHERE retired.document_id=d.id)))
 AND (SELECT ${invoiceReservationJSON('a')} FROM billing_draft_numbers a WHERE a.document_id=d.id) IS NEW.reservation_json
 AND NOT EXISTS(SELECT 1 FROM billing_issuances i WHERE i.document_id=d.id)
 AND NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=d.id)
 AND NOT EXISTS(SELECT 1 FROM billing_email_deliveries e WHERE e.document_id=d.id AND e.state IN('sending','sent','unknown')))
 THEN RAISE(ABORT,'BILLING_REGULARIZATION_CONFLICT') END; END`,
 'DROP TRIGGER IF EXISTS billing_invoice_number_retirement_guard',
 pick(billingInvoiceFinalizationNumberSchema,'billing_invoice_number_retirement_guard').replace("AND NOT EXISTS(SELECT 1 FROM billing_issuances i WHERE i.document_id=d.id)","AND NOT EXISTS(SELECT 1 FROM billing_issuances i WHERE i.document_id=d.id) AND NOT EXISTS(SELECT 1 FROM billing_invoice_regularizations a WHERE a.document_id=d.id)"),
 // A linked quote reference stays consistent through later draft saves.
 `CREATE TRIGGER IF NOT EXISTS billing_regularized_reference_guard BEFORE UPDATE ON billing_documents WHEN EXISTS(SELECT 1 FROM billing_invoice_regularizations r WHERE r.document_id=OLD.id) BEGIN
 SELECT CASE WHEN json_extract(NEW.data_json,'$.references.quoteNumber') IS NOT (SELECT quote_number FROM billing_invoice_regularizations WHERE document_id=OLD.id) THEN RAISE(ABORT,'BILLING_QUOTE_REFERENCE') END; END`,
 `CREATE TRIGGER IF NOT EXISTS billing_regularized_client_guard BEFORE UPDATE ON billing_documents WHEN EXISTS(SELECT 1 FROM billing_invoice_regularizations r WHERE r.document_id=OLD.id) BEGIN
 SELECT CASE WHEN coalesce(json_extract(NEW.data_json,'$.clientId'),'') IS NOT coalesce(json_extract(OLD.data_json,'$.clientId'),'') OR coalesce(json_extract(NEW.data_json,'$.buyer.siren'),'') IS NOT coalesce(json_extract(OLD.data_json,'$.buyer.siren'),'') OR coalesce(json_extract(NEW.data_json,'$.buyer.siret'),'') IS NOT coalesce(json_extract(OLD.data_json,'$.buyer.siret'),'') THEN RAISE(ABORT,'BILLING_REGULARIZATION_CLIENT') END; END`,
 'DROP TRIGGER IF EXISTS billing_draft_number_document_guard',
 pick(billingInvoiceFinalizationNumberSchema,'billing_draft_number_document_guard').replaceAll(oldReleased,invoiceLegacyNumberResolvedSQL('n.document_id')),
 'DROP TRIGGER IF EXISTS billing_issuance_guard',issuanceGuard,
 'DROP TRIGGER IF EXISTS billing_series_counter_guard',counter,
 'DROP TRIGGER IF EXISTS billing_issuance_insert',
 pick(billingInvoiceFinalizationNumberSchema,'billing_issuance_insert').replace('next_value=next_value+1','next_value=max(next_value,NEW.sequence_value+1)'),
 // Include late administrative links in the same family locks as conversions.
 ...billingRevisionSchema.filter(sql=>sql.startsWith('CREATE TRIGGER ')&&sql.includes('SELECT 1 FROM billing_documents fi WHERE fi.source_document_id=')).flatMap(sql=>{
  const name=sql.match(/^CREATE TRIGGER IF NOT EXISTS (\w+)/)[1];
  return ['DROP TRIGGER IF EXISTS '+name,sql.replaceAll('EXISTS(SELECT 1 FROM billing_documents fi WHERE fi.source_document_id=',familyLinked).replaceAll(' OR fi.source_document_id IN (',' OR fi.quote_id IN (')];
 }).filter(sql=>!sql.includes('billing_revision_conversion_guard')),
];
export const billingInvoiceRegularizationSchema=[...billingInvoiceRegularizationPrepareSchema,...billingInvoiceRegularizationActivateSchema];
