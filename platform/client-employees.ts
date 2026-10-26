import {createHash} from 'node:crypto';
import type {Database,Environment,Reply} from './contracts';
import {boundedBody} from './portal';
import {normalizeClientEmployees,normalizeClientPayments} from './client-employees-domain';
export async function clientEmployeesRoute(request:Request,db:Database,env:Environment,user:string,reply:Reply){
 const url=new URL(request.url),match=url.pathname.match(/^\/api\/v1\/billing\/client-employees\/([^/]+)(?:\/documents(?:\/([^/]+))?)?$/);if(!match)return reply(404,{error:'Espace introuvable.'});
 let clientId;try{clientId=decodeURIComponent(match[1]);}catch{return reply(400,{error:'Client invalide.'});}
 if(clientId.length>200||!clientId.trim())return reply(400,{error:'Client invalide.'});
 const client=await db.prepare("SELECT id FROM billing_directory WHERE id=? AND kind='clients' AND json_extract(data_json,'$.archived')=0").bind(clientId).first();if(!client)return reply(409,{error:'Enregistrez la fiche client avant d’ouvrir son espace salariés.'});
 const row=await db.prepare('SELECT version,data_json FROM client_employee_spaces WHERE client_id=?').bind(clientId).first<{version:number;data_json:string}>(),version=row?.version||0,stored=JSON.parse(row?.data_json||'{}'),agents=stored.agents||[],payments=stored.payments||[];
 const docs=async()=>(await db.prepare('SELECT id,employee_id AS employeeId,filename,kind,snapshot_json,created_at AS createdAt FROM client_employee_documents WHERE client_id=? ORDER BY created_at DESC').bind(clientId).all<any>()).results.map(({snapshot_json,...d})=>({...d,snapshot:JSON.parse(snapshot_json)}));
 const inDocuments=url.pathname.includes('/documents'),bucket=env.CET_FILES as any;
 if(request.method==='GET'){
  if(match[2]){const d=await db.prepare('SELECT object_key,mime FROM client_employee_documents WHERE id=? AND client_id=?').bind(match[2],clientId).first<any>(),file=d&&await bucket.get(d.object_key);if(!file)return reply(404,{error:'Document introuvable.'});const headers=new Headers(reply(200,{}).headers);headers.set('Content-Type',d.mime);headers.set('Content-Disposition','attachment');headers.set('Content-Security-Policy',"sandbox; default-src 'none'");return new Response(file.body,{headers});}
  return reply(200,{version,agents,payments,documents:await docs()});
 }
 if(request.headers.get('if-match')!==String(version))return reply(409,{error:'Cet espace a changé. Actualisez-le avant de continuer.'});
 if(request.method==='PUT'&&!inDocuments){
  let data;try{data=JSON.parse(new TextDecoder().decode(await boundedBody(request,1500000)));}catch{return reply(400,{error:'Saisie invalide.'});}
  let normalized,normalizedPayments;try{normalized=normalizeClientEmployees(data.agents);normalizedPayments=normalizeClientPayments(data.payments||[],normalized);}catch(e){return reply(422,{error:(e as Error).message});}const stamp=new Date().toISOString(),serialized=JSON.stringify({agents:normalized,payments:normalizedPayments});
  const saved=version?await db.prepare('UPDATE client_employee_spaces SET version=version+1,data_json=?,updated_at=?,updated_by=? WHERE client_id=? AND version=? RETURNING version').bind(serialized,stamp,user,clientId,version).first<any>():await db.prepare('INSERT INTO client_employee_spaces VALUES(?,1,?,?,?) ON CONFLICT DO NOTHING RETURNING version').bind(clientId,serialized,stamp,user).first<any>();
  if(!saved)return reply(409,{error:'Cet espace a changé. Actualisez-le.'});return reply(200,{version:saved.version,agents:normalized,payments:normalizedPayments,documents:await docs()});
 }
 if(request.method==='POST'&&inDocuments&&!match[2]){
  const kind=url.searchParams.get('kind'),employeeId=url.searchParams.get('employeeId')||'',employee=agents.find((a:any)=>a.id===employeeId),filename=decodeURIComponent(request.headers.get('x-filename')||'');
  if(!['mission','payment'].includes(kind||'')||kind==='mission'&&!employee||!filename||filename.length>200||/[\x00-\x1f/\\]/.test(filename))return reply(422,{error:'Document ou salarié invalide.'});
  const data=await boundedBody(request,10*1024*1024),mime=/\.docx$/i.test(filename)?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':/\.xlsx$/i.test(filename)?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':/\.pdf$/i.test(filename)?'application/pdf':'';
  if(!mime||mime==='application/pdf'&&new TextDecoder().decode(data.slice(0,5))!=='%PDF-'||mime!=='application/pdf'&&(data[0]!==80||data[1]!==75))return reply(422,{error:'Fichier Word, Excel ou PDF valide requis.'});
  const sha=createHash('sha256').update(data).digest('hex'),id=crypto.randomUUID(),key='client-employees/'+encodeURIComponent(clientId)+'/'+id+'/'+filename;
  await bucket.put(key,data,{httpMetadata:{contentType:mime}});
  const saved=await db.prepare(`INSERT INTO client_employee_documents SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM client_employee_spaces WHERE client_id=? AND version=?) RETURNING id`).bind(id,clientId,employeeId,kind,filename,mime,key,sha,JSON.stringify({version,agents:employee?[employee]:agents,...(kind==='payment'?{payments}:{})}),new Date().toISOString(),user,clientId,version).first();
  if(!saved){await bucket.delete(key);return reply(409,{error:'Les affectations ont changé. Régénérez le document.'});}return reply(201,{version,agents,payments,documents:await docs()});
 }
 return reply(405,{error:'Méthode non autorisée.'});
}
