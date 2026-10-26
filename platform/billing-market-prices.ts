import type {BillingContext,BillingDraft,BillingLine} from './billing-contracts';
import type {Price} from './client/markets-contracts';
import {newLine} from './billing-domain';

export type BpuMarket=BillingContext['markets'][number];
const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const clientMarkets=(context:BillingContext|null,d:BillingDraft)=>{
 const markets=context?.markets||[];
 // An explicit contract always takes precedence over other contracts of this client.
 if(d.references.marketId)return markets.filter(m=>m.id===d.references.marketId);
 return markets.filter(m=>(d.clientId&&m.clientId===d.clientId)||(d.buyer.name&&normalize(m.clientName)===normalize(d.buyer.name)));
};
export function priceDescription(price:Price){
 const parts=[price.label];
 for(const value of [price.profile,price.location])if(value&&!normalize(parts.join(' ')).includes(normalize(value)))parts.push(value);
 return parts.join(' · ');
}
export function applicablePrices(market:BpuMarket|undefined,date:string,query=''){
 const words=normalize(query).split(' ').filter(Boolean);
 return (market?.prices||[]).filter(p=>(!p.startDate||!date||p.startDate<=date)&&(!p.endDate||!date||p.endDate>=date)&&words.every(w=>normalize(priceDescription(p)).includes(w)));
}
export function bpuLine(price:Price):BillingLine{
 const rate=price.vatRate==null?'20':String(price.vatRate);
 return {...newLine(),description:priceDescription(price),unitPrice:price.amountMinor==null?'':(price.amountMinor/100).toFixed(2),unitCode:({day:'DAY',hour:'HUR',flat:'LS',unit:'C62',km:'KMT'} as Record<string,string>)[price.unit]||'C62',vatRate:rate,vatCategory:rate==='0'?'Z':'S'};
}
export function priceTtcMinor(price:Price):number|null{
 if(price.amountMinor==null||price.vatRate==null)return null;
 return Number((BigInt(price.amountMinor)*BigInt(10000+Math.round(price.vatRate*100))+5000n)/10000n);
}
