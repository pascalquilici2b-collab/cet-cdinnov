import {useState} from 'react';
import {ListChecks,Plus} from 'lucide-react';
import type {Price} from './markets-contracts';
import {formatMinor} from '../billing-domain';
import {applicablePrices,priceDescription,priceTtcMinor,type BpuMarket} from '../billing-market-prices';
import {Field} from './billing-fields';
import {Help} from './billing-help';
import {ActivitySelect} from './activity-select';
export {bpuLine,clientMarkets} from '../billing-market-prices';
export function BpuPicker({markets,marketId,date,query='',busy,onPick}:{markets:BpuMarket[];marketId:string;date:string;query?:string;busy:boolean;onPick:(market:BpuMarket,price:Price)=>void}){
 const [id,setId]=useState(markets.length===1?markets[0].id:''),market=markets.find(m=>m.id===(marketId||id));
 if(!markets.length)return null;
 const prices=applicablePrices(market,date,query);
 return <section className="bill-bpu-picker" aria-label="Tarifs du marché">
  <div className="bill-bpu-heading"><h3><ListChecks size={18}/>Tarifs du marché <span className="bill-bpu-count">{prices.length}</span></h3><Help label="Tarifs BPU et DQE" text="Prestations du BPU ou du DQE du marché. Le prix HT, l’unité et le taux de TVA renseignés sont repris. Un taux absent utilise la TVA habituelle de 20 %. Les montants et quantités restent modifiables ; vérifiez les tarifs issus d’une lecture automatique."/></div>
  {marketId&&market?<p className="bill-bpu-contract">{market.clientName}<span>{market.reference} · BPU / DQE</span></p>:<Field label="Marché du client"><ActivitySelect label="Marché du client" value={id} disabled={busy} onChange={setId} placeholder="Choisir un marché" options={markets.map(m=>({value:m.id,label:m.clientName||'Client à renseigner',detail:[m.reference,m.title].filter(Boolean).join(' · '),activity:m.activity}))}/></Field>}
  {market&&<div className="bill-bpu-lines">{prices.map(p=>{const ttc=priceTtcMinor(p),unit=({day:'jour',hour:'heure',flat:'forfait',unit:'unité',km:'km'} as Record<string,string>)[p.unit]||p.unit;return <button key={p.id} type="button" aria-label={'Choisir le tarif '+priceDescription(p)} disabled={busy} onClick={()=>onPick(market,p)}>
   <span className="bill-bpu-label"><strong>{priceDescription(p)}</strong></span>
   <span className="bill-bpu-amount"><strong>{p.amountMinor==null?'Tarif à compléter':formatMinor(String(p.amountMinor))+' HT / '+unit}</strong><small>{ttc==null?(p.vatRate==null?'':`TVA ${p.vatRate} %`):formatMinor(String(ttc))+' TTC · TVA '+p.vatRate+' %'}</small></span><Plus size={18} aria-hidden="true"/>
  </button>;})}{!prices.length&&<p className="bill-bpu-empty">{query?'Aucun tarif correspondant.':'Aucun tarif applicable à cette date.'}</p>}</div>}
 </section>;
}
