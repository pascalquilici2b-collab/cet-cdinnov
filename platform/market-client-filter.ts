import {createClientFilterResolver,clientFilterNameKey,type FilterClient} from './billing-client-filter-identity.ts';
import {historicalClientFilterNames} from './billing-client-filter-aliases.ts';

type MarketIdentity={id:string;clientId:string;clientName:string;title:string;reference:string};

/** Current client groups for navigation only: every market keeps its stored name and identity. */
export function marketClientGroups<T extends MarketIdentity>(clients:FilterClient[],markets:T[],query=''){
 const directory=new Map<string,FilterClient>();
 for(const client of clients)if(client.id)directory.set(client.id,{...client});
 // Archived directory entries remain navigable through their explicit market clientId.
 for(const market of markets)if(market.clientId&&!directory.has(market.clientId))directory.set(market.clientId,{id:market.clientId,name:market.clientName});
 for(const aliases of historicalClientFilterNames){
  const names=new Set(aliases.map(clientFilterNameKey)),matches=[...directory.values()].filter(c=>names.has(clientFilterNameKey(c.name)));
  if(matches.length===1)matches[0].aliases=[...aliases];
 }
 const resolve=createClientFilterResolver([...directory.values()],markets.map(m=>({clientId:m.clientId,name:m.clientName})));
 const groups=new Map<string,{value:string;label:string;markets:T[]}>(),needle=clientFilterNameKey(query);
 for(const market of markets){
  const identity=resolve({clientId:market.clientId,name:market.clientName});
  if(needle&&![market.title,market.reference,market.clientName,identity.label].some(value=>clientFilterNameKey(value).includes(needle)))continue;
  const group=groups.get(identity.value)||{...identity,label:identity.value==='name:'?'Client à renseigner':identity.label,markets:[]};
  group.markets.push(market);groups.set(identity.value,group);
 }
 return [...groups.values()].sort((a,b)=>a.label.localeCompare(b.label,'fr')||a.value.localeCompare(b.value));
}
