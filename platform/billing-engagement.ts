import {createHash} from 'node:crypto';
import type {Database,Environment,Reply} from './contracts';
import type {BillingDocument} from './billing-contracts';
import {boundedBody} from './portal';
import {projectsForMarket} from './project-links';

const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
interface Bucket {put(key:string,value:Uint8Array,options:unknown):Promise<unknown>;get(key:string):Promise<{body:ReadableStream<Uint8Array<ArrayBuffer>>}|null>;}
export async function engagementRoute(request:Request,db:Database,env:Environment,record:BillingDocument,email:string,reply:Reply,read:()=>Promise<BillingDocument>){
 if(record.data.kind!=='quote')return fail(400,'Un engagement est rattaché à un devis.');
 const bucket=env.CET_FILES as Bucket|undefined;if(!bucket)return fail(503,'L’archivage privé est indisponible.');
 const existing=await db.prepare('SELECT * FROM billing_quote_engagements WHERE document_id=?').bind(record.id).first<{sha256:string;object_key:string;filename:string;content_type:string;kind:string;metadata_json:string}>();
 if(request.method==='GET'){
  if(!existing)return fail(404,'Aucun engagement joint à ce devis.');
  const file=await bucket.get(existing.object_key);if(!file)return fail(503,'La pièce archivée est indisponible.');
  const headers=new Headers(reply(200,{}).headers);headers.set('Content-Type',existing.content_type);headers.set('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(existing.filename));headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');return new Response(file.body,{headers});
 }
 if(request.method!=='PUT')return reply(405,{error:'Méthode non autorisée.'});
 if(request.headers.get('if-match')!==String(record.version))return fail(409,'Rechargez le devis avant de joindre la pièce.');
 const q=record.quote;if(record.status!=='issued'||q?.state!=='accepted'||q.revision.abandoned||q.revision.currentId!==record.id||q.invoice)return fail(409,'Liez la pièce à la version acceptée du devis, avant de créer sa facture.');
 const kind=new URL(request.url).searchParams.get('kind');if(kind!=='order'&&kind!=='signed_quote')return fail(400,'Choisissez Bon de commande ou Devis signé.');
 const params=new URL(request.url).searchParams,refs=record.data.references;
 const marketId=params.get('marketId')??refs.marketId,projectId=params.get('projectId')??refs.projectId??'';
 const reference=(params.get('reference')??refs.orderReference??'').trim()||record.issuance?.number||'';
 const date=params.get('date')||new Date().toISOString().slice(0,10),rawAmount=params.get('amountMinor'),amountMinor=rawAmount===null?Number(record.totals?.netMinor||0):rawAmount===''?null:Number(rawAmount);
 if(reference.length>120||!/^[\d]{4}-[\d]{2}-[\d]{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||amountMinor!==null&&(!Number.isSafeInteger(amountMinor)||amountMinor<0||amountMinor>1e14))return fail(422,'Vérifiez la référence, la date et le montant de l’engagement.');
 const markets=(await db.prepare('SELECT id,payload FROM markets').all<{id:string;payload:string}>()).results.map(m=>({id:m.id,...JSON.parse(m.payload)})),market=markets.find(m=>m.id===marketId);
 const project=market?projectsForMarket(marketId,markets).find(p=>p.id===projectId):null;
 if(marketId&&!market||projectId&&!project)return fail(422,'Le projet doit appartenir au marché sélectionné.');
 const order=kind==='order'?[...(project?.orders||[]),...(market?.orders||[])].find(o=>o.reference.trim().toLocaleLowerCase('fr')===reference.toLocaleLowerCase('fr')):null;
 const extra=Object.fromEntries(['marketReference','engagement','serviceCode','otherReference'].map(k=>[k,(params.get(k)||'').trim()]));
 if(Object.values(extra).some(v=>v.length>300||/[\x00-\x1f\x7f]/.test(v)))return fail(422,'Références trop longues ou invalides.');
 const metadata={...extra,reference,date,amountMinor,marketId,marketReference:market?.reference||extra.marketReference||'',projectId,project:project?.name||(!refs.projectId?refs.project:''),client:record.data.buyer.name,orderId:kind==='order'?(order?.id||'engagement:'+record.id):''};
 let filename='';try{filename=decodeURIComponent(request.headers.get('x-filename')||'');}catch{}
 if(!filename.trim()||filename.length>200||/[\x00-\x1f\x7f/\\]/.test(filename))return fail(400,'Nom de fichier invalide.');
 const bytes=await boundedBody(request,10*1024*1024),head=new TextDecoder('latin1').decode(bytes.slice(0,8));
 const mime=head.startsWith('%PDF-')?'application/pdf':bytes[0]===137&&head.slice(1,4)==='PNG'?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':'';
 if(!mime||!({ 'application/pdf':/\.pdf$/i,'image/png':/\.png$/i,'image/jpeg':/\.jpe?g$/i }[mime]!).test(filename))return fail(422,'Choisissez un PDF, PNG ou JPEG valide (10 Mo maximum).');
 const sha=createHash('sha256').update(bytes).digest('hex');
 if(existing){if(existing.sha256===sha&&existing.kind===kind&&existing.metadata_json===JSON.stringify(metadata))return reply(200,await read());return fail(409,'Un engagement est déjà archivé pour ce devis.');}
 const key=`billing/engagements/${record.id}/${sha}`;await bucket.put(key,bytes,{httpMetadata:{contentType:mime}});
 // Re-check the commercial state in the same SQL statement as the insert.
 const inserted=await db.prepare(`INSERT INTO billing_quote_engagements SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE
  (SELECT action FROM billing_quote_events WHERE document_id=? ORDER BY version DESC LIMIT 1)='accepted'
  AND NOT EXISTS(SELECT 1 FROM billing_documents WHERE source_document_id=?) ON CONFLICT DO NOTHING RETURNING document_id`)
  .bind(record.id,record.version,kind,filename,mime,bytes.length,key,sha,new Date().toISOString(),email,JSON.stringify(metadata),record.id,record.id).first();
 if(!inserted)return fail(409,'Le suivi du devis a changé. Rechargez-le avant de continuer.');
 return reply(201,await read());
}
