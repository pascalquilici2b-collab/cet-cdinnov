/** Lossless business storage. JSON remains only at an individual record boundary
 * for optional/legacy fields; all known collections and sheet cells live in tables.
 * The read views are compatibility documents, never stored workspace sources. */
const array=(table,children={})=>({table,kind:'array',children});
const map=(table,children={})=>({table,kind:'object',children});
const object=(table,children={})=>({table,kind:'single',children});
export const domains={
 portal:{table:'app_portal_meta',kind:'single',children:{
  params:object('portal_settings'),types:array('portal_movement_types'),salaries:array('portal_employees'),
  mouvements:array('portal_cet_movements'),conges:array('portal_leaves'),
  notesFrais:array('portal_expense_claims',{lignes:array('portal_expense_lines')}),
  codesAffaires:array('portal_business_codes'),factures:array('portal_invoices'),
  facturxPartyMemory:object('portal_invoice_parties',{seller:array('portal_invoice_sellers'),buyer:array('portal_invoice_buyers')}),
  auth:object('portal_auth',{accounts:map('portal_accounts'),allowed:array('portal_allowed_accounts'),invitations:map('portal_invitations')})}},
 budgets:{table:'app_budgets_meta',kind:'single',children:{
  clients:array('budget_clients',{accounts:array('budget_client_accounts'),aliases:array('budget_client_aliases')}),
  projects:array('budget_projects',{periods:array('budget_periods')}),
  budgetLines:array('budget_lines',{subExpenses:array('budget_subexpenses'),allocations:map('budget_allocations')}),
  expenses:array('budget_expenses',{payments:array('budget_payments')}),drs:array('budget_drs'),
  imports:array('budget_imports'),partnerReports:array('budget_partner_reports',{
   categories:array('budget_report_categories'),expenses:array('budget_report_expenses'),warnings:array('budget_report_warnings')}),
  globalExpenditureImports:array('budget_global_imports'),reportExpenseLinks:array('budget_report_links',{budgetAllocations:array('budget_report_allocations')}),
  reportCaptureDescriptions:array('budget_capture_descriptions'),reportExpenseDescriptions:array('budget_expense_descriptions'),reportPeriodCoverages:array('budget_period_coverages')}},
 sheets:{table:'app_sheets_meta',kind:'single',children:{
  profile:object('sheet_profile'),workspaces:array('sheet_workspaces',{folders:array('sheet_folders')}),
  sheets:array('sheet_documents',{columns:array('sheet_columns'),rows:array('sheet_rows',{cells:map('sheet_cells')}),
   comments:array('sheet_comments'),forms:array('sheet_forms',{fields:array('sheet_form_fields')}),automations:array('sheet_automations')}),
  dashboards:array('sheet_dashboards',{widgets:array('sheet_widgets'),sheetIds:array('sheet_dashboard_links')}),activity:array('sheet_activity')}}
};
export const sources={portal:{table:'app_portal_workspace',revision:'version'},budgets:{table:'budgets_workspace',revision:'version'},sheets:{table:'cdinnov_sheets_workspace',revision:'revision'}};
export const entities=[];
function register(spec,domain,parent=null){entities.push({...spec,domain,parent});for(const child of Object.values(spec.children))register(child,domain,spec.table);}
for(const [domain,spec] of Object.entries(domains))register(spec,domain);
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fits=(v,spec)=>spec.kind==='array'?Array.isArray(v):isObject(v);

/** Keys use the original business identifier where available, with an occurrence
 * suffix for legacy duplicates. Anonymous rows use their position: no invented
 * identifier is ever exposed in the reconstructed document. */
