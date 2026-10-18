import {readFile} from 'node:fs/promises';
export async function migrationStatements(){
  return (await readFile(new URL('migrations/0001-budget-records.sql',import.meta.url),'utf8')).split('-- statement').map(s=>s.trim()).filter(Boolean);
}
export async function migrateLocal(db){for(const sql of await migrationStatements())await db.prepare(sql).run();}
