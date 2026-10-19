import {readFile} from 'node:fs/promises';
export async function migrationStatements(){
  const files=['0001-budget-records.sql','0002-portal-access.sql'];
  return (await Promise.all(files.map(file=>readFile(new URL('migrations/'+file,import.meta.url),'utf8')))).flatMap(s=>s.split('-- statement').map(s=>s.trim()).filter(Boolean));
}
export async function migrateLocal(db){for(const sql of await migrationStatements())await db.prepare(sql).run();}