export function normalizeDocument(domain,document){
 const output=new Map();
 function visit(spec,value,key,parent,position,mapKey){
  const data=isObject(value)?{...value}:value;
  if(isObject(data))for(const [field,child] of Object.entries(spec.children))if(fits(data[field],child)){
   const nested=data[field];data[field]=child.kind==='array'?[]:{};
   if(child.kind==='single')visit(child,nested,JSON.stringify([key,field]),key,0,null);
   else {
    const seen=new Map();
    for(const [index,[name,item]] of Object.entries(nested).entries()){
     let identity=child.kind==='object'?['map',name]:['position',index];
     if(child.kind==='array'&&isObject(item))for(const id of ['id','matricule','code','columnId'])if(['string','number'].includes(typeof item[id])){identity=[id,item[id]];break;}
     const identityText=JSON.stringify(identity),occurrence=seen.get(identityText)||0;seen.set(identityText,occurrence+1);
     visit(child,item,JSON.stringify([key,field,identity,occurrence]),key,index,child.kind==='object'?name:null);
    }
   }
  }
  const row={k:key,p:parent,i:position,m:mapKey,d:JSON.stringify(data)};
  if(!output.has(spec.table))output.set(spec.table,new Map());output.get(spec.table).set(key,row);
 }
 visit(domains[domain],document,domain,null,0,null);return output;
}
export function recordOperations(domain,before,after){
 const old=before===null?new Map():normalizeDocument(domain,before),next=normalizeDocument(domain,after),operations=[];
 // Upserts parent first, deletions child first, so foreign keys remain valid even
 // during imports and complete restores. Every operation belongs to one domain.
 for(const entity of entities.filter(e=>e.domain===domain))for(const row of next.get(entity.table)?.values()||[]){
  const previous=old.get(entity.table)?.get(row.k);
  if(!previous||JSON.stringify(previous)!==JSON.stringify(row))operations.push({t:entity.table,...row});
 }
 for(const entity of entities.filter(e=>e.domain===domain).reverse())for(const key of old.get(entity.table)?.keys()||[])if(!next.get(entity.table)?.has(key))operations.push({t:entity.table,k:key,remove:true});
 return operations;
}
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const rawJSON=a=>`CASE ${a}.type WHEN 'null' THEN 'null' WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' WHEN 'object' THEN ${a}.value WHEN 'array' THEN ${a}.value ELSE json_quote(${a}.value) END`;
/** JSON aggregates receive json(value) *inside* the aggregate; SQLite strips
 * JSON subtypes at subquery boundaries. Preserve booleans/null/empty containers. */
export function renderRecord(spec,data,key){
 let n=0;
 function render(node,data,key){
  if(!Object.keys(node.children).length)return data;
  const j='j'+(++n),arms=[];
  for(const [field,child] of Object.entries(node.children)){
   const r='r'+(++n),v=render(child,`${r}.data_json`,`${r}.record_key`);
   const rows=`SELECT ${r}.map_key AS mk,${v} AS value FROM ${child.table} ${r} WHERE ${r}.parent_key=${key} ORDER BY ${r}.position,${r}.record_key`;
   const nested=child.kind==='single'?`COALESCE((SELECT value FROM (${rows}) LIMIT 1),'{}')`:
    child.kind==='array'?`(SELECT json_group_array(json(value)) FROM (${rows}))`:`(SELECT json_group_object(mk,json(value)) FROM (${rows}))`;
   arms.push(`WHEN ${j}.key=${quote(field)} AND ${j}.type=${quote(child.kind==='array'?'array':'object')} THEN ${nested}`);
  }
  return `(CASE WHEN json_type(${data})='object' THEN (SELECT json_group_object(${j}.key,json(CASE ${arms.join(' ')} ELSE ${rawJSON(j)} END)) FROM json_each(${data}) ${j}) ELSE ${data} END)`;
 }
 return render(spec,data,key);
}
const fields={business_id:['id','matricule','code','columnId'],name:['name','nom','libelle','title'],employee_id:['matricule'],client_id:['clientId'],project_id:['projectId'],sheet_id:['sheetId'],status:['statut','status'],date:['date','dateFacture','createdAt'],amount:['ht','montantHT','amount','qte']};
function generatedColumns(){return Object.entries(fields).map(([name,paths])=>`${name} GENERATED ALWAYS AS (${paths.length===1?'':'COALESCE('}${paths.map(p=>`json_extract(data_json,'$.${p}')`).join(',')}${paths.length===1?'':')'}) VIRTUAL`).join(',');}

