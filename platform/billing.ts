import {createHash} from 'node:crypto';
import type {Database,Environment,Reply} from './contracts';
import type {BillingContext,BillingDocument,BillingDraft,BillingIssue,BillingTotals,BillingSettings,BillingIssuanceSummary,BillingQuoteSummary} from './billing-contracts';
import {normalizeDraft,calculateBilling,inspectDraft,blankSettings,normalizeSettings} from './billing-domain';
import {sessionIdentity} from './identity';
import {boundedBody} from './portal';
import {draftPDF} from './billing-pdf';
import {createNumberSeries,reserveIssuance} from './billing-issuance';
import {preflightIssuance,generateIssuance,issuedFile} from './billing-generation';
import {billingDirectoryRoute} from './billing-directory';
import {billingQuoteRoute,quoteJSON} from './billing-quote';
import {billingPaymentRoute,settlementJSON} from './billing-payments';
import {createQuoteRevision,abandonQuoteRevision,quoteVersions} from './billing-revisions';

interface Row {
 id:string; kind:'invoice'|'quote'; status:'draft'; version:number; data_json:string;
 totals_json:string|null; issues_json:string; create_hash:string; source_document_id:string|null;
 source_version:number|null; created_at:string; updated_at:string; created_by:string; updated_by:string;
 issuance_json?:string|null; quote_json?:string|null; settlement_json?:string|null;
}
type ObjectValue=Record<string,unknown>;
const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
const object=(v:unknown):v is ObjectValue=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const text=(v:unknown)=>typeof v==='string'?v:'';
const document=(r:Row):BillingDocument=>{const issuance:BillingIssuanceSummary|null=r.issuance_json?(typeof r.issuance_json==='string'?JSON.parse(r.issuance_json):r.issuance_json):null;return {id:r.id,version:r.version,status:issuance?(issuance.state==='ready'?'issued':issuance.state==='failed'?'issue_failed':'finalizing'):'draft',issuance,quote:r.quote_json?(typeof r.quote_json==='string'?JSON.parse(r.quote_json):r.quote_json) as BillingQuoteSummary:null,data:normalizeDraft(JSON.parse(r.data_json)),
 settlement:r.settlement_json?JSON.parse(r.settlement_json):null,sourceDocumentId:r.source_document_id,createdAt:r.created_at,updatedAt:r.updated_at,createdBy:r.created_by,updatedBy:r.updated_by,
 totals:r.totals_json===null?null:JSON.parse(r.totals_json),issues:JSON.parse(r.issues_json)};};
const issuanceJSON=`(SELECT json_object('id',i.id,'number',i.number,'state',j.state,'attempts',j.attempts,'errorCode',j.error_code,'createdAt',i.created_at,'updatedAt',j.updated_at,
 'files',json(CASE WHEN j.state='ready' THEN (SELECT json_group_array(json_extract(value,'$.kind')) FROM json_each(j.manifest_json,'$.artifacts')) ELSE '[]' END))
 FROM billing_issuances i JOIN billing_issue_jobs j ON j.issuance_id=i.id WHERE i.document_id=billing_documents.id)`;
