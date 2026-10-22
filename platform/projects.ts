import type {Environment,Reply} from './contracts';
import {sessionIdentity} from './identity';
import {boundedBody} from './portal';
import {validateMarket} from '../marches/domain.mjs';
export interface SharedProject {id:string;marketId:string;marketVersion:number;name:string;code:string;programme?:string;notes:string;archived:boolean;marketTitle:string;marketReference:string;clientName:string;}
export type ProjectInput=Pick<SharedProject,'id'|'marketId'|'marketVersion'|'name'|'code'|'programme'|'notes'|'archived'>;
export async function projectsRoute(request:Request,env:Environment,reply:Reply){
 const session=await sessionIdentity(request,env);if(!session)return reply(401,{error:'Connexion requise.'});
 const db=env.BUDGETS_DB.withSession('first-primary');
 if(request.method==='GET'){
  const rows=await db.prepare(`SELECT p.*,m.payload AS market FROM commercial_projects p JOIN markets m ON m.id=p.market_id WHERE json_extract(m.payload,'$.status')<>'archived' ORDER BY p.name COLLATE NOCASE,p.id`).all<{id:string;market_id:string;market_version:number;name:string;code:string;archived:number;data_json:string;market:string}>();
  return reply(200,{projects:rows.results.filter(p=>session.admin||!p.archived).map(p=>{const m=JSON.parse(p.market),d=JSON.parse(p.data_json);return {id:p.id,marketId:p.market_id,marketVersion:p.market_version,name:p.name,code:p.code,programme:d.programme||'',archived:!!p.archived,...(session.admin?{notes:d.notes||''}:{}),marketTitle:m.title,marketReference:m.reference,clientName:m.clientName};})});
 }
 if(!session.admin)return reply(403,{error:'La gestion des projets est réservée à la direction.'});
 if(request.method!=='PUT')return reply(405,{error:'Méthode non autorisée.'});
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply(415,{error:'Format JSON requis.'});
 let data:ProjectInput;try{data=JSON.parse(new TextDecoder().decode(await boundedBody(request,10000)));}catch{return reply(400,{error:'Projet invalide.'});}
 if(!data||Object.keys(data).some(k=>!['id','marketId','marketVersion','name','code','programme','notes','archived'].includes(k))||!Number.isSafeInteger(data.marketVersion)||data.marketVersion<1||!/^[-\w]{1,80}$/.test(data.id)||!/^[-\w]{1,80}$/.test(data.marketId))return reply(400,{error:'Projet invalide.'});
 const existing=await db.prepare('SELECT market_id FROM commercial_projects WHERE id=?').bind(data.id).first<{market_id:string}>();
 if(existing&&existing.market_id!==data.marketId)return reply(409,{error:'Ce projet appartient déjà à un autre marché.'});
 const row=await db.prepare('SELECT payload,version FROM markets WHERE id=?').bind(data.marketId).first<{payload:string;version:number}>();
 if(!row)return reply(404,{error:'Marché introuvable.'});
 if(row.version!==data.marketVersion)return reply(409,{error:'Le marché a changé. Actualisez les projets avant de réessayer.'});
 const market=JSON.parse(row.payload);if(market.status==='archived')return reply(409,{error:'Le marché est archivé.'});
 market.projects||=[];const previous=market.projects.find((p:{id:string})=>p.id===data.id);
 const project={id:data.id,name:data.name,code:data.code,programme:data.programme??previous?.programme??'',notes:data.notes,archived:data.archived,orders:previous?.orders||[]};
 market.projects=previous?market.projects.map((p:{id:string})=>p.id===data.id?project:p):[...market.projects,project];
 const docs=await db.prepare('SELECT id FROM market_documents WHERE market_id=?').bind(data.marketId).all();
 let validated;try{validated=validateMarket(market,docs.results);}catch(e){return reply(400,{error:(e as Error).message});}
 const saved=await db.prepare('UPDATE markets SET payload=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? RETURNING version').bind(JSON.stringify(validated),new Date().toISOString(),session.email,data.marketId,data.marketVersion).first<{version:number}>();
 if(!saved)return reply(409,{error:'Le marché a changé. Votre saisie est conservée.'});
 return reply(200,{project:{...data,marketVersion:saved.version,marketTitle:market.title,marketReference:market.reference,clientName:market.clientName}});
}
