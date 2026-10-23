import type {Environment,Reply} from './contracts';
import {sessionIdentity} from './identity';
import {boundedBody} from './portal';
import {validateMarket} from '../marches/domain.mjs';
import {validClientLogoData} from './billing-client-logo';
import {projectMarketIds} from './project-links';
export interface SharedProject {id:string;marketId:string;marketVersion:number;marketIds?:string[];clientIds?:string[];clientNames?:string[];marketLabels?:string[];logoData?:string;name:string;code:string;programme?:string;startDate?:string;endDate?:string;notes:string;archived:boolean;marketTitle:string;marketReference:string;clientName:string;}
export type ProjectInput=Pick<SharedProject,'id'|'marketId'|'marketVersion'|'marketIds'|'clientIds'|'logoData'|'name'|'code'|'programme'|'startDate'|'endDate'|'notes'|'archived'>;
export async function projectsRoute(request:Request,env:Environment,reply:Reply){
 const session=await sessionIdentity(request,env);if(!session)return reply(401,{error:'Connexion requise.'});
 const db=env.BUDGETS_DB.withSession('first-primary');
 if(!['GET','PUT'].includes(request.method))return reply(405,{error:'Méthode non autorisée.'});
 if(request.method==='PUT'&&!session.admin)return reply(403,{error:'La gestion des projets est réservée à la direction.'});
 const [allMarkets,budgetClients,directoryClients]=await Promise.all([
  db.prepare('SELECT id,payload FROM markets').all<{id:string;payload:string}>(),
  db.prepare('SELECT data_json FROM budget_clients').all<{data_json:string}>(),
  db.prepare("SELECT id,data_json FROM billing_directory WHERE kind='clients'").all<{id:string;data_json:string}>()
 ]);
 const markets=new Map(allMarkets.results.map(r=>[r.id,JSON.parse(r.payload)]));
 const clients=new Map<string,string>();
 for(const row of budgetClients.results){const c=JSON.parse(row.data_json);if(c.id&&c.name)clients.set(c.id,c.name);}
 for(const row of directoryClients.results){const c=JSON.parse(row.data_json);if(c.party?.name)clients.set(row.id,c.party.name);}
 const describe=(ownerId:string,d:any)=>{
  const owner=markets.get(ownerId),marketIds=projectMarketIds(ownerId,d),linkedMarkets=marketIds.map(id=>markets.get(id)).filter(Boolean);
  return {marketIds,clientIds:d.clientIds||[],logoData:d.logoData||'',marketTitle:owner?.title||'',marketReference:owner?.reference||'',clientName:owner?.clientName||'',
   clientNames:[...new Set([...linkedMarkets.map(m=>m.clientName),...(d.clientIds||[]).map((id:string)=>clients.get(id))].filter(Boolean))],
   marketLabels:linkedMarkets.map(m=>[m.reference,m.title].filter(Boolean).join(' · '))};
 };
 if(request.method==='GET'){
  const rows=await db.prepare('SELECT * FROM commercial_projects ORDER BY name COLLATE NOCASE,id').all<{id:string;market_id:string;market_version:number;name:string;code:string;archived:number;data_json:string}>();
  return reply(200,{clients:session.admin?[...clients].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,'fr')):[],projects:rows.results.filter(p=>session.admin||!p.archived).map(p=>{const d=JSON.parse(p.data_json);return {id:p.id,marketId:p.market_id,marketVersion:p.market_version,name:p.name,code:p.code,programme:d.programme||'',startDate:d.startDate||'',endDate:d.endDate||'',archived:!!p.archived,...(session.admin?{notes:d.notes||''}:{}),...describe(p.market_id,d)};})});
 }
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply(415,{error:'Format JSON requis.'});
 let data:ProjectInput;try{data=JSON.parse(new TextDecoder().decode(await boundedBody(request,400000)));}catch{return reply(400,{error:'Projet invalide ou logo trop volumineux.'});}
 if(!data||Object.keys(data).some(k=>!['id','marketId','marketVersion','marketIds','clientIds','logoData','name','code','programme','startDate','endDate','notes','archived'].includes(k))||!Number.isSafeInteger(data.marketVersion)||data.marketVersion<1||!/^[-\w]{1,80}$/.test(data.id)||!/^[-\w]{1,80}$/.test(data.marketId))return reply(400,{error:'Projet invalide.'});
 for(const key of ['marketIds','clientIds'] as const)if(data[key]!==undefined&&(!Array.isArray(data[key])||data[key]!.length>100||data[key]!.some(id=>typeof id!=='string'||!/^[-\w]{1,80}$/.test(id))))return reply(400,{error:'Rattachements du projet invalides.'});
 if(data.logoData!==undefined&&data.logoData!==''&&!validClientLogoData(data.logoData))return reply(400,{error:'Choisissez un logo PNG, JPEG ou WebP de 256 Ko maximum.'});
 const existing=await db.prepare('SELECT market_id FROM commercial_projects WHERE id=?').bind(data.id).first<{market_id:string}>();
 if(existing&&existing.market_id!==data.marketId)return reply(409,{error:'Conservez le marché d’origine et ajoutez les autres marchés dans les rattachements.'});
 const row=await db.prepare('SELECT payload,version FROM markets WHERE id=?').bind(data.marketId).first<{payload:string;version:number}>();
 if(!row)return reply(404,{error:'Marché introuvable.'});
 if(row.version!==data.marketVersion)return reply(409,{error:'Le marché a changé. Actualisez les projets avant de réessayer.'});
 const market=JSON.parse(row.payload);if(market.status==='archived'&&!existing)return reply(409,{error:'Le marché est archivé.'});
 market.projects||=[];const previous=market.projects.find((p:{id:string})=>p.id===data.id);
 const marketIds=projectMarketIds(data.marketId,{marketIds:data.marketIds??previous?.marketIds});
 const clientIds:string[]=[...new Set<string>(data.clientIds??previous?.clientIds??[])];
 if(marketIds.some(id=>!markets.has(id)))return reply(400,{error:'Un des marchés sélectionnés est introuvable.'});
 if(clientIds.some(id=>!clients.has(id)))return reply(400,{error:'Un des clients sélectionnés est introuvable.'});
 const project={id:data.id,name:data.name,code:data.code,programme:data.programme??previous?.programme??'',startDate:data.startDate??previous?.startDate??'',endDate:data.endDate??previous?.endDate??'',logoData:data.logoData??previous?.logoData??'',marketIds,clientIds,notes:data.notes,archived:data.archived,orders:previous?.orders||[]};
 market.projects=previous?market.projects.map((p:{id:string})=>p.id===data.id?project:p):[...market.projects,project];
 const docs=await db.prepare('SELECT id FROM market_documents WHERE market_id=?').bind(data.marketId).all();
 let validated;try{validated=validateMarket(market,docs.results);}catch(e){return reply(400,{error:(e as Error).message});}
 const payload=JSON.stringify(validated);if(new TextEncoder().encode(payload).byteLength>1500000)return reply(413,{error:'Les logos de ce marché sont trop volumineux. Réduisez leur taille.'});
 const saved=await db.prepare('UPDATE markets SET payload=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? RETURNING version').bind(payload,new Date().toISOString(),session.email,data.marketId,data.marketVersion).first<{version:number}>();
 if(!saved)return reply(409,{error:'Le marché a changé. Votre saisie est conservée.'});
 const clean=(validated as typeof market).projects.find((p:{id:string})=>p.id===data.id);
 return reply(200,{project:{...clean,orders:undefined,marketId:data.marketId,marketVersion:saved.version,...describe(data.marketId,clean)}});
}
