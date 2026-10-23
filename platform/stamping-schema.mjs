/** Additive migration, deliberately separate from normal requests and billing migrations. */
export const stampingSchema=[
 `CREATE TABLE IF NOT EXISTS stamp_batches(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,data TEXT NOT NULL DEFAULT '{}',created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS stamp_batches_owner ON stamp_batches(owner,created_at)`,
 `CREATE TABLE IF NOT EXISTS stamp_documents(id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES stamp_batches(id) ON DELETE CASCADE,name TEXT NOT NULL,sha256 TEXT NOT NULL,size INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'UPLOADED',data TEXT NOT NULL DEFAULT '{}',match_group TEXT,lease_until INTEGER NOT NULL DEFAULT 0,UNIQUE(batch_id,sha256),UNIQUE(batch_id,match_group))`,
 `CREATE INDEX IF NOT EXISTS stamp_documents_batch ON stamp_documents(batch_id,status)`,
 `CREATE TRIGGER IF NOT EXISTS stamp_document_quota BEFORE INSERT ON stamp_documents BEGIN SELECT CASE WHEN (SELECT COUNT(*) FROM stamp_documents WHERE batch_id=NEW.batch_id)>=100 OR (SELECT COALESCE(SUM(size),0) FROM stamp_documents WHERE batch_id=NEW.batch_id)+NEW.size>209715200 THEN RAISE(ABORT,'stamp_document_quota') END; END`,
 `CREATE TABLE IF NOT EXISTS stamp_audit(id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES stamp_batches(id) ON DELETE CASCADE,document_id TEXT,actor TEXT NOT NULL,action TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS stamp_profiles(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,data TEXT NOT NULL,updated_at INTEGER NOT NULL)`
];
export async function migrateStamping(db){for(const sql of stampingSchema)await db.prepare(sql).run();}
// Rollback (only after exporting/removing module data): stamp_audit, stamp_documents,
// stamp_batches, stamp_profiles, in that order. Existing application tables are untouched.
