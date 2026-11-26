import {billingInvoiceRegularizationActivateSchema,invoiceQuoteIdSQL} from './billing-invoice-regularization-schema.mjs';
import {billingSeriesPolicySchema} from './billing-series-policy-schema.mjs';
import {invoiceReservationJSON} from './billing-invoice-finalization-number-schema.mjs';

const pick=(schema,name)=>schema.find(sql=>sql.startsWith('CREATE TRIGGER IF NOT EXISTS '+name+' '));
export const referenceSuffixSQL=ref=>`(CASE WHEN substr(${ref},1,4)='DEV-' THEN substr(${ref},5) ELSE ${ref} END)`;
export const referenceInvoiceStemSQL=s=>`(CASE WHEN EXISTS(SELECT 1 FROM billing_monthly_series m WHERE m.series_id=${s}.id) THEN substr(${s}.prefix,1,4) ELSE ${s}.prefix END)`;
export const referenceCurrentPrefixSQL=(s,date)=>`(CASE WHEN EXISTS(SELECT 1 FROM billing_monthly_series m WHERE m.series_id=${s}.id) THEN substr(${s}.prefix,1,4)||substr(replace(${date},'-',''),1,6) ELSE ${s}.prefix||(CASE WHEN EXISTS(SELECT 1 FROM billing_dated_series m WHERE m.series_id=${s}.id) THEN replace(${date},'-','')||'-' ELSE '' END) END)`;
export const knownReferenceSQL=ref=>`EXISTS(SELECT 1 FROM billing_quote_number_sources q WHERE q.number=${ref} OR substr(q.number,length(q.stem)+1)=${referenceSuffixSQL(ref)})`;
const cleanIssuer=d=>`coalesce(nullif(replace(json_extract(${d}.data_json,'$.seller.siren'),' ',''),''),substr(replace(json_extract(${d}.data_json,'$.seller.siret'),' ',''),1,9))`;
const eligible=(d,ref)=>`${d}.kind='invoice' AND EXISTS(SELECT 1 FROM billing_draft_numbers n WHERE n.document_id=${d}.id) AND ${d}.source_document_id IS NULL AND ${invoiceQuoteIdSQL(d+'.id')} IS NULL
 AND json_extract(${d}.data_json,'$.references.quoteNumber')=${ref} AND NOT ${knownReferenceSQL(ref)}
 AND NOT EXISTS(SELECT 1 FROM billing_issuances i WHERE i.document_id=${d}.id) AND NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=${d}.id)
 AND NOT EXISTS(SELECT 1 FROM billing_email_deliveries e WHERE e.document_id=${d}.id AND e.state IN('sending','sent','unknown'))`;
// Numeric prefixes are opaque identifiers, never inferred calendar dates.
const suffixShape=(ref,prefix,stem,width,seq)=>`(${stem}||${referenceSuffixSQL(ref)}=${prefix}||printf('%0*d',${width},${seq}) AND (
 (length(${prefix})=length(${stem})+6 AND substr(${prefix},length(${stem})+1) NOT GLOB '*[^0-9]*') OR
 (length(${prefix}) IN(length(${stem})+5,length(${stem})+9) AND substr(${prefix},-1)='-' AND substr(${prefix},length(${stem})+1,length(${prefix})-length(${stem})-1) NOT GLOB '*[^0-9]*')))`;
const active=s=>`NOT EXISTS(SELECT 1 FROM billing_retired_series r WHERE r.series_id=${s}.id)`;
const regular=s=>`NOT EXISTS(SELECT 1 FROM billing_external_number_series x WHERE x.series_id=${s}.id)`;

