/** Explicit offline migration runner. Production freezes the previous writers
 * before invoking these steps; never call this from a user request. */
import assert from 'node:assert/strict';
import {schemaStatements,cutoverStatements,sources,saveBusinessDocument} from './business-schema.mjs';
export async function seedBusinessDocument(db,domain,document,version=1,updatedAt=new Date().toISOString(),updatedBy='fixture'){
 const current=await db.prepare(`SELECT payload,${sources[domain].revision} AS version FROM business_${domain}_workspace`).first();
 const saved=await saveBusinessDocument(db,domain,current?JSON.parse(current.payload):null,document,current?.version||0,updatedBy,!!current,updatedAt,version,true);
 assert.equal(saved,version);return saved;
}
export async function migrateBusiness(db){
 if(await db.prepare("SELECT id FROM app_schema_migrations WHERE id='0003-business-tables'").first())return;
 const schema=schemaStatements();for(let i=0;i<schema.length;i+=25)await db.batch(schema.slice(i,i+25).map(sql=>db.prepare(sql)));
 for(const [domain,source] of Object.entries(sources)){
  await db.prepare(`CREATE TABLE IF NOT EXISTS ${source.table}(id TEXT PRIMARY KEY,payload TEXT NOT NULL,${source.revision} INTEGER NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)`).run();
  const row=await db.prepare(`SELECT * FROM ${source.table} WHERE id='shared'`).first();
  if(row){
   await seedBusinessDocument(db,domain,JSON.parse(row.payload),row[source.revision],row.updated_at,row.updated_by);
   const actual=await db.prepare(`SELECT * FROM business_${domain}_workspace WHERE id='shared'`).first();
   assert.deepEqual({...actual,payload:JSON.parse(actual.payload)},{...row,payload:JSON.parse(row.payload)});
  }
 }
 await db.batch(cutoverStatements().map(sql=>db.prepare(sql)));
}
