import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {zipSync,strToU8} from 'fflate';
import {sessionIdentity} from './identity';
import {boundedBody} from './portal';
import {stampingSuggestions} from './stamping-ai';
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
async function upload(request:Request,limit:number){
 const bytes=await boundedBody(request,limit+65536);const form=await new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')||''},body:new Uint8Array(bytes)}).formData();
 const file=form.get('file');if(!file||typeof file==='string'||file.size>limit||!file.size)return fail(400,'Fichier absent ou trop volumineux.');
 const name=file.name.replace(/[\x00-\x1f/\\]/g,'_').slice(0,180);return {name,bytes:new Uint8Array(await file.arrayBuffer())};
}
const documents=async(db:Database,id:string)=>(await db.prepare('SELECT * FROM stamp_documents WHERE batch_id=? ORDER BY rowid').bind(id).all<Doc>()).results;
async function unlocked(db:Database,b:Batch,request:Request){
 if(JSON.parse(b.data).sealed)return fail(409,'Le tableau est verrouillé dès la première analyse. Créez un nouveau lot pour le remplacer.');
 if(request.headers.get('if-match')!==String(b.version))return fail(409,'Le lot a changé. Actualisez avant de continuer.');
 const row=await db.prepare("SELECT id FROM stamp_documents WHERE batch_id=? AND status IN ('QUEUED','PROCESSING','APPROVED','VERIFIED') LIMIT 1").bind(b.id).first();
 if(row)return fail(409,'Le tableau est verrouillé pendant le traitement ou après validation. Créez un nouveau lot pour changer les imputations.');
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
  const reading=await service(env,source,{action:'extract'});
  // The model sees only minimised server-extracted evidence, never caller-supplied document text.
  ai=batch.useAI?await stampingSuggestions(db,env,reading.evidence):{status:'disabled'};
  await db.prepare('UPDATE stamp_documents SET data=? WHERE id=? AND version=? AND status=?').bind(JSON.stringify({...data,reading,ai}),d.id,d.version,'PROCESSING').run();
  const result=await service(env,source,{action:'process',groups:batch.import.groups,options:data.options||batch.options||{},choice:data.choice,suggestions:ai.suggestions||[],overrides:data.overrides||[]});
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
function binary(reply:Reply,raw:Uint8Array,type:string,name:string){const headers=new Headers(reply(200,{}).headers);headers.set('Content-Type',type);headers.set('Content-Disposition',`attachment; filename="${name}"`);headers.set('X-Content-Type-Options','nosniff');return new Response(new Uint8Array(raw),{headers});}

export async function stampingRoute(request:Request,env:Environment,reply:Reply):Promise<Response>{
 const session=await sessionIdentity(request,env);if(!session)return reply(401,{error:'Connexion requise.'});if(!session.admin)return reply(403,{error:'Le tamponnage est réservé à la direction.'});
 const db=dbOf(env),path=new URL(request.url).pathname.slice('/api/v1/stamping'.length),method=request.method;
 if(path==='/context')return reply(200,{configured:!!env.BILLING_PDF_SERVICE_URL&&!!env.STAMPING_QUEUE,ai:!!env.MARKETS_AI,retentionDays:30});
 if(path==='/profiles'){
  if(method==='GET')return reply(200,{profiles:(await db.prepare('SELECT id,name,data FROM stamp_profiles WHERE owner=? ORDER BY updated_at DESC LIMIT 30').bind(session.email).all<any>()).results.map(r=>({...r,data:JSON.parse(r.data)}))});
  if(method==='POST'){const p=await json(request,20000);if(typeof p.name!=='string'||!p.name.trim()||p.name.length>120)return fail(400,'Nom de profil requis.');const id=crypto.randomUUID();await db.prepare('INSERT INTO stamp_profiles VALUES(?,?,?,?,?)').bind(id,session.email,p.name,JSON.stringify(p.mapping),Date.now()).run();return reply(201,{id});}
 }
 if(path==='/batches'){
  if(method==='GET')return reply(200,{batches:(await db.prepare('SELECT id,name,version,created_at,expires_at FROM stamp_batches WHERE owner=? AND expires_at>? ORDER BY created_at DESC LIMIT 100').bind(session.email,Date.now()).all()).results});
  if(method==='POST'){
   const p=await json(request,10000);if(typeof p.name!=='string'||!p.name.trim()||p.name.length>120)return fail(400,'Nom de lot requis.');
   const id=crypto.randomUUID(),now=Date.now();await db.prepare('INSERT INTO stamp_batches VALUES(?,?,?,1,?,?,?)').bind(id,session.email,p.name.trim(),JSON.stringify({useAI:p.useAI===true,options:{header:'Dépense imputée aux projets suivants',compact:true,split:true,allowAppendix:p.allowAppendix===true,pagePreference:p.pagePreference==='last'?'last':'first'}}),now,now+30*86400000).run();
   return reply(201,{id});
  }
 }
 const route=path.match(/^\/batches\/([^/]+)(?:\/(.*))?$/);if(!route||!uuid(route[1]))return reply(404,{error:'Route introuvable.'});
 const b=await db.prepare('SELECT * FROM stamp_batches WHERE id=? AND owner=? AND expires_at>?').bind(route[1],session.email,Date.now()).first<Batch>();if(!b)return reply(404,{error:'Lot introuvable.'});
 const tail=route[2]||'',data=JSON.parse(b.data);
 if(!tail&&method==='GET'){
  await db.prepare("UPDATE stamp_documents SET status='REVIEW_REQUIRED',lease_until=0,data=json_set(data,'$.error',json(?)) WHERE batch_id=? AND status='PROCESSING' AND lease_until<?").bind(JSON.stringify({code:'INTERRUPTED',message:'Le traitement a été interrompu. Relancez cette pièce.'}),b.id,Date.now()).run();
  const docs=await documents(db,b.id),used=new Set(docs.map(d=>d.match_group));
  return reply(200,{...b,data,documents:docs.map(expose),unmatchedGroups:(data.import?.groups||[]).filter((g:any)=>!used.has(g.id)).map((g:any)=>g.id)});
 }
 if(!tail&&method==='DELETE'){
  if((await documents(db,b.id)).some(d=>d.status==='PROCESSING'&&d.lease_until>Date.now()))return fail(409,'Attendez la fin de la pièce en cours avant suppression.');
  if(!await purge(db,env,b))return fail(409,'Une pièce vient de démarrer. Attendez sa fin avant suppression.');return reply(200,{ok:true});
 }
 if(tail==='table'&&method==='POST'){
  await unlocked(db,b,request);const file=await upload(request,5*1024*1024);const inspected=await service(env,file.bytes,{action:'inspect',name:file.name});
  const key=prefix(b)+'table-'+crypto.randomUUID()+'-'+inspected.sha256;await bucket(env).put(key,file.bytes);
  const next={...data,table:{name:file.name,key,...inspected},import:null,importConfirmed:false};
  const updated=await db.prepare('UPDATE stamp_batches SET data=?,version=version+1 WHERE id=? AND version=? RETURNING id').bind(JSON.stringify(next),b.id,b.version).first();if(!updated){await bucket(env).delete(key);return fail(409,'Le lot a changé. Rechargez-le.');}
  await audit(db,b,'TABLE_IMPORTED',{hash:inspected.sha256});return reply(200,{ok:true});
 }
 if(tail==='mapping'&&method==='POST'){
  await unlocked(db,b,request);if(!data.table)return fail(422,'Importez le tableau.');const p=await json(request,100000),raw=await object(env,data.table.key);
  const imported=await service(env,raw,{action:'import',name:data.table.name,options:p.mapping});
  const next={...data,import:imported,importConfirmed:p.confirmed===true&&imported.groups.length>0&&!imported.errors.length&&!imported.groups.some((g:any)=>g.errors.length)};
  if(new TextEncoder().encode(JSON.stringify(next)).length>1200000)return fail(413,'Le tableau et sa traçabilité sont trop volumineux pour un lot. Répartissez-les en plusieurs fichiers.');
  const updated=await db.prepare('UPDATE stamp_batches SET data=?,version=version+1 WHERE id=? AND version=? RETURNING id').bind(JSON.stringify(next),b.id,b.version).first();if(!updated)return fail(409,'Le lot a changé.');
  await audit(db,b,next.importConfirmed?'MAPPING_CONFIRMED':'MAPPING_PREVIEW',{mapping:p.mapping,source:imported.source_sha256});return reply(200,{ok:true});
 }
 if(tail==='documents'&&method==='POST'){
  const docs=await documents(db,b.id);if(docs.length>=100||docs.reduce((n,d)=>n+d.size,0)>180*1024*1024)return fail(413,'Limite du lot : 100 PDF et 200 Mo.');
  const file=await upload(request,20*1024*1024);if(!/\.pdf$/i.test(file.name)||new TextDecoder().decode(file.bytes.slice(0,5))!=='%PDF-')return fail(415,'Un PDF valide est requis.');
  if(docs.reduce((n,d)=>n+d.size,0)+file.bytes.length>200*1024*1024)return fail(413,'Lot limité à 200 Mo.');
  const sha=hash(file.bytes),duplicate=docs.find(d=>d.sha256===sha);if(duplicate)return reply(200,{id:duplicate.id,duplicate:true});
  const d={id:crypto.randomUUID(),batch_id:b.id,name:file.name,sha256:sha,size:file.bytes.length} as Doc;const key=sourceKey(b,d);
  await bucket(env).put(key,file.bytes);try{const inserted=await db.prepare('INSERT INTO stamp_documents(id,batch_id,name,sha256,size) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM stamp_batches WHERE id=? AND expires_at>?) RETURNING id').bind(d.id,b.id,d.name,sha,d.size,b.id,Date.now()).first();if(!inserted)throw new Error('expired');}catch{await bucket(env).delete(key);return fail(409,'Pièce déjà importée ou lot indisponible. Actualisez le lot.');}
  await audit(db,b,'PDF_IMPORTED',{source:sha},d.id);return reply(201,{id:d.id});
 }
 if(tail==='export'&&method==='GET'){
  const docs=await documents(db,b.id),files:Record<string,Uint8Array>={};let totalBytes=0;
  for(const d of docs.filter(d=>d.status==='VERIFIED')){const result=JSON.parse(d.data);const pdf=await object(env,result.candidateKey);if(hash(pdf)!==result.output_sha256)return fail(503,'Empreinte du PDF invalide.');totalBytes+=pdf.length;if(totalBytes>30*1024*1024)return fail(413,'Export ZIP limité à 30 Mo. Téléchargez les PDF séparément.');files[`piece-${d.id}_tamponne.pdf`]=pdf;}
  const escape=(v:unknown)=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';
  const rows=[['Fichier','État','Type','Période','Groupe','Base centimes','Imputé centimes','Reliquat centimes','Erreur','SHA256 source','SHA256 sortie'],...docs.map(d=>{const r=JSON.parse(d.data);return [d.name,d.status,r.reading?.fields?.document_type,r.reading?.fields?.period,d.match_group,r.base_cents,r.total_cents,r.remainder_cents,r.error?.message,d.sha256,r.output_sha256]})];
  files['rapport.csv']=strToU8('\ufeff'+rows.map(r=>r.map(escape).join(';')).join('\r\n'));
  const events=(await db.prepare('SELECT * FROM stamp_audit WHERE batch_id=? ORDER BY created_at').bind(b.id).all()).results;
  files['tracabilite.json']=strToU8(JSON.stringify({batch:{id:b.id,name:b.name},source:data.table?.sha256,mapping:data.import?.mapping,groups:data.import?.groups,documents:docs.map(expose),audit:events},null,2));
  return binary(reply,zipSync(files,{level:0}),'application/zip',`tamponnage-${b.id}.zip`);
 }
 const dr=tail.match(/^documents\/([^/]+)\/(analyze|approve|stamp|cancel|preview|source|output)$/);if(!dr||!uuid(dr[1]))return reply(404,{error:'Action introuvable.'});
 const d=await db.prepare('SELECT * FROM stamp_documents WHERE id=? AND batch_id=?').bind(dr[1],b.id).first<Doc>();if(!d)return reply(404,{error:'Pièce introuvable.'});const result=JSON.parse(d.data),action=dr[2];
 if(['source','output','preview'].includes(action)&&method==='GET'){
  if(action!=='source'&&!result.candidateKey)return fail(422,'Aperçu indisponible.');
  if(action==='output'&&d.status!=='VERIFIED')return fail(409,'Validez et tamponnez la pièce avant téléchargement.');
  const raw=await object(env,action==='source'?sourceKey(b,d):result.candidateKey);
  if(hash(raw)!==(action==='source'?d.sha256:result.output_sha256))return fail(503,'Empreinte du fichier invalide.');
  if(new URL(request.url).searchParams.has('image')){const image=await service(env,raw,{action:'preview',options:{page:Number(new URL(request.url).searchParams.get('page')||0)}});return binary(reply,Buffer.from(image.image,'base64'),'image/png','apercu.png');}
  return binary(reply,raw,'application/pdf',`piece-${d.id}${action==='output'?'_tamponne':''}.pdf`);
 }
 if(method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
 if(request.headers.get('if-match')!==String(d.version))return fail(409,'La pièce a changé. Actualisez le lot.');
 if(action==='analyze'){
  if(!data.importConfirmed)return fail(422,'Confirmez le tableau sans erreur avant analyse.');
  if(!env.STAMPING_QUEUE)return fail(503,'La file de traitement doit être activée.');
  if(!data.sealed){const sealed=await db.prepare("UPDATE stamp_batches SET data=json_set(data,'$.sealed',json('true')),version=version+1 WHERE id=? AND version=? RETURNING id").bind(b.id,b.version).first();if(!sealed)return fail(409,'Le lot a changé. Relancez l’analyse.');}
  if(['PROCESSING','VERIFIED','APPROVED'].includes(d.status))return fail(409,'Pièce en cours ou déjà validée.');
  const p=await json(request,50000);if(p.overrides!==undefined&&!Array.isArray(p.overrides))return fail(400,'Corrections invalides.');const next={choice:p.choice||null,options:{...data.options,...p.options},overrides:p.overrides||[]};
  if(p.choice&&(typeof p.choice.reason!=='string'||p.choice.reason.trim().length<5))return fail(422,'Justifiez le rapprochement manuel.');
  const row=await db.prepare("UPDATE stamp_documents SET status='QUEUED',data=?,match_group=NULL,version=version+1 WHERE id=? AND version=? AND status NOT IN ('PROCESSING','VERIFIED','APPROVED') RETURNING version").bind(JSON.stringify(next),d.id,d.version).first<{version:number}>();if(!row)return fail(409,'La pièce a changé.');
  try{await (env.STAMPING_QUEUE as {send(body:Job):Promise<void>}).send({batchId:b.id,documentId:d.id,version:row.version,owner:b.owner});}
  catch{await db.prepare("UPDATE stamp_documents SET status='REVIEW_REQUIRED' WHERE id=? AND version=?").bind(d.id,row.version).run();return fail(503,'La file est indisponible. Relancez cette pièce.');}
  await audit(db,b,'ANALYSIS_REQUESTED',next,d.id);return reply(202,{ok:true});
 }
 if(action==='cancel'){
  if(d.status==='PROCESSING')return fail(409,'La pièce en cours finit en sécurité. Les autres peuvent être annulées.');
  const changed=await db.prepare("UPDATE stamp_documents SET status='UPLOADED',version=version+1,data='{}',match_group=NULL WHERE id=? AND version=? AND status NOT IN ('VERIFIED','PROCESSING') RETURNING id").bind(d.id,d.version).first();if(!changed)return fail(409,'La pièce est en cours ou déjà tamponnée.');return reply(200,{ok:true});
 }
 if(action==='approve'){
  if(d.status!=='NEEDS_APPROVAL')return fail(409,'La pièce doit avoir un aperçu contrôlé.');const p=await json(request,2000);
  if(p.reviewed!==true||p.outputSha256!==result.output_sha256)return fail(422,'Confirmez l’aperçu courant et ses imputations.');
  const changed=await db.prepare("UPDATE stamp_documents SET status='APPROVED' WHERE id=? AND version=? AND status='NEEDS_APPROVAL' RETURNING id").bind(d.id,d.version).first();if(!changed)return fail(409,'La pièce a changé.');await audit(db,b,'APPROVED',{version:d.version,output:result.output_sha256},d.id);return reply(200,{ok:true});
 }
 if(action==='stamp'){
  if(d.status==='VERIFIED')return reply(200,{ok:true});if(d.status!=='APPROVED')return fail(409,'Validez l’aperçu avant tamponnage.');
  const raw=await object(env,result.candidateKey);if(hash(raw)!==result.output_sha256)return fail(503,'La copie validée a changé.');
  const changed=await db.prepare("UPDATE stamp_documents SET status='VERIFIED' WHERE id=? AND version=? AND status='APPROVED' RETURNING id").bind(d.id,d.version).first();if(!changed)return fail(409,'La pièce a changé.');await audit(db,b,'VERIFIED',{output:result.output_sha256},d.id);return reply(200,{ok:true});
 }
 return reply(404,{error:'Action introuvable.'});
}
