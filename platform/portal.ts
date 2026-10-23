import {createHash,randomBytes} from 'node:crypto';
import {Buffer} from 'node:buffer';
import type {Environment,Reply,WorkspaceRow} from './contracts';
import {admins,accountRole,portalAdmin,sessionIdentity} from './identity.ts';
import {applyRecordChanges,validateChanges,equalRecordValue} from './record-changes';
import {saveRecordSource} from './record-writes';
// The compatibility document keeps all unknown fields. Only explicitly granted fields
// leave the server for a collaborator; credential verifiers never leave normal APIs.
type Document = Record<string,any>;
const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
const norm=(s:unknown)=>String(s||'').trim().toLowerCase();
const object=(v:unknown):v is Document=>!!v&&typeof v==='object'&&!Array.isArray(v);
const same=equalRecordValue;
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const assignments:Record<string,string>={'quilici.pascal@cdinnov.com':'001','pasqualini.david@cdinnov.com':'002','boulanger.albert@cdinnov.com':'003','calendini.matthieu@cdinnov.com':'004','vincenti.paulmichel@cdinnov.com':'005'};
const employee=(p:Document,email:string)=>p.salaries?.find((s:Document)=>norm(s.email)===email)?.matricule||assignments[email];
const own=(r:Document,mat:string|undefined)=>!!mat&&r?.matricule===mat;
const pick=(o:Document,keys:string[])=>Object.fromEntries(keys.filter(k=>Object.hasOwn(o,k)).map(k=>[k,o[k]]));

export async function readPortal(env:Environment):Promise<WorkspaceRow>{
  const db=env.BUDGETS_DB.withSession('first-primary');
  const row=await db.prepare("SELECT * FROM app_portal_workspace WHERE id='shared'").first<WorkspaceRow>();
  if(row)return row;
  // Seed explicitly after the former writer is closed. Never silently resurrect
  // stale KV accounts or business data if the primary document is absent.
  return fail(503,'Le portail est en cours de maintenance. Réessayez dans un instant.');
}

/** Request-scoped adapter: all old readers now use the same primary D1 snapshot. */
export function portalEnvironment(source:Environment):Environment {
  let current:Promise<WorkspaceRow>|undefined;
  const kv=source.CET_KV as {get(key:string,mode?:string):Promise<unknown>};
  return {...source,async PORTAL_ACCOUNT_LOOKUP(email:string){
    const row=await source.BUDGETS_DB.withSession('first-primary').prepare(`SELECT
      (SELECT data_json FROM portal_accounts WHERE map_key=? LIMIT 1) AS account,
      (SELECT json_group_array(json(data_json)) FROM portal_allowed_accounts) AS allowed
      FROM app_domain_state WHERE domain='portal'`).bind(email).first<{account:string|null;allowed:string}>();
    if(!row)return fail(503,'Le service de connexion CDInnov est indisponible.');
    return {accounts:row.account?{[email]:JSON.parse(row.account)}:{},allowed:JSON.parse(row.allowed)};
  },CET_KV:{async get(key:string,mode?:string){
    if(key!==source.CET_WORKSPACE_KEY)return kv.get(key,mode);
    const row=await(current??=readPortal(source));return mode==='json'?JSON.parse(row.payload):row.payload;
  }}};
}

export function portalView(p:Document,email:string):Document {
  const admin=portalAdmin(p,email),mat=employee(p,email);
  const accounts=Object.fromEntries(Object.entries(p.auth?.accounts||{}).filter(([key])=>admin||key===email).map(([key,a])=>[key,{...pick(a as Document,['name','created']),role:accountRole(key,a as Document)}]));
  const auth={accounts,allowed:admin?p.auth?.allowed||[]:[email]};
  if(admin)return {...p,auth};
  return {params:p.params,types:p.types,salaries:(p.salaries||[]).map((s:Document)=>own(s,mat)?s:pick(s,['matricule','nom','prenom','email','statut','photo'])),
    mouvements:(p.mouvements||[]).filter((r:Document)=>own(r,mat)),conges:(p.conges||[]).map((r:Document)=>own(r,mat)?r:pick(r,['id','matricule','date','half','type','statut','req'])),
    notesFrais:(p.notesFrais||[]).filter((r:Document)=>own(r,mat)),codesAffaires:p.codesAffaires||[],factures:[],facturxPartyMemory:{seller:[],buyer:[]},majAt:p.majAt,majBy:p.majBy,auth};
}

