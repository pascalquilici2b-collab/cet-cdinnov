import {createHash,randomUUID} from 'node:crypto';
import type {Database} from './contracts';
import type {BillingDocument,BillingQuoteRevisionItem} from './billing-contracts';
import {billingId,calculateBilling,inspectDraft,normalizeDraft} from './billing-domain';
import {billingToday} from './billing-quote-domain';
import {revisionRoot} from './billing-revision-schema.mjs';

const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
const conflict=()=>fail(409,'Les versions de ce devis ont changé, ou une facture est déjà liée. Actualisez le devis avant de continuer.');
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function revisionJSON(){return `(SELECT json_object('rootId',coalesce(f.root_document_id,billing_documents.id),'familyVersion',coalesce(f.version,0),
 'ordinal',coalesce(r.ordinal,1),'count',coalesce(f.next_ordinal-1,1),'parentId',r.parent_document_id,'parentNumber',pi.number,'reason',coalesce(r.reason,''),
 'abandoned',json(CASE WHEN r.abandoned_at IS NULL THEN 'false' ELSE 'true' END),'abandonReason',r.abandon_reason,
 'currentId',coalesce(f.current_document_id,billing_documents.id),'currentOrdinal',coalesce(cr.ordinal,1),'currentNumber',ci.number,
 'currentState',CASE WHEN cj.state='ready' THEN 'issued' WHEN cj.state='failed' THEN 'issue_failed' WHEN ci.id IS NOT NULL THEN 'finalizing' ELSE 'draft' END)
 FROM (SELECT 1) LEFT JOIN billing_quote_revisions r ON r.document_id=billing_documents.id
 LEFT JOIN billing_quote_families f ON f.root_document_id=coalesce(r.root_document_id,billing_documents.id)
 LEFT JOIN billing_issuances pi ON pi.document_id=r.parent_document_id
 LEFT JOIN billing_quote_revisions cr ON cr.document_id=f.current_document_id
 LEFT JOIN billing_issuances ci ON ci.document_id=coalesce(f.current_document_id,billing_documents.id) LEFT JOIN billing_issue_jobs cj ON cj.issuance_id=ci.id)`;}

