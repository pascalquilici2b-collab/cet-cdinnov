import {sameClientForCreation} from './billing-client-creation-match';
import {createHash} from 'node:crypto';
import type {Database,Reply} from './contracts';
import type {BillingDirectoryKind,BillingDirectoryRecord} from './billing-contracts';
import {billingId,blankParty} from './billing-domain';
import {normalizeDirectory} from './billing-directory-domain';
import {boundedBody} from './portal';

type Row={kind:BillingDirectoryKind;id:string;version:number;data_json:string;updated_at:string|null;create_hash?:string};
const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
const conflict=()=>fail(409,'Cette fiche a changé ou cet identifiant est déjà utilisé. Votre saisie est conservée ; rechargez la fiche enregistrée.');
const record=(r:Row):BillingDirectoryRecord=>({id:r.id,kind:r.kind,version:r.version,data:normalizeDirectory(r.kind,JSON.parse(r.data_json)),updatedAt:r.updated_at} as BillingDirectoryRecord);
const stored=(db:Database,kind:BillingDirectoryKind,id:string)=>db.prepare('SELECT * FROM billing_directory WHERE kind=? AND id=?').bind(kind,id).first<Row>();
// Budget identities remain shared. Their name-only entries are virtual until a billing profile is saved.
// The billing profile is independent of later budget restores/renames and never rewrites invoice snapshots.
const directorySQL=`WITH entries AS (
 SELECT kind,id,version,data_json,updated_at FROM billing_directory WHERE kind=?
 UNION ALL
 SELECT 'clients',json_extract(b.data_json,'$.id'),0,
 json_object('schemaVersion',1,'party',json_patch(?,json_object('name',min(json_extract(b.data_json,'$.name')))),'notes','','archived',json('false')),NULL
 FROM budget_clients b WHERE ?='clients' AND json_type(b.data_json,'$.id')='text' AND length(json_extract(b.data_json,'$.id')) BETWEEN 1 AND 200
 AND json_type(b.data_json,'$.name')='text' AND length(trim(json_extract(b.data_json,'$.name'))) BETWEEN 1 AND 300
 AND NOT EXISTS(SELECT 1 FROM billing_directory p WHERE p.kind='clients' AND p.id=json_extract(b.data_json,'$.id'))
 GROUP BY json_extract(b.data_json,'$.id')
)`;
const baseBindings=(kind:BillingDirectoryKind)=>[kind,JSON.stringify(blankParty()),kind];
const fold=(text:string)=>text.normalize('NFD').replace(/\p{M}/gu,'').replace(/[œŒ]/g,'oe').replace(/[æÆ]/g,'ae').toLowerCase();
// D1's built-in lower() covers ASCII. Fold French accented names in the same way as the query.
const foldSQL=(expression:string)=>{
 for(const [letters,replacement] of [['àâäÀÂÄ','a'],['éèêëÉÈÊË','e'],['îïÎÏ','i'],['ôöÔÖ','o'],['ùûüÙÛÜ','u'],['çÇ','c'],['ÿŸ','y'],['œŒ','oe'],['æÆ','ae'],['\u0300\u0301\u0302\u0308\u0327','']])for(const letter of letters)expression=`replace(${expression},'${letter}','${replacement}')`;
 return `lower(${expression})`;
};
async function get(db:Database,kind:BillingDirectoryKind,id:string){return db.prepare(directorySQL+' SELECT * FROM entries WHERE id=?').bind(...baseBindings(kind),id).first<Row>();}
async function body(request:Request,keys:string[]){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return fail(415,'Format JSON requis.');
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request,400000)));}catch(error){if((error as {status?:number})?.status)throw error;return fail(400,'Données JSON invalides.');}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))return fail(400,'Champs de requête invalides.');return value;
}
function version(request:Request){const value=request.headers.get('if-match');if(value===null)return fail(428,'La version de la fiche est requise.');if(!/^(0|[1-9]\d*)$/.test(value)||!Number.isSafeInteger(Number(value)))return fail(400,'Version de fiche invalide.');return Number(value);}

