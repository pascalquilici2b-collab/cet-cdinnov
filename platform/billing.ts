import {createHash} from 'node:crypto';
import type {Database,Environment,Reply} from './contracts';
import type {BillingContext,BillingDocument,BillingDraft,BillingIssue,BillingTotals,BillingSettings} from './billing-contracts';
import {normalizeDraft,calculateBilling,inspectDraft,blankSettings,normalizeSettings} from './billing-domain';
import {sessionIdentity} from './identity';
import {boundedBody} from './portal';
import {draftPDF} from './billing-pdf';

interface Row {
 id:string; kind:'invoice'|'quote'; status:'draft'; version:number; data_json:string;
 totals_json:string|null; issues_json:string; create_hash:string; source_document_id:string|null;
 source_version:number|null; created_at:string; updated_at:string; created_by:string; updated_by:string;
}
type ObjectValue=Record<string,unknown>;
const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
const object=(v:unknown):v is ObjectValue=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const text=(v:unknown)=>typeof v==='string'?v:'';
const document=(r:Row):BillingDocument=>({id:r.id,version:r.version,status:r.status,data:normalizeDraft(JSON.parse(r.data_json)),
 sourceDocumentId:r.source_document_id,createdAt:r.created_at,updatedAt:r.updated_at,createdBy:r.created_by,updatedBy:r.updated_by,
 totals:r.totals_json===null?null:JSON.parse(r.totals_json),issues:JSON.parse(r.issues_json)});
