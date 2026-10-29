import type {LinkedMarketProject,MarketProject} from './client/markets-contracts';
import type {Database} from './contracts';

/** A project is stored once. Additional markets share its identity, never its purchase orders. */
export function projectMarketIds(ownerId:string,project:{marketIds?:string[]}){
 return [...new Set([ownerId,...(project.marketIds||[])])];
}
export function projectsForMarket(marketId:string,markets:{id:string;projects?:MarketProject[]}[]):MarketProject[]{
 return markets.flatMap(owner=>(owner.projects||[]).filter(p=>projectMarketIds(owner.id,p).includes(marketId)).map(p=>owner.id===marketId?p:{...p,orders:[]}));
}

/** Read-only links are separate from the owner's writable projects and purchase orders. */
export async function readLinkedMarketProjects(db:Database,marketId?:string){
 const sql=`SELECT m.id AS market_id,p.value AS data_json,links.value AS linked_market_id,
  json_extract(m.payload,'$.reference') AS owner_reference,json_extract(m.payload,'$.title') AS owner_title
  FROM markets m JOIN json_each(m.payload,'$.projects') p
  JOIN json_each(p.value,'$.marketIds') links
  WHERE links.value<>m.id${marketId?' AND links.value=?':''} ORDER BY json_extract(p.value,'$.name') COLLATE NOCASE,json_extract(p.value,'$.id')`;
 const query=db.prepare(sql),rows=await(marketId?query.bind(marketId):query).all<{market_id:string;data_json:string;linked_market_id:string;owner_reference:string;owner_title:string}>();
 const result=new Map<string,LinkedMarketProject[]>();
 for(const row of rows.results){
  const {orders:_,...project}=JSON.parse(row.data_json) as MarketProject;
  const links=result.get(row.linked_market_id)||[];
  if(!links.some(p=>p.id===project.id))links.push({...project,ownerMarketId:row.market_id,ownerMarketReference:row.owner_reference||'',ownerMarketTitle:row.owner_title||''});
  result.set(row.linked_market_id,links);
 }
 return result;
}
