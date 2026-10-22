import {useState} from 'react';
import {ListChecks,Plus} from 'lucide-react';
import type {BillingContext,BillingDraft,BillingLine} from '../billing-contracts';
import type {Price} from './markets-contracts';
import {newLine,formatMinor} from '../billing-domain';
import {Field} from './billing-fields';
export type BpuMarket=BillingContext['markets'][number];
export const clientMarkets=(context:BillingContext|null,d:BillingDraft)=>{
 const name=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('fr');
 return context?.markets.filter(m=>m.id===d.references.marketId||(d.clientId&&m.clientId===d.clientId)||(d.buyer.name&&name(m.clientName)===name(d.buyer.name)))||[];
};
export function bpuLine(price:Price):BillingLine{
 return {...newLine(),description:[price.label,price.profile,price.location].filter(Boolean).join(' · '),unitPrice:price.amountMinor===null?'':(price.amountMinor/100).toFixed(2),unitCode:({day:'DAY',hour:'HUR',flat:'C62',unit:'C62',km:'KMT'} as Record<string,string>)[price.unit]||'C62'};
}
export function BpuPicker({markets,marketId,date,busy,onPick}:{markets:BpuMarket[];marketId:string;date:string;busy:boolean;onPick:(market:BpuMarket,price:Price)=>void}){
 const [id,setId]=useState(marketId|| (markets.length===1?markets[0].id:'')),market=markets.find(m=>m.id===id);
 if(!markets.length)return null;
 const prices=market?.prices?.filter(p=>(!p.startDate||!date||p.startDate<=date)&&(!p.endDate||!date||p.endDate>=date))||[];
 return <section className="bill-bpu-picker" aria-label="BPU du client"><h3><ListChecks size={18}/> Bordereau du marché</h3>
  <Field label="Marché du client"><select value={id} disabled={busy} onChange={e=>setId(e.target.value)}><option value="">Choisir un marché</option>{markets.map(m=><option key={m.id} value={m.id}>{m.reference?m.reference+' · ':''}{m.title}</option>)}</select></Field>
  {market&&<div className="bill-bpu-lines">{prices.map(p=><button key={p.id} type="button" disabled={busy||p.amountMinor===null} onClick={()=>onPick(market,p)}><span><strong>{p.label}</strong>{(p.profile||p.location)&&<small>{[p.profile,p.location].filter(Boolean).join(' · ')}</small>}</span><span>{p.amountMinor===null?'Tarif à compléter':formatMinor(String(p.amountMinor))}</span><Plus size={16}/></button>)}{!prices.length&&<p>Aucun tarif applicable à cette date.</p>}</div>}
 </section>;
}
