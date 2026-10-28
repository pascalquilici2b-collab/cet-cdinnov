import {billingSeriesPolicySchema} from './billing-series-policy-schema.mjs';

const legacyNumberSQL=date=>`s.prefix||(CASE WHEN EXISTS(SELECT 1 FROM billing_dated_series a WHERE a.series_id=s.id) THEN replace(${date},'-','')||'-' ELSE '' END)||printf('%0*d',s.width,s.next_value)`;
/** Internal SQL expressions only; dates are bound parameters or trigger columns. */
export const billingNumberSQL=date=>`(CASE WHEN EXISTS(SELECT 1 FROM billing_monthly_series m WHERE m.series_id=s.id) THEN substr(s.prefix,1,4)||substr(replace(${date},'-',''),1,6) ELSE s.prefix||(CASE WHEN EXISTS(SELECT 1 FROM billing_dated_series a WHERE a.series_id=s.id) THEN replace(${date},'-','')||'-' ELSE '' END) END)||printf('%0*d',s.width,s.next_value)`;
const guard=(name,date)=>{
 const sql=billingSeriesPolicySchema.find(s=>s.startsWith('CREATE TRIGGER IF NOT EXISTS '+name+' '));
 if(!sql?.includes(legacyNumberSQL(date)))throw Error('Monthly number guard mismatch: '+name);
 return sql.replaceAll(legacyNumberSQL(date),billingNumberSQL(date));
};
export const billingMonthlyNumberSchema=[
 `CREATE TABLE IF NOT EXISTS billing_monthly_series(series_id TEXT PRIMARY KEY REFERENCES billing_number_series(id))`,
 `CREATE TRIGGER IF NOT EXISTS billing_monthly_series_insert BEFORE INSERT ON billing_monthly_series BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_number_series s WHERE s.id=NEW.series_id AND s.prefix=CASE WHEN s.kind='invoice' THEN 'FAC-AAAAMM' ELSE 'DEV-AAAAMM' END AND s.width=3 AND s.next_value=s.first_value AND s.version=1 AND s.last_issue_date IS NULL AND s.start_date='1970-01-01' AND s.end_date='9999-12-31' AND NOT EXISTS(SELECT 1 FROM billing_dated_series d WHERE d.series_id=s.id)) THEN RAISE(ABORT,'BILLING_MONTHLY_SERIES_INVALID') END; END`,
 ...['UPDATE','DELETE'].map(op=>`CREATE TRIGGER IF NOT EXISTS billing_monthly_series_no_${op.toLowerCase()} BEFORE ${op} ON billing_monthly_series BEGIN SELECT RAISE(ABORT,'BILLING_SERIES_IMMUTABLE'); END`),
 'DROP TRIGGER IF EXISTS billing_draft_number_guard',guard('billing_draft_number_guard','NEW.number_date'),
 'DROP TRIGGER IF EXISTS billing_issuance_guard',guard('billing_issuance_guard','NEW.issue_date')
];
