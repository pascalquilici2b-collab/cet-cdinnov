import type {Database,Reply} from './contracts';
import type {ClientEmployee} from './client-employees-domain';
import type {RhClient,RhProject,RhPayrollSource,RhSnapshot} from './rh-domain';
import type {RhClientAgents,RhClientArchive,RhArchiveFile,RhArchivePayroll,RhArchiveVersion,RhArchiveReturn,RhArchivePaymentDocument} from './rh-client-records';
import {rhFail,rhId} from './rh-domain';
import {rhDocumentStatus,type RhDocumentStatus} from './rh-lifecycle';
import {boundedBody} from './portal';

interface Helpers {
 references:()=>Promise<{clients:RhClient[];projects:RhProject[]}>;
 employees:(clientId:string)=>Promise<RhClientAgents&{stored:any}>;
 activeClient:(clientId:string)=>Promise<void>;
}
const encode=encodeURIComponent;
const payrollPath=(id:string)=>'/api/v1/rh/payroll/'+encode(id)+'/source';
const filePath=(clientId:string,id:string)=>'/api/v1/billing/client-employees/'+encode(clientId)+'/documents/'+encode(id);
const publicAgents=({version,agents,links}:RhClientAgents):RhClientAgents=>({version,agents,links});

async function link(request:Request,db:Database,user:string,reply:Reply,helpers:Helpers,clientId:string,agentId:string,projectId?:string){
 if(!rhId(clientId)||!rhId(agentId))rhFail('Agent ou client invalide.');await helpers.activeClient(clientId);
 if(request.method==='POST'){
  let body:any;try{body=JSON.parse(new TextDecoder().decode(await boundedBody(request,10000)));}catch{return rhFail('Rattachement invalide.',400);}
  projectId=body?.projectId;
 }
 if(!rhId(projectId))rhFail('Choisissez un projet.');
 const [space,refs]=await Promise.all([helpers.employees(clientId),helpers.references()]);
 if(request.headers.get('if-match')!==String(space.version))rhFail('Cet espace a changé. Actualisez-le avant de continuer.',409);
 const agent=space.agents.find(a=>a.id===agentId);if(!agent)rhFail('Cet agent n’appartient pas au client.');
 const project=refs.projects.find(p=>p.id===projectId&&p.clientIds.includes(clientId));if(!project)rhFail('Ce projet n’est pas rattaché à cette entité.');
 const existing=await db.prepare('SELECT agent_id FROM rh_agent_projects WHERE client_id=? AND agent_id=? AND project_id=?').bind(clientId,agentId,projectId).first();
 const adding=request.method==='POST';
 if(!adding&&agent.allocations.some(a=>a.projectId===projectId))rhFail('Ce projet possède des affectations historiques dans la fiche agent. Leur lien est conservé.',409);
 if(adding&&existing||!adding&&!existing)return reply(200,publicAgents(space));
 const id=crypto.randomUUID(),date=new Date().toISOString();
 // Advancing the same shared employee-space version makes links and employee edits mutually exclusive.
 await db.batch([
  db.prepare("INSERT INTO rh_write_guards(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM client_employee_spaces WHERE client_id=? AND version=?) AND EXISTS(SELECT 1 FROM commercial_projects WHERE id=? AND market_version=? AND archived=0) AND EXISTS(SELECT 1 FROM billing_directory WHERE kind='clients' AND id=? AND coalesce(json_extract(data_json,'$.archived'),0)=0) THEN 1 ELSE 0 END").bind(id,clientId,space.version,projectId,project.marketVersion,clientId),
  db.prepare('UPDATE client_employee_spaces SET version=version+1,updated_at=?,updated_by=? WHERE client_id=? AND version=?').bind(date,user,clientId,space.version),
  adding?db.prepare('INSERT INTO rh_agent_projects VALUES(?,?,?,?,?)').bind(clientId,agentId,projectId,date,user):db.prepare('DELETE FROM rh_agent_projects WHERE client_id=? AND agent_id=? AND project_id=?').bind(clientId,agentId,projectId),
  db.prepare('INSERT INTO rh_audit VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),clientId,null,adding?'AGENT_PROJECT_LINKED':'AGENT_PROJECT_UNLINKED',JSON.stringify({agentId,projectId}),date,user),
  db.prepare('DELETE FROM rh_write_guards WHERE id=?').bind(id)
 ]);
 return reply(200,publicAgents(await helpers.employees(clientId)));
}

async function archive(db:Database,clientId:string,helpers:Helpers):Promise<RhClientArchive>{
 if(!rhId(clientId))rhFail('Client invalide.');await helpers.activeClient(clientId);
 const [space,refs,legacy,payrollRows,documentRows,versionRows,returnRows,historicalAgents]=await Promise.all([
  helpers.employees(clientId),helpers.references(),
  db.prepare("SELECT id,employee_id,kind,filename,mime,created_at,json_extract(snapshot_json,'$.agents[0].name') AS employee_name FROM client_employee_documents WHERE client_id=? ORDER BY created_at DESC,id DESC").bind(clientId).all<any>(),
  db.prepare("SELECT p.id,p.sha256,p.created_at,p.document_id,d.name AS document_name,json_extract(d.data_json,'$._deletedAt') AS deleted_at,json_extract(p.data_json,'$.agentId') AS agent_id,json_extract(p.data_json,'$.month') AS month,json_extract(p.data_json,'$.filename') AS filename,json_extract(p.data_json,'$.confirmed') AS confirmed,json_extract(p.data_json,'$.reading.fields.employee_name') AS read_name FROM rh_payroll_files p JOIN rh_documents d ON d.id=p.document_id AND d.client_id=p.client_id WHERE p.client_id=? ORDER BY p.created_at DESC,p.id DESC").bind(clientId).all<any>(),
  db.prepare('SELECT id,name,version,data_json,updated_at FROM rh_documents WHERE client_id=? ORDER BY updated_at DESC,id DESC').bind(clientId).all<any>(),
  db.prepare("SELECT v.id,v.document_id,v.revision,v.created_at,json_extract(v.data_json,'$.client.name') AS client_name,(SELECT json_group_array(json_object('id',json_extract(p.value,'$.id'),'name',json_extract(p.value,'$.name'))) FROM json_each(v.data_json,'$.projects') p) AS projects_json FROM rh_versions v WHERE v.client_id=? ORDER BY v.revision DESC,v.created_at DESC").bind(clientId).all<any>(),
  db.prepare("SELECT r.id,r.version_id,r.revision,r.status,r.created_at,json_extract(r.data_json,'$.files') AS files_json,json_extract(r.data_json,'$.inspection.complete') AS complete FROM rh_returns r JOIN rh_versions v ON v.id=r.version_id WHERE v.client_id=? ORDER BY r.revision DESC,r.created_at DESC").bind(clientId).all<any>(),
  db.prepare("SELECT json_extract(a.value,'$.id') AS id,json_extract(a.value,'$.name') AS name FROM rh_versions v,json_each(v.data_json,'$.agents') a WHERE v.client_id=? ORDER BY v.created_at DESC").bind(clientId).all<{id:string;name:string}>()
 ]);
 const names=new Map(space.agents.map(a=>[a.id,a.name]));for(const a of historicalAgents.results)if(!names.has(a.id)&&a.name)names.set(a.id,a.name);
 const legacyFile=(row:any):RhArchiveFile=>({id:row.id,filename:row.filename,mime:row.mime,createdAt:row.created_at,downloadPath:filePath(clientId,row.id),...(row.employee_id?{employeeId:row.employee_id,employeeName:row.employee_name||names.get(row.employee_id)||'Agent archivé'}:{})});
 const grouped=new Map<string,RhArchivePayroll>();
 for(const row of payrollRows.results){
  const employeeId=row.agent_id||'',month=row.month||'',key=JSON.stringify([employeeId,month,row.sha256]),source={id:row.id,documentId:row.document_id,documentName:row.document_name,deleted:!!row.deleted_at,confirmed:!!row.confirmed,downloadPath:payrollPath(row.id)},previous=grouped.get(key);
  if(previous){previous.sources.push(source);previous.confirmed ||= !!row.confirmed;continue;}
  grouped.set(key,{id:row.id,employeeId,employeeName:names.get(employeeId)||row.read_name||'Agent à identifier',month,filename:row.filename,mime:'application/pdf',createdAt:row.created_at,downloadPath:payrollPath(row.id),confirmed:!!row.confirmed,sources:[source]});
 }
 const returns=new Map<string,RhArchiveReturn[]>();for(const row of returnRows.results){
  const files=(JSON.parse(row.files_json||'[]') as {name:string;mime:string}[]).map((file,index)=>({id:row.id+':'+index,filename:file.name,mime:file.mime,createdAt:row.created_at,downloadPath:'/api/v1/rh/versions/'+encode(row.version_id)+'/returns/'+encode(row.id)+'/files/'+index}));
  returns.set(row.version_id,[...(returns.get(row.version_id)||[]),{id:row.id,revision:row.revision,status:row.status,complete:!!row.complete,createdAt:row.created_at,files}]);
 }
 const versions=new Map<string,RhArchiveVersion[]>(),frozenProjects=new Map<string,{id:string;name:string}[]>();
 for(const row of versionRows.results){
  if(!frozenProjects.has(row.document_id))frozenProjects.set(row.document_id,JSON.parse(row.projects_json||'[]'));
  versions.set(row.document_id,[...(versions.get(row.document_id)||[]),{id:row.id,revision:row.revision,filename:`RH_${row.client_name}_v${row.revision}.xlsx`,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',createdAt:row.created_at,downloadPath:'/api/v1/rh/versions/'+encode(row.id)+'/export',returns:returns.get(row.id)||[]}]);
 }
 const payments:RhArchivePaymentDocument[]=[];
 for(const row of documentRows.results){
  const stored=JSON.parse(row.data_json),archived=versions.get(row.id)||[],periods=stored.periods||[];
  let status:RhDocumentStatus=stored._workflow;
  if(!['draft','in_progress','finalized'].includes(status)){
   // Only old documents lack a stored workflow. Reuse the same inference as the RH screen.
   const [files,last]=await Promise.all([db.prepare('SELECT data_json FROM rh_payroll_files WHERE document_id=?').bind(row.id).all<{data_json:string}>(),db.prepare('SELECT data_json FROM rh_versions WHERE document_id=? ORDER BY revision DESC LIMIT 1').bind(row.id).first<{data_json:string}>()]);
   status=rhDocumentStatus(stored,files.results.map(f=>JSON.parse(f.data_json) as RhPayrollSource),last?JSON.parse(last.data_json) as RhSnapshot:undefined);
  }
  const projectIds=[...new Set<string>(periods.map((p:any)=>p.projectId))],dates=periods.flatMap((p:any)=>[p.startDate,p.endDate]).filter(Boolean).sort();
  payments.push({id:row.id,name:row.name,version:row.version,status,deleted:!!stored._deletedAt,updatedAt:row.updated_at,employeeIds:[...new Set<string>(periods.flatMap((p:any)=>p.agents.map((a:any)=>a.agentId)))],projects:projectIds.map(id=>({id,name:refs.projects.find(p=>p.id===id)?.name||frozenProjects.get(row.id)?.find(p=>p.id===id)?.name||'Projet archivé'})),periodStart:dates[0]||'',periodEnd:dates.at(-1)||'',latestReturnStatus:archived[0]?.returns[0]?.status||null,versions:archived});
 }
 return {payroll:[...grouped.values()].sort((a,b)=>a.employeeName.localeCompare(b.employeeName,'fr')||b.month.localeCompare(a.month)||b.createdAt.localeCompare(a.createdAt)),missions:legacy.results.filter(r=>r.kind==='mission').map(legacyFile),legacyPayments:legacy.results.filter(r=>r.kind==='payment').map(legacyFile),payments};
}

/** Extends the existing RH permission gate; does not duplicate documents or storage. */
export async function rhClientRecordsRoute(request:Request,db:Database,user:string,reply:Reply,helpers:Helpers):Promise<Response|null>{
 const path=new URL(request.url).pathname.slice('/api/v1/rh'.length),linked=path.match(/^\/clients\/([^/]+)\/agents\/([^/]+)\/projects(?:\/([^/]+))?$/),index=path.match(/^\/clients\/([^/]+)\/archive$/),project=path.match(/^\/projects\/([^/]+)\/agents$/);
 if(linked){if(request.method==='POST'&&!linked[3]||request.method==='DELETE'&&linked[3])return link(request,db,user,reply,helpers,linked[1],linked[2],linked[3]);return reply(405,{error:'Méthode non autorisée.'});}
 if(index){if(request.method!=='GET')return reply(405,{error:'Méthode non autorisée.'});return reply(200,await archive(db,index[1],helpers));}
 if(project&&request.method==='GET'){
  const refs=await helpers.references(),found=refs.projects.find(p=>p.id===project[1]);if(!found)rhFail('Projet introuvable.',404);
  const directory=(await db.prepare("SELECT id,json_extract(data_json,'$.party.name') AS name FROM billing_directory WHERE kind='clients'").all<{id:string;name:string}>()).results,clientNames=new Map(directory.map(c=>[c.id,c.name])),agents=[];
  for(const clientId of found.clientIds){const space=await helpers.employees(clientId);for(const agent of space.agents)if(space.links.some(l=>l.agentId===agent.id&&l.projectId===found.id))agents.push({id:agent.id,name:agent.name,role:agent.role,clientId,clientName:clientNames.get(clientId)||'Entité archivée'});}
  return reply(200,{agents});
 }
 return null;
}
