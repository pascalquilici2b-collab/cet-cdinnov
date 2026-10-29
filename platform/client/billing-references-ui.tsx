import {referencesForProject} from '../billing-reference-selection';
import {MarketMeter} from './billing-market-meter';
import {ProjectAvatar} from './project-logo';
import {ActivitySelect} from './activity-select';
import {projectActivity} from '../project-activity';
import type {BillingReferences,BillingContext,BillingTransport} from '../billing-contracts';
import {OrderPreview} from './billing-order-preview';
import {Field} from './billing-fields';
import {Help} from './billing-help';
import {RefreshCw,ExternalLink} from 'lucide-react';
export function ReferenceFields({kind,value:r,context,transport,onChange,onRefresh,onMarkets,amount=0,documentId=''}:{amount?:number;documentId?:string;kind:'quote'|'invoice';value:BillingReferences;context:BillingContext|null;transport:BillingTransport;onChange:(r:BillingReferences)=>void;onRefresh:()=>void;onMarkets:()=>void}){
 const market=context?.markets.find(m=>m.id===r.marketId),project=market?.projects?.find(p=>p.id===r.projectId),orders=project?.orders||market?.orders||[];
 return <>
  <div className="bill-reference-tools"><button className="bill-button bill-button-quiet" type="button" onClick={onMarkets}><ExternalLink size={15}/> Marchés et contrats</button><button type="button" className="bill-icon-button" aria-label="Actualiser les projets et commandes" onClick={onRefresh}><RefreshCw size={16}/></button></div>
  <div className="bill-fields">
   <Field label="Marché ou contrat" wide><ActivitySelect label="Marché ou contrat" value={r.marketId} onChange={value=>{const m=context?.markets.find(v=>v.id===value),p=m?.projects?.find(p=>p.id===r.projectId);onChange({...r,marketId:value,marketReference:m?.reference||'',projectId:p?.id||'',project:p?.name||'',orderId:'',orderReference:'',serviceCode:'',engagement:'',otherReference:''});}} placeholder="Sans marché lié" options={[...(r.marketId&&!market?[{value:r.marketId,label:r.marketReference||'Marché enregistré'}]:[]),...(context?.markets||[]).map(m=>({value:m.id,label:m.clientName||'Client à renseigner',detail:[m.reference,m.title].filter(Boolean).join(' · '),activity:m.activity}))]}/></Field>
   {market&&<MarketMeter market={market} amount={amount} documentId={documentId} warn={kind==='quote'}/>}
   {market&&<Field label="Projet" wide><ActivitySelect label="Projet du marché" value={r.projectId||''} onChange={value=>{const p=market.projects?.find(v=>v.id===value);onChange(referencesForProject(r,p||{id:'',name:'',orders:market.orders||[]}));}} placeholder="Sans projet lié" options={[...(r.projectId&&!project?[{value:r.projectId,label:r.project||'Projet enregistré'}]:[]),...(market?.projects||[]).filter(p=>!p.archived||p.id===r.projectId).map(p=>({value:p.id,label:p.name,activity:projectActivity(p),visual:<ProjectAvatar logo={p.logoData}/>}))]}/></Field>}
   {kind==='invoice'&&market&&<Field label="Bon de commande" wide action={r.orderId&&<OrderPreview key={r.marketId+':'+r.orderId} marketId={r.marketId} projectId={r.projectId||''} orderId={r.orderId} reference={r.orderReference} transport={transport}/>}><select aria-label="Bon de commande du projet" value={r.orderId||''} onChange={e=>{const o=orders.find(v=>v.id===e.target.value);onChange({...r,orderId:e.target.value,orderReference:o?.reference||'',serviceCode:o?.serviceCode||'',engagement:o?.engagement||'',otherReference:o?.otherReference||''});}}><option value="">Sans bon de commande lié</option>{r.orderId&&!orders.some(o=>o.id===r.orderId)&&<option value={r.orderId}>{r.orderReference||'Commande enregistrée'}</option>}{orders.filter(o=>!o.archived||o.id===r.orderId).map(o=><option key={o.id} value={o.id}>{o.reference}{o.archived?' · archivé':''}</option>)}</select></Field>}
   <Field label="Code affaire"><input list="bill-business-codes" value={r.businessCode} maxLength={300} onChange={e=>onChange({...r,businessCode:e.target.value})}/><datalist id="bill-business-codes">{context?.businessCodes.map(c=><option key={c.id} value={c.code}>{c.label}</option>)}</datalist></Field>
   {(!r.marketId)&&<Field label="Référence marché / contrat"><input value={r.marketReference} maxLength={300} onChange={e=>onChange({...r,marketReference:e.target.value})}/></Field>}
   {!r.projectId&&<Field label="Projet libre"><input value={r.project} maxLength={300} onChange={e=>onChange({...r,project:e.target.value})}/></Field>}
   {kind==='invoice'&&!r.orderId&&<Field label="Référence de commande libre"><input value={r.orderReference} maxLength={300} onChange={e=>onChange({...r,orderReference:e.target.value})}/></Field>}
  </div>
  <details className="bill-extra-fields"><summary>Références complémentaires <Help label="Références complémentaires" text="Le service et son numéro sont fournis par le client, notamment pour Chorus Pro."/></summary><div className="bill-fields">{([['serviceCode','Service / n° de service'],['engagement','N° d’engagement'],['otherReference','Autre référence']] as const).map(([k,label])=><Field key={k} label={label}><input value={r[k]||''} maxLength={300} onChange={e=>onChange({...r,[k]:e.target.value})}/></Field>)}</div></details>
 </>;
}