const get=(db:Database,id:string)=>db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(id).first<Row>();
const conflict=()=>fail(409,'Ce document a changé ou cet identifiant est déjà utilisé. Rechargez le document avant de continuer.');
function expectedVersion(request:Request,allowZero=false):number {
 const value=request.headers.get('if-match');
 if(value===null)return fail(428,'La version du document est requise pour enregistrer cette modification.');
 if(!(allowZero?/^(0|[1-9]\d*)$/:/^[1-9]\d*$/).test(value)||!Number.isSafeInteger(Number(value)))return fail(400,'Version du document invalide.');
 return Number(value);
}
async function body(request:Request,keys:string[]):Promise<ObjectValue> {
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return fail(415,'Format JSON requis.');
 const bytes=await boundedBody(request,300000);
 let value:unknown;
 try {value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));} catch {return fail(400,'Données JSON invalides.');}
 if(!object(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!keys.includes(k)))return fail(400,'Champs de requête invalides.');
 return value;
}
function prepared(raw:unknown):{data:BillingDraft;dataJSON:string;totalsJSON:string|null;issuesJSON:string} {
 let data:BillingDraft;
 try {data=normalizeDraft(raw);} catch(error) {return fail(400,error instanceof Error?error.message:'Brouillon invalide.');}
 const issues:BillingIssue[]=inspectDraft(data);
 let totals:BillingTotals|null=null;
 // An unfinished decimal input remains a valid draft, but is never reported as a zero amount.
 try {totals=calculateBilling(data);} catch { /* inspectDraft reports unresolved calculation fields. */ }
 return {data,dataJSON:JSON.stringify(data),totalsJSON:totals===null?null:JSON.stringify(totals),issuesJSON:JSON.stringify(issues)};
}
async function readSettings(db:Database):Promise<BillingSettings>{
 const row=await db.prepare("SELECT version,data_json,updated_at FROM billing_settings WHERE id='default'").first<{version:number;data_json:string;updated_at:string}>();
 return row?{version:row.version,data:normalizeSettings(JSON.parse(row.data_json)),updatedAt:row.updated_at}:{version:0,data:blankSettings(),updatedAt:null};
}
async function settingsRoute(request:Request,db:Database,email:string,reply:Reply){
 if(request.method==='GET')return reply(200,await readSettings(db));
 if(request.method!=='PUT')return reply(405,{error:'Méthode non autorisée.'});
 const expected=expectedVersion(request,true),input=await body(request,['data']);
 let data;try{data=normalizeSettings(input.data);}catch(e){return fail(400,(e as Error).message);}
 const stamp=new Date().toISOString(),json=JSON.stringify(data);
 const row=expected===0?
  await db.prepare("INSERT INTO billing_settings(id,version,data_json,updated_at,updated_by) VALUES('default',1,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING version,data_json,updated_at").bind(json,stamp,email).first<{version:number;data_json:string;updated_at:string}>():
  await db.prepare("UPDATE billing_settings SET version=version+1,data_json=?,updated_at=?,updated_by=? WHERE id='default' AND version=? RETURNING version,data_json,updated_at").bind(json,stamp,email,expected).first<{version:number;data_json:string;updated_at:string}>();
 if(!row)return fail(409,'Les paramètres ont été modifiés depuis leur ouverture. Votre saisie est conservée ; rechargez la version du serveur avant de réessayer.');
 return reply(200,{version:row.version,data:JSON.parse(row.data_json),updatedAt:row.updated_at});
}
async function context(db:Database):Promise<BillingContext> {
 // Read only the allowed business columns. Account verifiers and portal authentication never enter this response.
 const [clients,codes,markets,settings]=await Promise.all([
  db.prepare('SELECT data_json FROM budget_clients ORDER BY position,record_key').all<{data_json:string}>(),
  db.prepare('SELECT data_json FROM portal_business_codes ORDER BY position,record_key').all<{data_json:string}>(),
  db.prepare('SELECT id,payload FROM markets ORDER BY updated_at DESC,id').all<{id:string;payload:string}>(),readSettings(db)
 ]);
 return {
  clients:clients.results.map(r=>JSON.parse(r.data_json)).filter(object).map(r=>({id:text(r.id),name:text(r.name)})).filter(r=>r.id&&r.name),
  businessCodes:codes.results.map(r=>JSON.parse(r.data_json)).filter(object).map(r=>({id:text(r.id),code:[r.code1,r.code2].filter(v=>typeof v==='number'||(typeof v==='string'&&v)).join(' '),label:text(r.label),client:text(r.client)})).filter(r=>r.id),
  markets:markets.results.map(r=>{const p=JSON.parse(r.payload);return {id:r.id,title:text(p.title),reference:text(p.reference),clientName:text(p.clientName)};}),
  seller:settings.data.seller,settings
 };
}
function pageParameter(params:URLSearchParams,name:string,fallback:number,max:number,min=0) {
 const value=params.get(name);if(value===null)return fallback;
 if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)return fail(400,'Paramètres de pagination invalides.');
 return Number(value);
}
async function list(request:Request,db:Database,reply:Reply) {
 const params=new URL(request.url).searchParams,kind=params.get('kind'),q=params.get('q')||'';
 if([...params.keys()].some(k=>!['kind','q','limit','offset'].includes(k))||[...new Set(params.keys())].some(k=>params.getAll(k).length>1)||
  (kind!==null&&kind!=='quote'&&kind!=='invoice')||q.length>200)return fail(400,'Filtres de recherche invalides.');
 const limit=pageParameter(params,'limit',25,100,1),offset=pageParameter(params,'offset',0,1000000);
 // Bound parameters and instr keep wildcard/SQL characters literal.
 const where="(? IS NULL OR kind=?) AND (?='' OR instr(lower(json_extract(data_json,'$.title')),lower(?))>0 OR instr(lower(json_extract(data_json,'$.buyer.name')),lower(?))>0 OR instr(lower(json_extract(data_json,'$.references.businessCode')),lower(?))>0)";
 const bindings=[kind,kind,q,q,q,q];
 // One statement gives the count and requested page from the same database snapshot, including empty pages.
 const row=await db.prepare(`SELECT (SELECT count(*) FROM billing_documents WHERE ${where}) AS total,
  (SELECT json_group_array(json(row_json)) FROM (SELECT json_object('id',id,'kind',kind,'status',status,'version',version,'data_json',data_json,'totals_json',totals_json,'issues_json',issues_json,'source_document_id',source_document_id,'created_at',created_at,'updated_at',updated_at,'created_by',created_by,'updated_by',updated_by) AS row_json
  FROM billing_documents WHERE ${where} ORDER BY updated_at DESC,id LIMIT ? OFFSET ?)) AS rows_json`).bind(...bindings,...bindings,limit,offset).first<{total:number;rows_json:string}>();
 return reply(200,{documents:JSON.parse(row?.rows_json||'[]').map(document),total:row?.total||0,limit,offset});
}

