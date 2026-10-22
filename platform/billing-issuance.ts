import {createHash} from 'node:crypto';
import type {Database} from './contracts';
import type {BillingDraft,BillingKind,BillingTotals} from './billing-contracts';
import {billingId,validBillingDate,normalizeDraft,inspectDocumentReadiness,calculateBilling} from './billing-domain.ts';

const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
/** Identical JSON form in the Worker and Python: sorted object keys, preserved array order, UTF-8. */
export function billingCanonicalJSON(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(billingCanonicalJSON).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+billingCanonicalJSON((value as Record<string,unknown>)[key])).join(',')+'}';
 return JSON.stringify(value);
}
const id=(value:unknown)=>billingId(value)?value.toLowerCase():fail(400,'Identifiant de facturation invalide.');
const actor=(value:string)=>typeof value==='string'&&value.trim()&&value.length<=320?value:fail(400,'Auteur requis.');
const integer=(value:number,min:number,max:number)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const nowValue=(value:number)=>integer(value,0,8640000000000000)?value:fail(400,'Horodatage invalide.');
export interface NumberSeriesInput {
 id:string;issuerSiren:string;kind:BillingKind;prefix:string;width:number;firstValue:number;startDate:string;endDate:string;
}
interface SeriesRow {
 id:string;issuer_siren:string;kind:BillingKind;prefix:string;width:number;first_value:number;next_value:number;
 start_date:string;end_date:string;last_issue_date:string|null;version:number;created_at:string;created_by:string;
}
interface IssuanceRow {
 id:string;document_id:string;document_version:number;series_id:string;issuer_siren:string;sequence_value:number;
 number:string;issue_date:string;source_json:string;snapshot_json:string;totals_json:string;snapshot_sha256:string;created_at:string;created_by:string;
}
export interface Issuance {
 id:string;documentId:string;documentVersion:number;seriesId:string;issuerSiren:string;sequenceValue:number;
 number:string;issueDate:string;snapshot:BillingDraft;totals:BillingTotals;snapshotSha256:string;envelopeSha256:string;createdAt:string;createdBy:string;
}
export interface IssuanceJob {
 issuance_id:string;state:'pending'|'rendering'|'failed'|'ready';version:number;attempts:number;
 lease_token:string|null;lease_until:number|null;error_code:string|null;manifest_json:string|null;updated_at:string;updated_by:string;
}
export interface IssuanceArtifact {kind:'pdf'|'xml'|'validation'|'verapdf';key:string;sha256:string;size:number;contentType:string;}
export interface IssuanceManifest {schemaVersion:1;envelopeSha256:string;generatorVersion:string;profile:'quote-pdf'|'invoice-pdf'|'en16931';artifacts:IssuanceArtifact[];}
const unpack=(r:IssuanceRow):Issuance=>({id:r.id,documentId:r.document_id,documentVersion:r.document_version,seriesId:r.series_id,
 issuerSiren:r.issuer_siren,sequenceValue:r.sequence_value,number:r.number,issueDate:r.issue_date,snapshot:JSON.parse(r.snapshot_json),
 totals:JSON.parse(r.totals_json),snapshotSha256:r.snapshot_sha256,
 envelopeSha256:hash(billingCanonicalJSON({schemaVersion:1,id:r.id,documentId:r.document_id,version:r.document_version,issuerSiren:r.issuer_siren,number:r.number,issueDate:r.issue_date,snapshotSha256:r.snapshot_sha256})),
 createdAt:r.created_at,createdBy:r.created_by});
const readRow=(db:Database,issuanceId:string)=>db.prepare('SELECT * FROM billing_issuances WHERE id=?').bind(issuanceId).first<IssuanceRow>();
export const readIssuanceJob=(db:Database,issuanceId:string)=>db.prepare('SELECT * FROM billing_issue_jobs WHERE issuance_id=?').bind(id(issuanceId)).first<IssuanceJob>();
export async function readIssuance(db:Database,issuanceId:string){const row=await readRow(db,id(issuanceId));return row?unpack(row):null;}

