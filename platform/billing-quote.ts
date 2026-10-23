import {createHash} from 'node:crypto';
import type {Database,Reply} from './contracts';
import type {BillingDocument,BillingQuoteAction,BillingQuoteEvent} from './billing-contracts';
import {boundedBody} from './portal';
import {billingToday} from './billing-quote-domain';
import {revisionJSON,quoteFamilyRoot} from './billing-revisions';

const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const actions:BillingQuoteAction[]=['sent','accepted','refused','reopened'];
type EventRow={id:string;document_id:string;document_version:number;version:number;action:BillingQuoteAction;occurred_on:string;note:string;request_hash:string;recorded_at:string;recorded_by:string};
const event=(r:EventRow):BillingQuoteEvent=>({id:r.id,version:r.version,action:r.action,occurredOn:r.occurred_on,note:r.note,recordedAt:r.recorded_at,recordedBy:r.recorded_by});
/** Internal calendar value only, never an interpolated request parameter. */
export function quoteJSON(){
 const last=(field:string)=>`(SELECT ${field} FROM billing_quote_events WHERE document_id=billing_documents.id ORDER BY version DESC LIMIT 1)`;
 return `CASE WHEN kind='quote' THEN json_object('version',coalesce(${last('version')},0),
  'state',CASE WHEN ${last('action')} IN ('accepted','refused') THEN ${last('action')}
   WHEN coalesce(json_extract(data_json,'$.validUntil'),'')<>'' AND json_extract(data_json,'$.validUntil')<'${billingToday()}' THEN 'expired'
   WHEN ${last('action')} IN ('sent','reopened') THEN 'sent' ELSE 'prepared' END,'occurredOn',${last('occurred_on')},
  'invoice',json((SELECT json_object('id',d.id,'number',i.number,'state',CASE WHEN j.state='ready' THEN 'issued' WHEN j.state='failed' THEN 'issue_failed' WHEN i.id IS NOT NULL THEN 'finalizing' ELSE 'draft' END)
   FROM billing_documents d LEFT JOIN billing_issuances i ON i.document_id=d.id LEFT JOIN billing_issue_jobs j ON j.issuance_id=i.id
   WHERE d.source_document_id=${quoteFamilyRoot('billing_documents.id')} OR d.source_document_id IN (SELECT document_id FROM billing_quote_revisions WHERE root_document_id=${quoteFamilyRoot('billing_documents.id')}))),
  'engagement',json((SELECT json_object('kind',kind,'filename',filename,'createdAt',created_at) FROM billing_quote_engagements WHERE document_id=billing_documents.id)),
  'revision',json(${revisionJSON()})) ELSE NULL END`;
}

