CREATE TABLE IF NOT EXISTS app_portal_workspace (id TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
-- statement
CREATE TABLE IF NOT EXISTS app_session_revocations (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
-- statement
INSERT OR IGNORE INTO app_schema_migrations(id, applied_at) VALUES ('0002-portal-access', datetime('now'));