/** Called only after the common billing identity and direction-role gates. */
export async function billingDirectoryRoute(request:Request,db:Database,user:string,reply:Reply):Promise<Response>{
 const url=new URL(request.url),match=url.pathname.match(/^\/api\/v1\/billing\/(clients|services)(?:\/([^/]+))?$/);
 if(!match)return reply(404,{error:'Fiche introuvable.'});const kind=match[1] as BillingDirectoryKind;
 let id='';if(match[2]){try{id=decodeURIComponent(match[2]);}catch{return fail(400,'Identifiant invalide.');}if(!id.trim()||id.length>200||/[\x00-\x1f\x7f]/.test(id))return fail(400,'Identifiant invalide.');}
 if(request.method==='GET'){
  if(id){const row=await get(db,kind,id);return row?reply(200,record(row)):reply(404,{error:'Fiche introuvable.'});}
  const p=url.searchParams,q=(p.get('q')||'').trim();
  if([...p.keys()].some(k=>!['q','offset','limit','archived'].includes(k)||p.getAll(k).length>1)||q.length>200||!['true','false'].includes(p.get('archived')||'false'))return fail(400,'Filtres invalides.');
  const integer=(key:string,fallback:number,min:number,max:number)=>{const v=p.get(key);if(v===null)return fallback;if(!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)<min||Number(v)>max)return fail(400,'Pagination invalide.');return Number(v);};
  const offset=integer('offset',0,0,1000000),limit=integer('limit',20,1,100),archived=p.get('archived')==='true'?1:0;
  const searchable=foldSQL("coalesce(json_extract(data_json,'$.party.name'),'')||' '||coalesce(json_extract(data_json,'$.party.siren'),'')||' '||coalesce(json_extract(data_json,'$.party.siret'),'')||' '||coalesce(json_extract(data_json,'$.party.email'),'')||' '||coalesce(json_extract(data_json,'$.label'),'')||' '||coalesce(json_extract(data_json,'$.reference'),'')");
  const sql=directorySQL+`, filtered AS (SELECT * FROM entries WHERE json_extract(data_json,'$.archived')=? AND (?='' OR instr(${searchable},?)>0))
  SELECT (SELECT count(*) FROM filtered) AS total,(SELECT json_group_array(json(row_json)) FROM (SELECT json_object('id',id,'kind',kind,'version',version,'data_json',data_json,'updated_at',updated_at) AS row_json FROM filtered ORDER BY lower(coalesce(json_extract(data_json,'$.party.name'),json_extract(data_json,'$.label'))),id LIMIT ? OFFSET ?)) AS rows_json`;
  const result=await db.prepare(sql).bind(...baseBindings(kind),archived,q,fold(q),limit,offset).first<{total:number;rows_json:string}>();
  return reply(200,{records:JSON.parse(result?.rows_json||'[]').map(record),total:result?.total||0,offset,limit});
 }
 if((request.method==='POST'&&!id)||(request.method==='PUT'&&id)){
  const expected=request.method==='PUT'?version(request):null,input=await body(request,expected===null?['id','data']:['data']);
  if(expected===null){if(!billingId(input.id))return fail(400,'Identifiant de nouvelle fiche invalide.');id=input.id.toLowerCase();}
  const data=normalizeDirectory(kind,input.data),json=JSON.stringify(data),hash=createHash('sha256').update(json).digest('hex'),stamp=new Date().toISOString();
  try{
   if(expected===null||expected===0){
    const previous=await stored(db,kind,id);
    if(previous){if(previous.create_hash!==hash)return conflict();return reply(200,record(previous));}
    if(expected===null&&kind==='clients'&&'party' in data){const entries=await db.prepare(directorySQL+' SELECT * FROM entries').bind(...baseBindings(kind)).all<Row>();if(entries.results.some(row=>{const r=record(row);return r.kind==='clients'&&!r.data.archived&&sameClientForCreation(r.data,data.party);}))return fail(409,'Ce client existe déjà. Ouvrez sa fiche dans Clients pour compléter ses coordonnées.');}
    if(expected===null&&await get(db,kind,id))return fail(409,'Ce client existe déjà dans le répertoire. Ouvrez sa fiche pour la compléter.');
    if(expected===0&&(kind!=='clients'||!await get(db,kind,id)))return fail(404,'Le client d’origine n’existe plus. Créez une nouvelle fiche.');
    const siret=kind==='clients'&&'party' in data?data.party.siret.replace(/\s/g,''):'';
    const guard=expected===0?"WHERE EXISTS(SELECT 1 FROM budget_clients WHERE json_extract(data_json,'$.id')=?)":siret?"WHERE NOT EXISTS(SELECT 1 FROM billing_directory WHERE kind='clients' AND json_extract(data_json,'$.archived')=0 AND replace(json_extract(data_json,'$.party.siret'),' ','')=?)":'';
    const inserted=await db.prepare(`INSERT INTO billing_directory(kind,id,version,data_json,create_hash,created_at,created_by,updated_at,updated_by) SELECT ?,?,1,?,?,?,?,?,? ${guard} ON CONFLICT(kind,id) DO NOTHING RETURNING *`).bind(kind,id,json,hash,stamp,user,stamp,user,...(expected===0?[id]:siret?[siret]:[])).first<Row>();
    if(inserted)return reply(201,record(inserted));
    const existing=await stored(db,kind,id);if(existing?.create_hash===hash)return reply(200,record(existing));return conflict();
   }
   const saved=await db.prepare('UPDATE billing_directory SET version=version+1,data_json=?,updated_at=?,updated_by=? WHERE kind=? AND id=? AND version=? RETURNING *').bind(json,stamp,user,kind,id,expected).first<Row>();
   if(saved)return reply(200,record(saved));if(!await stored(db,kind,id))return fail(404,'Fiche introuvable.');return conflict();
  }catch(error){if(String(error).includes('billing_service_reference'))return fail(409,'Cette référence de prestation est déjà utilisée, y compris dans les archives.');throw error;}
 }
 return reply(405,{error:'Méthode non autorisée. Archivez une fiche pour la retirer des choix.'});
}
