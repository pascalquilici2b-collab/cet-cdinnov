import type {BillingEngagementTracking} from './billing-contracts';

export type EngagementOrder=BillingEngagementTracking['orders'][number];
export type EngagementMarket=BillingEngagementTracking['markets'][number];
export interface EngagementFilters {search?:string;client?:string;}
export interface BillingEngagementOrderGroup {
 key:string;
 marketId:string;
 market:EngagementMarket|null;
 orders:EngagementOrder[];
 allOrderCount:number;
 /** Display totals of the visible orders only; never a market's annual consumption. */
 totals:{amountMinor:number;invoicedMinor:number;reservedMinor:number;unknownAmountCount:number;historyPending:boolean};
}

const fold=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('fr').trim();
const matches=(values:string[],client:string,filters:EngagementFilters)=>
 (!filters.client||client===filters.client)&&fold(values.join(' ')).includes(fold(filters.search||''));

/** IDs, including orphan IDs, are never reconstructed from labels or references. */
export function engagementOrderKey(order:EngagementOrder):string {
 return JSON.stringify(['order',order.marketId||'',order.projectId||'',order.kind,order.id]);
}

/** The current API carries display names, not client IDs. Keep that existing filter
 * explicit rather than inventing client identities from a company name or logo. */
export function engagementClientOptions(data:BillingEngagementTracking):{value:string;label:string}[] {
 return [...new Set([...data.markets.map(m=>m.client),...data.orders.map(o=>o.client)].filter(Boolean))]
  .sort((a,b)=>a.localeCompare(b,'fr')).map(value=>({value,label:value}));
}

export function filterEngagementMarkets(data:BillingEngagementTracking,filters:EngagementFilters={}):EngagementMarket[] {
 return data.markets.filter(m=>matches([m.client,m.reference,m.title],m.client,filters));
}

/** Pure presentation projection: original orders and complete market consumption
 * snapshots are retained. Filtering only changes the visible children and totals. */
export function groupEngagementOrders(data:BillingEngagementTracking,filters:EngagementFilters={}):BillingEngagementOrderGroup[] {
 const byMarket=new Map(data.markets.map(m=>[m.id,m]));
 const groups=new Map<string,BillingEngagementOrderGroup>();
 for(const order of data.orders){
  const marketId=order.marketId||'',market=byMarket.get(marketId)||null;
  const key=JSON.stringify(market?['market',marketId]:marketId?['unknown-market',marketId]:['unassigned']);
  let group=groups.get(key);
  if(!group){
   group={key,marketId,market,orders:[],allOrderCount:0,totals:{amountMinor:0,invoicedMinor:0,reservedMinor:0,unknownAmountCount:0,historyPending:false}};
   groups.set(key,group);
  }
  group.allOrderCount++;
  if(!matches([order.client,order.reference,order.project,order.market,market?.reference||'',market?.title||'',market?.client||''],order.client,filters))continue;
  group.orders.push(order);
  if(order.amountMinor===null)group.totals.unknownAmountCount++;
  else group.totals.amountMinor+=order.amountMinor;
  group.totals.invoicedMinor+=order.invoicedMinor;
  group.totals.reservedMinor+=order.reservedMinor||0;
  group.totals.historyPending ||= !!order.historyPending;
 }
 // Respect the API market order, with orphan groups afterwards in first-seen order.
 const position=new Map(data.markets.map((m,index)=>[m.id,index]));
 return [...groups.values()].filter(g=>g.orders.length).sort((a,b)=>(position.get(a.marketId)??data.markets.length)-(position.get(b.marketId)??data.markets.length));
}
