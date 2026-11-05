import {createHash} from 'node:crypto';
import type {Environment,Database} from './contracts';
import type {SessionIdentity} from './identity';
import {hasAccess} from './identity';
import type {RhSnapshot,RhPayrollSource} from './rh-domain';

function fail(status:number,message:string):never{throw Object.assign(new Error(message),{status});}
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const number=(n:number)=>Number.isSafeInteger(n)&&n>=0;
type Group={id:string;document_type:'PAYSLIP';employee_ref:string;document_ref:string;invoice_number:string;invoice_date:string;supplier_ref:string;period:string;currency:'EUR';base_type:'EMPLOYER_COST';base_amount_cents:number;allocations:any[];errors:string[];total_cents:number;remainder_cents:number;rounding_cents:number};
type Planned={source:RhPayrollSource;group:Group};

/** Pure conversion of frozen, server-created RH lines; no browser amounts enter this path. */
export function buildRhStampImport(snapshot:RhSnapshot){
 const sourceHash=hash(JSON.stringify(snapshot)),plans=new Map<string,Planned>(),lineIds=new Set(),pairSources=new Map<string,string>();
 for(const line of snapshot.lines){
  if(!number(line.allocatedCents)||!number(line.employerCostCents)||!number(line.rateBasisPoints)||line.rateBasisPoints>10000)fail(422,'Imputation RH invalide.');
  if(line.allocatedCents!==Math.round(line.employerCostCents*line.rateBasisPoints/10000))fail(422,'Une imputation diffère du calcul RH figé.');
  if(lineIds.has(line.id))fail(422,'Une ligne RH est présente plusieurs fois.');lineIds.add(line.id);
  if(line.allocatedCents===0)continue;
  const agent=snapshot.agents.find(a=>a.id===line.agentId),project=snapshot.projects.find(p=>p.id===line.projectId),source=snapshot.payroll.find(p=>p.id===line.payrollId);
  if(!agent||!project||!source||!source.confirmed||source.agentId!==agent.id||source.month!==line.month||source.employerCostCents!==line.employerCostCents||!/^\d{4}-(0[1-9]|1[0-2])$/.test(line.month)||!source.objectKey||!/^[a-f\d]{64}$/i.test(source.sha256))fail(422,'Le bulletin confirmé ou son rattachement est incohérent.');
  const pair=agent.id+'|'+line.month,prior=pairSources.get(pair);if(prior&&prior!==source.id)fail(422,'Plusieurs bulletins représentent le même agent et le même mois.');pairSources.set(pair,source.id);
  let plan=plans.get(source.id);
  if(!plan){
   const group:Group={id:hash(snapshot.id+'|'+source.id).slice(0,24),document_type:'PAYSLIP',employee_ref:agent.name,document_ref:'',invoice_number:'',invoice_date:'',supplier_ref:'',period:line.month,currency:'EUR',base_type:'EMPLOYER_COST',base_amount_cents:line.employerCostCents,allocations:[],errors:[],total_cents:0,remainder_cents:0,rounding_cents:0};
   plan={source,group};plans.set(source.id,plan);
  }
  if(plan.group.allocations.some(a=>a.projectId===project.id))fail(422,'Un projet apparaît deux fois pour le même bulletin.');
  plan.group.allocations.push({id:line.id,projectId:project.id,project:project.name,code:project.code,programme:project.programme,amount_cents:line.allocatedCents,base_cents:line.employerCostCents,percent:String(line.rateBasisPoints/100),calculated:true,source:{file:snapshot.name,sha256:sourceHash,sheet:line.periodId,cell:'',row:null,rule:'RH_FROZEN_ROUND_HALF_UP',versionId:snapshot.id,payrollId:source.id,lineId:line.id}});
 }
 const prepared=[...plans.values()];if(!prepared.length)fail(422,'Cette version RH ne contient aucune imputation positive.');if(prepared.length>300)fail(413,'Un document RH est limité à 300 bulletins.');
 const hashes=new Set<string>();for(const p of prepared){
  if(hashes.has(p.source.sha256))fail(422,'Un même PDF correspond à plusieurs bulletins. Importez les bulletins séparément avant de figer le document.');hashes.add(p.source.sha256);
  const g=p.group,rate=g.allocations.reduce((n,a)=>n+Math.round(Number(a.percent)*100),0);g.total_cents=g.allocations.reduce((n,a)=>n+a.amount_cents,0);g.remainder_cents=g.base_amount_cents-g.total_cents;g.rounding_cents=g.total_cents-Math.round(g.base_amount_cents*rate/10000);
  if(rate>10000||g.remainder_cents<0)fail(422,'Les imputations du bulletin dépassent 100 %.');
 }
 return {plans:prepared,import:{groups:prepared.map(p=>p.group),errors:[],warnings:[],source_sha256:sourceHash,mapping:{frozenRh:true,versionId:snapshot.id}},sourceHash};
}

