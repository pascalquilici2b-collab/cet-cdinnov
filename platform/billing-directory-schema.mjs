export const billingDirectorySchema=[
 `CREATE TABLE IF NOT EXISTS billing_directory (
  kind TEXT NOT NULL CHECK(kind IN ('clients','services')),id TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>=1),
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),create_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,created_by TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,
  PRIMARY KEY(kind,id)
 )`,
 `CREATE UNIQUE INDEX IF NOT EXISTS billing_service_reference ON billing_directory(lower(trim(json_extract(data_json,'$.reference')))) WHERE kind='services' AND trim(json_extract(data_json,'$.reference'))<>''`,
 `CREATE TABLE IF NOT EXISTS billing_directory_versions (
  kind TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,data_json TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,
  PRIMARY KEY(kind,id,version),FOREIGN KEY(kind,id) REFERENCES billing_directory(kind,id)
 )`,
 `CREATE TRIGGER IF NOT EXISTS billing_directory_initial BEFORE INSERT ON billing_directory BEGIN
  SELECT CASE WHEN NEW.version<>1 THEN RAISE(ABORT,'BILLING_DIRECTORY_INITIAL') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_directory_guard BEFORE UPDATE ON billing_directory BEGIN
  SELECT CASE WHEN NEW.kind<>OLD.kind OR NEW.id<>OLD.id OR NEW.version<>OLD.version+1 OR NEW.create_hash<>OLD.create_hash OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by THEN RAISE(ABORT,'BILLING_DIRECTORY_IDENTITY') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_directory_insert AFTER INSERT ON billing_directory BEGIN
  INSERT INTO billing_directory_versions VALUES(NEW.kind,NEW.id,NEW.version,NEW.data_json,NEW.updated_at,NEW.updated_by);
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_directory_update AFTER UPDATE ON billing_directory BEGIN
  INSERT INTO billing_directory_versions VALUES(NEW.kind,NEW.id,NEW.version,NEW.data_json,NEW.updated_at,NEW.updated_by);
 END`,
 `CREATE TRIGGER IF NOT EXISTS billing_directory_no_delete BEFORE DELETE ON billing_directory BEGIN SELECT RAISE(ABORT,'BILLING_DIRECTORY_HISTORY'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_directory_history_no_update BEFORE UPDATE ON billing_directory_versions BEGIN SELECT RAISE(ABORT,'BILLING_DIRECTORY_HISTORY'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_directory_history_no_delete BEFORE DELETE ON billing_directory_versions BEGIN SELECT RAISE(ABORT,'BILLING_DIRECTORY_HISTORY'); END`
];