/** Idempotent series creation; callers supply the complete numbering policy. */
export async function createNumberSeries(db:Database,input:NumberSeriesInput,user:string):Promise<SeriesRow>{
 if(!input||typeof input!=='object'||Object.keys(input).sort().join()!==['id','issuerSiren','kind','prefix','width','firstValue','startDate','endDate'].sort().join())return fail(400,'Paramètres de série invalides.');
 const seriesId=id(input.id);actor(user);
 if(typeof input.issuerSiren!=='string'||!/^\d{9}$/.test(input.issuerSiren)||!['invoice','quote'].includes(input.kind)||typeof input.prefix!=='string'||
  !/^[A-Z0-9][A-Z0-9_/-]{0,25}$/.test(input.prefix)||!integer(input.width,1,9)||!integer(input.firstValue,1,999999999)||
  typeof input.startDate!=='string'||typeof input.endDate!=='string'||!validBillingDate(input.startDate)||!validBillingDate(input.endDate)||input.endDate<input.startDate)return fail(422,'Émetteur, préfixe, compteur ou période de série invalide.');
 const find=()=>db.prepare('SELECT * FROM billing_number_series WHERE id=?').bind(seriesId).first<SeriesRow>();
 const same=(row:SeriesRow)=>row.issuer_siren===input.issuerSiren&&row.kind===input.kind&&row.prefix===input.prefix&&row.width===input.width&&row.first_value===input.firstValue&&row.start_date===input.startDate&&row.end_date===input.endDate;
 const existing=await find();if(existing){if(same(existing))return existing;return fail(409,'Cet identifiant désigne une autre série.');}
 try{
  const created=await db.prepare(`INSERT INTO billing_number_series(id,issuer_siren,kind,prefix,width,first_value,next_value,start_date,end_date,version,created_at,created_by)
   VALUES(?,?,?,?,?,?,?,?,?,1,?,?) RETURNING *`).bind(seriesId,input.issuerSiren,input.kind,input.prefix,input.width,input.firstValue,input.firstValue,input.startDate,input.endDate,new Date().toISOString(),user).first<SeriesRow>();
  if(created)return created;
 }catch(error){
  const retry=await find();if(retry&&same(retry))return retry;
  if(/BILLING_SERIES_OVERLAP|UNIQUE constraint/.test(String(error)))return fail(409,'Une série de cet émetteur utilise déjà ce préfixe ou cette période.');
  throw error;
 }
 return fail(503,'La série n’a pas pu être enregistrée.');
}

/** Atomic reservation boundary. The HTTP caller must first run the service preflight. */
export async function reserveIssuance(db:Database,input:{id:string;documentId:string;documentVersion:number;seriesId:string},user:string):Promise<Issuance>{
 if(!input||typeof input!=='object'||Object.keys(input).sort().join()!==['id','documentId','documentVersion','seriesId'].sort().join())return fail(400,'Demande d’émission invalide.');
 const issuanceId=id(input.id),documentId=id(input.documentId),seriesId=id(input.seriesId);actor(user);
 if(!integer(input.documentVersion,1,Number.MAX_SAFE_INTEGER))return fail(400,'Version de document invalide.');
 const replay=async()=>{
  const row=await readRow(db,issuanceId);
  if(row){if(row.document_id!==documentId||row.document_version!==input.documentVersion||row.series_id!==seriesId)return fail(409,'Cette tentative d’émission désigne un autre document ou une autre version.');return unpack(row);}
  return null;
 };
 const existing=await replay();if(existing)return existing;
 const source=await db.prepare('SELECT data_json,version FROM billing_documents WHERE id=?').bind(documentId).first<{data_json:string;version:number}>();
 if(!source)return fail(404,'Document introuvable.');if(source.version!==input.documentVersion)return fail(409,'Le document a changé avant la finalisation.');
 const snapshot=normalizeDraft(JSON.parse(source.data_json)),issues=inspectDocumentReadiness(snapshot);
 // Native v3 rendering is ready; issuance remains closed until the linked allocation ledger is installed.
 if(snapshot.creditNote)return fail(409,'La finalisation des avoirs nécessite le contrôle des montants déjà crédités sur la facture d’origine.');
 if(issues.length)throw Object.assign(new Error('Complétez le document avant la finalisation.'),{status:422,issues});
 // Electronic conversion is separate; this reservation binds the definitive PDF.
 const snapshotJSON=JSON.stringify(snapshot),totalsJSON=JSON.stringify(calculateBilling(snapshot));
 const snapshotHash=hash(billingCanonicalJSON({schemaVersion:1,document:snapshot,totals:JSON.parse(totalsJSON)}));
 const stamp=new Date().toISOString();
 try{
  // The SELECT and insert triggers run in one SQLite statement: no read/increment/write gap.
  const row=await db.prepare(`INSERT INTO billing_issuances(id,document_id,document_version,series_id,issuer_siren,sequence_value,number,issue_date,source_json,snapshot_json,totals_json,snapshot_sha256,created_at,created_by)
   SELECT ?,d.id,d.version,s.id,s.issuer_siren,coalesce(n.sequence_value,s.next_value),coalesce(n.number,s.prefix||(CASE WHEN EXISTS(SELECT 1 FROM billing_dated_series a WHERE a.series_id=s.id) THEN replace(?,'-','')||'-' ELSE '' END)||printf('%0*d',s.width,s.next_value)),?,?,?,?,?,?,?
   FROM billing_documents d JOIN billing_number_series s ON s.id=? LEFT JOIN billing_draft_numbers n ON n.document_id=d.id AND n.series_id=s.id WHERE d.id=? AND d.version=? AND d.data_json=?
   AND NOT EXISTS(SELECT 1 FROM billing_issuances WHERE document_id=d.id) RETURNING *`)
   .bind(issuanceId,snapshot.issueDate,snapshot.issueDate,source.data_json,snapshotJSON,totalsJSON,snapshotHash,stamp,user,seriesId,documentId,input.documentVersion,source.data_json).first<IssuanceRow>();
  if(row)return unpack(row);
 }catch(error){
  const retried=await replay();if(retried)return retried;
  if(/BILLING_REVISION_INACTIVE/.test(String(error)))return fail(409,'Cette version du devis a été remplacée ou abandonnée. Ouvrez la version en cours.');
  if(!/BILLING_RESERVATION_CONFLICT|UNIQUE constraint/.test(String(error)))throw error;
 }
 const retried=await replay();if(retried)return retried;
 return fail(409,'Réservation impossible : document déjà figé, version modifiée, série absente, épuisée, incompatible ou date antérieure au dernier numéro.');
}