export function schemaStatements(){
 const sql=[`CREATE TABLE IF NOT EXISTS app_domain_state(domain TEXT PRIMARY KEY CHECK(domain IN ('portal','budgets','sheets')),revision INTEGER NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS app_write_guard(domain TEXT PRIMARY KEY,expected INTEGER,expected_exists INTEGER NOT NULL)`,
 `CREATE TRIGGER IF NOT EXISTS app_write_guard_check BEFORE INSERT ON app_write_guard BEGIN
 SELECT CASE WHEN (NEW.expected_exists=1 AND NOT EXISTS(SELECT 1 FROM app_domain_state WHERE domain=NEW.domain AND revision=NEW.expected)) OR (NEW.expected_exists=0 AND EXISTS(SELECT 1 FROM app_domain_state WHERE domain=NEW.domain)) THEN RAISE(ABORT,'CDI_STALE_REVISION') END; END`];
 for(const e of entities){
  sql.push(`CREATE TABLE IF NOT EXISTS ${e.table}(record_key TEXT PRIMARY KEY,parent_key TEXT${e.parent?` REFERENCES ${e.parent}(record_key) DEFERRABLE INITIALLY DEFERRED`:''},position INTEGER NOT NULL,map_key TEXT,data_json TEXT NOT NULL CHECK(json_valid(data_json)),${generatedColumns()})`);
  sql.push(`CREATE INDEX IF NOT EXISTS ${e.table}_parent ON ${e.table}(parent_key,position)`);
  if(e.kind==='object')sql.push(`CREATE INDEX IF NOT EXISTS ${e.table}_map_key ON ${e.table}(map_key)`);
  if(!e.table.startsWith('app_'))sql.push(`CREATE INDEX IF NOT EXISTS ${e.table}_business ON ${e.table}(business_id)`);
 }
 // A command view is an ephemeral SQL input, not a stored table. One statement
 // per changed entity type performs upserts and deletes, all in the same batch.
 // Separate triggers bound SQLite's compiled statement size on the free tier.
 for(const e of entities){
  sql.push(`CREATE VIEW IF NOT EXISTS command_${e.table} AS SELECT '[]' AS operations`);
  sql.push(`CREATE TRIGGER IF NOT EXISTS command_${e.table}_apply INSTEAD OF INSERT ON command_${e.table} BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_write_guard WHERE domain=${quote(e.domain)}) THEN RAISE(ABORT,'CDI_WRITE_GUARD_REQUIRED') END;
 INSERT INTO ${e.table}(record_key,parent_key,position,map_key,data_json) SELECT json_extract(o.value,'$.k'),json_extract(o.value,'$.p'),json_extract(o.value,'$.i'),json_extract(o.value,'$.m'),o.value -> '$.d' FROM json_each(NEW.operations) o WHERE COALESCE(json_extract(o.value,'$.remove'),0)=0
 ON CONFLICT(record_key) DO UPDATE SET parent_key=excluded.parent_key,position=excluded.position,map_key=excluded.map_key,data_json=excluded.data_json;
 DELETE FROM ${e.table} WHERE record_key IN (SELECT json_extract(o.value,'$.k') FROM json_each(NEW.operations) o WHERE json_extract(o.value,'$.remove')=1); END`);
 }
 for(const [domain,spec] of Object.entries(domains))sql.push(`CREATE VIEW IF NOT EXISTS business_${domain}_workspace AS SELECT 'shared' AS id,${renderRecord(spec,'r.data_json','r.record_key')} AS payload,s.revision AS ${sources[domain].revision},s.updated_at,s.updated_by FROM app_domain_state s JOIN ${spec.table} r ON r.record_key=s.domain WHERE s.domain=${quote(domain)}`);
 return sql;
}
export function cutoverStatements(){
 const sql=['DROP TRIGGER IF EXISTS app_budget_records_insert','DROP TRIGGER IF EXISTS app_budget_records_update','DROP TRIGGER IF EXISTS app_budget_records_delete','DROP VIEW IF EXISTS app_budget_source_records'];
 for(const source of [...Object.values(sources),{table:'app_budget_records'}])sql.push(`ALTER TABLE ${source.table} RENAME TO archive_${source.table}`);
 for(const [domain,source] of Object.entries(sources))sql.push(`CREATE VIEW ${source.table} AS SELECT * FROM business_${domain}_workspace`);
 const collections=['clients','projects','budgetLines','expenses','drs','imports','partnerReports'];
 const projections=collections.map(collection=>{
  const spec=domains.budgets.children[collection];return `SELECT 'shared' AS workspace_id,${quote(collection)} AS collection,r.business_id AS record_id,r.position,${renderRecord(spec,'r.data_json','r.record_key')} AS payload,r.name,r.client_id,r.project_id FROM ${spec.table} r WHERE json_type(r.data_json,'$.id')='text'`;
 });
 sql.push('CREATE VIEW app_budget_records AS SELECT * FROM ('+projections.slice(0,4).join(' UNION ALL ')+') UNION ALL SELECT * FROM ('+projections.slice(4).join(' UNION ALL ')+')');
 for(const source of [...Object.values(sources),{table:'app_budget_records'}])for(const op of ['INSERT','UPDATE','DELETE'])sql.push(`CREATE TRIGGER archive_${source.table}_${op.toLowerCase()} BEFORE ${op} ON archive_${source.table} BEGIN SELECT RAISE(ABORT,'CDI_ARCHIVE_READ_ONLY'); END`);
 sql.push("INSERT OR IGNORE INTO app_schema_migrations(id,applied_at) VALUES ('0003-business-tables',datetime('now'))");return sql;
}

