import type {Database} from './contracts';
import type {BillingDraft,BillingFollowupLink,BillingReferences} from './billing-contracts';
import {normalizeDraft,inspectDraft,calculateBilling} from './billing-domain';
import {referencesFromEngagement} from './billing-reference-selection';
import {engagementTracking} from './billing-engagement-tracking';
const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
const activeDraft=`NOT EXISTS(SELECT 1 FROM billing_issuances i WHERE i.document_id=d.id) AND NOT EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=d.id) AND NOT EXISTS(SELECT 1 FROM billing_quote_revisions q WHERE q.document_id=d.id AND q.abandoned_at IS NOT NULL)`;
export async function linkedReferences(db:Database,refs:BillingReferences,link?:BillingFollowupLink|null){
 if(!link)return refs;
 const compatible=!refs.projectId?refs.marketId===link.marketId:!!await db.prepare(`SELECT 1 FROM commercial_projects WHERE id=? AND (market_id=? OR EXISTS(SELECT 1 FROM json_each(data_json,'$.marketIds') WHERE value=?))`).bind(refs.projectId,link.marketId,link.marketId).first();
 return referencesFromEngagement(refs,link,compatible);
}
export async function selectedLink(db:Database,marketId:string,orderId:string):Promise<BillingFollowupLink>{
 const order=(await engagementTracking(db)).orders.find(o=>o.id===orderId&&o.marketId===marketId);
 if(!order)return fail(422,'Cet engagement n’existe plus. Actualisez la liste.');
 return {orderId:order.id,marketId:order.marketId,marketReference:order.market,projectId:order.projectId,project:order.project,reference:order.reference,date:order.date,amountMinor:order.amountMinor,kind:order.kind,files:order.files,serviceCode:order.serviceCode||'',engagement:order.engagement||'',otherReference:order.otherReference||''};
}
/** One D1 transaction changes commercial tracking and every unissued family draft.
 * Issued snapshots stay immutable. A guarded batch fails if any draft was saved/issued meanwhile. */
export async function syncLinkedDrafts(db:Database,rootId:string,expected:number,title:string|null,link:BillingFollowupLink,email:string,edited?:{id:string;version:number;data:BillingDraft}){
 const rows=(await db.prepare(`SELECT d.id,d.version,d.data_json FROM billing_documents d JOIN billing_link_roots r ON r.id=d.id WHERE r.root_id=? AND ${activeDraft}`).bind(rootId).all<{id:string;version:number;data_json:string}>()).results;
 if(edited&&!rows.some(r=>r.id===edited.id&&r.version===edited.version))return fail(409,'Ce document a changé. Rechargez-le avant de continuer.');
 const drafts=await Promise.all(rows.map(async row=>{const data=edited?.id===row.id?edited.data:normalizeDraft(JSON.parse(row.data_json));data.references=await linkedReferences(db,data.references,link);return {row,data};}));
 const stamp=new Date().toISOString();
 const statements=[db.prepare(`INSERT INTO billing_link_writes(root_id,valid) VALUES(?,
 coalesce((SELECT version FROM billing_document_followup WHERE document_id=?),0)=? AND
 (SELECT count(*) FROM billing_documents d JOIN billing_link_roots r ON r.id=d.id WHERE r.root_id=? AND ${activeDraft})=? AND
 NOT EXISTS(SELECT 1 FROM json_each(?) old WHERE NOT EXISTS(SELECT 1 FROM billing_documents d JOIN billing_link_roots r ON r.id=d.id WHERE r.root_id=? AND ${activeDraft} AND d.id=json_extract(old.value,'$.id') AND d.version=json_extract(old.value,'$.version') AND d.data_json=json_extract(old.value,'$.data_json'))))`).bind(rootId,rootId,expected,rootId,rows.length,JSON.stringify(rows),rootId),
 db.prepare(`INSERT INTO billing_document_followup(document_id,version,title,link_json,updated_at,updated_by) VALUES(?,1,?,?,?,?) ON CONFLICT(document_id) DO UPDATE SET version=version+1,title=excluded.title,link_json=excluded.link_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(rootId,title,JSON.stringify(link),stamp,email),
 ...drafts.map(({row,data})=>{let totals:string|null=null;try{totals=JSON.stringify(calculateBilling(data));}catch{}return db.prepare(`UPDATE billing_documents SET version=version+1,data_json=?,totals_json=?,issues_json=?,updated_at=?,updated_by=? WHERE id=?`).bind(JSON.stringify(data),totals,JSON.stringify(inspectDraft(data)),stamp,email,row.id);}),
 db.prepare('DELETE FROM billing_link_writes WHERE root_id=?').bind(rootId)];
 try{await db.batch(statements);}catch(e){if(String(e).includes('BILLING_ORDER_LIMIT'))return fail(422,'Ce rattachement dépasserait le montant du bon de commande, en tenant compte de toutes les factures liées.');if(/billing_link_writes|BILLING_LINK_WRITE_CONFLICT/.test(String(e)))return fail(409,'Un document lié a changé. Rechargez-le avant de continuer.');throw e;}
}
