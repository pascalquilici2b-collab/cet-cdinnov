import assert from 'node:assert/strict';
import {testEnvironment} from '../marches/test.mjs';
import {migrateBusiness,seedBusinessDocument} from './business-migration.mjs';
import {domains,entities,sources,normalizeDocument,recordOperations,writeStatements,saveBusinessDocument} from './business-schema.mjs';
const ctx=await testEnvironment({beforeBusinessMigration:true});let checks=0;
const check=async(name,fn)=>{await fn();console.log('OK '+name);checks++;};
const documents={};
function specimen(spec,depth=0){
 const value={id:'duplicate',name:'Texte é € " \\ 🧾',nullable:null,boolean:false,number:3.14159,extension:{'quoted"key':true,'slash\\key':[null,false,{x:1}]}};
 for(const [key,child] of Object.entries(spec.children))value[key]=child.kind==='single'?specimen(child,depth+1):child.kind==='object'?{'key"\\':specimen(child,depth+1),'empty':null,'bool':false}: [specimen(child,depth+1),specimen(child,depth+1),{noId:'kept'},null,false];
 return value;
}
try{
 for(const [domain,source] of Object.entries(sources)){
  await ctx.db.prepare(`CREATE TABLE IF NOT EXISTS ${source.table}(id TEXT PRIMARY KEY,payload TEXT NOT NULL,${source.revision} INTEGER NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)`).run();
  documents[domain]=specimen(domains[domain]);
  // Keep the initial portal authentication valid for the integration fixture.
  if(domain==='portal')documents[domain].auth={accounts:ctx.accounts,allowed:Object.keys(ctx.accounts)};
  await ctx.db.prepare(`INSERT INTO ${source.table} VALUES('shared',?,17,'original-time','original-author') ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,${source.revision}=17,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(JSON.stringify(documents[domain])).run();
 }
 await check('Migration preserves all values, duplicates, anonymous records, positions and metadata',async()=>{
  await migrateBusiness(ctx.db);
  for(const [domain,source] of Object.entries(sources)){
   const row=await ctx.db.prepare(`SELECT * FROM ${source.table}`).first();assert.deepEqual(JSON.parse(row.payload),documents[domain]);assert.equal(row[source.revision],17);assert.equal(row.updated_at,'original-time');
   for(const [table,rows] of normalizeDocument(domain,documents[domain]))assert.equal((await ctx.db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,rows.size);
  }
  assert.deepEqual((await ctx.db.prepare('PRAGMA foreign_key_check').all()).results,[]);
 });
 await check('Source documents are read-only views; archives are immutable and migration is idempotent',async()=>{
  await migrateBusiness(ctx.db);
  for(const source of Object.values(sources)){
   assert.equal((await ctx.db.prepare('SELECT type FROM sqlite_master WHERE name=?').bind(source.table).first()).type,'view');
   await assert.rejects(()=>ctx.db.prepare(`UPDATE ${source.table} SET payload='{}'`).run(),/view/);
   await assert.rejects(()=>ctx.db.prepare(`UPDATE archive_${source.table} SET payload='{}'`).run(),/CDI_ARCHIVE_READ_ONLY/);
  }
 });
 await check('A cell edit writes only that cell; parents and other cells stay byte-for-byte unchanged',async()=>{
  const before=documents.sheets,after=structuredClone(before);after.sheets[0].rows[0].cells['key"\\'].number=99;
  const operations=recordOperations('sheets',before,after);assert.equal(operations.length,1);assert.equal(operations[0].t,'sheet_cells');
  assert.equal(await saveBusinessDocument(ctx.db,'sheets',before,after,17,'test'),18);
  assert.deepEqual(JSON.parse((await ctx.db.prepare('SELECT payload FROM cdinnov_sheets_workspace').first()).payload),after);
  assert.equal((await ctx.db.prepare('SELECT COUNT(*) n FROM app_write_guard').first()).n,0);
 });
 await check('Stale revision rejects every change and a foreign-key error rolls back the whole transaction',async()=>{
  const before=documents.budgets,after=structuredClone(before);after.clients[0].name='New';
  assert.equal(await saveBusinessDocument(ctx.db,'budgets',before,after,16,'stale'),null);
  const statements=writeStatements('budgets',before,after,17,'test');
  statements.splice(2,0,{sql:"INSERT INTO budget_client_accounts(record_key,parent_key,position,data_json) VALUES('orphan','missing',0,'{}')",params:[]});
  await assert.rejects(()=>ctx.db.batch(statements.map(s=>ctx.db.prepare(s.sql).bind(...s.params))),/FOREIGN KEY/);
  assert.deepEqual(JSON.parse((await ctx.db.prepare('SELECT payload FROM budgets_workspace').first()).payload),before);
  assert.equal((await ctx.db.prepare('SELECT COUNT(*) n FROM app_write_guard').first()).n,0);
 });
 await check('Full deletion, reorder and restore preserve all optional fields and empty containers',async()=>{
  for(const [domain,original] of Object.entries(documents)){
   await seedBusinessDocument(ctx.db,domain,{},30);
   assert.deepEqual(JSON.parse((await ctx.db.prepare(`SELECT payload FROM ${sources[domain].table}`).first()).payload),{});
   await seedBusinessDocument(ctx.db,domain,original,31);
   assert.deepEqual(JSON.parse((await ctx.db.prepare(`SELECT payload FROM ${sources[domain].table}`).first()).payload),original);
  }
  assert.deepEqual((await ctx.db.prepare('PRAGMA foreign_key_check').all()).results,[]);
 });
 await check('All business collections fit within the free per-request query budget',async()=>{
  for(const domain of Object.keys(domains))assert.ok(writeStatements(domain,null,documents[domain],0,'test',false).length<35);
  assert.equal(entities.length,new Set(entities.map(e=>e.table)).size);
 });
 await check('Heavily escaped legacy text does not double the SQL command payload',async()=>{
  const text='"\\'.repeat(300000),doc={clients:[{id:'large',name:text}]};
  const statements=writeStatements('budgets',null,doc,0,'test',false);
  assert.ok(Math.max(...statements.flatMap(s=>s.params.filter(p=>typeof p==='string').map(p=>Buffer.byteLength(p))))<1500000);
  await seedBusinessDocument(ctx.db,'budgets',doc,32);
  assert.deepEqual(JSON.parse((await ctx.db.prepare('SELECT payload FROM budgets_workspace').first()).payload),doc);
 });
 console.log(checks+' business-table checks passed; '+entities.length+' entity tables');
}finally{await ctx.worker.dispose();}