/** This produces few statements even for large imports: well below the free
 * plan's per-invocation query limit. D1 batch is one transaction, not a loop. */
export function writeStatements(domain,before,after,version,email,exists=true,stamp=new Date().toISOString(),nextVersion=version+1,force=false){
 const operations=recordOperations(domain,before,after),sql=[];
 if(!operations.length&&exists&&!force)return [];
 sql.push({sql:'INSERT INTO app_write_guard(domain,expected,expected_exists) VALUES(?,?,?)',params:[domain,version,exists?1:0]});
 for(const e of entities.filter(e=>e.domain===domain)){
  let chunk=[],bytes=2;
  const flush=()=>{if(chunk.length)sql.push({sql:`INSERT INTO command_${e.table}(operations) VALUES(?)`,params:[JSON.stringify(chunk)]});chunk=[];bytes=2;};
  for(const op of operations.filter(op=>op.t===e.table)){
   // Encode data once. Escaped legacy text must not double the command size.
   const wire=op.remove?op:{...op,d:JSON.parse(op.d)};
   const size=new TextEncoder().encode(JSON.stringify(wire)).length+1;if(chunk.length&&bytes+size>1600000)flush();chunk.push(wire);bytes+=size;
  }
  flush();
 }
 sql.push({sql:'INSERT INTO app_domain_state(domain,revision,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(domain) DO UPDATE SET revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by',params:[domain,nextVersion,stamp,email]});
 sql.push({sql:'DELETE FROM app_write_guard WHERE domain=?',params:[domain]});return sql;
}
export async function saveBusinessDocument(db,domain,before,after,version,email,exists=true,stamp=undefined,nextVersion=version+1,force=false){
 const statements=writeStatements(domain,exists?before:null,after,version,email,exists,stamp,nextVersion,force);
 if(!statements.length)return version;
 try{await db.batch(statements.map(s=>db.prepare(s.sql).bind(...s.params)));return nextVersion;}
 catch(error){if(String(error?.message||error).includes('CDI_STALE_REVISION'))return null;throw error;}
}