/** Each worker attempt has a new fencing token. Expired workers cannot publish or fail a newer attempt. */
export async function claimIssuanceJob(db:Database,issuanceId:string,leaseToken:string,user:string,now=Date.now(),leaseMs=120000):Promise<IssuanceJob|null>{
 actor(user);nowValue(now);if(!integer(leaseMs,1000,600000)||now+leaseMs>8640000000000000)return fail(400,'Durée de traitement invalide.');
 return db.prepare(`UPDATE billing_issue_jobs SET state='rendering',version=version+1,attempts=attempts+1,lease_token=?,lease_until=?,error_code=NULL,updated_at=?,updated_by=?
  WHERE issuance_id=? AND (state IN ('pending','failed') OR (state='rendering' AND lease_until<=?)) RETURNING *`)
  .bind(id(leaseToken),now+leaseMs,new Date(now).toISOString(),user,id(issuanceId),now).first<IssuanceJob>();
}
export async function failIssuanceJob(db:Database,issuanceId:string,leaseToken:string,code:'render'|'validation'|'storage'|'unavailable',user:string,now=Date.now()):Promise<boolean>{
 actor(user);nowValue(now);if(!['render','validation','storage','unavailable'].includes(code))return fail(400,'Code d’échec invalide.');
 const row=await db.prepare(`UPDATE billing_issue_jobs SET state='failed',version=version+1,lease_token=NULL,lease_until=NULL,error_code=?,updated_at=?,updated_by=?
  WHERE issuance_id=? AND state='rendering' AND lease_token=? AND lease_until>? RETURNING issuance_id`)
  .bind(code,new Date(now).toISOString(),user,id(issuanceId),id(leaseToken),now).first();
 return !!row;
}
function validateManifest(raw:IssuanceManifest,issuance:Issuance):string{
 if(!raw||typeof raw!=='object'||Object.keys(raw).sort().join()!==['schemaVersion','envelopeSha256','generatorVersion','profile','artifacts'].sort().join()||
  raw.schemaVersion!==1||raw.envelopeSha256!==issuance.envelopeSha256||typeof raw.generatorVersion!=='string'||!/^[-A-Za-z0-9._+]{1,100}$/.test(raw.generatorVersion)||
  !(issuance.snapshot.kind==='quote'?raw.profile==='quote-pdf':['invoice-pdf','en16931'].includes(raw.profile))||!Array.isArray(raw.artifacts))return fail(422,'Manifeste documentaire invalide.');
 const required=raw.profile==='en16931'?['pdf','xml','validation','verapdf']:['pdf'];
 if(raw.artifacts.length!==required.length||raw.artifacts.map(a=>a?.kind).sort().join()!==required.sort().join())return fail(422,'Les fichiers et rapports requis sont incomplets.');
 for(const file of raw.artifacts){
  const mime={pdf:'application/pdf',xml:'application/xml',validation:'application/json',verapdf:'application/xml'}[file.kind];
  // Content-addressed paths are internal to the private bucket, never URLs or user-selected paths.
  if(Object.keys(file).sort().join()!==['kind','key','sha256','size','contentType'].sort().join()||
   typeof file.sha256!=='string'||!/^[a-f0-9]{64}$/.test(file.sha256)||!integer(file.size,1,20*1024*1024)||file.contentType!==mime||
   file.key!==`billing/${issuance.id}/${file.kind}/${file.sha256}`)return fail(422,'Référence de fichier invalide.');
 }
 return JSON.stringify(raw);
}
/** Call only after writing and verifying all artifacts in private storage. A manifest is not proof of a bucket write. */
export async function completeIssuanceJob(db:Database,issuanceId:string,leaseToken:string,manifest:IssuanceManifest,user:string,now=Date.now()):Promise<boolean>{
 actor(user);nowValue(now);const issuance=await readIssuance(db,issuanceId);if(!issuance)return fail(404,'Émission introuvable.');
 const manifestJSON=validateManifest(manifest,issuance);
 const row=await db.prepare(`UPDATE billing_issue_jobs SET state='ready',version=version+1,lease_token=NULL,lease_until=NULL,manifest_json=?,updated_at=?,updated_by=?
  WHERE issuance_id=? AND state='rendering' AND lease_token=? AND lease_until>? RETURNING issuance_id`)
  .bind(manifestJSON,new Date(now).toISOString(),user,issuance.id,id(leaseToken),now).first();
 return !!row;
}
