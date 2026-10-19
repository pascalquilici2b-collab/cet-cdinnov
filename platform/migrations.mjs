import {readFile} from 'node:fs/promises';
export async function migrationStatements(){
  const files=['0001-budget-records.sql','0002-portal-access.sql'];
  return (await Promise.all(files.map(file=>readFile(new URL('migrations/'+file,import.meta.url),'utf8')))).flatMap(s=>s.split('-- statement').map(s=>s.trim()).filter(Boolean));
}
export async function migrateLocal(db){
 const exists=await db.prepare("SELECT name FROM sqlite_master WHERE name='app_schema_migrations'").first();
 const applied=exists?(await db.prepare('SELECT id FROM app_schema_migrations').all()).results.map(r=>r.id):[];
 for(const id of ['0001-budget-records','0002-portal-access'])if(!applied.includes(id)){
  const contents=await readFile(new URL('migrations/'+id+'.sql',import.meta.url),'utf8');
  for(const sql of contents.split('-- statement').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 }
}
