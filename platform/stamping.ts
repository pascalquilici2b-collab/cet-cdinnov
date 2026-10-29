import {normalizeDirectInvoice} from './stamping-direct';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {zipSync} from 'fflate';
import {stampedLotFilename,stampedDocumentNames} from './stamping-filenames';
import {hasAccess,sessionIdentity} from './identity';
import {boundedBody} from './portal';
import {stampingSuggestions} from './stamping-ai';
import {paymentLayoutSuggestions} from './stamping-layout-ai';
import type {Environment,Database,Reply} from './contracts';

type Batch={id:string;owner:string;name:string;version:number;data:string;created_at:number;expires_at:number};
type Doc={id:string;batch_id:string;name:string;sha256:string;size:number;version:number;status:string;data:string;match_group:string|null;lease_until:number};
type Job={batchId:string;documentId:string;version:number;owner:string};
const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const uuid=(v:string)=>/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(v);
const bucket=(env:Environment)=>env.CET_FILES as any;
const prefix=(b:Batch)=>`stamping/${hash(b.owner).slice(0,24)}/${b.id}/`;
const sourceKey=(b:Batch,d:Doc)=>prefix(b)+d.id+'/source.pdf';
const candidateKey=(b:Batch,d:Doc)=>prefix(b)+d.id+`/candidate-${d.version}.pdf`;
const dbOf=(env:Environment)=>env.BUDGETS_DB.withSession('first-primary');
const expose=(d:Doc)=>({...d,data:JSON.parse(d.data),lease_until:undefined});
const audit=(db:Database,b:Batch,action:string,data:unknown={},documentId:string|null=null)=>db.prepare('INSERT INTO stamp_audit VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),b.id,documentId,b.owner,action,JSON.stringify(data),Date.now()).run();
async function json(request:Request,limit=1500000){try{return JSON.parse(new TextDecoder().decode(await boundedBody(request,limit)));}catch{return fail(400,'Requête JSON invalide.');}}
async function service(env:Environment,raw:Uint8Array,payload:unknown){
 const base=env.BILLING_PDF_SERVICE_URL,key=env.BILLING_PDF_SERVICE_KEY;
 if(typeof base!=='string'||typeof key!=='string'||key.length<32)return fail(503,'Le service documentaire doit être activé.');
 let url:URL;try{url=new URL(base);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw 0;}catch{return fail(503,'Adresse du service documentaire invalide.');}
 url.pathname='/api/stamping/process';const form=new FormData();form.append('file',new Blob([new Uint8Array(raw)]),'source');form.append('payload',JSON.stringify(payload));
 let response:Response;try{response=await fetch(url,{method:'POST',headers:{'X-API-Key':key},body:form,redirect:'manual',signal:AbortSignal.timeout(105000)});}catch{return fail(503,'Le moteur documentaire ne répond pas. Relancez cette pièce.');}
 if(!response.ok)return fail(response.status===503?503:422,'Le moteur documentaire a refusé le traitement.');
 const result=JSON.parse(new TextDecoder().decode(await boundedBody(response,40*1024*1024)));
 if(!result.ok)throw Object.assign(new Error(result.message||'Document non exploitable.'),{status:422,code:result.code});
 return result.result;
}
async function object(env:Environment,key:string){const stored=await bucket(env).get(key);if(!stored)return fail(404,'Fichier introuvable.');return new Uint8Array(await stored.arrayBuffer());}
async function inspectPaymentTable(db:Database,env:Environment,file:{name:string;bytes:Uint8Array},category:string){
 const inspect=async(options:Record<string,unknown>)=>{
  let result=await service(env,file.bytes,{action:'inspect',name:file.name,options});
  const candidates=result.layoutCandidates||[];delete result.layoutCandidates;
  if(candidates.length){
   const ai=await paymentLayoutSuggestions(db,env,candidates,category);
   if(ai.plans.length){
    try{result=await service(env,file.bytes,{action:'resolve-layout',name:file.name,options,plans:ai.plans});}
    catch{ai.status='failed';}
   }
   result.layoutAI={status:ai.status,model:ai.model,prompt:ai.prompt};
   // A partially read workbook must never be silently treated as complete.
   if(!ai.plans.length||ai.status==='failed'){
    const issues=candidates.map((c:any)=>({sheet:c.sheet,row:0,message:'Organisation du tableau à préciser.'}));
    result.layoutIssues=issues;if(result.suggestedImport)result.suggestedImport.errors.push(...issues);
   }
  }
  return result;
 };
 if(!/\.pdf$/i.test(file.name))return inspect({category});
 const info=await service(env,file.bytes,{action:'table-info'}),parts=[];let mappingHint={};
 for(let page=0;page<info.pages;page++){
  const part=await inspect({page,mappingHint,category});parts.push(part);
  const mapped=part.sheets?.find((s:any)=>s.mapping?.allocation_amount!==undefined&&(s.mapping?.employee_ref!==undefined||s.mapping?.supplier_ref!==undefined));if(mapped)mappingHint=mapped.mapping;
 }
 return service(env,new Uint8Array(),{action:'combine',parts});
}
async function removeDocumentFiles(env:Environment,b:Batch,id:string,beforeVersion?:number){
 let cursor:string|undefined;const start=prefix(b)+id+'/';
 do{const listing=await bucket(env).list({prefix:start,cursor});const keys=listing.objects.map((o:any)=>o.key).filter((key:string)=>beforeVersion===undefined||Number(key.slice(start.length).match(/^candidate-(\d+)\.pdf$/)?.[1]??Infinity)<beforeVersion);if(keys.length)await bucket(env).delete(keys);cursor=listing.truncated?listing.cursor:undefined;}while(cursor);
}
async function upload(request:Request,limit:number){
 const bytes=await boundedBody(request,limit+65536);const form=await new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')||''},body:new Uint8Array(bytes)}).formData();
 const file=form.get('file');if(!file||typeof file==='string'||file.size>limit||!file.size)return fail(400,'Fichier absent ou trop volumineux.');
 const name=file.name.replace(/[\x00-\x1f/\\]/g,'_').slice(0,180);return {name,bytes:new Uint8Array(await file.arrayBuffer())};
}
const documents=async(db:Database,id:string)=>(await db.prepare('SELECT * FROM stamp_documents WHERE batch_id=? ORDER BY rowid').bind(id).all<Doc>()).results;
async function unlocked(db:Database,b:Batch,request:Request){
 if(JSON.parse(b.data).sealed)return fail(409,'Le document de paiement est verrouillé après analyse. Supprimez-le pour réinitialiser les répartitions et le remplacer.');
 if(request.headers.get('if-match')!==String(b.version))return fail(409,'Le lot a changé. Actualisez avant de continuer.');
 const row=await db.prepare("SELECT id FROM stamp_documents WHERE batch_id=? AND status IN ('QUEUED','PROCESSING','APPROVED','VERIFIED') LIMIT 1").bind(b.id).first();
 if(row)return fail(409,'Le document de paiement est verrouillé pendant le traitement ou après validation.');
}
async function purge(db:Database,env:Environment,b:Batch){
 // Fence new uploads/jobs atomically before deleting private objects.
 const fenced=await db.prepare("UPDATE stamp_batches SET expires_at=0,version=version+1 WHERE id=? AND NOT EXISTS (SELECT 1 FROM stamp_documents WHERE batch_id=? AND status='PROCESSING' AND lease_until>?) RETURNING id").bind(b.id,b.id,Date.now()).first();if(!fenced)return false;
 let cursor:string|undefined;do{const listing=await bucket(env).list({prefix:prefix(b),cursor});if(listing.objects.length)await bucket(env).delete(listing.objects.map((o:any)=>o.key));cursor=listing.truncated?listing.cursor:undefined;}while(cursor);
 await db.batch([db.prepare('DELETE FROM stamp_audit WHERE batch_id=?').bind(b.id),db.prepare('DELETE FROM stamp_documents WHERE batch_id=?').bind(b.id),db.prepare('DELETE FROM stamp_batches WHERE id=?').bind(b.id)]);
 return true;
}
export async function purgeStamping(env:Environment){const db=dbOf(env);const rows=(await db.prepare('SELECT * FROM stamp_batches WHERE expires_at<? LIMIT 20').bind(Date.now()-10*60*1000).all<Batch>()).results;for(const b of rows)await purge(db,env,b);}

export async function processStampJob(job:Job,env:Environment){
 const db=dbOf(env);const b=await db.prepare('SELECT * FROM stamp_batches WHERE id=? AND owner=? AND expires_at>?').bind(job.batchId,job.owner,Date.now()).first<Batch>();if(!b)return;
 const d=await db.prepare("UPDATE stamp_documents SET status='PROCESSING',lease_until=? WHERE id=? AND batch_id=? AND version=? AND (status='QUEUED' OR (status='PROCESSING' AND lease_until<?)) AND EXISTS (SELECT 1 FROM stamp_batches WHERE id=? AND expires_at>?) RETURNING *").bind(Date.now()+5*60*1000,job.documentId,b.id,job.version,Date.now(),b.id,Date.now()).first<Doc>();
 if(!d){const pending=await db.prepare("SELECT lease_until FROM stamp_documents WHERE id=? AND version=? AND status='PROCESSING'").bind(job.documentId,job.version).first<{lease_until:number}>();if(pending)throw {retryAfter:Math.max(1,Math.ceil((pending.lease_until-Date.now())/1000)+1)};return;}
 let ai:any=null;
 try{
  const source=await object(env,sourceKey(b,d));if(hash(source)!==d.sha256)throw new Error('source hash');
  const batch=JSON.parse(b.data),data=JSON.parse(d.data);
  // A transient failure belongs to the previous attempt, not its retry.
  delete data.error;
  const startedAt=data.progress?.startedAt||Date.now(),payload={action:'analyze',groups:batch.import?.groups||[],directInvoice:data.directInvoice||null,options:data.options||batch.options||{},choice:data.choice,overrides:data.overrides||[],cachedReading:data.cachedReading||null};
  const progress=async(stage:string,extra:Record<string,unknown>={})=>db.prepare("UPDATE stamp_documents SET data=? WHERE id=? AND version=? AND status='PROCESSING'").bind(JSON.stringify({...data,...extra,progress:{startedAt,stage}}),d.id,d.version).run();
  await progress('reading');
  let result=await service(env,source,payload);ai={status:'not_needed',suggestions:[]};
  if(result.needsAI){
   await progress('ai',{reading:result.reading,cachedReading:result.cachedReading});
   ai=await stampingSuggestions(db,env,result.reading.evidence);
   if(ai.suggestions.length){await progress('reading',{reading:result.reading,ai,cachedReading:result.cachedReading});result=await service(env,source,{...payload,cachedReading:result.cachedReading,suggestions:ai.suggestions});}
  }
  await progress('saving',{...result,ai,pdf:undefined});
  if(result.error)throw Object.assign(new Error(result.error.message),{code:result.error.code});
  result.progress={startedAt,stage:'complete',elapsedMs:Date.now()-startedAt};
  const raw=Buffer.from(result.pdf,'base64');delete result.pdf;
  if(hash(raw)!==result.output_sha256||result.source_sha256!==d.sha256||Object.values(result.checks).some(v=>v!==true))throw new Error('verification');
  const key=candidateKey(b,d);await bucket(env).put(key,raw,{httpMetadata:{contentType:'application/pdf'}});
  try{
   const updated=await db.prepare("UPDATE stamp_documents SET status='NEEDS_APPROVAL',match_group=?,data=?,lease_until=0 WHERE id=? AND version=? AND status='PROCESSING' RETURNING id").bind(result.groupId,JSON.stringify({...data,...result,ai,candidateKey:key}),d.id,d.version).first();if(!updated){await bucket(env).delete(key);return;}
  }catch{await bucket(env).delete(key);throw Object.assign(new Error('Ces imputations sont déjà rattachées à une autre pièce du lot.'),{code:'DUPLICATE_MATCH'});}
  await audit(db,b,'ANALYZED',{version:d.version,algorithm:result.algorithm,model:ai.model,prompt:ai.prompt,source:d.sha256,output:result.output_sha256,overrides:result.allocations.filter((a:any)=>a.override).map((a:any)=>({allocationId:a.id,...a.override}))},d.id);
 }catch(error){
  const e=error as {status?:number;code?:string;message?:string};const transient=e.status===503;
  const current=await db.prepare('SELECT data FROM stamp_documents WHERE id=?').bind(d.id).first<{data:string}>();
  await db.prepare("UPDATE stamp_documents SET status=?,lease_until=0,data=? WHERE id=? AND version=?").bind(transient?'QUEUED':'REVIEW_REQUIRED',JSON.stringify({...JSON.parse(current?.data||d.data),ai,error:{code:e.code||'PROCESSING_FAILED',message:e.code||e.status?e.message:'Le traitement a échoué. Relancez cette pièce.'}}),d.id,d.version).run();
  if(transient)throw error;
 }
}

export async function stampingQueue(batch:{messages:{body:Job;ack():void;retry(options?:unknown):void;attempts?:number}[]},env:Environment){
 for(const message of batch.messages){try{await processStampJob(message.body,env);message.ack();}catch(error){
  if(error&&typeof error==='object'&&'retryAfter' in error){message.retry({delaySeconds:error.retryAfter});continue;}
  if((message.attempts||0)>=3){const db=dbOf(env);await db.prepare("UPDATE stamp_documents SET status='REVIEW_REQUIRED',lease_until=0 WHERE id=? AND batch_id=? AND version=? AND status='QUEUED'").bind(message.body.documentId,message.body.batchId,message.body.version).run();message.ack();}
  else message.retry({delaySeconds:30});
 }}
}
function binary(reply:Reply,raw:Uint8Array,type:string,name:string){const headers=new Headers(reply(200,{}).headers);headers.set('Content-Type',type);const ascii=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]|["\\]/g,'_');const encoded=encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());headers.set('Content-Disposition',`attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`);headers.set('X-Content-Type-Options','nosniff');return new Response(new Uint8Array(raw),{headers});}

export async function stampingRoute(request:Request,env:Environment,reply:Reply):Promise<Response>{
 const session=await sessionIdentity(request,env);if(!session)return reply(401,{error:'Connexion requise.'});if(!hasAccess(session,'tamponnage'))return reply(403,{error:'Votre compte n’a pas accès au tamponnage.'});
 const db=dbOf(env),path=new URL(request.url).pathname.slice('/api/v1/stamping'.length),method=request.method;
 if(path==='/context')return reply(200,{configured:!!env.BILLING_PDF_SERVICE_URL&&!!env.STAMPING_QUEUE,ai:!!env.MARKETS_AI,retentionDays:30});
 if(path==='/profiles'){
  if(method==='GET')return reply(200,{profiles:(await db.prepare('SELECT id,name,data FROM stamp_profiles WHERE owner=? ORDER BY updated_at DESC LIMIT 30').bind(session.email).all<any>()).results.map(r=>({...r,data:JSON.parse(r.data)}))});
  if(method==='POST'){const p=await json(request,20000);if(typeof p.name!=='string'||!p.name.trim()||p.name.length>120)return fail(400,'Nom de profil requis.');const id=crypto.randomUUID();await db.prepare('INSERT INTO stamp_profiles VALUES(?,?,?,?,?)').bind(id,session.email,p.name,JSON.stringify(p.mapping),Date.now()).run();return reply(201,{id});}
 }
 if(path==='/batches'){
  if(method==='GET')return reply(200,{batches:(await db.prepare(`SELECT id,owner,name,version,created_at,expires_at,CASE WHEN json_extract(data,'$.category') IN ('RH','SERVICES') THEN json_extract(data,'$.category') WHEN EXISTS(SELECT 1 FROM json_each(data,'$.import.groups') WHERE json_extract(value,'$.document_type')='INVOICE') THEN CASE WHEN EXISTS(SELECT 1 FROM json_each(data,'$.import.groups') WHERE json_extract(value,'$.document_type')='PAYSLIP') THEN 'MIXED' ELSE 'SERVICES' END ELSE 'RH' END AS category FROM stamp_batches WHERE expires_at>? ORDER BY created_at DESC`).bind(Date.now()).all<any>()).results.map(b=>({...b,canEdit:b.owner===session.email||session.admin}))});
  if(method==='POST'){
   const p=await json(request,10000);if(typeof p.name!=='string'||!p.name.trim()||p.name.length>120)return fail(400,'Nom de lot requis.');
   if(p.category!==undefined&&!['RH','SERVICES'].includes(p.category))return fail(400,'Choisissez un type de pièces valide.');
   const id=crypto.randomUUID(),now=Date.now();await db.prepare('INSERT INTO stamp_batches VALUES(?,?,?,1,?,?,?)').bind(id,session.email,p.name.trim(),JSON.stringify({...(p.category?{category:p.category}:{}),useAI:true,options:{header:'Dépense imputée aux projets suivants',compact:true,split:true,allowAppendix:p.allowAppendix===true,pagePreference:p.pagePreference==='last'?'last':'first'}}),now,now+30*86400000).run();
   return reply(201,{id});
  }
 }
 const route=path.match(/^\/batches\/([^/]+)(?:\/(.*))?$/);if(!route||!uuid(route[1]))return reply(404,{error:'Route introuvable.'});
 const b=await db.prepare('SELECT * FROM stamp_batches WHERE id=? AND expires_at>?').bind(route[1],Date.now()).first<Batch>();if(!b)return reply(404,{error:'Lot introuvable.'});
 const tail=route[2]||'',data=JSON.parse(b.data),canEdit=b.owner===session.email||session.admin;
 if(method!=='GET'&&!canEdit)return reply(403,{error:'Ce lot est consultable par l’équipe. Sa modification est réservée au créateur et aux administrateurs.'});
 if(!tail&&method==='GET'){
  await db.prepare("UPDATE stamp_documents SET status='REVIEW_REQUIRED',lease_until=0,data=json_set(data,'$.error',json(?)) WHERE batch_id=? AND status='PROCESSING' AND lease_until<?").bind(JSON.stringify({code:'INTERRUPTED',message:'Le traitement a été interrompu. Relancez cette pièce.'}),b.id,Date.now()).run();
  const docs=await documents(db,b.id),used=new Set(docs.map(d=>d.match_group));
  return reply(200,{...b,canEdit,data,documents:docs.map(expose),unmatchedGroups:(data.import?.groups||[]).filter((g:any)=>!used.has(g.id)).map((g:any)=>g.id)});
 }
 if(!tail&&method==='DELETE'){
  if((await documents(db,b.id)).some(d=>d.status==='PROCESSING'&&d.lease_until>Date.now()))return fail(409,'Attendez la fin de la pièce en cours avant suppression.');
  if(!await purge(db,env,b))return fail(409,'Une pièce vient de démarrer. Attendez sa fin avant suppression.');return reply(200,{ok:true});
 }
 if(tail==='direct'&&method==='POST'){
  await unlocked(db,b,request);if(data.category!=='SERVICES'||data.table)return fail(422,'Le mode sans référence est réservé aux prestations sans document de paiement.');
  const directInvoice=normalizeDirectInvoice(await json(request,5000));delete directInvoice.amount;delete directInvoice.manualTotal;delete directInvoice.manualConfirmed;
  const next={...data,directInvoice,importConfirmed:true,import:{groups:[],errors:[]}};
  const changed=await db.prepare('UPDATE stamp_batches SET data=?,version=version+1 WHERE id=? AND version=? RETURNING id').bind(JSON.stringify(next),b.id,b.version).first();if(!changed)return fail(409,'Le lot a changé.');
  await audit(db,{...b,owner:session.email},'DIRECT_INVOICE_CONFIGURED',directInvoice);return reply(200,{ok:true});
 }
 if(tail==='table/source'&&method==='GET'){
  if(!data.table?.key)return fail(404,'Document de paiement introuvable.');
  const raw=await object(env,data.table.key);if(hash(raw)!==data.table.sha256)return fail(503,'Empreinte du document invalide.');
  const type=/\.pdf$/i.test(data.table.name)?'application/pdf':/\.xlsx$/i.test(data.table.name)?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv; charset=utf-8';
  return binary(reply,raw,type,'document-paiement.'+(/\.pdf$/i.test(data.table.name)?'pdf':/\.xlsx$/i.test(data.table.name)?'xlsx':'csv'));
 }
 if(tail==='table'&&method==='DELETE'){
  if(request.headers.get('if-match')!==String(b.version))return fail(409,'Le lot a changé. Actualisez avant de continuer.');
  if(!data.table)return fail(404,'Document de paiement introuvable.');
  const removal=crypto.randomUUID(),next={...data,table:null,import:null,importConfirmed:false,sealed:false,lastTableRemoval:removal};
  // Both the reference and every dependent result change in one transaction.
  // Queued jobs retain their old document version and cannot claim the reset rows.
  const rows=await db.batch([
   db.prepare("UPDATE stamp_batches SET data=?,version=version+1 WHERE id=? AND version=? AND NOT EXISTS (SELECT 1 FROM stamp_documents WHERE batch_id=? AND status IN ('PROCESSING','DELETING')) RETURNING id").bind(JSON.stringify(next),b.id,b.version,b.id),
   db.prepare("UPDATE stamp_documents SET status='UPLOADED',version=version+1,data=json_object('sourceUpload',json_extract(data,'$.sourceUpload')),match_group=NULL,lease_until=0 WHERE batch_id=? AND EXISTS (SELECT 1 FROM stamp_batches WHERE id=? AND json_extract(data,'$.lastTableRemoval')=?) RETURNING id,version").bind(b.id,b.id,removal)
  ]) as {results:{id:string;version:number}[]}[];
  if(!rows[0].results?.length)return fail(409,'Attendez la fin de la pièce en cours, puis actualisez le lot.');
  await audit(db,{...b,owner:session.email},'PAYMENT_DOCUMENT_REMOVED',{source:data.table.sha256,resetDocuments:rows[1].results.length});
  await bucket(env).delete(data.table.key);
  for(const row of rows[1].results as {id:string;version:number}[])await removeDocumentFiles(env,b,row.id,row.version);
  return reply(200,{ok:true});
 }
 if(tail==='table/reinspect'&&method==='POST'){
  await unlocked(db,b,request);
  if(data.importConfirmed)return fail(409,'Les répartitions ont déjà été confirmées. Elles sont conservées.');
  if(!data.table?.key)return fail(404,'Document de paiement introuvable.');
  const raw=await object(env,data.table.key);if(hash(raw)!==data.table.sha256)return fail(503,'Empreinte du document invalide.');
  const inspected=await inspectPaymentTable(db,env,{name:data.table.name,bytes:raw},data.category||'RH');
  if(inspected.sha256!==data.table.sha256)return fail(503,'Empreinte de lecture invalide.');
  const {suggestedImport,...table}=inspected;
  const next={...data,table:{...data.table,...table},import:suggestedImport||null,importConfirmed:false};
  if(new TextEncoder().encode(JSON.stringify(next)).length>1200000)return fail(413,'Tableau trop volumineux : répartissez les pièces en plusieurs lots.');
  const updated=await db.prepare("UPDATE stamp_batches SET data=?,version=version+1 WHERE id=? AND version=? AND expires_at>? AND NOT EXISTS (SELECT 1 FROM stamp_documents WHERE batch_id=? AND status IN ('QUEUED','PROCESSING','APPROVED','VERIFIED','DELETING')) RETURNING id").bind(JSON.stringify(next),b.id,b.version,Date.now(),b.id).first();
  if(!updated)return fail(409,'Le lot a changé. Rechargez-le.');
  await audit(db,{...b,owner:session.email},'TABLE_REINSPECTED',{hash:table.sha256});return reply(200,{ok:true});
 }
 if(tail==='table'&&method==='POST'){
  if(data.directInvoice)return fail(409,'Ce lot utilise les montants des factures. Créez un autre lot pour utiliser un document de paiement.');
  await unlocked(db,b,request);const file=await upload(request,5*1024*1024),inspected=await inspectPaymentTable(db,env,file,data.category||'RH');
  const key=prefix(b)+'table-'+crypto.randomUUID()+'-'+inspected.sha256;await bucket(env).put(key,file.bytes);
  const suggested=inspected.suggestedImport;delete inspected.suggestedImport;
  const next={...data,useAI:true,table:{name:file.name,key,...inspected},import:suggested||null,importConfirmed:false};
  if(new TextEncoder().encode(JSON.stringify(next)).length>1200000){await bucket(env).delete(key);return fail(413,'Tableau trop volumineux : répartissez les pièces en plusieurs lots.');}
  const updated=await db.prepare('UPDATE stamp_batches SET data=?,version=version+1 WHERE id=? AND version=? RETURNING id').bind(JSON.stringify(next),b.id,b.version).first();if(!updated){await bucket(env).delete(key);return fail(409,'Le lot a changé. Rechargez-le.');}
  await audit(db,{...b,owner:session.email},'TABLE_IMPORTED',{hash:inspected.sha256});if(data.table?.key)await bucket(env).delete(data.table.key);return reply(200,{ok:true});
 }
 if(tail==='review'&&method==='POST'){
  await unlocked(db,b,request);if(!data.import)return fail(422,'Lisez le document de paiement avant de confirmer.');const p=await json(request);
  const imported=await service(env,new Uint8Array(),{action:'review',original:data.import,changes:p.changes||[]});
  const next={...data,import:imported,importConfirmed:p.confirmed===true&&imported.groups.length>0&&!imported.errors.length&&!imported.groups.some((g:any)=>g.errors.length)};
  if(new TextEncoder().encode(JSON.stringify(next)).length>1200000)return fail(413,'Tableau trop volumineux : répartissez les pièces en plusieurs lots.');
  const updated=await db.prepare('UPDATE stamp_batches SET data=?,version=version+1 WHERE id=? AND version=? RETURNING id').bind(JSON.stringify(next),b.id,b.version).first();if(!updated)return fail(409,'Le lot a changé.');
  await audit(db,{...b,owner:session.email},next.importConfirmed?'READING_CONFIRMED':'READING_CORRECTED',{source:imported.source_sha256,changes:p.changes||[]});return reply(200,{ok:true});
 }
 if(tail==='mapping'&&method==='POST'){
  await unlocked(db,b,request);if(!data.table)return fail(422,'Importez le document de paiement.');const p=await json(request,100000),raw=await object(env,data.table.key);
  const imported=await service(env,raw,{action:'import',name:data.table.name,options:p.mapping});
  const next={...data,import:imported,importConfirmed:p.confirmed===true&&imported.groups.length>0&&!imported.errors.length&&!imported.groups.some((g:any)=>g.errors.length)};
  if(new TextEncoder().encode(JSON.stringify(next)).length>1200000)return fail(413,'Le tableau et sa traçabilité sont trop volumineux pour un lot. Répartissez-les en plusieurs fichiers.');
  const updated=await db.prepare('UPDATE stamp_batches SET data=?,version=version+1 WHERE id=? AND version=? RETURNING id').bind(JSON.stringify(next),b.id,b.version).first();if(!updated)return fail(409,'Le lot a changé.');
  await audit(db,{...b,owner:session.email},next.importConfirmed?'MAPPING_CONFIRMED':'MAPPING_PREVIEW',{mapping:p.mapping,source:imported.source_sha256});return reply(200,{ok:true});
 }
 if(tail==='documents'&&method==='POST'){
  const docs=await documents(db,b.id);if(docs.length>=100)return fail(413,'Limite du lot : 100 PDF et 200 Mo.');
  const file=await upload(request,20*1024*1024);if(!/\.pdf$/i.test(file.name)||new TextDecoder().decode(file.bytes.slice(0,5))!=='%PDF-')return fail(415,'Un PDF valide est requis.');
  const sha=hash(file.bytes),duplicate=docs.find(d=>d.sha256===sha);if(duplicate)return reply(200,{id:duplicate.id,duplicate:true});
  const info=await service(env,file.bytes,{action:'document-info'});
  // At most three OCR pages (3 × 25 seconds) per isolated request, within its 95s limit.
  const scans=info.pages.length>1?info.pages.filter((p:any)=>p.needsOCR).map((p:any)=>p.page):[];
  for(let i=0;i<scans.length;i+=3){const part=await service(env,file.bytes,{action:'document-page',page:scans.slice(i,i+3)});for(const page of part.pages)info.pages[page.page]=page;}
  const split=await service(env,file.bytes,{action:'document-split',pages:info.pages});
  const seen=new Set(docs.map(d=>d.sha256)),prepared:{d:Doc;raw:Uint8Array;key:string;metadata:string}[]=[];let duplicates=0;
  const originalKey=prefix(b)+'imports/'+sha+'.pdf';
  for(const part of split.parts){
   const raw=part.original?file.bytes:new Uint8Array(Buffer.from(part.pdf,'base64')),partSha=hash(raw);
   if(seen.has(partSha)){duplicates++;continue;}seen.add(partSha);
   const name=split.parts.length===1?file.name:file.name.replace(/\.pdf$/i,'')+` · pages ${part.start+1}–${part.end+1}.pdf`;
   const d={id:crypto.randomUUID(),batch_id:b.id,name,sha256:partSha,size:raw.length} as Doc;
   prepared.push({d,raw,key:sourceKey(b,d),metadata:JSON.stringify({sourceUpload:{name:file.name,sha256:sha,pages:[part.start+1,part.end+1],...(split.parts.length>1?{key:originalKey}:{})}})});
  }
  if(docs.length+prepared.length>100||docs.reduce((n,d)=>n+d.size,0)+prepared.reduce((n,p)=>n+p.raw.length,0)>200*1024*1024)return fail(413,'Limite du lot : 100 pièces et 200 Mo après découpage.');
  if(!prepared.length)return reply(200,{duplicate:true,added:0,duplicates});
  const written:string[]=[];
  try{
   if(split.parts.length>1)await bucket(env).put(originalKey,file.bytes,{httpMetadata:{contentType:'application/pdf'}});
   for(const p of prepared){await bucket(env).put(p.key,p.raw,{httpMetadata:{contentType:'application/pdf'}});written.push(p.key);}
   const inserted=await db.batch(prepared.map(p=>db.prepare('INSERT INTO stamp_documents(id,batch_id,name,sha256,size,data) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM stamp_batches WHERE id=? AND expires_at>?) RETURNING id').bind(p.d.id,b.id,p.d.name,p.d.sha256,p.d.size,p.metadata,b.id,Date.now()))) as {results:{id:string}[]}[];
   if(inserted.some(r=>!r.results?.length))throw new Error('expired');
  }catch{if(written.length)await bucket(env).delete(written);return fail(409,'Import interrompu ou limite du lot atteinte. Actualisez le lot avant de réessayer.');}
  await audit(db,{...b,owner:session.email},'PDF_IMPORTED',{source:sha,documents:prepared.map(p=>p.d.id),split:split.parts.length>1});
  return reply(201,{id:prepared[0].d.id,added:prepared.length,duplicates});
 }
 if(tail==='export'&&method==='GET'){
  const docs=await documents(db,b.id),files:Record<string,Uint8Array>={};let totalBytes=0;
  const verified=docs.filter(d=>d.status==='VERIFIED'),names=stampedDocumentNames(verified,data.import?.groups||[]);
  for(const d of verified){const result=JSON.parse(d.data);const pdf=await object(env,result.candidateKey);if(hash(pdf)!==result.output_sha256)return fail(503,'Empreinte du PDF invalide.');totalBytes+=pdf.length;if(totalBytes>30*1024*1024)return fail(413,'Export ZIP limité à 30 Mo. Téléchargez les PDF séparément.');files[names.get(d.id)!]=pdf;}
  if(!Object.keys(files).length)return fail(422,'Aucune pièce tamponnée à télécharger.');
  return binary(reply,zipSync(files,{level:0}),'application/zip',stampedLotFilename(b.name));
 }
 const dr=tail.match(/^documents\/([^/]+)(?:\/(analyze|confirm|revise|approve|stamp|cancel|preview|source|output))?$/);if(!dr||!uuid(dr[1]))return reply(404,{error:'Action introuvable.'});
 const d=await db.prepare('SELECT * FROM stamp_documents WHERE id=? AND batch_id=?').bind(dr[1],b.id).first<Doc>();if(!d)return reply(404,{error:'Pièce introuvable.'});const result=JSON.parse(d.data),action=dr[2];
 if(!action&&method==='DELETE'){
  if(request.headers.get('if-match')!==String(d.version))return fail(409,'La pièce a changé. Actualisez le lot.');
  const removed=await db.prepare("UPDATE stamp_documents SET status='DELETING',version=version+1,match_group=NULL WHERE id=? AND batch_id=? AND version=? AND status!='PROCESSING' RETURNING version").bind(d.id,b.id,d.version).first<{version:number}>();
  if(!removed)return fail(409,'Attendez la fin de l’analyse de cette pièce avant de la supprimer.');
  // A retry can finish deletion after a storage interruption; the tombstone
  // prevents analysis, download or export of a partially removed document.
  await removeDocumentFiles(env,b,d.id);
  await db.prepare("DELETE FROM stamp_documents WHERE id=? AND version=? AND status='DELETING'").bind(d.id,removed.version).run();
  await audit(db,{...b,owner:session.email},'DOCUMENT_REMOVED',{name:d.name,source:d.sha256},d.id);return reply(200,{ok:true});
 }
 if(d.status==='DELETING')return fail(409,'Relancez la suppression de cette pièce pour la terminer.');
 if(['source','output','preview'].includes(action)&&method==='GET'){
  if(action!=='source'&&!result.candidateKey)return fail(422,'Aperçu indisponible.');
  if(action==='output'&&d.status!=='VERIFIED')return fail(409,'Validez et tamponnez la pièce avant téléchargement.');
  const raw=await object(env,action==='source'?sourceKey(b,d):result.candidateKey);
  if(hash(raw)!==(action==='source'?d.sha256:result.output_sha256))return fail(503,'Empreinte du fichier invalide.');
  if(new URL(request.url).searchParams.has('image')){const image=await service(env,raw,{action:'preview',options:{page:Number(new URL(request.url).searchParams.get('page')||0)}});return binary(reply,Buffer.from(image.image,'base64'),'image/png','apercu.png');}
  return binary(reply,raw,'application/pdf',action==='output'?stampedDocumentNames([d],data.import?.groups||[]).get(d.id)!:`piece-${d.id}.pdf`);
 }
 if(method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
 if(request.headers.get('if-match')!==String(d.version))return fail(409,'La pièce a changé. Actualisez le lot.');
 if(action==='confirm'){
  if(!data.importConfirmed||!['UPLOADED','REVIEW_REQUIRED'].includes(d.status))return fail(409,'Confirmez la répartition et attendez la fin de l’analyse avant correction.');
  const p=await json(request,50000),raw=await object(env,sourceKey(b,d));if(hash(raw)!==d.sha256)return fail(503,'Empreinte du fichier invalide.');
  const directInvoice=data.directInvoice?normalizeDirectInvoice({...data.directInvoice,...result.directInvoice,...p.directInvoice},true):null;
  const options={...data.options,fontSize:5,allowOverlap:true};
  const confirmed=await service(env,raw,{action:'confirm',groups:data.import?.groups||[],choice:p.choice,directInvoice,options,overrides:p.overrides||[]});
  const pdf=Buffer.from(confirmed.pdf||'','base64');delete confirmed.pdf;
  if(!confirmed.checks||Object.values(confirmed.checks).some(v=>v!==true)||confirmed.source_sha256!==d.sha256||hash(pdf)!==confirmed.output_sha256)return fail(503,'Le PDF corrigé n’a pas passé les contrôles.');
  const key=prefix(b)+d.id+`/candidate-${d.version+1}-${crypto.randomUUID()}.pdf`;
  await bucket(env).put(key,pdf,{httpMetadata:{contentType:'application/pdf'}});
  const confirmation=crypto.randomUUID();
  const next={...result,...confirmed,candidateKey:key,options,directInvoice,error:undefined,progress:{stage:'complete',startedAt:Date.now()},confirmedBy:session.email};
  try{
   // Fence reference changes before writing a result based on that reference version.
   const updated=await db.batch([
    db.prepare("UPDATE stamp_batches SET data=json_set(data,'$.sealed',json('true'),'$.lastManualConfirmation',?),version=version+1 WHERE id=? AND version=? AND expires_at>? RETURNING id").bind(confirmation,b.id,b.version,Date.now()),
    db.prepare("UPDATE stamp_documents SET status='APPROVED',version=version+1,data=?,match_group=? WHERE id=? AND version=? AND status=? AND EXISTS(SELECT 1 FROM stamp_batches WHERE id=? AND version=? AND json_extract(data,'$.lastManualConfirmation')=?) RETURNING id").bind(JSON.stringify(next),confirmed.groupId,d.id,d.version,d.status,b.id,b.version+1,confirmation)
   ]) as {results:{id:string}[]}[];
   if(updated.some(r=>!r.results?.length))throw new Error('changed');
  }catch{await bucket(env).delete(key);return fail(409,'La pièce ou sa répartition a changé, ou ces imputations sont déjà utilisées. Actualisez le lot.');}
  await audit(db,{...b,owner:session.email},'MANUALLY_CONFIRMED',{version:d.version+1,choice:p.choice,output:confirmed.output_sha256,withoutAnalysis:true},d.id);
  return reply(200,{ok:true});
 }
 if(action==='revise'){
  if(!['NEEDS_APPROVAL','APPROVED','VERIFIED'].includes(d.status)||!result.candidateKey)return fail(409,'Un aperçu contrôlé est requis avant modification.');
  const p=await json(request,70000);
  if(Object.keys(p).some(k=>!['placements','overrides','additions'].includes(k))||['placements','overrides','additions'].some(k=>p[k]!==undefined&&(!Array.isArray(p[k])||p[k].length>200)))return fail(400,'Modification invalide.');
  const raw=await object(env,sourceKey(b,d));if(hash(raw)!==d.sha256)return fail(503,'Empreinte du fichier invalide.');
  // The previous result is authoritative private server state; callers cannot
  // supply the reading, base, allocations, or verification evidence.
  const previous={...result,blocks:result.blocks?.map(({image,...b}:any)=>b)};
  const options={...data.options,...result.options,allowOverlap:true,fontSize:5};delete options.placement;delete options.placements;
  if(p.placements)options.placements=p.placements;
  else if(result.blocks?.every((b:any)=>b.allocationIds))options.placements=result.blocks.map(({page,x,y,layoutWidth,scale,allocationIds}:any)=>({page,x,y,layoutWidth,scale,allocationIds}));
  const revised=await service(env,raw,{action:'revise',previous,options,overrides:p.overrides||[],additions:p.additions||[]});
  const pdf=Buffer.from(revised.pdf||'','base64');delete revised.pdf;
  if(!revised.checks||Object.values(revised.checks).some(v=>v!==true)||revised.source_sha256!==d.sha256||hash(pdf)!==revised.output_sha256)return fail(503,'Le PDF modifié n’a pas passé les contrôles.');
  const key=prefix(b)+d.id+`/candidate-${d.version+1}-${crypto.randomUUID()}.pdf`;
  await bucket(env).put(key,pdf,{httpMetadata:{contentType:'application/pdf'}});
  const next={...result,...revised,candidateKey:key,options,error:undefined,overrides:[],progress:{stage:'complete',startedAt:Date.now()}};
  let updated;
  try{updated=await db.prepare("UPDATE stamp_documents SET status='NEEDS_APPROVAL',version=version+1,data=? WHERE id=? AND version=? AND status=? AND EXISTS (SELECT 1 FROM stamp_batches WHERE id=? AND expires_at>?) RETURNING id").bind(JSON.stringify(next),d.id,d.version,d.status,b.id,Date.now()).first();}
  catch(error){await bucket(env).delete(key);throw error;}
  if(!updated){await bucket(env).delete(key);return fail(409,'La pièce a changé pendant la modification. Actualisez le lot.');}
  await audit(db,{...b,owner:session.email},'PREVIEW_REVISED',{version:d.version+1,previous:result.output_sha256,output:revised.output_sha256,placements:options.placements,overrides:p.overrides||[],additions:p.additions||[]},d.id);
  return reply(200,{ok:true});
 }
 if(action==='analyze'){
  if(!data.importConfirmed)return fail(422,'Confirmez le document de paiement sans erreur avant analyse.');
  if(!env.STAMPING_QUEUE)return fail(503,'La file de traitement doit être activée.');
  if(!data.sealed){const sealed=await db.prepare("UPDATE stamp_batches SET data=json_set(data,'$.sealed',json('true')),version=version+1 WHERE id=? AND version=? RETURNING id").bind(b.id,b.version).first();if(!sealed)return fail(409,'Le lot a changé. Relancez l’analyse.');}
  if(['PROCESSING','VERIFIED','APPROVED'].includes(d.status))return fail(409,'Pièce en cours ou déjà validée.');
  const p=await json(request,50000);if(p.overrides!==undefined&&!Array.isArray(p.overrides))return fail(400,'Corrections invalides.');const next={sourceUpload:result.sourceUpload,...(data.directInvoice?{directInvoice:normalizeDirectInvoice({...data.directInvoice,...result.directInvoice,...p.directInvoice},true)}:{}),choice:p.choice||null,options:{...data.options,fontSize:5,allowOverlap:true,...p.options},overrides:p.overrides||[],cachedReading:result.cachedReading||null,progress:{startedAt:Date.now(),stage:'queued'}};
  if(p.choice&&(typeof p.choice.reason!=='string'||p.choice.reason.trim().length<5))return fail(422,'Justifiez le rapprochement manuel.');
  const row=await db.prepare("UPDATE stamp_documents SET status='QUEUED',data=?,match_group=NULL,version=version+1 WHERE id=? AND version=? AND status NOT IN ('PROCESSING','VERIFIED','APPROVED') RETURNING version").bind(JSON.stringify(next),d.id,d.version).first<{version:number}>();if(!row)return fail(409,'La pièce a changé.');
  try{await (env.STAMPING_QUEUE as {send(body:Job):Promise<void>}).send({batchId:b.id,documentId:d.id,version:row.version,owner:b.owner});}
  catch{await db.prepare("UPDATE stamp_documents SET status='REVIEW_REQUIRED' WHERE id=? AND version=?").bind(d.id,row.version).run();return fail(503,'La file est indisponible. Relancez cette pièce.');}
  await audit(db,{...b,owner:session.email},'ANALYSIS_REQUESTED',{choice:next.choice,options:next.options,overrides:next.overrides},d.id);return reply(202,{ok:true});
 }
 if(action==='cancel'){
  if(d.status==='PROCESSING')return fail(409,'La pièce en cours finit en sécurité. Les autres peuvent être annulées.');
  const changed=await db.prepare("UPDATE stamp_documents SET status='UPLOADED',version=version+1,data=json_object('sourceUpload',json_extract(data,'$.sourceUpload')),match_group=NULL WHERE id=? AND version=? AND status NOT IN ('VERIFIED','PROCESSING') RETURNING id").bind(d.id,d.version).first();if(!changed)return fail(409,'La pièce est en cours ou déjà tamponnée.');return reply(200,{ok:true});
 }
 if(action==='approve'){
  if(d.status!=='NEEDS_APPROVAL')return fail(409,'La pièce doit avoir un aperçu contrôlé.');const p=await json(request,2000);
  if(p.reviewed!==true||p.outputSha256!==result.output_sha256)return fail(422,'Confirmez l’aperçu courant et ses imputations.');
  const changed=await db.prepare("UPDATE stamp_documents SET status='APPROVED' WHERE id=? AND version=? AND status='NEEDS_APPROVAL' RETURNING id").bind(d.id,d.version).first();if(!changed)return fail(409,'La pièce a changé.');await audit(db,{...b,owner:session.email},'APPROVED',{version:d.version,output:result.output_sha256},d.id);return reply(200,{ok:true});
 }
 if(action==='stamp'){
  if(d.status==='VERIFIED')return reply(200,{ok:true});if(d.status!=='APPROVED')return fail(409,'Validez l’aperçu avant tamponnage.');
  const raw=await object(env,result.candidateKey);if(hash(raw)!==result.output_sha256)return fail(503,'La copie validée a changé.');
  const changed=await db.prepare("UPDATE stamp_documents SET status='VERIFIED' WHERE id=? AND version=? AND status='APPROVED' RETURNING id").bind(d.id,d.version).first();if(!changed)return fail(409,'La pièce a changé.');await audit(db,{...b,owner:session.email},'VERIFIED',{output:result.output_sha256},d.id);return reply(200,{ok:true});
 }
 return reply(404,{error:'Action introuvable.'});
}
