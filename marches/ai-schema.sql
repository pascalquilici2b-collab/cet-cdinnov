CREATE TABLE IF NOT EXISTS market_document_readings (
 document_id TEXT PRIMARY KEY, text TEXT NOT NULL, method TEXT NOT NULL,
 complete INTEGER NOT NULL, pages INTEGER NOT NULL, warnings TEXT NOT NULL,
 updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
 FOREIGN KEY(document_id) REFERENCES market_documents(id)
);
CREATE TABLE IF NOT EXISTS market_analysis_runs (
 id TEXT PRIMARY KEY, market_id TEXT NOT NULL, base_version INTEGER NOT NULL,
 fingerprint TEXT NOT NULL, status TEXT NOT NULL, total INTEGER NOT NULL,
 completed INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
 result TEXT NOT NULL DEFAULT '{}', error TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(market_id) REFERENCES markets(id)
);
CREATE INDEX IF NOT EXISTS market_analysis_market ON market_analysis_runs(market_id,created_at);
CREATE TABLE IF NOT EXISTS market_analysis_parts (
 run_id TEXT NOT NULL, position INTEGER NOT NULL, document_id TEXT NOT NULL,
 name TEXT NOT NULL, text TEXT NOT NULL, output TEXT,
 PRIMARY KEY(run_id,position), FOREIGN KEY(run_id) REFERENCES market_analysis_runs(id)
);
CREATE TABLE IF NOT EXISTS market_ai_daily (
 day TEXT PRIMARY KEY, reserved INTEGER NOT NULL
);