export async function boundedBody(request:Pick<Request,'body'>,max=1500000):Promise<Uint8Array>{
  const chunks:Uint8Array[]=[],reader=request.body?.getReader();let size=0;
  if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();fail(413,'Fichier ou données trop volumineux.');}chunks.push(value);}}finally{reader.releaseLock();}
  return Buffer.concat(chunks);
}
async function input(request:Request,max=1500000):Promise<Document>{
  if(!request.headers.get('content-type')?.startsWith('application/json'))return fail(415,'Format JSON requis.');
  let value:unknown;try{value=JSON.parse(Buffer.from(await boundedBody(request,max)).toString());}catch(e){if((e as {status?:number}).status)throw e;return fail(400,'Données JSON invalides.');}
  return object(value)?value:fail(400,'Document invalide.');
}
function version(request:Request){const value=request.headers.get('if-match');if(!value||!/^\d+$/.test(value))return fail(428,'Rechargez les données avant de les enregistrer.');return Number(value);}
async function writePortal(env:Environment,p:Document,expected:number,email:string){
  const row=await readPortal(env);
  if(row.version!==expected)fail(409,'Une autre personne a modifié le portail. Vos modifications locales sont conservées.');
  const saved=await saveRecordSource(env.BUDGETS_DB.withSession('first-primary'),'portal',JSON.parse(row.payload),p,expected,email);
  if(saved===null)fail(409,'Une autre personne a modifié le portail. Vos modifications locales sont conservées.');
  return saved!;
}
function merge(p:Document,next:Document,email:string){
  for(const key of ['salaries','types','mouvements','conges','notesFrais','codesAffaires','factures'])if(!Array.isArray(next[key]))fail(400,'Collection invalide : '+key);
  if(!object(next.params))fail(400,'Paramètres invalides.');
  const admin=portalAdmin(p,email),mat=employee(p,email),view=portalView(p,email);
  let result:Document;
  if(admin){result={...p,...next,auth:p.auth};}
  else {
    const writable=new Set(['conges','mouvements','notesFrais','majAt','majBy']);
    for(const key of new Set([...Object.keys(view),...Object.keys(next)]))if(!writable.has(key)&&!same(view[key],next[key]))fail(403,'Cette rubrique est réservée à un administrateur.');
    result={...p};
    for(const key of ['conges','mouvements','notesFrais']){
      const other=(r:Document)=>!own(r,mat);
      if(!same(next[key].filter(other),view[key].filter(other)))fail(403,'Vous ne pouvez modifier que votre dossier.');
      const records=next[key].filter((r:Document)=>own(r,mat));
      if(key==='conges')for(const r of records){const before=p.conges.find((c:Document)=>c.id===r.id);if(r.statut!=='En attente'&&!same(before,r))fail(403,'La validation des congés est réservée à un responsable.');}
      let index=0;result[key]=(p[key]||[]).flatMap((r:Document)=>other(r)?[r]:index<records.length?[records[index++]]:[]);
      result[key].push(...records.slice(index));
    }
  }
  for(const key of ['conges','mouvements','notesFrais']){
    const ids=new Set();for(const r of result[key]){if(!object(r)||typeof r.id!=='string'||!r.id||ids.has(r.id))fail(400,'Identifiant absent ou dupliqué : '+key);ids.add(r.id);}
  }
  if(email!=='boulanger.albert@cdinnov.com'){
    const old=new Map((p.notesFrais||[]).map((r:Document)=>[r.id,r]));
    for(const r of result.notesFrais){const before=old.get(r.id) as Document|undefined;if(r.statut==='Payée'&&before?.statut!=='Payée')fail(403,'Seule la comptabilité peut marquer une note comme payée.');if(before?.statut==='Payée'&&!same(r,before))fail(403,'Une note payée est verrouillée.');}
    for(const r of p.notesFrais||[])if(r.statut==='Payée'&&!result.notesFrais.some((x:Document)=>x.id===r.id))fail(403,'Une note payée est verrouillée.');
  }
  result.majAt=new Date().toISOString();result.majBy=email;return result;
}

