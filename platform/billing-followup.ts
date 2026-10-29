import type {Database,Reply} from './contracts';
import type {BillingDocument} from './billing-contracts';
import {boundedBody} from './portal';
import {selectedLink,syncLinkedDrafts} from './billing-link-sync';
const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
// A converted invoice inherits the archived quote commitment until a shared tracking correction overrides it.
export const followupJSON=`(SELECT json_object('version',coalesce(f.version,0),'title',CASE WHEN billing_documents.kind='quote' THEN f.title ELSE NULL END,
 'link',json(coalesce(f.link_json,CASE WHEN e.document_id IS NOT NULL THEN json_set(e.metadata_json,'$.kind',e.kind,'$.files',json_array(json_object('documentId',e.document_id,'filename',e.filename))) END)))
 FROM billing_link_roots r LEFT JOIN billing_document_followup f ON f.document_id=r.root_id LEFT JOIN billing_quote_engagements e ON e.document_id=r.root_id
 WHERE r.id=billing_documents.id AND (f.document_id IS NOT NULL OR e.document_id IS NOT NULL))`;
export async function followupRoute(request:Request,db:Database,record:BillingDocument,email:string,reply:Reply,read:()=>Promise<BillingDocument>){
 if(request.method!=='PATCH')return reply(405,{error:'Méthode non autorisée.'});
 if(record.status==='finalizing')return fail(409,'Attendez la fin de la finalisation.');
 const expected=request.headers.get('if-match');if(!expected||!/^(0|[1-9]\d*)$/.test(expected))return fail(428,'Version de suivi requise.');
 let input:any;try{input=JSON.parse(new TextDecoder().decode(await boundedBody(request,2000)));}catch{return fail(400,'Modification de suivi invalide.');}
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['title','orderId','marketId'].includes(k)))return fail(400,'Modification de suivi invalide.');
 const root=await db.prepare('SELECT root_id FROM billing_link_roots WHERE id=?').bind(record.id).first<{root_id:string}>();if(!root)return fail(404,'Document introuvable.');
 const current=await db.prepare('SELECT version,title,link_json FROM billing_document_followup WHERE document_id=?').bind(root.root_id).first<{version:number;title:string|null;link_json:string|null}>();
 if((current?.version||0)!==Number(expected))return fail(409,'Le suivi a changé. Rechargez le document.');
 let title=current?.title??null,link=current?.link_json??null;
 if(Object.hasOwn(input,'title')){if(record.data.kind!=='quote'||typeof input.title!=='string'||!input.title.trim()||input.title.length>300)return fail(422,'Le libellé de suivi est réservé aux devis (300 caractères maximum).');title=input.title.trim();}
 if(Object.hasOwn(input,'orderId')){
  if(typeof input.orderId!=='string'||typeof input.marketId!=='string')return fail(422,'Choisissez un engagement.');
  const selected=await selectedLink(db,input.marketId,input.orderId);
  await syncLinkedDrafts(db,root.root_id,Number(expected),title,selected,email);
  return reply(200,await read());
 }
 if(!Object.hasOwn(input,'title')&&!Object.hasOwn(input,'orderId'))return fail(400,'Aucune modification.');
 const stamp=new Date().toISOString();
 try{
  const result=await db.prepare(`INSERT INTO billing_document_followup(document_id,version,title,link_json,updated_at,updated_by) SELECT ?,1,?,?,?,? WHERE ?=0
   ON CONFLICT(document_id) DO UPDATE SET version=version+1,title=?,link_json=?,updated_at=?,updated_by=? WHERE version=? RETURNING document_id`).bind(root.root_id,title,link,stamp,email,Number(expected),title,link,stamp,email,Number(expected)).first();
  // UPDATE has a separate branch because INSERT SELECT ... WHERE false skips the upsert.
  if(!result&&Number(expected)>0){const changed=await db.prepare('UPDATE billing_document_followup SET version=version+1,title=?,link_json=?,updated_at=?,updated_by=? WHERE document_id=? AND version=? RETURNING document_id').bind(title,link,stamp,email,root.root_id,Number(expected)).first();if(!changed)return fail(409,'Le suivi a changé. Rechargez le document.');}
  else if(!result)return fail(409,'Le suivi a changé. Rechargez le document.');
 }catch(e){if(String(e).includes('BILLING_ORDER_LIMIT'))return fail(422,'Ce rattachement dépasserait le montant du bon de commande, en tenant compte de toutes les factures liées.');throw e;}
 return reply(200,await read());
}
