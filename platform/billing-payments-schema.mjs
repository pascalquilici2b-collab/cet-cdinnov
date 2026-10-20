/** Monetary movements are append-only. One operation inserts its complete ledger in a single SQLite transaction. */
const account=(field)=>`(SELECT ${field} FROM billing_payment_accounts WHERE document_id=NEW.document_id)`;
const target=(field)=>`(SELECT ${field} FROM billing_payment_entries WHERE id=NEW.target_id)`;
const insertEntry=(kind,condition,version,amount,delta,reversal,replacement,date,method,reference,note)=>`
 INSERT INTO billing_payment_entries(id,operation_id,document_id,version,kind,amount_minor,delta_minor,balance_after_minor,occurred_on,method,reference,note,reason,reversal_of,replacement_for,recorded_at,recorded_by)
 SELECT ${kind==="'void'"?"NEW.id||':void'":"NEW.id"},NEW.id,NEW.document_id,${version},${kind},${amount},${delta},${account('balance_minor')}+(${delta}),${date},${method},${reference},${note},NEW.reason,${reversal},${replacement},NEW.recorded_at,NEW.recorded_by WHERE ${condition};`;
const voidEntry=(condition)=>insertEntry("'void'",condition,`${account('version')}+1`,target('amount_minor'),`-${target('delta_minor')}`,'NEW.target_id','NULL','NEW.correction_date',target('method'),target('reference'),"''");
export const billingPaymentSchema=[
 `CREATE TABLE IF NOT EXISTS billing_payment_accounts (
  document_id TEXT PRIMARY KEY REFERENCES billing_documents(id),version INTEGER NOT NULL CHECK(version>=0),
  received_minor INTEGER NOT NULL CHECK(typeof(received_minor)='integer' AND received_minor>=0),
  refunded_minor INTEGER NOT NULL CHECK(typeof(refunded_minor)='integer' AND refunded_minor>=0),
  balance_minor INTEGER NOT NULL CHECK(typeof(balance_minor)='integer' AND balance_minor>=0 AND balance_minor=received_minor-refunded_minor),
  updated_at TEXT NOT NULL,updated_by TEXT NOT NULL
 )`,
 `CREATE TABLE IF NOT EXISTS billing_payment_operations (
  id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES billing_documents(id),document_version INTEGER NOT NULL,
  expected_version INTEGER NOT NULL CHECK(expected_version>=0),kind TEXT NOT NULL CHECK(kind IN ('receipt','refund','void','replace')),
  target_id TEXT REFERENCES billing_payment_entries(id),amount_minor INTEGER,
  occurred_on TEXT,method TEXT,reference TEXT NOT NULL CHECK(length(reference)<=300),note TEXT NOT NULL CHECK(length(note)<=2000),reason TEXT NOT NULL CHECK(length(reason)<=2000),
  correction_date TEXT NOT NULL CHECK(length(correction_date)=10 AND coalesce(date(correction_date,'+0 days')=correction_date,0)),
  request_hash TEXT NOT NULL,recorded_at TEXT NOT NULL,recorded_by TEXT NOT NULL,
  CHECK((kind IN ('void','replace') AND target_id IS NOT NULL AND length(trim(reason))>0) OR (kind IN ('receipt','refund') AND target_id IS NULL AND reason='')),
  CHECK((kind='void' AND amount_minor IS NULL AND occurred_on IS NULL AND method IS NULL AND reference='' AND note='') OR
   (kind<>'void' AND typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 99999999999999 AND method IN ('transfer','card','cash','cheque','direct_debit','other') AND method IS NOT NULL
    AND occurred_on IS NOT NULL AND length(occurred_on)=10 AND coalesce(date(occurred_on,'+0 days')=occurred_on,0) AND occurred_on<=correction_date)),
  FOREIGN KEY(document_id,document_version) REFERENCES billing_document_versions(document_id,version)
 )`,
 `CREATE TABLE IF NOT EXISTS billing_payment_entries (
  id TEXT PRIMARY KEY,operation_id TEXT NOT NULL REFERENCES billing_payment_operations(id),document_id TEXT NOT NULL REFERENCES billing_payment_accounts(document_id),
  version INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('receipt','refund','void')),amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 99999999999999),
  delta_minor INTEGER NOT NULL CHECK(typeof(delta_minor)='integer' AND abs(delta_minor)=amount_minor),
  balance_after_minor INTEGER NOT NULL CHECK(typeof(balance_after_minor)='integer' AND balance_after_minor>=0),occurred_on TEXT NOT NULL,method TEXT NOT NULL,
  reference TEXT NOT NULL,note TEXT NOT NULL,reason TEXT NOT NULL,reversal_of TEXT UNIQUE REFERENCES billing_payment_entries(id),replacement_for TEXT REFERENCES billing_payment_entries(id),
  recorded_at TEXT NOT NULL,recorded_by TEXT NOT NULL,UNIQUE(document_id,version)
 )`,
 `CREATE INDEX IF NOT EXISTS billing_payment_operation_document ON billing_payment_operations(document_id,expected_version)`,
 `CREATE TRIGGER IF NOT EXISTS billing_payment_account_initial BEFORE INSERT ON billing_payment_accounts BEGIN
  SELECT CASE WHEN NEW.version<>0 OR NEW.received_minor<>0 OR NEW.refunded_minor<>0 OR NEW.balance_minor<>0
   OR NOT EXISTS(SELECT 1 FROM billing_documents d JOIN billing_issuances i ON i.document_id=d.id JOIN billing_issue_jobs j ON j.issuance_id=i.id WHERE d.id=NEW.document_id AND d.kind='invoice' AND j.state='ready')
   THEN RAISE(ABORT,'BILLING_PAYMENT_ACCOUNT') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_payment_operation_guard BEFORE INSERT ON billing_payment_operations BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_documents d JOIN billing_issuances i ON i.document_id=d.id JOIN billing_issue_jobs j ON j.issuance_id=i.id
   WHERE d.id=NEW.document_id AND d.kind='invoice' AND d.version=NEW.document_version AND j.state='ready')
   OR NEW.expected_version<>coalesce(${account('version')},0) THEN RAISE(ABORT,'BILLING_PAYMENT_CONFLICT') END;
  SELECT CASE WHEN NEW.target_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM billing_payment_entries e WHERE e.id=NEW.target_id AND e.document_id=NEW.document_id AND e.kind IN ('receipt','refund')
    AND NOT EXISTS(SELECT 1 FROM billing_payment_entries r WHERE r.reversal_of=e.id)) THEN RAISE(ABORT,'BILLING_PAYMENT_TARGET') END;
  SELECT CASE WHEN coalesce(${account('balance_minor')},0)+CASE NEW.kind WHEN 'receipt' THEN NEW.amount_minor WHEN 'refund' THEN -NEW.amount_minor
    WHEN 'void' THEN -${target('delta_minor')} ELSE -${target('delta_minor')}+CASE ${target('kind')} WHEN 'receipt' THEN NEW.amount_minor ELSE -NEW.amount_minor END END<0
   THEN RAISE(ABORT,'BILLING_PAYMENT_BALANCE') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_payment_operation_apply AFTER INSERT ON billing_payment_operations BEGIN
  INSERT INTO billing_payment_accounts SELECT NEW.document_id,0,0,0,0,NEW.recorded_at,NEW.recorded_by WHERE NOT EXISTS(SELECT 1 FROM billing_payment_accounts WHERE document_id=NEW.document_id);
  ${voidEntry(`NEW.kind='replace' AND ${target('kind')}='refund'`)}
  ${insertEntry(`CASE WHEN NEW.kind='replace' THEN ${target('kind')} ELSE NEW.kind END`,"NEW.kind<>'void'",`${account('version')}+1`,'NEW.amount_minor',`CASE WHEN NEW.kind='receipt' OR (NEW.kind='replace' AND ${target('kind')}='receipt') THEN NEW.amount_minor ELSE -NEW.amount_minor END`,'NULL',"CASE WHEN NEW.kind='replace' THEN NEW.target_id ELSE NULL END",'NEW.occurred_on','NEW.method','NEW.reference','NEW.note')}
  ${voidEntry(`NEW.kind='void' OR (NEW.kind='replace' AND ${target('kind')}='receipt')`)}
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_payment_entry_guard BEFORE INSERT ON billing_payment_entries BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_payment_operations o LEFT JOIN billing_payment_entries t ON t.id=o.target_id WHERE o.id=NEW.operation_id
   AND o.document_id=NEW.document_id AND o.recorded_at=NEW.recorded_at AND o.recorded_by=NEW.recorded_by AND o.reason=NEW.reason
   AND NEW.version=o.expected_version+CASE WHEN o.kind='replace' AND ((t.kind='receipt' AND NEW.kind='void') OR (t.kind='refund' AND NEW.kind='refund')) THEN 2 ELSE 1 END
   AND ((NEW.kind='void' AND NEW.id=o.id||':void' AND o.kind IN ('void','replace') AND NEW.reversal_of=o.target_id AND NEW.replacement_for IS NULL
     AND NEW.amount_minor=t.amount_minor AND NEW.delta_minor=-t.delta_minor AND NEW.occurred_on=o.correction_date AND NEW.method=t.method AND NEW.reference=t.reference AND NEW.note='')
    OR (NEW.kind<>'void' AND NEW.id=o.id AND NEW.kind=CASE WHEN o.kind='replace' THEN t.kind ELSE o.kind END
     AND NEW.reversal_of IS NULL AND NEW.replacement_for IS CASE WHEN o.kind='replace' THEN o.target_id ELSE NULL END
     AND NEW.amount_minor=o.amount_minor AND NEW.delta_minor=CASE WHEN NEW.kind='receipt' THEN o.amount_minor ELSE -o.amount_minor END
     AND NEW.occurred_on=o.occurred_on AND NEW.method=o.method AND NEW.reference=o.reference AND NEW.note=o.note)))
   OR NEW.version<>${account('version')}+1 OR NEW.balance_after_minor<>${account('balance_minor')}+NEW.delta_minor
   THEN RAISE(ABORT,'BILLING_PAYMENT_ENTRY') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_payment_entry_apply AFTER INSERT ON billing_payment_entries BEGIN
  UPDATE billing_payment_accounts SET version=NEW.version,balance_minor=NEW.balance_after_minor,
   received_minor=received_minor+CASE WHEN NEW.kind='receipt' THEN NEW.amount_minor WHEN NEW.kind='void' AND (SELECT kind FROM billing_payment_entries WHERE id=NEW.reversal_of)='receipt' THEN -NEW.amount_minor ELSE 0 END,
   refunded_minor=refunded_minor+CASE WHEN NEW.kind='refund' THEN NEW.amount_minor WHEN NEW.kind='void' AND (SELECT kind FROM billing_payment_entries WHERE id=NEW.reversal_of)='refund' THEN -NEW.amount_minor ELSE 0 END,
   updated_at=NEW.recorded_at,updated_by=NEW.recorded_by WHERE document_id=NEW.document_id;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_payment_account_update BEFORE UPDATE ON billing_payment_accounts BEGIN
  SELECT CASE WHEN NEW.document_id<>OLD.document_id OR NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM billing_payment_entries e WHERE e.document_id=NEW.document_id AND e.version=NEW.version
   AND e.balance_after_minor=NEW.balance_minor AND e.recorded_at=NEW.updated_at AND e.recorded_by=NEW.updated_by
   AND NEW.received_minor=OLD.received_minor+CASE WHEN e.kind='receipt' THEN e.amount_minor WHEN e.kind='void' AND (SELECT kind FROM billing_payment_entries WHERE id=e.reversal_of)='receipt' THEN -e.amount_minor ELSE 0 END
   AND NEW.refunded_minor=OLD.refunded_minor+CASE WHEN e.kind='refund' THEN e.amount_minor WHEN e.kind='void' AND (SELECT kind FROM billing_payment_entries WHERE id=e.reversal_of)='refund' THEN -e.amount_minor ELSE 0 END)
   THEN RAISE(ABORT,'BILLING_PAYMENT_ACCOUNT') END;
 END`,
 ...['operations','entries'].flatMap(table=>['UPDATE','DELETE'].map(action=>`CREATE TRIGGER IF NOT EXISTS billing_payment_${table}_no_${action.toLowerCase()} BEFORE ${action} ON billing_payment_${table} BEGIN SELECT RAISE(ABORT,'BILLING_PAYMENT_HISTORY'); END`)),
 `CREATE TRIGGER IF NOT EXISTS billing_payment_account_no_delete BEFORE DELETE ON billing_payment_accounts BEGIN SELECT RAISE(ABORT,'BILLING_PAYMENT_HISTORY'); END`
];