async function linked(db:Database,versionId:string,owner:string){
 return db.prepare('SELECT b.id,b.expires_at,b.data FROM rh_stamp_links l JOIN stamp_batches b ON b.id=l.batch_id WHERE l.version_id=? AND l.owner=? AND b.expires_at>?').bind(versionId,owner,Date.now()).first<{id:string;expires_at:number;data:string}>();
}
export async function createRhStampingBatch(env:Environment,session:SessionIdentity,snapshot:RhSnapshot,_options:Record<string,unknown>={}){
 if(!hasAccess(session,'facturier')||!hasAccess(session,'tamponnage'))fail(403,'Vos accès ne permettent pas de préparer ce tamponnage RH.');
 const db=env.BUDGETS_DB.withSession('first-primary'),storage=env.CET_FILES as any,queue=env.STAMPING_QUEUE as {sendBatch(messages:{body:unknown}[]):Promise<void>}|undefined;
 if(!storage||!queue||!env.BILLING_PDF_SERVICE_URL)fail(503,'Le service documentaire et la file de tamponnage doivent être activés.');
 const existing=await linked(db,snapshot.id,session.email);if(existing)return {batchId:existing.id,reused:true,needsPreviewApproval:true};
 const prepared=buildRhStampImport(snapshot),id=crypto.randomUUID(),now=Date.now(),prefix=`stamping/${hash(session.email).slice(0,24)}/${id}/`,written:string[]=[];
 const docs:{id:string;source:RhPayrollSource;group:Group;size:number;key:string}[]=[];let total=0;
 const batchData={category:'RH',useAI:true,importConfirmed:true,sealed:true,rhVersionId:snapshot.id,rhDocumentId:snapshot.documentId,rhRevision:snapshot.revision,rhClientId:snapshot.client.id,import:prepared.import,options:{header:'Dépense imputée aux projets suivants',compact:true,split:true,allowAppendix:false,pagePreference:'first',fontSize:5,allowOverlap:true,width:180}};
 if(new TextEncoder().encode(JSON.stringify(batchData)).length>1200000)fail(413,'Les imputations sont trop volumineuses pour un seul lot.');
 try{
  // Keep one PDF in memory. Copied objects are removed on failure before the atomic batch exists.
  for(const p of prepared.plans){
   const object=await storage.get(p.source.objectKey);if(!object)fail(404,'Un bulletin archivé est introuvable.');const raw=new Uint8Array(await object.arrayBuffer());
   if(hash(raw)!==p.source.sha256)fail(409,'L’empreinte d’un bulletin archivé a changé.');
   if(!raw.length||raw.length>20*1024*1024||new TextDecoder().decode(raw.slice(0,5))!=='%PDF-')fail(422,'Un bulletin archivé n’est pas un PDF exploitable.');
   total+=raw.length;if(total>200*1024*1024)fail(413,'Le lot dépasse 200 Mo.');const documentId=crypto.randomUUID(),key=prefix+documentId+'/source.pdf';
   await storage.put(key,raw,{httpMetadata:{contentType:'application/pdf'}});written.push(key);docs.push({id:documentId,source:p.source,group:p.group,size:raw.length,key});
  }
  const guardId=crypto.randomUUID(),statements=[
   db.prepare('DELETE FROM rh_stamp_links WHERE version_id=? AND owner=? AND NOT EXISTS(SELECT 1 FROM stamp_batches b WHERE b.id=rh_stamp_links.batch_id AND b.expires_at>?)').bind(snapshot.id,session.email,now),
   db.prepare('INSERT OR IGNORE INTO rh_stamp_links(version_id,owner,batch_id,created_at) VALUES(?,?,?,?)').bind(snapshot.id,session.email,id,now),
   db.prepare('INSERT INTO stamp_batches(id,owner,name,version,data,created_at,expires_at) SELECT ?,?,?,1,?,?,? WHERE EXISTS(SELECT 1 FROM rh_stamp_links WHERE version_id=? AND owner=? AND batch_id=?) RETURNING id').bind(id,session.email,(snapshot.name+' · RH v'+snapshot.revision).slice(0,120),JSON.stringify(batchData),now,now+30*86400000,snapshot.id,session.email,id),
   ...docs.map(d=>db.prepare("INSERT INTO stamp_documents(id,batch_id,name,sha256,size,version,status,data) SELECT ?,?,?,?,?,1,'QUEUED',? WHERE EXISTS(SELECT 1 FROM stamp_batches WHERE id=?) RETURNING id").bind(d.id,id,d.source.filename,d.source.sha256,d.size,JSON.stringify({rhPayrollId:d.source.id,rhGroupId:d.group.id,sourceUpload:{name:d.source.filename,sha256:d.source.sha256},options:batchData.options,progress:{startedAt:now,stage:'queued'}}),id)),
   db.prepare("INSERT INTO stamp_audit(id,batch_id,document_id,actor,action,data,created_at) SELECT ?,?,NULL,?,'RH_VERSION_IMPORTED',?,? WHERE EXISTS(SELECT 1 FROM stamp_batches WHERE id=?)").bind(crypto.randomUUID(),id,session.email,JSON.stringify({versionId:snapshot.id,documentId:snapshot.documentId,source:prepared.sourceHash,files:docs.length,lines:snapshot.lines.length}),now,id),
   // The source may be trashed while PDFs are copied; roll back the entire lot.
   db.prepare("INSERT INTO rh_write_guards(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM rh_documents WHERE id=? AND json_extract(data_json,'$._deletedAt') IS NULL) THEN 1 ELSE 0 END").bind(guardId,snapshot.documentId),
   db.prepare('DELETE FROM rh_write_guards WHERE id=?').bind(guardId)
  ];
  const result=await db.batch(statements) as {results?:unknown[]}[];
  if(!result[2].results?.length){await storage.delete(written);const winner=await linked(db,snapshot.id,session.email);if(!winner)fail(409,'La préparation concurrente a changé. Relancez le tamponnage.');return {batchId:winner.id,reused:true,needsPreviewApproval:true};}
 }catch(error){if(written.length)await storage.delete(written);throw error;}
 let queued=0;
 for(let start=0;start<docs.length;start+=100){const part=docs.slice(start,start+100);try{await queue.sendBatch(part.map(d=>({body:{batchId:id,documentId:d.id,version:1,owner:session.email}})));queued+=part.length;}catch{
  await db.batch(part.map(d=>db.prepare("UPDATE stamp_documents SET status='REVIEW_REQUIRED',data=json_set(data,'$.error',json(?)) WHERE id=? AND status='QUEUED'").bind(JSON.stringify({code:'QUEUE_UNAVAILABLE',message:'La file est momentanément indisponible. Relancez l’analyse de cette pièce.'}),d.id)));
 }}
 return {batchId:id,reused:false,documents:docs.length,queued,needsPreviewApproval:true};
}
