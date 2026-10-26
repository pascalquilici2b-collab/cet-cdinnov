export const clientEmployeesSchema=[
 `CREATE TABLE IF NOT EXISTS client_employee_spaces(client_id TEXT PRIMARY KEY,version INTEGER NOT NULL,data_json TEXT NOT NULL CHECK(json_valid(data_json)),updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS client_employee_versions(client_id TEXT NOT NULL,version INTEGER NOT NULL,data_json TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,PRIMARY KEY(client_id,version))`,
 `CREATE TRIGGER IF NOT EXISTS client_employee_insert AFTER INSERT ON client_employee_spaces BEGIN INSERT INTO client_employee_versions VALUES(NEW.client_id,NEW.version,NEW.data_json,NEW.updated_at,NEW.updated_by); END`,
 `CREATE TRIGGER IF NOT EXISTS client_employee_update AFTER UPDATE ON client_employee_spaces BEGIN INSERT INTO client_employee_versions VALUES(NEW.client_id,NEW.version,NEW.data_json,NEW.updated_at,NEW.updated_by); END`,
 `CREATE TABLE IF NOT EXISTS client_employee_documents(id TEXT PRIMARY KEY,client_id TEXT NOT NULL,employee_id TEXT NOT NULL,kind TEXT NOT NULL,filename TEXT NOT NULL,mime TEXT NOT NULL,object_key TEXT NOT NULL,sha256 TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL)`
];
