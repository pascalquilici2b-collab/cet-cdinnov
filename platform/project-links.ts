import type {MarketProject} from './client/markets-contracts';

/** A project is stored once. Additional markets share its identity, never its purchase orders. */
export function projectMarketIds(ownerId:string,project:{marketIds?:string[]}){
 return [...new Set([ownerId,...(project.marketIds||[])])];
}
export function projectsForMarket(marketId:string,markets:{id:string;projects?:MarketProject[]}[]):MarketProject[]{
 return markets.flatMap(owner=>(owner.projects||[]).filter(p=>projectMarketIds(owner.id,p).includes(marketId)).map(p=>owner.id===marketId?p:{...p,orders:[]}));
}