async function checkNewFiles(env:Environment,p:Document,result:Document,email:string){
  const keys=(value:unknown,out=new Set<string>()):Set<string>=>{if(typeof value==='string'){try{const u=new URL(value);if(u.pathname.startsWith('/files/'))out.add(decodeURIComponent(u.pathname.slice(7)));}catch{}}else if(value&&typeof value==='object')Object.values(value).forEach(v=>keys(v,out));return out;};
  const previous=keys(portalView(p,email));
  for(const key of keys(portalView(result,email)))if(!previous.has(key)){
    const metadata=await (env.CET_FILES as any).head(key);
    if(metadata?.customMetadata?.owner!==email)fail(403,'Vous ne pouvez joindre que les fichiers de votre dossier.');
  }
}

export async function portalRoute(request:Request,env:Environment,reply:Reply):Promise<Response>{
  const path=new URL(request.url).pathname;
  const row=await readPortal(env),p:Document=JSON.parse(row.payload);
  // Registration requires a one-time invitation issued by an authenticated admin.
  if(path==='/api/v1/portal/enrol'&&request.method==='POST'){
    const data=await input(request),email=norm(data.email),invite=p.auth?.invitations?.[email];
    if(!invite||invite.expiresAt<Date.now()||typeof data.token!=='string'||digest(data.token)!==invite.hash)fail(403,'Invitation invalide ou expirée. Demandez un nouveau lien à un administrateur.');
    if(!/^[a-f0-9]{32}$/.test(data.salt)||!/^[a-f0-9]{64}$/.test(data.hash)||data.iter!==150000||typeof data.name!=='string'||data.name.length>200)fail(400,'Compte invalide.');
    p.auth.accounts[email]={salt:data.salt,hash:data.hash,iter:data.iter,name:data.name.trim()||email,created:new Date().toISOString(),role:invite.role==='admin'?'admin':'collaborator'};delete p.auth.invitations[email];
    if(!p.auth.allowed.includes(email))p.auth.allowed.push(email);
    await writePortal(env,p,row.version,email);return reply(200,{ok:true});
  }
  const session=await sessionIdentity(request,portalEnvironment(env));if(!session)return reply(401,{error:'Votre connexion CDInnov a expiré. Reconnectez-vous.'});
  if(path==='/api/v1/portal'&&request.method==='GET')return reply(200,{workspace:portalView(p,session.email),version:row.version});
  if(path==='/api/v1/portal'&&request.method==='PATCH'){
    // A replacement includes both the old precondition and the new value. Keep
    // existing large inline logos importable without increasing stored document size.
    const {changes}=await input(request,4000000);validateChanges(changes);
    if(changes.some(c=>['auth','majAt','majBy'].includes(String(c.path[0]))))fail(403,'Ce champ est géré par le serveur.');
    for(let attempt=0;attempt<6;attempt++){
      const current=attempt?await readPortal(env):row,document=JSON.parse(current.payload);
      const next=applyRecordChanges(portalView(document,session.email),changes);
      const result=merge(document,next,session.email);
      if(!portalAdmin(document,session.email))await checkNewFiles(env,document,result,session.email);
      if(!changes.length)return reply(200,{version:current.version});
      const saved=await saveRecordSource(env.BUDGETS_DB.withSession('first-primary'),'portal',document,result,current.version,session.email);
      if(saved!==null)return reply(200,{version:saved,majAt:result.majAt,majBy:result.majBy});
    }
    return reply(409,{error:'Plusieurs enregistrements sont en cours. Votre copie est conservée. Réessayez.'});
  }
  if(path==='/api/v1/portal'&&request.method==='PUT'){
    const expected=version(request);if(expected!==row.version)fail(409,'Le portail a changé. Vos modifications locales sont conservées.');
    const result=merge(p,await input(request),session.email);
    if(!session.admin)await checkNewFiles(env,p,result,session.email);
    const v=await writePortal(env,result,expected,session.email);
    return reply(200,{version:v,majAt:result.majAt,majBy:result.majBy});
  }
  if(!session.admin||!portalAdmin(p,session.email))return reply(403,{error:'Accès réservé à un administrateur.'});
  if(path==='/api/v1/portal/backup'&&request.method==='GET')return reply(200,p);
  if(path==='/api/v1/portal/restore'&&request.method==='PUT'){
    const data=await input(request),expected=version(request);
    const restored={...p,...data,params:{...p.params,...data.params},auth:p.auth};
    // Old backups can contain accounts; restoring business data never revives revoked
    // accounts or invalidates the administrator performing the restore.
    const result=merge(p,restored,session.email);return reply(200,{version:await writePortal(env,result,expected,session.email)});
  }
  if(path==='/api/v1/portal/accounts'&&request.method==='POST'){
    const data=await input(request),email=norm(data.email);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail(400,'Adresse invalide.');
    p.auth??={};p.auth.accounts??={};p.auth.allowed??=[];p.auth.invitations??={};
    const activeAdmins=Object.keys(p.auth.accounts).filter(e=>portalAdmin(p,e));
    if(data.action==='role'){
      const expected=version(request);
      if(expected!==row.version)fail(409,'Les comptes ont changé. Actualisez avant de modifier les droits.');
      if(!['admin','collaborator'].includes(data.role))fail(400,'Droit invalide.');
      const target=p.auth.accounts[email];if(!target)fail(404,'Ce compte doit être activé avant de modifier ses droits.');
      const previous=accountRole(email,target);
      if(previous===data.role)return reply(200,{ok:true,version:row.version});
      if(previous==='admin'&&data.role!=='admin'&&activeAdmins.length<=1)fail(409,'Conservez au moins un administrateur actif.');
      target.role=data.role;
      // Auth metadata stays private and is committed atomically with the account.
      p.auth.roleHistory??=[];p.auth.roleHistory.push({email,from:previous,to:data.role,by:session.email,at:new Date().toISOString()});
      return reply(200,{ok:true,version:await writePortal(env,p,expected,session.email)});
    }
    if(data.action==='remove'){
      if(portalAdmin(p,email))fail(403,'Retirez les droits administrateur avant de supprimer cet accès.');
      delete p.auth.accounts[email];delete p.auth.invitations[email];p.auth.allowed=p.auth.allowed.filter((e:string)=>e!==email);
      await writePortal(env,p,row.version,session.email);return reply(200,{ok:true});
    }
    if(!['invite','reset'].includes(data.action))fail(400,'Action invalide.');
    if(data.action==='invite'&&p.auth.accounts[email])fail(409,'Ce compte existe déjà.');
    if(email===session.email&&data.action==='reset')fail(403,'Demandez à un autre administrateur de réinitialiser votre compte.');
    if(data.action==='reset'&&portalAdmin(p,email)&&activeAdmins.length<=1)fail(409,'Conservez au moins un administrateur actif.');
    const token=randomBytes(32).toString('base64url'),expiresAt=Date.now()+24*3600000;
    p.auth.invitations[email]={hash:digest(token),expiresAt,role:data.action==='reset'?accountRole(email,p.auth.accounts[email]):'collaborator'};if(data.action==='reset')delete p.auth.accounts[email];
    if(!p.auth.allowed.includes(email))p.auth.allowed.push(email);
    await writePortal(env,p,row.version,session.email);return reply(200,{email,token,expiresAt});
  }
  return reply(405,{error:'Méthode non autorisée.'});
}

