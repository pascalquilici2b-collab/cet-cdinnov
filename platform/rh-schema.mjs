import {rhStampingSchema} from './rh-stamping-schema.mjs';
/** Explicit additive migration; HTTP requests never create tables. */
export const rhSchema=[
 `CREATE TABLE IF NOT EXISTS rh_write_guards(id TEXT PRIMARY KEY,ok INTEGER NOT NULL CONSTRAINT RH_WRITE_CONFLICT CHECK(ok=1))`,
 `CREATE TABLE IF NOT EXISTS rh_agent_projects(client_id TEXT NOT NULL,agent_id TEXT NOT NULL,project_id TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL,PRIMARY KEY(client_id,agent_id,project_id))`,
 `CREATE TABLE IF NOT EXISTS rh_documents(id TEXT PRIMARY KEY,client_id TEXT NOT NULL,name TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>=1),data_json TEXT NOT NULL CHECK(json_valid(data_json)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS rh_documents_client ON rh_documents(client_id,updated_at)`,
 `CREATE TABLE IF NOT EXISTS rh_document_history(document_id TEXT NOT NULL,version INTEGER NOT NULL,data_json TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,PRIMARY KEY(document_id,version))`,
 ...['INSERT','UPDATE'].map(event=>`CREATE TRIGGER IF NOT EXISTS rh_document_${event.toLowerCase()} AFTER ${event} ON rh_documents BEGIN INSERT INTO rh_document_history VALUES(NEW.id,NEW.version,NEW.data_json,NEW.updated_at,NEW.updated_by); END`),
 `CREATE TABLE IF NOT EXISTS rh_payroll_files(id TEXT PRIMARY KEY,client_id TEXT NOT NULL,document_id TEXT NOT NULL,sha256 TEXT NOT NULL,object_key TEXT NOT NULL,data_json TEXT NOT NULL CHECK(json_valid(data_json)),created_at TEXT NOT NULL,UNIQUE(document_id,sha256))`,
 `CREATE INDEX IF NOT EXISTS rh_payroll_document ON rh_payroll_files(document_id)`,
 `CREATE TABLE IF NOT EXISTS rh_payroll_history(id TEXT PRIMARY KEY,payroll_id TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL)`,
 ...['INSERT','UPDATE'].map(event=>`CREATE TRIGGER IF NOT EXISTS rh_payroll_${event.toLowerCase()} AFTER ${event} ON rh_payroll_files BEGIN INSERT INTO rh_payroll_history VALUES(lower(hex(randomblob(16))),NEW.id,NEW.data_json,strftime('%Y-%m-%dT%H:%M:%fZ','now')); END`),
 `CREATE TABLE IF NOT EXISTS rh_versions(id TEXT PRIMARY KEY,document_id TEXT NOT NULL,client_id TEXT NOT NULL,revision INTEGER NOT NULL,data_json TEXT NOT NULL CHECK(json_valid(data_json)),created_at TEXT NOT NULL,created_by TEXT NOT NULL,UNIQUE(document_id,revision))`,
 `CREATE TRIGGER IF NOT EXISTS rh_versions_no_update BEFORE UPDATE ON rh_versions BEGIN SELECT RAISE(ABORT,'RH_VERSION_IMMUTABLE'); END`,
 `CREATE TRIGGER IF NOT EXISTS rh_versions_no_delete BEFORE DELETE ON rh_versions BEGIN SELECT RAISE(ABORT,'RH_VERSION_IMMUTABLE'); END`,
 `CREATE TABLE IF NOT EXISTS rh_returns(id TEXT PRIMARY KEY,version_id TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,data_json TEXT NOT NULL CHECK(json_valid(data_json)),created_at TEXT NOT NULL,created_by TEXT NOT NULL,UNIQUE(version_id,revision))`,
 `CREATE TABLE IF NOT EXISTS rh_audit(id TEXT PRIMARY KEY,client_id TEXT NOT NULL,document_id TEXT,action TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL)`,
 ...rhStampingSchema
];
export async function migrateRh(db){await db.batch(rhSchema.map(sql=>db.prepare(sql)));}