export const billingInvoiceReferencePrepareSchema=[
 `CREATE TABLE IF NOT EXISTS billing_external_number_series(
 series_id TEXT PRIMARY KEY,issuer_siren TEXT NOT NULL,prefix TEXT NOT NULL,width INTEGER NOT NULL,first_value INTEGER NOT NULL,
 base_series_id TEXT NOT NULL REFERENCES billing_number_series(id),document_id TEXT NOT NULL REFERENCES billing_documents(id),document_version INTEGER NOT NULL,quote_number TEXT NOT NULL,
 created_at TEXT NOT NULL,created_by TEXT NOT NULL,UNIQUE(issuer_siren,prefix),
 FOREIGN KEY(document_id,document_version) REFERENCES billing_document_versions(document_id,version))`,
 `CREATE TABLE IF NOT EXISTS billing_invoice_reference_regularizations(
 document_id TEXT PRIMARY KEY REFERENCES billing_documents(id),document_version INTEGER NOT NULL,quote_number TEXT NOT NULL,
 reference_confirmed INTEGER NOT NULL CHECK(reference_confirmed=1),client_json TEXT NOT NULL CHECK(json_valid(client_json)),
 base_series_id TEXT NOT NULL REFERENCES billing_number_series(id),invoice_series_id TEXT NOT NULL REFERENCES billing_number_series(id),invoice_number TEXT NOT NULL CHECK(length(invoice_number) BETWEEN 1 AND 35),sequence_value INTEGER NOT NULL CHECK(sequence_value BETWEEN 1 AND 999999999),
 reservation_action TEXT NOT NULL CHECK(reservation_action IN('preserve','release')),reservation_json TEXT NOT NULL CHECK(json_valid(reservation_json)),reason TEXT NOT NULL CHECK(length(reason)<=2000),regularized_at TEXT NOT NULL,regularized_by TEXT NOT NULL,
 FOREIGN KEY(document_id,document_version) REFERENCES billing_document_versions(document_id,version))`,
 `CREATE VIEW IF NOT EXISTS billing_invoice_regularization_audits AS SELECT document_id,document_version,quote_id,quote_version,quote_number,invoice_series_id,invoice_number,reservation_action,reservation_json,reason,regularized_at,regularized_by,'registered' source FROM billing_invoice_regularizations
 UNION ALL SELECT document_id,document_version,NULL,NULL,quote_number,invoice_series_id,invoice_number,reservation_action,reservation_json,reason,regularized_at,regularized_by,'provided' FROM billing_invoice_reference_regularizations`,
 ...['billing_external_number_series','billing_invoice_reference_regularizations'].flatMap(table=>['UPDATE','DELETE'].map(op=>`CREATE TRIGGER IF NOT EXISTS ${table}_no_${op.toLowerCase()} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'BILLING_REGULARIZATION_IMMUTABLE'); END`)),
];
let issuance=pick(billingInvoiceRegularizationActivateSchema,'billing_issuance_guard');
const noQuote="(SELECT quote_id FROM billing_invoice_regularizations WHERE document_id=d.id) IS NULL AND ";
issuance=issuance.replace(noQuote,noQuote+"NOT EXISTS(SELECT 1 FROM billing_invoice_reference_regularizations e WHERE e.document_id=d.id) AND NOT EXISTS(SELECT 1 FROM billing_external_number_series e WHERE e.series_id=s.id) AND ");
const branch=`EXISTS(SELECT 1 FROM billing_invoice_reference_regularizations a WHERE a.document_id=d.id AND a.invoice_series_id=s.id AND a.invoice_number=NEW.number AND a.sequence_value=NEW.sequence_value AND NEW.sequence_value<=s.next_value AND ${active('s')})`;
issuance=issuance.replace("OR (d.kind='invoice' AND ((","OR (d.kind='invoice' AND ("+branch+" OR (");
// The common immutable projection supplies both preservation modes.
issuance=issuance.replaceAll("FROM billing_invoice_regularizations a WHERE a.document_id=d.id AND a.reservation_action='preserve'","FROM billing_invoice_regularization_audits a WHERE a.document_id=d.id AND a.reservation_action='preserve'");
const initial=pick(billingSeriesPolicySchema,'billing_series_initial').replace("AND id NOT IN(SELECT series_id FROM billing_retired_series)","AND id NOT IN(SELECT series_id FROM billing_retired_series) AND id NOT IN(SELECT series_id FROM billing_external_number_series)").replace("SELECT CASE WHEN EXISTS(SELECT 1 FROM billing_number_series",`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_external_number_series x WHERE x.series_id=NEW.id AND x.issuer_siren=NEW.issuer_siren AND x.prefix=NEW.prefix AND x.width=NEW.width AND x.first_value=NEW.first_value AND NEW.kind='invoice' AND NEW.start_date='1970-01-01' AND NEW.end_date='9999-12-31' AND x.created_at=NEW.created_at AND x.created_by=NEW.created_by) AND EXISTS(SELECT 1 FROM billing_number_series`);
export const billingInvoiceReferenceActivateSchema=[
 `CREATE TRIGGER IF NOT EXISTS billing_external_series_guard BEFORE INSERT ON billing_external_number_series BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_documents d JOIN billing_number_series b ON b.id=NEW.base_series_id WHERE d.id=NEW.document_id AND d.version=NEW.document_version AND ${eligible('d','NEW.quote_number')}
 AND NOT EXISTS(SELECT 1 FROM billing_invoice_regularization_audits a WHERE a.document_id=d.id) AND b.kind='invoice' AND b.issuer_siren=NEW.issuer_siren AND b.issuer_siren=${cleanIssuer('d')} AND ${active('b')} AND ${regular('b')}
 AND NEW.width BETWEEN 1 AND 9 AND NEW.width=length(${referenceInvoiceStemSQL('b')}||${referenceSuffixSQL('NEW.quote_number')})-length(NEW.prefix) AND NEW.first_value BETWEEN 1 AND 999999999 AND length(NEW.prefix) BETWEEN 1 AND 26
 AND ${suffixShape('NEW.quote_number','NEW.prefix',referenceInvoiceStemSQL('b'),'NEW.width','NEW.first_value')}
 AND NEW.prefix<>${referenceCurrentPrefixSQL('b',"json_extract(d.data_json,'$.issueDate')")} AND NOT EXISTS(SELECT 1 FROM billing_number_series s WHERE s.id=NEW.series_id OR s.issuer_siren=NEW.issuer_siren AND s.prefix=NEW.prefix)) THEN RAISE(ABORT,'BILLING_EXTERNAL_SERIES_CONFLICT') END; END`,
 'DROP TRIGGER IF EXISTS billing_series_initial',initial,
 `CREATE TRIGGER IF NOT EXISTS billing_external_series_create AFTER INSERT ON billing_external_number_series BEGIN
 INSERT INTO billing_number_series(id,issuer_siren,kind,prefix,width,first_value,next_value,start_date,end_date,version,created_at,created_by) VALUES(NEW.series_id,NEW.issuer_siren,'invoice',NEW.prefix,NEW.width,NEW.first_value,NEW.first_value,'1970-01-01','9999-12-31',1,NEW.created_at,NEW.created_by); END`,
 ...['INSERT','UPDATE'].map(op=>`CREATE TRIGGER IF NOT EXISTS billing_external_default_no_${op.toLowerCase()} BEFORE ${op} ON billing_default_series WHEN EXISTS(SELECT 1 FROM billing_external_number_series x WHERE x.series_id=NEW.series_id) BEGIN SELECT RAISE(ABORT,'BILLING_EXTERNAL_SERIES_RESTRICTED'); END`),
 `CREATE TRIGGER IF NOT EXISTS billing_external_draft_number_no_insert BEFORE INSERT ON billing_draft_numbers WHEN EXISTS(SELECT 1 FROM billing_external_number_series x WHERE x.series_id=NEW.series_id) BEGIN SELECT RAISE(ABORT,'BILLING_EXTERNAL_SERIES_RESTRICTED'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_external_reference_guard BEFORE INSERT ON billing_invoice_reference_regularizations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_documents d JOIN billing_number_series s ON s.id=NEW.invoice_series_id JOIN billing_number_series b ON b.id=NEW.base_series_id
 WHERE d.id=NEW.document_id AND d.version=NEW.document_version AND ${eligible('d','NEW.quote_number')}
 AND NOT EXISTS(SELECT 1 FROM billing_invoice_regularizations r WHERE r.document_id=d.id) AND s.kind='invoice' AND b.kind='invoice' AND s.issuer_siren=b.issuer_siren AND s.issuer_siren=${cleanIssuer('d')} AND ${active('s')} AND ${active('b')} AND ${regular('b')}
 AND NEW.client_json=json_object('clientId',json_extract(d.data_json,'$.clientId'),'siren',json_extract(d.data_json,'$.buyer.siren'),'siret',json_extract(d.data_json,'$.buyer.siret'))
 AND NEW.invoice_number=${referenceInvoiceStemSQL('b')}||${referenceSuffixSQL('NEW.quote_number')}
 AND NEW.sequence_value<=s.next_value
 AND ((NEW.reservation_action='preserve' AND EXISTS(SELECT 1 FROM billing_draft_numbers n WHERE n.document_id=d.id AND n.series_id=s.id AND n.issuer_siren=s.issuer_siren AND n.number=NEW.invoice_number AND n.sequence_value=NEW.sequence_value) AND NOT EXISTS(SELECT 1 FROM billing_invoice_number_retirements r WHERE r.document_id=d.id))
 OR (NEW.reservation_action='release' AND NOT EXISTS(SELECT 1 FROM billing_draft_numbers n WHERE n.issuer_siren=s.issuer_siren AND n.number=NEW.invoice_number)
 AND ((s.id=b.id AND NEW.invoice_number=${referenceCurrentPrefixSQL('b',"json_extract(d.data_json,'$.issueDate')")}||printf('%0*d',s.width,NEW.sequence_value)) OR (EXISTS(SELECT 1 FROM billing_external_number_series x WHERE x.series_id=s.id) AND ${suffixShape('NEW.quote_number','s.prefix',referenceInvoiceStemSQL('b'),'s.width','NEW.sequence_value')}))))
 AND NOT EXISTS(SELECT 1 FROM billing_issuances used WHERE used.issuer_siren=s.issuer_siren AND (used.number=NEW.invoice_number OR used.series_id=s.id AND used.sequence_value=NEW.sequence_value))
 AND (s.last_issue_date IS NULL OR json_extract(d.data_json,'$.issueDate')>=s.last_issue_date)
 AND NOT EXISTS(SELECT 1 FROM billing_issuances used WHERE used.series_id=s.id AND (used.issue_date>json_extract(d.data_json,'$.issueDate') OR used.sequence_value>NEW.sequence_value AND used.issue_date<json_extract(d.data_json,'$.issueDate')))
 AND (SELECT ${invoiceReservationJSON('n')} FROM billing_draft_numbers n WHERE n.document_id=d.id)=NEW.reservation_json) THEN RAISE(ABORT,'BILLING_EXTERNAL_REFERENCE_CONFLICT') END; END`,
 `CREATE TRIGGER IF NOT EXISTS billing_registered_reference_exclusive BEFORE INSERT ON billing_invoice_regularizations WHEN EXISTS(SELECT 1 FROM billing_invoice_reference_regularizations r WHERE r.document_id=NEW.document_id) BEGIN SELECT RAISE(ABORT,'BILLING_REGULARIZATION_CONFLICT'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_external_reference_retirement_guard BEFORE INSERT ON billing_invoice_number_retirements WHEN EXISTS(SELECT 1 FROM billing_invoice_reference_regularizations r WHERE r.document_id=NEW.document_id) BEGIN SELECT RAISE(ABORT,'BILLING_REGULARIZATION_CONFLICT'); END`,
 ...['billing_regularized_reference_guard','billing_regularized_client_guard'].flatMap(name=>['DROP TRIGGER IF EXISTS '+name,pick(billingInvoiceRegularizationActivateSchema,name).replaceAll('billing_invoice_regularizations','billing_invoice_regularization_audits')]),
 'DROP TRIGGER IF EXISTS billing_draft_number_document_guard',pick(billingInvoiceRegularizationActivateSchema,'billing_draft_number_document_guard'),
 'DROP TRIGGER IF EXISTS billing_issuance_guard',issuance,
];
export const billingInvoiceReferenceSchema=[...billingInvoiceReferencePrepareSchema,...billingInvoiceReferenceActivateSchema];
// Targeted upgrade for already installed external-reference schemas. The audit,
// counter, normal-series and immutable-history guards are left in place.
export const billingInvoiceReferenceWidthSchema=['DROP TRIGGER IF EXISTS billing_external_series_guard',pick(billingInvoiceReferenceActivateSchema,'billing_external_series_guard')];
