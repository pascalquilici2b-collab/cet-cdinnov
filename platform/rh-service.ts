import {createHash} from 'node:crypto';
import type {Database,Environment,Reply,Statement} from './contracts';
import {sessionIdentity,hasAccess} from './identity';
import {boundedBody} from './portal';
import {normalizeClientEmployees} from './client-employees-domain';
import type {ClientEmployee} from './client-employees-domain';
import {normalizeRhDraft,rhExpected,rhValidateReferences,rhIssues,rhLines,rhFail,rhId,rhMonth} from './rh-domain';
import type {RhClient,RhProject,RhDraft,RhPayrollSource,RhSnapshot,RhDocument,RhReturnInspection} from './rh-domain';
import {exportRhWorkbook,inspectRhReturnWorkbook} from './rh-document-files';
import {createRhStampingBatch} from './rh-stamping';

type Row={id:string;client_id:string;name:string;version:number;data_json:string;created_at:string;updated_at:string;updated_by:string};
const sha=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const now=()=>new Date().toISOString(),bucket=(env:Environment)=>env.CET_FILES as any;
const matchName=(a:string,b:string)=>{const k=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z]+/g)?.sort().join(' ');return !!k(a)&&k(a)===k(b);};
async function json(request:Request){try{return JSON.parse(new TextDecoder().decode(await boundedBody(request,1500000)));}catch{return rhFail('Saisie JSON invalide.',400);}}
async function multipart(request:Request){const data=await boundedBody(request,31*1024*1024);return new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')||''},body:new Uint8Array(data)}).formData();}
async function uploaded(value:FormDataEntryValue|null,ext:'pdf'|'xlsx'){
 if(!value||typeof value==='string'||!value.size||value.size>15*1024*1024)rhFail('Fichier absent ou supérieur à 15 Mo.');
 const file=value as File,bytes=new Uint8Array(await file.arrayBuffer()),name=file.name.replace(/[\x00-\x1f/\\]/g,'_').slice(0,180);
 if(!name.toLowerCase().endsWith('.'+ext)||ext==='pdf'&&new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-'||ext==='xlsx'&&(bytes[0]!==80||bytes[1]!==75))rhFail('Format '+ext.toUpperCase()+' invalide.');
 return {bytes,name,sha256:sha(bytes),mime:ext==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
}
async function context(db:Database){
 const [clientRows,projectRows,marketRows]=await Promise.all([
  db.prepare("SELECT id,data_json FROM billing_directory WHERE kind='clients' AND coalesce(json_extract(data_json,'$.archived'),0)=0").all<{id:string;data_json:string}>(),
  db.prepare('SELECT id,market_id,market_version,data_json FROM commercial_projects WHERE archived=0').all<{id:string;market_id:string;market_version:number;data_json:string}>(),
  db.prepare('SELECT id,payload FROM markets').all<{id:string;payload:string}>()
 ]);
 const clients:RhClient[]=clientRows.results.map(r=>{const d=JSON.parse(r.data_json);return {id:r.id,name:d.party?.name||d.name||'',logoData:d.logoData||'',siret:d.party?.siret||''};}).filter(c=>c.name);
 const marketClients=new Map(marketRows.results.map(r=>[r.id,JSON.parse(r.payload).clientId]));
 const projects:RhProject[]=projectRows.results.map(r=>{const p=JSON.parse(r.data_json);return {id:r.id,name:p.name,code:p.code||'',programme:p.programme||'',marketId:r.market_id,marketVersion:r.market_version,clientIds:[...new Set<string>([...(p.clientIds||[]),...([r.market_id,...(p.marketIds||[])]).map(id=>marketClients.get(id)).filter(Boolean)])],logoData:p.logoData||''};});
 return {clients:clients.sort((a,b)=>a.name.localeCompare(b.name,'fr')),projects:projects.sort((a,b)=>a.name.localeCompare(b.name,'fr'))};
}
async function employees(db:Database,clientId:string){
 const row=await db.prepare('SELECT version,data_json FROM client_employee_spaces WHERE client_id=?').bind(clientId).first<{version:number;data_json:string}>();
 const data=JSON.parse(row?.data_json||'{"agents":[],"payments":[]}');
 const links=(await db.prepare('SELECT agent_id AS agentId,project_id AS projectId FROM rh_agent_projects WHERE client_id=?').bind(clientId).all<{agentId:string;projectId:string}>()).results;
 for(const a of data.agents as ClientEmployee[])for(const p of a.allocations)if(p.projectId&&!links.some(l=>l.agentId===a.id&&l.projectId===p.projectId))links.push({agentId:a.id,projectId:p.projectId});
 return {version:row?.version||0,agents:data.agents as ClientEmployee[],links,stored:data};
}
async function payroll(db:Database,id:string){return (await db.prepare('SELECT data_json FROM rh_payroll_files WHERE document_id=? ORDER BY created_at,id').bind(id).all<{data_json:string}>()).results.map(r=>JSON.parse(r.data_json) as RhPayrollSource);}
async function detail(db:Database,row:Row):Promise<RhDocument&{issues:string[]} >{
 const draft=JSON.parse(row.data_json) as RhDraft,[files,versions,space]=await Promise.all([payroll(db,row.id),db.prepare('SELECT id,revision,created_at AS createdAt FROM rh_versions WHERE document_id=? ORDER BY revision DESC').bind(row.id).all<{id:string;revision:number;createdAt:string}>(),employees(db,row.client_id)]);
 return {id:row.id,version:row.version,draft,payroll:files,versions:versions.results,createdAt:row.created_at,updatedAt:row.updated_at,issues:rhIssues(draft,files,space.agents)};
}
async function rowFor(db:Database,id:string){const row=await db.prepare('SELECT * FROM rh_documents WHERE id=?').bind(id).first<Row>();if(!row)rhFail('Document introuvable.',404);return row!;}
function ifMatch(request:Request,version:number){if(request.headers.get('if-match')!==String(version))rhFail('Le document a changé. Actualisez avant de continuer.',409);}
const clientGuard=(db:Database,clientId:string)=>db.prepare("SELECT id FROM billing_directory WHERE id=? AND kind='clients' AND coalesce(json_extract(data_json,'$.archived'),0)=0").bind(clientId).first();
async function activeClient(db:Database,clientId:string){if(!await clientGuard(db,clientId))rhFail('La fiche client doit être enregistrée et active.',409);}
function guard(db:Database,condition:string,params:unknown[]){const id=crypto.randomUUID();return [db.prepare(`INSERT INTO rh_write_guards(id,ok) SELECT ?,CASE WHEN ${condition} THEN 1 ELSE 0 END`).bind(id,...params),db.prepare('DELETE FROM rh_write_guards WHERE id=?').bind(id)] as const;}
function audit(db:Database,clientId:string,docId:string|null,action:string,data:unknown,user:string){return db.prepare('INSERT INTO rh_audit VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),clientId,docId,action,JSON.stringify(data),now(),user);}
function touch(db:Database,row:Row,user:string,data?:RhDraft){return db.prepare('UPDATE rh_documents SET version=version+1,name=?,data_json=?,updated_at=?,updated_by=? WHERE id=? AND version=?').bind(data?.name||row.name,JSON.stringify(data||JSON.parse(row.data_json)),now(),user,row.id,row.version);}
function referencesGuard(draft:RhDraft,spaceVersion:number,projects:RhProject[]){return {condition:"coalesce((SELECT version FROM client_employee_spaces WHERE client_id=?),0)=? AND EXISTS(SELECT 1 FROM billing_directory WHERE id=? AND kind='clients' AND coalesce(json_extract(data_json,'$.archived'),0)=0) AND NOT EXISTS(SELECT 1 FROM json_each(?) p LEFT JOIN commercial_projects c ON c.id=json_extract(p.value,'$.id') WHERE c.id IS NULL OR c.archived<>0 OR c.market_version<>json_extract(p.value,'$.marketVersion'))",params:[draft.clientId,spaceVersion,draft.clientId,JSON.stringify(projects.filter(p=>draft.periods.some(x=>x.projectId===p.id)).map(p=>({id:p.id,marketVersion:p.marketVersion})))]};}
async function mutate(db:Database,row:Row,user:string,statements:Statement[],draft?:RhDraft,extra?:{condition:string;params:unknown[]}){
 const [before,after]=guard(db,'EXISTS(SELECT 1 FROM rh_documents WHERE id=? AND version=?)'+(extra?' AND ('+extra.condition+')':''),[row.id,row.version,...(extra?.params||[])]);
 await db.batch([before,touch(db,row,user,draft),...statements,after]);return detail(db,await rowFor(db,row.id));
}
async function readPayroll(env:Environment,bytes:Uint8Array){
 const base=env.BILLING_PDF_SERVICE_URL,key=env.BILLING_PDF_SERVICE_KEY;if(typeof base!=='string'||typeof key!=='string'||key.length<32)rhFail('Le service de lecture des bulletins n’est pas disponible.',503);
 let url:URL;try{url=new URL(base as string);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw 0;}catch{return rhFail('Adresse du service documentaire invalide.',503);}
 url.pathname='/api/stamping/process';const form=new FormData();form.append('file',new Blob([new Uint8Array(bytes)]),'source.pdf');form.append('payload',JSON.stringify({action:'extract'}));
 let response:Response;try{response=await fetch(url,{method:'POST',headers:{'X-API-Key':key as string},body:form,redirect:'manual',signal:AbortSignal.timeout(105000)});}catch{return rhFail('La lecture du bulletin a échoué. Réessayez.',503);}
 if(!response.ok)rhFail('Le bulletin ne peut pas être lu. Vérifiez le PDF.',422);
 const result=JSON.parse(new TextDecoder().decode(await boundedBody(response,8*1024*1024)));if(!result.ok||!result.result||result.result.source_sha256!==sha(bytes))rhFail('La lecture ne correspond pas au bulletin.',422);return result.result;
}
const cents=(v:unknown,allowNull=false)=>v===null&&allowNull||Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=99999999999;
async function binary(env:Environment,key:string,name:string,mime:string,reply:Reply){const object=await bucket(env).get(key);if(!object)rhFail('Fichier introuvable.',404);const headers=new Headers(reply(200,{}).headers);headers.set('Content-Type',mime);headers.set('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(name));headers.set('Content-Security-Policy',"sandbox; default-src 'none'");return new Response(object.body,{headers});}

export async function rhRoute(request:Request,env:Environment,reply:Reply):Promise<Response>{
 try{return await route(request,env,reply);}catch(error){if(String(error).includes('RH_WRITE_CONFLICT')||String(error).includes('UNIQUE constraint failed'))return reply(409,{error:'Les données ont changé. Actualisez avant de réessayer.'});throw error;}
}
async function route(request:Request,env:Environment,reply:Reply):Promise<Response>{
 const session=await sessionIdentity(request,env);if(!session)return reply(401,{error:'Connexion requise.'});if(!hasAccess(session,'facturier'))return reply(403,{error:'Accès aux documents RH réservé à la facturation.'});
 const db=env.BUDGETS_DB.withSession('first-primary'),path=new URL(request.url).pathname.slice('/api/v1/rh'.length),method=request.method;
 if(path==='/context'&&method==='GET')return reply(200,await context(db));
 if(/^\/clients\/[^/]+\/payroll$/.test(path)&&method==='GET'){const clientId=path.split('/')[2];await activeClient(db,clientId);const files=(await db.prepare('SELECT data_json FROM rh_payroll_files WHERE client_id=? ORDER BY created_at DESC LIMIT 1000').bind(clientId).all<{data_json:string}>()).results.map(r=>JSON.parse(r.data_json) as RhPayrollSource);return reply(200,{payroll:files.filter(p=>p.confirmed)});}
 let match=path.match(/^\/clients\/([^/]+)\/agents$/);
 if(match){const clientId=match[1];if(!rhId(clientId))rhFail('Client invalide.');await activeClient(db,clientId);const space=await employees(db,clientId);
  if(method==='GET')return reply(200,{version:space.version,agents:space.agents,links:space.links});
  if(method==='POST'){
   ifMatch(request,space.version);const data=await json(request),id=data.id||crypto.randomUUID();if(!/^[a-f\d-]{36}$/i.test(id))rhFail('Identifiant agent invalide.');const existing=space.agents.find(a=>a.id===id);if(existing){if(existing.name!==String(data.name||'').trim())rhFail('Cet identifiant est déjà utilisé.',409);return reply(200,{version:space.version,agent:existing,agents:space.agents,links:space.links});}
   const agents=normalizeClientEmployees([...space.agents,{id,name:data.name,role:data.role||'',supervisor:data.supervisor||'',allocations:[]}]),serialized=JSON.stringify({...space.stored,agents}),stamp=now();
   const result=space.version?await db.prepare('UPDATE client_employee_spaces SET version=version+1,data_json=?,updated_at=?,updated_by=? WHERE client_id=? AND version=? RETURNING version').bind(serialized,stamp,session.email,clientId,space.version).first<{version:number}>():await db.prepare('INSERT INTO client_employee_spaces VALUES(?,1,?,?,?) ON CONFLICT DO NOTHING RETURNING version').bind(clientId,serialized,stamp,session.email).first<{version:number}>();if(!result)rhFail('La liste des agents a changé. Actualisez.',409);return reply(201,{version:result!.version,agent:agents.at(-1),agents,links:space.links});
  }return reply(405,{error:'Méthode non autorisée.'});
 }
 if(path==='/documents'){
  if(method==='GET'){const rows=await db.prepare('SELECT d.id,d.client_id AS clientId,d.name,d.version,d.updated_at AS updatedAt,(SELECT count(*) FROM rh_versions v WHERE v.document_id=d.id) AS versionsCount FROM rh_documents d ORDER BY d.updated_at DESC LIMIT 300').all();return reply(200,{documents:rows.results});}
  if(method==='POST'){
   const input=await json(request),draft=normalizeRhDraft(input),id=input.id||crypto.randomUUID();if(!rhId(id))rhFail('Identifiant document invalide.');await activeClient(db,draft.clientId);const [refs,space]=await Promise.all([context(db),employees(db,draft.clientId)]);rhValidateReferences(draft,refs.projects,space.agents);
   const existing=await db.prepare('SELECT * FROM rh_documents WHERE id=?').bind(id).first<Row>();if(existing){if(existing.client_id!==draft.clientId||existing.data_json!==JSON.stringify(draft))rhFail('Cet identifiant est déjà utilisé.',409);return reply(200,await detail(db,existing));}
   const stamp=now(),refsCheck=referencesGuard(draft,space.version,refs.projects),[before,after]=guard(db,refsCheck.condition,refsCheck.params),links=draft.periods.flatMap(p=>p.agents.map(a=>db.prepare('INSERT OR IGNORE INTO rh_agent_projects VALUES(?,?,?,?,?)').bind(draft.clientId,a.agentId,p.projectId,stamp,session.email)));await db.batch([before,db.prepare('INSERT INTO rh_documents VALUES(?,?,?,1,?,?,?,?)').bind(id,draft.clientId,draft.name,JSON.stringify(draft),stamp,stamp,session.email),...links,after]);return reply(201,await detail(db,await rowFor(db,id)));
  }return reply(405,{error:'Méthode non autorisée.'});
 }
 if(path==='/versions'&&method==='GET'){const records=(await db.prepare('SELECT id,revision,created_at AS createdAt,json_extract(data_json,\'$.name\') AS name,json_extract(data_json,\'$.client.name\') AS clientName FROM rh_versions ORDER BY created_at DESC LIMIT 300').all()).results;return reply(200,{versions:records});}
 if(path==='/returns'&&method==='GET'){const records=(await db.prepare('SELECT r.id,r.version_id AS versionId,r.revision,r.status,r.created_at AS createdAt,json_extract(v.data_json,\'$.name\') AS documentName,json_extract(v.data_json,\'$.client.name\') AS clientName FROM rh_returns r JOIN rh_versions v ON v.id=r.version_id ORDER BY r.created_at DESC LIMIT 300').all()).results;return reply(200,{returns:records});}
 match=path.match(/^\/projects\/([^/]+)\/agents$/);
 if(match&&method==='GET'){const refs=await context(db),p=refs.projects.find(p=>p.id===match![1]);if(!p)rhFail('Projet introuvable.',404);const result=[];for(const clientId of p!.clientIds){const s=await employees(db,clientId);for(const a of s.agents)if(s.links.some(l=>l.agentId===a.id&&l.projectId===p!.id))result.push({id:a.id,name:a.name,role:a.role,clientId});}return reply(200,{agents:result});}
 match=path.match(/^\/payroll\/([^/]+)\/source$/);
 if(match&&method==='GET'){const file=await db.prepare('SELECT client_id,data_json FROM rh_payroll_files WHERE id=?').bind(match[1]).first<any>();if(!file)rhFail('Bulletin introuvable.',404);await activeClient(db,file.client_id);const p=JSON.parse(file.data_json);return binary(env,p.objectKey,p.filename,'application/pdf',reply);}
 match=path.match(/^\/documents\/([^/]+)(?:\/(payroll|freeze|reuse-payroll)(?:\/([^/]+))?)?$/);
 if(match){const row=await rowFor(db,match[1]);await activeClient(db,row.client_id);const draft=JSON.parse(row.data_json) as RhDraft,sub=match[2];
  if(!sub&&method==='GET')return reply(200,await detail(db,row));
  ifMatch(request,row.version);
  if(!sub&&method==='PUT'){
   const next=normalizeRhDraft(await json(request));if(next.clientId!==row.client_id)rhFail('Le client du document ne peut pas être modifié.');const [refs,space]=await Promise.all([context(db),employees(db,row.client_id)]);rhValidateReferences(next,refs.projects,space.agents);
   const links=next.periods.flatMap(p=>p.agents.map(a=>db.prepare('INSERT OR IGNORE INTO rh_agent_projects VALUES(?,?,?,?,?)').bind(row.client_id,a.agentId,p.projectId,now(),session.email)));
   return reply(200,await mutate(db,row,session.email,[...links,audit(db,row.client_id,row.id,'DRAFT_SAVED',{},session.email)],next,referencesGuard(next,space.version,refs.projects)));
  }
  if(sub==='payroll'&&!match[3]&&method==='POST'){
   const form=await multipart(request),file=await uploaded(form.get('file'),'pdf'),existing=await db.prepare('SELECT id FROM rh_payroll_files WHERE document_id=? AND sha256=?').bind(row.id,file.sha256).first();if(existing)return reply(200,{...await detail(db,row),duplicate:true});
   const fileCount=await db.prepare('SELECT count(*) AS count FROM rh_payroll_files WHERE document_id=?').bind(row.id).first<{count:number}>();if((fileCount?.count||0)>=300)rhFail('Le document contient déjà 300 bulletins. Réduisez sa période.');
   const reading=await readPayroll(env,file.bytes),space=await employees(db,row.client_id),providedAgent=String(form.get('agentId')||''),providedMonth=String(form.get('month')||'');
   const candidates=space.agents.filter(a=>matchName(a.name,reading.fields?.employee_name||'')),agentId=providedAgent||((candidates.length===1&&candidates[0].id)||''),month=providedMonth||(rhMonth(reading.fields?.period||'')?reading.fields.period:'');
   if(agentId&&!space.agents.some(a=>a.id===agentId)||month&&!rhMonth(month))rhFail('Attribution du bulletin invalide.');
   const amount=reading.bases?.EMPLOYER_COST?.amount_cents,id=crypto.randomUUID(),objectKey=`rh/${row.client_id}/payroll/${id}.pdf`,source:RhPayrollSource={id,agentId,month,filename:file.name,sha256:file.sha256,objectKey,employerCostCents:cents(amount)?amount:null,netBeforeTaxCents:null,reading,confirmed:false,createdAt:now()};
   await bucket(env).put(objectKey,file.bytes,{httpMetadata:{contentType:'application/pdf'}});
   try{return reply(201,await mutate(db,row,session.email,[db.prepare('INSERT INTO rh_payroll_files VALUES(?,?,?,?,?,?,?)').bind(id,row.client_id,row.id,file.sha256,objectKey,JSON.stringify(source),source.createdAt),audit(db,row.client_id,row.id,'PAYROLL_ADDED',{id,sha256:file.sha256},session.email)]));}catch(e){await bucket(env).delete(objectKey);throw e;}
  }
  if(sub==='payroll'&&match[3]&&method==='PATCH'){
   const file=await db.prepare('SELECT data_json FROM rh_payroll_files WHERE id=? AND document_id=?').bind(match[3],row.id).first<{data_json:string}>();if(!file)rhFail('Bulletin introuvable.',404);const original=JSON.parse(file!.data_json) as RhPayrollSource,input=await json(request),space=await employees(db,row.client_id),person=space.agents.find(a=>a.id===input.agentId);
   if(!person||!rhMonth(input.month||''))rhFail('Choisissez l’agent et le mois du bulletin.');if(input.netBeforeTaxCents!==undefined&&!cents(input.netBeforeTaxCents,true))rhFail('Net avant impôt invalide.');
   if(input.confirmed===true){if(original.employerCostCents===null||original.reading?.fields?.document_type!=='PAYSLIP')rhFail('Coût employeur non identifié. Importez un bulletin de salaire lisible.');if(original.reading.fields.period&&original.reading.fields.period!==input.month)rhFail('Le mois choisi ne correspond pas au bulletin.');if(original.reading.fields.employee_name&&!matchName(person!.name,original.reading.fields.employee_name)&&String(input.identityReason||'').trim().length<5)rhFail('Le nom lu diffère. Précisez le motif du rapprochement après lecture du PDF.');const all=await payroll(db,row.id);if(all.some(p=>p.id!==original.id&&p.confirmed&&p.agentId===input.agentId&&p.month===input.month))rhFail('Un bulletin est déjà confirmé pour cet agent et ce mois.');}
   const next={...original,agentId:input.agentId,month:input.month,netBeforeTaxCents:input.netBeforeTaxCents===undefined?original.netBeforeTaxCents:input.netBeforeTaxCents,confirmed:input.confirmed===true,reviewedBy:session.email,reviewedAt:now(),identityReason:String(input.identityReason||'').slice(0,1000)};
   return reply(200,await mutate(db,row,session.email,[db.prepare('UPDATE rh_payroll_files SET data_json=? WHERE id=? AND document_id=?').bind(JSON.stringify(next),original.id,row.id),audit(db,row.client_id,row.id,'PAYROLL_REVIEWED',{id:original.id,confirmed:next.confirmed},session.email)]));
  }
  if(sub==='reuse-payroll'&&method==='POST'){
   const input=await json(request);if(!Array.isArray(input.payrollIds)||input.payrollIds.length<1||input.payrollIds.length>100||input.payrollIds.some((id:unknown)=>!rhId(id)))rhFail('Sélection de bulletins invalide.');
   const existing=await payroll(db,row.id),expected=rhExpected(draft),statements:Statement[]=[];
   for(const sourceId of [...new Set<string>(input.payrollIds)]){const found=await db.prepare('SELECT data_json FROM rh_payroll_files WHERE id=? AND client_id=?').bind(sourceId,row.client_id).first<{data_json:string}>();if(!found)rhFail('Un bulletin ne dépend pas de ce client.');const p=JSON.parse(found!.data_json) as RhPayrollSource;if(!p.confirmed||!expected.some(x=>x.agentId===p.agentId&&x.month===p.month))rhFail('Le bulletin ne correspond pas aux agents et mois du document.');if(existing.some(x=>x.sha256===p.sha256))continue;if(existing.some(x=>x.confirmed&&x.agentId===p.agentId&&x.month===p.month))rhFail('Un bulletin est déjà confirmé pour cet agent et ce mois.');const copy={...p,id:crypto.randomUUID(),createdAt:now()};existing.push(copy);statements.push(db.prepare('INSERT INTO rh_payroll_files VALUES(?,?,?,?,?,?,?)').bind(copy.id,row.client_id,row.id,copy.sha256,copy.objectKey,JSON.stringify(copy),copy.createdAt));}
   return reply(200,await mutate(db,row,session.email,[...statements,audit(db,row.client_id,row.id,'PAYROLL_REUSED',{sourceIds:input.payrollIds},session.email)]));
  }
  if(sub==='freeze'&&method==='POST'){
   const [refs,space,files,allVersions]=await Promise.all([context(db),employees(db,row.client_id),payroll(db,row.id),db.prepare('SELECT document_id,revision,data_json FROM rh_versions WHERE client_id=?').bind(row.client_id).all<{document_id:string;revision:number;data_json:string}>()]);rhValidateReferences(draft,refs.projects,space.agents);
   const previous=allVersions.results.filter(v=>v.document_id===row.id).reduce((max,v)=>Math.max(max,v.revision),0),latest=new Map<string,RhSnapshot>();for(const v of allVersions.results)if(v.document_id!==row.id&&(!latest.has(v.document_id)||latest.get(v.document_id)!.revision<v.revision))latest.set(v.document_id,JSON.parse(v.data_json));
   const checkedAgents=structuredClone(space.agents);for(const version of latest.values())for(const line of version.lines){const agent=checkedAgents.find(a=>a.id===line.agentId);if(agent)agent.allocations.push({id:line.id,projectId:line.projectId,project:'Document RH',projectCode:'',programme:'',percent:String(line.rateBasisPoints/100),startDate:line.month+'-01',endDate:new Date(Date.UTC(Number(line.month.slice(0,4)),Number(line.month.slice(5,7)),0)).toISOString().slice(0,10),tasks:''});}
   const issues=rhIssues(draft,files,checkedAgents);for(const p of refs.projects.filter(p=>draft.periods.some(x=>x.projectId===p.id)))if(!p.code||!p.programme)issues.push(`Complétez l’ID et le programme du projet ${p.name} dans sa fiche.`);if(issues.length)return reply(422,{error:issues[0],issues});
   const used=rhExpected(draft),selected=files.filter(p=>p.confirmed&&used.some(x=>x.agentId===p.agentId&&x.month===p.month));for(const f of selected){const object=await bucket(env).get(f.objectKey);if(!object||sha(new Uint8Array(await object.arrayBuffer()))!==f.sha256)rhFail('Un bulletin source est absent ou a changé.',409);}
   const id=crypto.randomUUID(),snapshot:RhSnapshot={id,documentId:row.id,revision:previous+1,name:draft.name,client:refs.clients.find(c=>c.id===row.client_id)!,projects:refs.projects.filter(p=>draft.periods.some(x=>x.projectId===p.id)),periods:draft.periods,agents:space.agents.filter(a=>used.some(x=>x.agentId===a.id)),payroll:selected,lines:rhLines(draft,files),createdAt:now(),createdBy:session.email};
   for(const prior of latest.values())if(prior.lines.some(a=>snapshot.lines.some(b=>a.agentId===b.agentId&&a.projectId===b.projectId&&a.month===b.month)))rhFail('Ces dépenses figurent déjà dans un autre document RH. Corrigez le document existant.');
   const frozenGuard=referencesGuard(draft,space.version,refs.projects);frozenGuard.condition+=' AND (SELECT count(*) FROM rh_versions WHERE client_id=?)=?';frozenGuard.params.push(row.client_id,allVersions.results.length);
   const document=await mutate(db,row,session.email,[db.prepare('INSERT INTO rh_versions VALUES(?,?,?,?,?,?,?)').bind(id,row.id,row.client_id,snapshot.revision,JSON.stringify(snapshot),snapshot.createdAt,session.email),audit(db,row.client_id,row.id,'VERSION_FROZEN',{versionId:id,revision:snapshot.revision},session.email)],undefined,frozenGuard);return reply(201,{version:snapshot,document});
  }
  return reply(405,{error:'Méthode non autorisée.'});
 }
 match=path.match(/^\/versions\/([^/]+)(?:\/(export|returns|stamping)(?:\/([^/]+)(?:\/(validate|files)(?:\/(\d+))?)?)?)?$/);
 if(match){const saved=await db.prepare('SELECT data_json,client_id FROM rh_versions WHERE id=?').bind(match[1]).first<{data_json:string;client_id:string}>();if(!saved)rhFail('Version introuvable.',404);await activeClient(db,saved!.client_id);const snapshot=JSON.parse(saved!.data_json) as RhSnapshot,sub=match[2];
  if(!sub&&method==='GET'){const records=(await db.prepare('SELECT * FROM rh_returns WHERE version_id=? ORDER BY revision DESC').bind(snapshot.id).all<any>()).results.map(r=>({id:r.id,revision:r.revision,status:r.status,createdAt:r.created_at,...JSON.parse(r.data_json)}));return reply(200,{snapshot,returns:records});}
  if(sub==='stamping'&&method==='POST'){if(!hasAccess(session,'tamponnage'))return reply(403,{error:'Accès au tamponnage requis.'});return reply(201,await createRhStampingBatch(env,session,snapshot,await json(request)));}
  if(sub==='export'&&method==='GET'){const data=await exportRhWorkbook(snapshot),headers=new Headers(reply(200,{}).headers);headers.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');headers.set('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(`RH_${snapshot.client.name}_v${snapshot.revision}.xlsx`));return new Response(new Uint8Array(data),{headers});}
  if(sub==='returns'&&!match[3]&&method==='POST'){
   const form=await multipart(request),signed=await uploaded(form.get('signedPdf'),'pdf'),excel=form.get('excel')?await uploaded(form.get('excel'),'xlsx'):null;
   let inspection:RhReturnInspection;try{inspection=excel?await inspectRhReturnWorkbook(excel.bytes,snapshot):{payments:[],complete:false,issues:['PDF archivé. Un fichier Excel complété est nécessaire pour vérifier automatiquement les paiements.']};}catch(error){inspection={payments:[],complete:false,issues:[String((error as Error).message||'Le classeur reçu est illisible.').slice(0,500)]};}
   const existing=await db.prepare('SELECT max(revision) AS revision FROM rh_returns WHERE version_id=?').bind(snapshot.id).first<{revision:number|null}>(),revision=(existing?.revision||0)+1,id=crypto.randomUUID(),files:Array<{objectKey:string;name:string;mime:string;sha256:string}>=[];
   const data={inspection,files,signatureReviewed:false,concordanceReviewed:false},status='received';try{for(const file of [signed,...(excel?[excel]:[])]){const objectKey=`rh/${snapshot.client.id}/returns/${id}/${files.length}`;await bucket(env).put(objectKey,file.bytes,{httpMetadata:{contentType:file.mime}});files.push({objectKey,name:file.name,mime:file.mime,sha256:file.sha256});}await db.batch([db.prepare('INSERT INTO rh_returns VALUES(?,?,?,?,?,?,?)').bind(id,snapshot.id,revision,status,JSON.stringify(data),now(),session.email),audit(db,snapshot.client.id,snapshot.documentId,'RETURN_RECEIVED',{returnId:id,versionId:snapshot.id},session.email)]);}catch(e){if(files.length)await bucket(env).delete(files.map(f=>f.objectKey));throw e;}
   return reply(201,{id,revision,status,...data});
  }
  if(sub==='returns'&&match[3]){const record=await db.prepare('SELECT * FROM rh_returns WHERE id=? AND version_id=?').bind(match[3],snapshot.id).first<any>();if(!record)rhFail('Retour introuvable.',404);const data=JSON.parse(record.data_json);
   if(match[4]==='files'&&method==='GET'){const f=data.files[Number(match[5])];if(!f)rhFail('Fichier introuvable.',404);return binary(env,f.objectKey,f.name,f.mime,reply);}
   if(match[4]==='validate'&&method==='POST'){const input=await json(request);if(input.signatureReviewed!==true||input.concordanceReviewed!==true)rhFail('Vérifiez la signature et la concordance du PDF avec l’Excel.');if(!data.inspection.complete||data.inspection.issues.length||data.files.length<2)rhFail('Le retour doit contenir un Excel complet conforme et son PDF signé.');if(record.status==='validated')return reply(200,{id:record.id,status:record.status,...data});
    for(const file of data.files){const original=await bucket(env).get(file.objectKey);if(!original||sha(new Uint8Array(await original.arrayBuffer()))!==file.sha256)rhFail('Une pièce du retour est absente ou a changé. Réimportez les originaux.',409);}
    const checked={...data,signatureReviewed:true,concordanceReviewed:true,reviewedBy:session.email,reviewedAt:now()},[before,after]=guard(db,"EXISTS(SELECT 1 FROM rh_returns WHERE id=? AND status='received')",[record.id]);await db.batch([before,db.prepare("UPDATE rh_returns SET status='validated',data_json=? WHERE id=? AND status='received'").bind(JSON.stringify(checked),record.id),audit(db,snapshot.client.id,snapshot.documentId,'RETURN_VALIDATED',{returnId:record.id},session.email),after]);return reply(200,{id:record.id,status:'validated',...checked});
   }
  }return reply(405,{error:'Méthode non autorisée.'});
 }
 return reply(404,{error:'Écran RH introuvable.'});
}