function references(value:unknown,key:string):boolean{
  if(typeof value==='string'){try{return decodeURIComponent(new URL(value).pathname)==='/files/'+key;}catch{return false;}}
  return !!value&&typeof value==='object'&&Object.values(value).some(v=>references(v,key));
}
export async function filesRoute(request:Request,env:Environment,headers:Headers,reply:Reply){
  const session=await sessionIdentity(request,env);if(!session)return reply(401,{error:'Connexion requise.'});
  let key:string;try{key=decodeURIComponent(new URL(request.url).pathname.slice('/files/'.length));}catch{return reply(400,{error:'Clé invalide.'});}
  if(!key||key.length>500||/[\x00-\x1f]/.test(key))return reply(400,{error:'Clé invalide.'});
  if(key.startsWith('billing/'))return reply(403,{error:'Les documents émis sont accessibles uniquement depuis la facturation.'});
  const bucket=env.CET_FILES as any;
  if(request.method==='PUT'){
    const bytes=await boundedBody(request,20*1024*1024);
    const saved=await bucket.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:request.headers.get('content-type')||'application/octet-stream'},customMetadata:{owner:session.email}});
    if(!saved)return reply(409,{error:'Ce fichier existe déjà. Utilisez un nouveau nom.'});
    return reply(200,{ok:true,key});
  }
  if(!['GET','DELETE'].includes(request.method))return reply(405,{error:'Méthode non autorisée.'});
  const p=JSON.parse((await readPortal(env)).payload),metadata=await bucket.head(key);
  const canRead=session.admin||references(portalView(p,session.email),key)||metadata?.customMetadata?.owner===session.email;
  if(!canRead)return reply(403,{error:'Ce fichier ne fait pas partie de votre dossier.'});
  if(request.method==='DELETE'){
    // Referenced files are retained, including another user's copy of a receipt.
    if(references(p,key))return reply(409,{error:'Ce fichier est encore utilisé. Retirez d’abord sa référence et enregistrez.'});
    if(!session.admin&&metadata?.customMetadata?.owner!==session.email)return reply(403,{error:'Suppression non autorisée.'});
    await bucket.delete(key);return reply(200,{ok:true});
  }
  const file=await bucket.get(key);if(!file)return reply(404,{error:'Fichier introuvable.'});
  const output=new Headers(headers);output.set('Content-Type',file.httpMetadata?.contentType||'application/octet-stream');output.set('Content-Disposition','attachment');output.set('Content-Security-Policy',"sandbox; default-src 'none'");
  return new Response(file.body,{headers:output});
}

export async function notificationRequest(request:Request,env:Environment):Promise<Request>{
  const session=await sessionIdentity(request,env);if(!session)fail(401,'Connexion requise.');
  if(request.method!=='POST')fail(405,'Méthode non autorisée.');
  const data=await input(request);if(typeof data.subject!=='string'||typeof data.html!=='string'||data.html.length>20000)fail(400,'Notification invalide.');
  const p=JSON.parse((await readPortal(env)).payload);
  const internal=new Set([...Object.keys(p.auth?.accounts||{}),...admins]);
  if(data.to&&(!session!.admin||typeof data.to!=='string'||!internal.has(norm(data.to))))fail(403,'Destinataire non autorisé.');
  const id='notify:'+session!.email,now=Date.now();
  const limit=await env.BUDGETS_DB.prepare('INSERT INTO budgets_login_limits(id,attempts,until_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN until_at<? THEN 1 ELSE attempts+1 END,until_at=CASE WHEN until_at<? THEN excluded.until_at ELSE until_at END RETURNING attempts').bind(id,now+60000,now,now).first<{attempts:number}>();
  if(!limit||limit.attempts>20)fail(429,'Trop de notifications. Réessayez dans une minute.');
  return new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(data)});
}