const get=(db:Database,id:string)=>db.prepare(`SELECT *,${issuanceJSON} AS issuance_json,${quoteJSON()} AS quote_json,${settlementJSON()} AS settlement_json FROM billing_documents WHERE id=?`).bind(id).first<Row>();
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
  // Linked credit creation must use its own allocation boundary, never a free-form invoice POST/PUT.
  if(data.creditNote)return fail(409,'Créez un avoir depuis sa facture d’origine. Le parcours lié doit être disponible avant sa saisie.');
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
 const params=new URL(request.url).searchParams,kind=params.get('kind'),q=params.get('q')||'',state=params.get('state')||'all';
 const paymentStates=['unpaid','partial','paid','overpaid','overdue'];
 const quoteStates=['prepared','sent','accepted','refused','expired','previous','abandoned'];
 if([...params.keys()].some(k=>!['kind','q','limit','offset','state'].includes(k))||[...new Set(params.keys())].some(k=>params.getAll(k).length>1)||
  (kind!==null&&kind!=='quote'&&kind!=='invoice')||q.length>200||!['all','draft','issued','finalizing','issue_failed',...quoteStates,...paymentStates].includes(state)||(quoteStates.includes(state)&&kind!=='quote')||(paymentStates.includes(state)&&kind!=='invoice'))return fail(400,'Filtres de recherche invalides.');
 const limit=pageParameter(params,'limit',25,100,1),offset=pageParameter(params,'offset',0,1000000);
 // Count and page share one snapshot. Search characters remain literal, including SQL wildcards.
 const row=await db.prepare(`WITH enriched AS (
  SELECT *,${issuanceJSON} AS issuance_json,${quoteJSON()} AS quote_json,${settlementJSON()} AS settlement_json FROM billing_documents WHERE (? IS NULL OR kind=?)
 ), classified AS (SELECT *,CASE WHEN json_extract(issuance_json,'$.state')='ready' THEN 'issued' WHEN json_extract(issuance_json,'$.state')='failed' THEN 'issue_failed' WHEN issuance_json IS NOT NULL THEN 'finalizing' ELSE 'draft' END AS effective_status FROM enriched),
 filtered AS (SELECT * FROM classified WHERE (CASE
  WHEN ?='previous' THEN kind='quote' AND json_extract(quote_json,'$.revision.currentId')<>id AND json_extract(quote_json,'$.revision.abandoned')=0
  WHEN ?='abandoned' THEN kind='quote' AND json_extract(quote_json,'$.revision.abandoned')=1
  ELSE (kind<>'quote' OR (?='all' AND ?<>'') OR (json_extract(quote_json,'$.revision.currentId')=id AND json_extract(quote_json,'$.revision.abandoned')=0))
   AND (?='all' OR effective_status=? OR (effective_status='issued' AND json_extract(quote_json,'$.state')=?) OR (effective_status='issued' AND (json_extract(settlement_json,'$.state')=? OR (?='overdue' AND json_extract(settlement_json,'$.overdue')=1)))) END)
  AND (?='' OR instr(lower(json_extract(data_json,'$.title')),lower(?))>0 OR instr(lower(json_extract(data_json,'$.buyer.name')),lower(?))>0 OR instr(lower(json_extract(data_json,'$.references.businessCode')),lower(?))>0 OR instr(lower(json_extract(issuance_json,'$.number')),lower(?))>0))
 SELECT (SELECT count(*) FROM filtered) AS total,(SELECT json_group_array(json(row_json)) FROM (
 SELECT json_object('id',id,'kind',kind,'status',status,'version',version,'data_json',data_json,'totals_json',totals_json,'issues_json',issues_json,'source_document_id',source_document_id,'created_at',created_at,'updated_at',updated_at,'created_by',created_by,'updated_by',updated_by,'issuance_json',issuance_json,'quote_json',quote_json,'settlement_json',settlement_json) AS row_json
 FROM filtered ORDER BY updated_at DESC,id LIMIT ? OFFSET ?)) AS rows_json`).bind(kind,kind,state,state,state,q,state,state,state,state,state,q,q,q,q,q,limit,offset).first<{total:number;rows_json:string}>();
 return reply(200,{documents:JSON.parse(row?.rows_json||'[]').map(document),total:row?.total||0,limit,offset});
}

