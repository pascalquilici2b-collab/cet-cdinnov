-- Phase 1: indexed read model. The existing workspace remains the only writer.
-- Triggers and its version compare-and-swap run in the same SQLite transaction.
CREATE TABLE IF NOT EXISTS app_schema_migrations (
  id TEXT PRIMARY KEY, applied_at TEXT NOT NULL
);
-- statement
CREATE TABLE IF NOT EXISTS app_budget_records (
  workspace_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  name TEXT,
  client_id TEXT,
  project_id TEXT,
  PRIMARY KEY(workspace_id, collection, position)
);
-- statement
CREATE INDEX IF NOT EXISTS app_budget_records_page
  ON app_budget_records(workspace_id, collection, position, record_id);
-- statement
CREATE INDEX IF NOT EXISTS app_budget_records_project
  ON app_budget_records(workspace_id, collection, project_id, position);
-- statement
CREATE VIEW IF NOT EXISTS app_budget_source_records AS
SELECT w.id AS workspace_id, a.key AS collection,
       json_extract(r.value,'$.id') AS record_id, CAST(r.key AS INTEGER) AS position,
       r.value AS payload, json_extract(r.value,'$.name') AS name,
       json_extract(r.value,'$.clientId') AS client_id,
       json_extract(r.value,'$.projectId') AS project_id
FROM budgets_workspace w, json_each(w.payload) a, json_each(CASE WHEN a.type='array' THEN a.value ELSE '[]' END) r
WHERE a.key IN ('clients','projects','budgetLines','expenses','drs','imports','partnerReports')
  AND a.type='array' AND r.type='object'
  AND json_type(CASE WHEN r.type='object' THEN r.value ELSE '{}' END,'$.id')='text';
-- statement
CREATE TRIGGER IF NOT EXISTS app_budget_records_insert AFTER INSERT ON budgets_workspace BEGIN
  INSERT INTO app_budget_records SELECT * FROM app_budget_source_records WHERE workspace_id=NEW.id;
END;
-- statement
CREATE TRIGGER IF NOT EXISTS app_budget_records_update AFTER UPDATE OF payload ON budgets_workspace BEGIN
  DELETE FROM app_budget_records
  WHERE workspace_id=NEW.id AND (collection,position) NOT IN (
    SELECT collection,position FROM app_budget_source_records WHERE workspace_id=NEW.id
  );
  INSERT INTO app_budget_records SELECT * FROM app_budget_source_records WHERE workspace_id=NEW.id
  ON CONFLICT(workspace_id,collection,position) DO UPDATE SET
    record_id=excluded.record_id, payload=excluded.payload, name=excluded.name,
    client_id=excluded.client_id, project_id=excluded.project_id
  WHERE app_budget_records.payload<>excluded.payload OR app_budget_records.position<>excluded.position;
END;
-- statement
CREATE TRIGGER IF NOT EXISTS app_budget_records_delete AFTER DELETE ON budgets_workspace BEGIN
  DELETE FROM app_budget_records WHERE workspace_id=OLD.id;
END;
-- statement
INSERT INTO app_budget_records SELECT * FROM app_budget_source_records WHERE true
ON CONFLICT(workspace_id,collection,position) DO UPDATE SET
  record_id=excluded.record_id, payload=excluded.payload, name=excluded.name,
  client_id=excluded.client_id, project_id=excluded.project_id
WHERE app_budget_records.payload<>excluded.payload OR app_budget_records.position<>excluded.position;
-- statement
INSERT INTO app_schema_migrations(id,applied_at) VALUES('0001-budget-records',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(id) DO NOTHING;