export async function billingQuoteRoute(request:Request,db:Database,record:BillingDocument,email:string,reply:Reply,read:()=>Promise<BillingDocument>):Promise<Response>{
 if(record.data.kind!=='quote')return fail(400,'Le suivi commercial concerne uniquement les devis.');
 if(request.method==='GET'){
  const params=new URL(request.url).searchParams,before=params.get('before');
  if([...params.keys()].some(k=>k!=='before')||params.getAll('before').length>1||(before!==null&&(!/^[1-9]\d*$/.test(before)||!Number.isSafeInteger(Number(before)))))return fail(400,'Page d’historique invalide.');
  const rows=(await db.prepare('SELECT * FROM billing_quote_events WHERE document_id=? AND version<? ORDER BY version DESC LIMIT 51').bind(record.id,before===null?Number.MAX_SAFE_INTEGER:Number(before)).all<EventRow>()).results;
  return reply(200,{events:rows.slice(0,50).map(event),nextBefore:rows.length>50?rows[49].version:null});
 }
 if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
 const expected=request.headers.get('if-match');
 if(expected===null)return fail(428,'La version du suivi est requise.');
 if(!/^(0|[1-9]\d*)$/.test(expected)||!Number.isSafeInteger(Number(expected)))return fail(400,'Version de suivi invalide.');
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return fail(415,'Format JSON requis.');
 const bytes=await boundedBody(request,12000);
 let input;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return fail(400,'Événement de suivi invalide.');}
 const keys=['id','documentVersion','action','occurredOn','note'];
 if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length!==keys.length||keys.some(k=>!Object.hasOwn(input,k))||!uuid(input.id)||!Number.isSafeInteger(input.documentVersion)||input.documentVersion<1||!actions.includes(input.action)||!date(input.occurredOn)||typeof input.note!=='string'||input.note.length>2000)return fail(400,'Événement de suivi invalide.');
 const id=input.id.toLowerCase(),note=input.note.trim().normalize('NFC'),hash=createHash('sha256').update(JSON.stringify([record.id,input.documentVersion,Number(expected),input.action,input.occurredOn,note])).digest('hex');
 const existing=await db.prepare('SELECT * FROM billing_quote_events WHERE id=?').bind(id).first<EventRow>();
 if(existing){if(existing.document_id!==record.id||existing.request_hash!==hash)return fail(409,'Cet identifiant de suivi est déjà utilisé.');return reply(200,await read());}
 if(record.status!=='issued')return fail(409,'Finalisez le devis avant d’enregistrer son suivi.');
 if(record.version!==input.documentVersion||record.quote?.version!==Number(expected))return fail(409,'Le suivi a changé dans une autre session. Rechargez-le avant de continuer.');
 if(record.quote.invoice)return fail(409,'Une facture est déjà liée à ce devis. Son suivi est conservé.');
 if(record.quote.revision.abandoned||record.quote.revision.currentId!==record.id)return fail(409,'Utilisez la version en cours du devis pour enregistrer une réponse.');
 if(input.occurredOn>billingToday()||input.occurredOn<record.data.issueDate)return fail(422,'La date doit être comprise entre la date du devis et aujourd’hui.');
 if(input.action==='accepted'&&record.data.validUntil&&input.occurredOn>record.data.validUntil)return fail(422,'La date de l’accord dépasse la validité du devis. Préparez un nouveau devis si les conditions ont changé.');
 if(input.action!=='sent'&&!note)return fail(422,input.action==='reopened'?'Indiquez la raison de la correction.':'Précisez l’origine de la réponse du client (e-mail, devis signé, appel…).');
 const last=await db.prepare('SELECT * FROM billing_quote_events WHERE document_id=? ORDER BY version DESC LIMIT 1').bind(record.id).first<EventRow>();
 if((input.action==='sent'&&last)||(input.action==='reopened'&&!['accepted','refused'].includes(last?.action||''))||(['accepted','refused'].includes(input.action)&&['accepted','refused'].includes(last?.action||'')))return fail(409,'Cette action ne correspond plus à l’état du devis. Rechargez le suivi.');
 const sent=await db.prepare("SELECT occurred_on FROM billing_quote_events WHERE document_id=? AND action='sent'").bind(record.id).first<{occurred_on:string}>();
 if(sent&&input.action!=='reopened'&&input.occurredOn<sent.occurred_on)return fail(422,'La réponse du client ne peut pas précéder l’envoi déclaré.');
 try{
  await db.prepare('INSERT INTO billing_quote_events(id,document_id,document_version,version,action,occurred_on,note,request_hash,recorded_at,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,record.id,record.version,Number(expected)+1,input.action,input.occurredOn,note,hash,new Date().toISOString(),email).run();
 }catch(error){
  const retry=await db.prepare('SELECT * FROM billing_quote_events WHERE id=?').bind(id).first<EventRow>();
  if(retry?.document_id===record.id&&retry.request_hash===hash)return reply(200,await read());
  if(/BILLING_QUOTE_TRANSITION|BILLING_REVISION_INACTIVE|UNIQUE constraint/.test(String(error)))return fail(409,'Le suivi ou la version en cours a changé. Votre saisie est conservée ; rechargez le suivi.');
  throw error;
 }
 return reply(201,await read());
}
