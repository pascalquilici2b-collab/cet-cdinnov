import {billingIssuanceSchema} from './billing-issuance-schema.mjs';
import {billingNumberingSchema} from './billing-numbering-schema.mjs';
const pick=(list,name)=>list.find(s=>s.startsWith('CREATE TRIGGER IF NOT EXISTS '+name+' '));
const formatted="s.prefix||(CASE WHEN EXISTS(SELECT 1 FROM billing_dated_series a WHERE a.series_id=s.id) THEN replace(NEW.issue_date,'-','')||'-' ELSE '' END)||printf('%0*d',s.width,s.next_value)";
const allocation=`EXISTS(SELECT 1 FROM billing_draft_numbers n WHERE n.document_id=NEW.document_id AND n.series_id=s.id AND n.issuer_siren=NEW.issuer_siren AND n.sequence_value=NEW.sequence_value AND n.number=NEW.number)`;
const guard=pick(billingNumberingSchema,'billing_issuance_guard').replace(
 `AND NEW.sequence_value=s.next_value AND NEW.sequence_value<=999999999\n   AND NEW.number=${formatted}`,
 `AND NEW.sequence_value<=999999999 AND (${allocation} OR (NOT EXISTS(SELECT 1 FROM billing_draft_numbers n WHERE n.document_id=NEW.document_id) AND NEW.sequence_value=s.next_value AND NEW.number=${formatted}))`
).replace('THEN RAISE(ABORT,\'BILLING_RESERVATION_CONFLICT\')',`THEN RAISE(ABORT,'BILLING_RESERVATION_CONFLICT')`);
if(!guard.includes(allocation))throw Error('Numbering guard replacement failed');
export const billingDraftNumberSchema=[
 `CREATE TABLE IF NOT EXISTS billing_draft_numbers(
 document_id TEXT PRIMARY KEY REFERENCES billing_documents(id),series_id TEXT NOT NULL REFERENCES billing_number_series(id),
 issuer_siren TEXT NOT NULL,sequence_value INTEGER NOT NULL,number TEXT NOT NULL,number_date TEXT NOT NULL,
 created_at TEXT NOT NULL,created_by TEXT NOT NULL,UNIQUE(series_id,sequence_value),UNIQUE(issuer_siren,number))`,
 `CREATE TRIGGER IF NOT EXISTS billing_draft_number_guard BEFORE INSERT ON billing_draft_numbers BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_documents d JOIN billing_number_series s ON s.id=NEW.series_id
 WHERE d.id=NEW.document_id AND d.kind=s.kind AND NEW.issuer_siren=s.issuer_siren AND NEW.sequence_value=s.next_value AND NEW.sequence_value<=999999999
 AND coalesce(nullif(replace(json_extract(d.data_json,'$.seller.siren'),' ',''),''),substr(replace(json_extract(d.data_json,'$.seller.siret'),' ',''),1,9))=s.issuer_siren
 AND NEW.number_date BETWEEN s.start_date AND s.end_date
 AND NEW.number=s.prefix||(CASE WHEN EXISTS(SELECT 1 FROM billing_dated_series a WHERE a.series_id=s.id) THEN replace(NEW.number_date,'-','')||'-' ELSE '' END)||printf('%0*d',s.width,s.next_value)
 AND NOT EXISTS(SELECT 1 FROM billing_issuances i WHERE i.document_id=d.id OR (i.issuer_siren=NEW.issuer_siren AND i.number=NEW.number)))
 THEN RAISE(ABORT,'BILLING_DRAFT_NUMBER_CONFLICT') END; END`,
 `CREATE TRIGGER IF NOT EXISTS billing_draft_number_insert AFTER INSERT ON billing_draft_numbers BEGIN
 UPDATE billing_number_series SET next_value=next_value+1,version=version+1 WHERE id=NEW.series_id; END`,
 `CREATE TRIGGER IF NOT EXISTS billing_draft_number_no_update BEFORE UPDATE ON billing_draft_numbers BEGIN SELECT RAISE(ABORT,'BILLING_DRAFT_NUMBER_IMMUTABLE'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_draft_number_no_delete BEFORE DELETE ON billing_draft_numbers BEGIN SELECT RAISE(ABORT,'BILLING_DRAFT_NUMBER_IMMUTABLE'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_draft_number_document_guard BEFORE UPDATE ON billing_documents WHEN EXISTS(SELECT 1 FROM billing_draft_numbers WHERE document_id=OLD.id) BEGIN
 SELECT CASE WHEN coalesce(nullif(replace(json_extract(NEW.data_json,'$.seller.siren'),' ',''),''),substr(replace(json_extract(NEW.data_json,'$.seller.siret'),' ',''),1,9))<>(SELECT issuer_siren FROM billing_draft_numbers WHERE document_id=OLD.id)
 THEN RAISE(ABORT,'BILLING_DRAFT_NUMBER_ISSUER') END; END`,
 `CREATE TRIGGER IF NOT EXISTS billing_draft_number_document_no_delete BEFORE DELETE ON billing_documents WHEN EXISTS(SELECT 1 FROM billing_draft_numbers WHERE document_id=OLD.id) BEGIN SELECT RAISE(ABORT,'BILLING_DRAFT_NUMBER_IMMUTABLE'); END`,
 'DROP TRIGGER IF EXISTS billing_series_counter_guard',
 pick(billingIssuanceSchema,'billing_series_counter_guard').replace(
 'OR NOT EXISTS(SELECT 1 FROM billing_issuances WHERE series_id=OLD.id AND sequence_value=OLD.next_value AND issue_date=NEW.last_issue_date)',
 `OR NOT (EXISTS(SELECT 1 FROM billing_issuances WHERE series_id=OLD.id AND sequence_value=OLD.next_value AND issue_date=NEW.last_issue_date) OR (NEW.last_issue_date IS OLD.last_issue_date AND EXISTS(SELECT 1 FROM billing_draft_numbers WHERE series_id=OLD.id AND sequence_value=OLD.next_value)))`
 ),
 'DROP TRIGGER IF EXISTS billing_issuance_guard',guard,
 'DROP TRIGGER IF EXISTS billing_issuance_insert',
 pick(billingIssuanceSchema,'billing_issuance_insert').replace('WHERE id=NEW.series_id;','WHERE id=NEW.series_id AND NOT EXISTS(SELECT 1 FROM billing_draft_numbers WHERE document_id=NEW.document_id);'),
 `CREATE TRIGGER IF NOT EXISTS billing_issuance_number_chronology BEFORE INSERT ON billing_issuances BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM billing_issuances WHERE series_id=NEW.series_id AND (issue_date>NEW.issue_date OR (sequence_value>NEW.sequence_value AND issue_date<NEW.issue_date)))
 THEN RAISE(ABORT,'BILLING_RESERVATION_CONFLICT') END; END`
];
