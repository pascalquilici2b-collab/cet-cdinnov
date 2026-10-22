import {billingIssuanceSchema} from './billing-issuance-schema.mjs';
// Opt-in formatting metadata: manual and historical series keep their original rules.
const guard=billingIssuanceSchema.find(sql=>sql.startsWith('CREATE TRIGGER IF NOT EXISTS billing_issuance_guard '));
export const billingNumberingSchema=[
 `CREATE TABLE IF NOT EXISTS billing_dated_series(series_id TEXT PRIMARY KEY REFERENCES billing_number_series(id))`,
 `CREATE TRIGGER IF NOT EXISTS billing_dated_series_insert BEFORE INSERT ON billing_dated_series BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_number_series WHERE id=NEW.series_id AND kind='invoice' AND prefix='F-' AND width=3 AND first_value=1 AND next_value=1 AND start_date='1970-01-01' AND end_date='9999-12-31') THEN RAISE(ABORT,'BILLING_DATED_SERIES_INVALID') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_dated_series_no_update BEFORE UPDATE ON billing_dated_series BEGIN SELECT RAISE(ABORT,'BILLING_SERIES_IMMUTABLE'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_dated_series_no_delete BEFORE DELETE ON billing_dated_series BEGIN SELECT RAISE(ABORT,'BILLING_SERIES_IMMUTABLE'); END`,
 'DROP TRIGGER IF EXISTS billing_issuance_guard',
 guard.replace("AND NEW.number=s.prefix||printf('%0*d',s.width,s.next_value)","AND NEW.number=s.prefix||(CASE WHEN EXISTS(SELECT 1 FROM billing_dated_series a WHERE a.series_id=s.id) THEN replace(NEW.issue_date,'-','')||'-' ELSE '' END)||printf('%0*d',s.width,s.next_value)")
];
