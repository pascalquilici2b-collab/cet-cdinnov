/** Materialized shared project directory. Market snapshots remain the single write boundary. */
export const projectsSchema=[
 `CREATE TABLE IF NOT EXISTS commercial_projects(id TEXT PRIMARY KEY,market_id TEXT NOT NULL REFERENCES markets(id),name TEXT NOT NULL,code TEXT NOT NULL,archived INTEGER NOT NULL CHECK(archived IN(0,1)),market_version INTEGER NOT NULL,data_json TEXT NOT NULL CHECK(json_valid(data_json)))`,
 `CREATE INDEX IF NOT EXISTS commercial_projects_market ON commercial_projects(market_id)`,
 ...['INSERT','UPDATE'].map(event=>`CREATE TRIGGER IF NOT EXISTS commercial_projects_${event.toLowerCase()} AFTER ${event} ON markets BEGIN
   DELETE FROM commercial_projects WHERE market_id=NEW.id;
   INSERT INTO commercial_projects SELECT json_extract(value,'$.id'),NEW.id,json_extract(value,'$.name'),coalesce(json_extract(value,'$.code'),''),coalesce(json_extract(value,'$.archived'),0),NEW.version,value FROM json_each(NEW.payload,'$.projects');
 END`),
 `INSERT INTO commercial_projects SELECT json_extract(p.value,'$.id'),m.id,json_extract(p.value,'$.name'),coalesce(json_extract(p.value,'$.code'),''),coalesce(json_extract(p.value,'$.archived'),0),m.version,p.value FROM markets m,json_each(m.payload,'$.projects') p WHERE NOT EXISTS(SELECT 1 FROM commercial_projects c WHERE c.id=json_extract(p.value,'$.id') AND c.market_id=m.id)`
];
export async function migrateProjects(db){await db.batch(projectsSchema.map(sql=>db.prepare(sql)));}
