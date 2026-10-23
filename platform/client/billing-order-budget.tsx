import {useEffect,useState} from 'react';
import {TriangleAlert,ShieldCheck} from 'lucide-react';
import type {BillingDraft,BillingTransport} from '../billing-contracts';
import {formatMinor} from '../billing-domain';
import './billing-order-budget.css';
type Capacity=Awaited<ReturnType<BillingTransport['orderBudget']>>;
export function useOrderBudget(transport:BillingTransport,id:string|undefined,draft:BillingDraft|undefined,locked:boolean){
 const key=JSON.stringify([id,draft]),[result,setResult]=useState<{key:string;capacity?:Capacity;error?:string}|null>(null);
 useEffect(()=>{let active=true;if(!id||!draft||locked||draft.kind!=='invoice'||!draft.references.marketId||!draft.references.orderId&&!draft.references.orderReference){setResult(null);return;}
 const timer=setTimeout(()=>{transport.orderBudget(id,draft).then(capacity=>{if(active)setResult({key,capacity});}).catch(()=>{if(active)setResult({key,error:'Le solde sera vérifié à l’enregistrement.'});});},350);
 return()=>{active=false;clearTimeout(timer);};},[transport,key,locked]);
 return result?.key===key?result:null;
}
export function OrderBudgetNotice({result}:{result:ReturnType<typeof useOrderBudget>}){
 const capacity=result?.capacity;if(!result||!capacity?.linked&&!result.error)return null;
 return <div className="bill-order-budget" data-blocked={!!capacity?.blocked} role={capacity?.blocked?'alert':'status'}>{capacity?.blocked?<TriangleAlert size={18}/>:<ShieldCheck size={18}/>}<span>{result.error||capacity?.message||(capacity?.availableMinor==null?'Montant du bon de commande à renseigner.':'Bon '+capacity.reference+' · Disponible pour cette facture : '+formatMinor(String(Math.max(0,capacity.availableMinor)))+' HT')}</span></div>;
}