/** Dedicated billing API; the reservation ledger controls the effective state of each document. */
export async function billingRoute(request:Request,env:Environment,reply:Reply):Promise<Response> {
 const session=await sessionIdentity(request,env);
 if(!session)return reply(401,{error:'Votre connexion CDInnov a expiré. Reconnectez-vous.'});
 if(!session.admin)return reply(403,{error:'La facturation est réservée à la direction.'});
 const path=new URL(request.url).pathname,db=env.BUDGETS_DB.withSession('first-primary');
 if(/^\/api\/v1\/billing\/(clients|services)(?:\/|$)/.test(path))return billingDirectoryRoute(request,db,session.email,reply);
 if(path==='/api/v1/billing/settings')return settingsRoute(request,db,session.email,reply);
 if(path==='/api/v1/billing/number-series'){
  if(request.method==='GET')return reply(200,(await db.prepare('SELECT id,issuer_siren,kind,prefix,width,first_value,next_value,start_date,end_date,last_issue_date,version FROM billing_number_series ORDER BY start_date DESC,kind,id').all()).results);
  if(request.method==='POST'){const input=await body(request,['data']);return reply(201,await createNumberSeries(db,input.data as Parameters<typeof createNumberSeries>[1],session.email));}
  return reply(405,{error:'Méthode non autorisée.'});
 }
 if(path==='/api/v1/billing/context')return request.method==='GET'?reply(200,await context(db)):reply(405,{error:'Méthode non autorisée.'});
 if(path==='/api/v1/billing/documents') {
  if(request.method==='GET')return list(request,db,reply);
  if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
  const input=await body(request,['id','data']);if(!uuid(input.id))return fail(400,'Identifiant de document invalide.');
  const id=input.id.toLowerCase(),p=prepared(input.data),hash=digest(p.dataJSON),stamp=new Date().toISOString();
  const created=await db.prepare(`INSERT INTO billing_documents(id,kind,status,version,data_json,totals_json,issues_json,create_hash,created_at,updated_at,created_by,updated_by)
   VALUES(?,?,'draft',1,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING *`).bind(id,p.data.kind,p.dataJSON,p.totalsJSON,p.issuesJSON,hash,stamp,stamp,session.email,session.email).first<Row>();
  if(created)return reply(201,document(created.kind==='quote'?(await get(db,created.id))!:created));
  const existing=await get(db,id);
  if(!existing||existing.source_document_id!==null)return conflict();
  if(existing.create_hash!==hash){
   const initial=await db.prepare('SELECT data_json FROM billing_document_versions WHERE document_id=? AND version=1').bind(id).first<{data_json:string}>();
   if(!initial||digest(JSON.stringify(normalizeDraft(JSON.parse(initial.data_json))))!==hash)return conflict();
  }
  return reply(200,document(existing));
 }
 const match=path.match(/^\/api\/v1\/billing\/documents\/([^/]+)(\/payments|\/quote-versions|\/revise|\/abandon-revision|\/quote-events|\/convert|\/preview\.pdf|\/issue|\/finalize|\/files\/(?:pdf|xml|validation|verapdf))?$/);
 if(!match)return reply(404,{error:'Accès de facturation introuvable.'});
 if(!uuid(match[1]))return fail(400,'Identifiant de document invalide.');
 const id=match[1].toLowerCase();
 if(match[2]==='/quote-versions'||match[2]==='/revise'||match[2]==='/abandon-revision'){
  const row=await get(db,id);if(!row)return reply(404,{error:'Devis introuvable.'});const current=document(row);
  if(match[2]==='/quote-versions'){
   if(request.method!=='GET')return reply(405,{error:'Méthode non autorisée.'});
   const params=new URL(request.url).searchParams;if([...params.keys()].some(k=>k!=='before')||params.getAll('before').length>1)return fail(400,'Page de versions invalide.');
   const before=pageParameter(params,'before',Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,1);
   return reply(200,await quoteVersions(db,current,before));
  }
  if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
  const expected=expectedVersion(request),input=await body(request,['id','familyVersion','reason']);
  if(match[2]==='/revise'){const result=await createQuoteRevision(db,current,expected,input,session.email);return reply(result.created?201:200,document((await get(db,result.id))!));}
  await abandonQuoteRevision(db,current,expected,input,session.email);return reply(200,document((await get(db,id))!));
 }
 if(match[2]==='/payments'){
  const row=await get(db,id);if(!row)return reply(404,{error:'Facture introuvable.'});
  return billingPaymentRoute(request,db,document(row),session.email,reply,async()=>document((await get(db,id))!));
 }
 if(match[2]==='/quote-events'){
  const row=await get(db,id);if(!row)return reply(404,{error:'Devis introuvable.'});
  return billingQuoteRoute(request,db,document(row),session.email,reply,async()=>document((await get(db,id))!));
 }
 if(match[2]==='/issue'||match[2]==='/finalize'){
  if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
  const expected=expectedVersion(request),input=await body(request,match[2]==='/issue'?['id','seriesId']:[]),row=await get(db,id);
  if(!row)return reply(404,{error:'Document introuvable.'});if(row.version!==expected)return conflict();
  const current=document(row);
  if(match[2]==='/issue'){
   if(!uuid(input.id)||!uuid(input.seriesId))return fail(400,'Identifiant de finalisation ou de série invalide.');
   if(!current.issuance&&current.quote&&(current.quote.revision.abandoned||current.quote.revision.currentId!==current.id))return fail(409,'Cette version du devis a été remplacée ou abandonnée. Ouvrez la version en cours.');
   if(!current.issuance)await preflightIssuance(env,current.data);
   await reserveIssuance(db,{id:input.id,documentId:id,documentVersion:expected,seriesId:input.seriesId},session.email);
  }else{
   if(!current.issuance)return fail(409,'Réservez le numéro du document avant sa génération.');
   await generateIssuance(db,env,current.issuance.id,session.email);
  }
  return reply(200,document((await get(db,id))!));
 }
 if(match[2]?.startsWith('/files/')){
  if(request.method!=='GET')return reply(405,{error:'Méthode non autorisée.'});
  const row=await get(db,id);if(!row)return reply(404,{error:'Document introuvable.'});
  const current=document(row);if(!current.issuance)return fail(409,'Ce document n’est pas émis.');
  return issuedFile(db,env,current.issuance.id,match[2].slice('/files/'.length),reply);
 }
 if(match[2]==='/preview.pdf'){
  if(request.method!=='GET')return reply(405,{error:'Méthode non autorisée.'});
  const expected=expectedVersion(request),row=await get(db,id);
  if(!row)return reply(404,{error:'Document introuvable.'});
  if(row.version!==expected)return conflict();
  if(row.issuance_json)return fail(409,'Le document est figé. Utilisez son fichier définitif dès qu’il est disponible.');
  return draftPDF(document(row),env,reply);
 }
 if(!match[2]&&request.method==='GET'){
  const row=await get(db,id);return row?reply(200,document(row)):reply(404,{error:'Document introuvable.'});
 }
 if(!match[2]&&request.method==='PUT') {
  const expected=expectedVersion(request),input=await body(request,['data']),p=prepared(input.data);
  const saved=await db.prepare(`UPDATE billing_documents SET version=version+1,data_json=?,totals_json=?,issues_json=?,updated_at=?,updated_by=?
   WHERE id=? AND version=? AND kind=? AND status='draft' AND NOT EXISTS(SELECT 1 FROM billing_issuances WHERE document_id=billing_documents.id) AND NOT EXISTS(SELECT 1 FROM billing_quote_revisions WHERE document_id=billing_documents.id AND abandoned_at IS NOT NULL) RETURNING *`).bind(p.dataJSON,p.totalsJSON,p.issuesJSON,new Date().toISOString(),session.email,id,expected,p.data.kind).first<Row>();
  if(saved)return reply(200,document((await get(db,saved.id))!));
  const existing=await get(db,id);if(!existing)return reply(404,{error:'Document introuvable.'});
  if(existing.kind!==p.data.kind)return fail(400,'Le type du document ne peut pas être modifié. Utilisez la conversion du devis.');
  if(document(existing).quote?.revision.abandoned)return fail(409,'Cette version a été abandonnée et reste consultable. Ouvrez la version en cours pour poursuivre.');
  if(existing.issuance_json)return fail(409,'Ce document est figé et ne peut plus être modifié. Créez un document correctif.');
  return conflict();
 }
 if(match[2]==='/convert'&&request.method==='POST') {
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
   if(String(error).includes('BILLING_REVISION_INACTIVE'))return fail(409,'Utilisez la version en cours du devis. Une facture peut déjà être liée à cette proposition.');
   if(String(error).includes('BILLING_QUOTE_ACCEPTANCE_REQUIRED'))return fail(409,'Enregistrez l’accord du client avant de facturer ce devis émis.');
   if(String(error).includes('BILLING_SOURCE_VERSION'))return conflict();throw error;
  }
  if(created)return reply(201,document(created.kind==='quote'?(await get(db,created.id))!:created));
  const existing=await get(db,targetId);
  if(existing?.source_document_id===id&&existing.source_version===expected)return reply(200,document(existing));
  return fail(409,'Ce devis a changé ou a déjà été converti intégralement en facture.');
 }
 return reply(405,{error:'Méthode non autorisée.'});
}
