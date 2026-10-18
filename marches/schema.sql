CREATE TABLE IF NOT EXISTS markets (
 id TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL,
 updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS market_versions (
 market_id TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL,
 updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
 PRIMARY KEY(market_id,version), FOREIGN KEY(market_id) REFERENCES markets(id)
);
CREATE TRIGGER IF NOT EXISTS market_history_insert AFTER INSERT ON markets BEGIN
 INSERT INTO market_versions VALUES(NEW.id,NEW.version,NEW.payload,NEW.updated_at,NEW.updated_by);
END;
CREATE TRIGGER IF NOT EXISTS market_history_update AFTER UPDATE ON markets BEGIN
 INSERT INTO market_versions VALUES(NEW.id,NEW.version,NEW.payload,NEW.updated_at,NEW.updated_by);
END;
CREATE TABLE IF NOT EXISTS market_documents (
 id TEXT PRIMARY KEY, market_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
 mime TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL,
 uploaded_at TEXT NOT NULL, uploaded_by TEXT NOT NULL, extracted_text TEXT NOT NULL DEFAULT '',
 UNIQUE(market_id,sha256), FOREIGN KEY(market_id) REFERENCES markets(id)
);
CREATE INDEX IF NOT EXISTS market_documents_market ON market_documents(market_id);
CREATE TRIGGER IF NOT EXISTS market_document_quota BEFORE INSERT ON market_documents
WHEN (SELECT COUNT(*) FROM market_documents WHERE market_id=NEW.market_id)>=50
 OR (SELECT COALESCE(SUM(size),0) FROM market_documents WHERE market_id=NEW.market_id)+NEW.size>52428800
BEGIN SELECT RAISE(ABORT,'market_document_quota'); END;
CREATE TRIGGER IF NOT EXISTS market_document_archive BEFORE INSERT ON market_documents
WHEN (SELECT json_extract(payload,'$.status') FROM markets WHERE id=NEW.market_id)='archived'
BEGIN SELECT RAISE(ABORT,'market_archived'); END;
CREATE TABLE IF NOT EXISTS market_document_chunks (
 document_id TEXT NOT NULL, sequence INTEGER NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY(document_id,sequence), FOREIGN KEY(document_id) REFERENCES market_documents(id)
);
