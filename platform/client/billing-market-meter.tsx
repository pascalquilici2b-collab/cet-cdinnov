import type {BillingContext} from '../billing-contracts';
import {formatMinor} from '../billing-domain';
import './billing-market-meter.css';
export function MarketMeter({market,amount=0,documentId='',warn=false}:{market:BillingContext['markets'][number];amount?:number;documentId?:string;warn?:boolean}){
 const c=market.consumption;if(!c)return null;
 const used=c.quotedMinor,limit=c.maximumMinor,percent=limit&&limit>0?Math.max(0,Math.min(100,used/limit*100)):0,over=limit!=null&&used+(c.documentIds.includes(documentId)?0:amount)>limit,date=c.resetDate?.split('-').reverse().join('/');
 return <div className="bill-market-meter"><div><span>{formatMinor(String(used))}{limit!=null?' / '+formatMinor(String(limit)):''} HT</span><span>{date?'Réinitialisation le '+date:c.annual?'Réinitialisation à renseigner':'Engagement global'}</span></div><div className="bill-market-track" role="progressbar" aria-label="Consommation du marché" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><i style={{width:percent+'%'}} data-over={over}/></div>{warn&&over&&c.annual&&<p role="alert">{date?`Attention, le plafond annuel de ce marché est dépassé. Il sera remis à zéro le ${date}. Le devis peut être créé, mais il ne pourra être engagé par le client (création du bon de commande) qu'à partir du ${date}.`:'Le plafond annuel est dépassé. Complétez la date de réinitialisation dans le marché.'}</p>}</div>;
}
