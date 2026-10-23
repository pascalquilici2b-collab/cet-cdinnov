import {Help} from './billing-help';
import {formatMinor} from '../billing-domain';
import './engagement-meter.css';
export const engagementMoney=(n:number|null)=>n===null?'À renseigner':formatMinor(String(n));
export function EngagementMeter({used,maximum,reserved=0,pending=false,label='Consommation'}:{used:number;maximum:number|null;reserved?:number;pending?:boolean;label?:string}){
 const percent=maximum!==null&&maximum>0?used/maximum*100:null,total=used+reserved,tone=maximum!==null&&total>maximum?'over':percent!==null&&percent>=85?'near':'normal';
 return <div className="cdi-consumption" data-tone={tone}>
 <div className="cdi-consumption-value"><strong>{engagementMoney(used)}</strong><span> / {engagementMoney(maximum)} HT</span><b>{percent===null?'—':Math.round(percent)+' %'}</b></div>
 <div className="cdi-consumption-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent===null?undefined:Math.max(0,Math.min(100,percent))} aria-valuetext={maximum===null?'Montant du bon non renseigné':engagementMoney(used)+' facturés sur '+engagementMoney(maximum)}><span style={{width:Math.max(0,Math.min(100,percent||0))+'%'}}/>{reserved>0&&maximum!==null&&maximum>0&&<i style={{left:Math.max(0,Math.min(100,percent||0))+'%',width:Math.max(0,Math.min(100-(percent||0),reserved/maximum*100))+'%'}}/>}</div>
 <div className="cdi-consumption-caption"><span>{maximum===null?'Montant à renseigner':total>maximum?'Dépassement '+engagementMoney(total-maximum):'Reste '+engagementMoney(maximum-total)}{reserved>0&&<small> · {engagementMoney(reserved)} en brouillons</small>}</span>{pending&&<span className="cdi-consumption-pending">À vérifier <Help label="Historique à vérifier" text="La barre représente les factures déjà rattachées. Le solde est provisoire jusqu’au rapprochement complet des anciennes factures."/></span>}</div>
 </div>;
}