/** Dedicated draft API. Issuance and invoice numbering are separate future transitions. */
export async function billingRoute(request:Request,env:Environment,reply:Reply):Promise<Response> {
 const session=await sessionIdentity(request,env);
 if(!session)return reply(401,{error:'Votre connexion CDInnov a expiré. Reconnectez-vous.'});
 if(!session.admin)return reply(403,{error:'La facturation est réservée à la direction.'});
 const path=new URL(request.url).pathname,db=env.BUDGETS_DB.withSession('first-primary');
 if(path==='/api/v1/billing/settings')return settingsRoute(request,db,session.email,reply);
 if(path==='/api/v1/billing/context')return request.method==='GET'?reply(200,await context(db)):reply(405,{error:'Méthode non autorisée.'});
 if(path==='/api/v1/billing/documents') {
  if(request.method==='GET')return list(request,db,reply);
  if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
  const input=await body(request,['id','data']);if(!uuid(input.id))return fail(400,'Identifiant de document invalide.');
  const id=input.id.toLowerCase(),p=prepared(input.data),hash=digest(p.dataJSON),stamp=new Date().toISOString();
  const created=await db.prepare(`INSERT INTO billing_documents(id,kind,status,version,data_json,totals_json,issues_json,create_hash,created_at,updated_at,created_by,updated_by)
   VALUES(?,?,'draft',1,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING *`).bind(id,p.data.kind,p.dataJSON,p.totalsJSON,p.issuesJSON,hash,stamp,stamp,session.email,session.email).first<Row>();
  if(created)return reply(201,document(created));
  const existing=await get(db,id);
  if(!existing||existing.source_document_id!==null)return conflict();
  if(existing.create_hash!==hash){
   const initial=await db.prepare('SELECT data_json FROM billing_document_versions WHERE document_id=? AND version=1').bind(id).first<{data_json:string}>();
   if(!initial||digest(JSON.stringify(normalizeDraft(JSON.parse(initial.data_json))))!==hash)return conflict();
  }
  return reply(200,document(existing));
 }
 const match=path.match(/^\/api\/v1\/billing\/documents\/([^/]+)(\/convert|\/preview\.pdf)?$/);
 if(!match)return reply(404,{error:'Accès de facturation introuvable.'});
 if(!uuid(match[1]))return fail(400,'Identifiant de document invalide.');
 const id=match[1].toLowerCase();
 if(match[2]==='/preview.pdf'){
  if(request.method!=='GET')return reply(405,{error:'Méthode non autorisée.'});
  const expected=expectedVersion(request),row=await get(db,id);
  if(!row)return reply(404,{error:'Document introuvable.'});
  if(row.version!==expected)return conflict();
  return draftPDF(document(row),env,reply);
 }
 if(!match[2]&&request.method==='GET'){
  const row=await get(db,id);return row?reply(200,document(row)):reply(404,{error:'Document introuvable.'});
 }
 if(!match[2]&&request.method==='PUT') {
  const expected=expectedVersion(request),input=await body(request,['data']),p=prepared(input.data);
  const saved=await db.prepare(`UPDATE billing_documents SET version=version+1,data_json=?,totals_json=?,issues_json=?,updated_at=?,updated_by=?
   WHERE id=? AND version=? AND kind=? AND status='draft' RETURNING *`).bind(p.dataJSON,p.totalsJSON,p.issuesJSON,new Date().toISOString(),session.email,id,expected,p.data.kind).first<Row>();
  if(saved)return reply(200,document(saved));
  const existing=await get(db,id);if(!existing)return reply(404,{error:'Document introuvable.'});
  if(existing.kind!==p.data.kind)return fail(400,'Le type du document ne peut pas être modifié. Utilisez la conversion du devis.');
  return conflict();
 }
 if(match[2]&&request.method==='POST') {
  const expected=expectedVersion(request),input=await body(request,['id']);
  if(!uuid(input.id)||input.id.toLowerCase()===id)return fail(400,'Identifiant de facture invalide.');
  const targetId=input.id.toLowerCase(),source=await get(db,id);
  if(!source)return reply(404,{error:'Devis introuvable.'});
  if(source.kind!=='quote')return fail(400,'Seul un devis peut être converti en facture.');
  const retry=await get(db,targetId);
  if(retry) {
   if(retry.source_document_id===id&&retry.source_version===expected)return reply(200,document(retry));
   return conflict();
  }
  if(source.version!==expected)return conflict();
  const p=prepared({...JSON.parse(source.data_json),kind:'invoice',validUntil:''}),stamp=new Date().toISOString();
  let created:Row|null;
  try {
   created=await db.prepare(`INSERT INTO billing_documents(id,kind,status,version,data_json,totals_json,issues_json,create_hash,source_document_id,source_version,created_at,updated_at,created_by,updated_by)
    SELECT ?,'invoice','draft',1,?,?,?,?,id,version,?,?,?,? FROM billing_documents WHERE id=? AND version=? AND kind='quote' AND status='draft'
    ON CONFLICT DO NOTHING RETURNING *`).bind(targetId,p.dataJSON,p.totalsJSON,p.issuesJSON,digest(p.dataJSON),stamp,stamp,session.email,session.email,id,expected).first<Row>();
  } catch(error) {
   if(String(error).includes('BILLING_SOURCE_VERSION'))return conflict();throw error;
  }
  if(created)return reply(201,document(created));
  const existing=await get(db,targetId);
  if(existing?.source_document_id===id&&existing.source_version===expected)return reply(200,document(existing));
  return fail(409,'Ce devis a changé ou a déjà été converti intégralement en facture.');
 }
 return reply(405,{error:'Méthode non autorisée.'});
}