function intent(record:BillingDocument,expected:number,raw:Record<string,unknown>){
 if(record.data.kind!=='quote')return fail(400,'Les révisions concernent uniquement les devis.');
 if(!billingId(raw.id)||typeof raw.reason!=='string'||!raw.reason.trim()||raw.reason.length>2000||!Number.isSafeInteger(raw.familyVersion)||(raw.familyVersion as number)<0)return fail(400,'Identifiant, version du suivi ou motif de révision invalide.');
 const reason=raw.reason.trim().normalize('NFC'),id=raw.id.toLowerCase(),familyVersion=raw.familyVersion as number;
 return {id,reason,familyVersion,hash:digest(JSON.stringify([record.id,expected,familyVersion,reason]))};
}
export async function createQuoteRevision(db:Database,record:BillingDocument,expected:number,raw:Record<string,unknown>,email:string){
 const v=intent(record,expected,raw),revision=record.quote!.revision;
 const replay=async()=>{const row=await db.prepare('SELECT parent_document_id,request_hash FROM billing_quote_revisions WHERE document_id=?').bind(v.id).first<{parent_document_id:string;request_hash:string}>();if(!row)return false;if(row.parent_document_id!==record.id||row.request_hash!==v.hash)return conflict();return true;};
 if(await replay())return {id:v.id,created:false};
 if(record.version!==expected||revision.familyVersion!==v.familyVersion||revision.currentId!==record.id||revision.abandoned||record.quote!.invoice)return conflict();
 if(record.status!=='issued')return fail(409,'Finalisez le devis avant de préparer une nouvelle version. Le brouillon reste modifiable directement.');
 if(v.id===record.id)return fail(400,'Le nouveau devis doit avoir son propre identifiant.');
 const reference='Version révisée du devis '+record.issuance!.number+'.';
 const notes=record.data.notes.length+reference.length+2<=10000?[record.data.notes,reference].filter(Boolean).join('\n\n'):record.data.notes;
 const draft=normalizeDraft({...record.data,issueDate:billingToday(),validUntil:'',dueDate:'',lines:record.data.lines.map(line=>({...line,id:randomUUID()})),notes});
 const json=JSON.stringify(draft),totals=JSON.stringify(calculateBilling(draft)),issues=JSON.stringify(inspectDraft(draft)),stamp=new Date().toISOString();
 try{
  await db.batch([
   db.prepare('INSERT INTO billing_quote_families(root_document_id,current_document_id,version,next_ordinal,updated_at,updated_by) VALUES(?,?,1,2,?,?) ON CONFLICT(root_document_id) DO NOTHING').bind(revision.rootId,revision.rootId,stamp,email),
   db.prepare("INSERT INTO billing_documents(id,kind,status,version,data_json,totals_json,issues_json,create_hash,created_at,updated_at,created_by,updated_by) VALUES(?,'quote','draft',1,?,?,?,?,?,?,?,?)").bind(v.id,json,totals,issues,digest(json),stamp,stamp,email,email),
   db.prepare('INSERT INTO billing_quote_revisions(document_id,root_document_id,parent_document_id,parent_document_version,base_family_version,ordinal,reason,request_hash,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(v.id,revision.rootId,record.id,expected,v.familyVersion||1,revision.count+1,v.reason,v.hash,stamp,email)
  ]);
 }catch(error){if(await replay())return {id:v.id,created:false};if(/BILLING_REVISION|BILLING_FAMILY|UNIQUE constraint/.test(String(error)))return conflict();throw error;}
 return {id:v.id,created:true};
}

export async function abandonQuoteRevision(db:Database,record:BillingDocument,expected:number,raw:Record<string,unknown>,email:string){
 const v=intent(record,expected,raw),revision=record.quote!.revision;
 const replay=async()=>{const row=await db.prepare('SELECT document_id,abandon_hash FROM billing_quote_revisions WHERE abandoned_id=?').bind(v.id).first<{document_id:string;abandon_hash:string}>();if(!row)return false;if(row.document_id!==record.id||row.abandon_hash!==v.hash)return conflict();return true;};
 if(await replay())return;
 if(record.version!==expected||revision.familyVersion!==v.familyVersion||revision.currentId!==record.id||revision.abandoned||!revision.parentId||record.issuance||record.quote!.invoice)return conflict();
 try{
  const row=await db.prepare(`UPDATE billing_quote_revisions SET abandoned_id=?,abandoned_at=?,abandoned_by=?,abandon_reason=?,abandon_hash=?
   WHERE document_id=? AND abandoned_at IS NULL AND EXISTS(SELECT 1 FROM billing_quote_families WHERE root_document_id=billing_quote_revisions.root_document_id AND version=? AND current_document_id=?)
   AND EXISTS(SELECT 1 FROM billing_documents WHERE id=? AND version=?) RETURNING document_id`).bind(v.id,new Date().toISOString(),email,v.reason,v.hash,record.id,v.familyVersion,record.id,record.id,expected).first();
  if(!row){if(await replay())return;return conflict();}
 }catch(error){if(await replay())return;if(/BILLING_REVISION|BILLING_FAMILY|UNIQUE constraint/.test(String(error)))return conflict();throw error;}
}

export async function quoteVersions(db:Database,record:BillingDocument,before:number){
 if(!record.quote)return fail(400,'Les versions concernent uniquement les devis.');
 const root=record.quote.revision.rootId;
 const result=(await db.prepare(`SELECT d.id,coalesce(r.ordinal,1) AS ordinal,i.number,CASE WHEN j.state='ready' THEN 'issued' WHEN j.state='failed' THEN 'issue_failed' WHEN i.id IS NOT NULL THEN 'finalizing' ELSE 'draft' END AS status,
 d.created_at AS createdAt,coalesce(r.reason,'Version initiale') AS reason,r.abandoned_at AS abandonedAt,r.abandon_reason AS abandonReason,json_extract(d.totals_json,'$.grossMinor') AS grossMinor
 FROM billing_documents d LEFT JOIN billing_quote_revisions r ON r.document_id=d.id LEFT JOIN billing_issuances i ON i.document_id=d.id LEFT JOIN billing_issue_jobs j ON j.issuance_id=i.id
 WHERE (d.id=? OR r.root_document_id=?) AND coalesce(r.ordinal,1)<? ORDER BY ordinal DESC LIMIT 51`).bind(root,root,before).all<BillingQuoteRevisionItem>()).results;
 return {versions:result.slice(0,50),nextBefore:result.length>50?result[49].ordinal:null};
}
export const quoteFamilyRoot=revisionRoot;
