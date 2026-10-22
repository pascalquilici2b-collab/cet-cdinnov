import {ActivitySelect} from './activity-select';
import {projectActivity} from '../project-activity';
import type {BillingReferences,BillingContext} from '../billing-contracts';
import {Field} from './billing-fields';
import {Help} from './billing-help';
import {RefreshCw,ExternalLink} from 'lucide-react';
export function ReferenceFields({kind,value:r,context,onChange,onRefresh,onMarkets}:{kind:'quote'|'invoice';value:BillingReferences;context:BillingContext|null;onChange:(r:BillingReferences)=>void;onRefresh:()=>void;onMarkets:()=>void}){
 const market=context?.markets.find(m=>m.id===r.marketId),project=market?.projects?.find(p=>p.id===r.projectId);
 return <>
  <div className="bill-reference-tools"><button className="bill-button bill-button-quiet" type="button" onClick={onMarkets}><ExternalLink size={15}/> Marchés et contrats</button><button type="button" className="bill-icon-button" aria-label="Actualiser les projets et commandes" onClick={onRefresh}><RefreshCw size={16}/></button></div>
  <div className="bill-fields">
   <Field label="Marché ou contrat" wide><ActivitySelect label="Marché ou contrat" value={r.marketId} onChange={value=>{const m=context?.markets.find(v=>v.id===value);onChange({...r,marketId:value,marketReference:m?.reference||'',projectId:'',project:'',orderId:'',orderReference:''});}} placeholder="Sans marché lié" options={[...(r.marketId&&!market?[{value:r.marketId,label:r.marketReference||'Marché enregistré'}]:[]),...(context?.markets||[]).map(m=>({value:m.id,label:m.clientName||'Client à renseigner',detail:[m.reference,m.title].filter(Boolean).join(' · '),activity:m.activity}))]}/></Field>
   {market&&<Field label="Projet" wide><ActivitySelect label="Projet du marché" value={r.projectId||''} onChange={value=>{const p=market.projects?.find(v=>v.id===value);onChange({...r,projectId:value,project:p?.name||'',orderId:'',orderReference:''});}} placeholder="Sans projet lié" options={[...(r.projectId&&!project?[{value:r.projectId,label:r.project||'Projet enregistré'}]:[]),...(market?.projects||[]).filter(p=>!p.archived||p.id===r.projectId).map(p=>({value:p.id,label:p.name,activity:projectActivity(p)}))]}/></Field>}
   {kind==='invoice'&&project&&<Field label="Bon de commande" wide><select aria-label="Bon de commande du projet" value={r.orderId||''} onChange={e=>{const o=project.orders.find(v=>v.id===e.target.value);onChange({...r,orderId:e.target.value,orderReference:o?.reference||''});}}><option value="">Sans bon de commande lié</option>{r.orderId&&!project.orders.some(o=>o.id===r.orderId)&&<option value={r.orderId}>{r.orderReference||'Commande enregistrée'}</option>}{project.orders.filter(o=>!o.archived||o.id===r.orderId).map(o=><option key={o.id} value={o.id}>{o.reference}{o.archived?' · archivé':''}</option>)}</select></Field>}
   <Field label="Code affaire"><input list="bill-business-codes" value={r.businessCode} maxLength={300} onChange={e=>onChange({...r,businessCode:e.target.value})}/><datalist id="bill-business-codes">{context?.businessCodes.map(c=><option key={c.id} value={c.code}>{c.label}</option>)}</datalist></Field>
   {(!r.marketId)&&<Field label="Référence marché / contrat"><input value={r.marketReference} maxLength={300} onChange={e=>onChange({...r,marketReference:e.target.value})}/></Field>}
   {!r.projectId&&<Field label="Projet libre"><input value={r.project} maxLength={300} onChange={e=>onChange({...r,project:e.target.value})}/></Field>}
   {kind==='invoice'&&!r.orderId&&<Field label="Référence de commande libre"><input value={r.orderReference} maxLength={300} onChange={e=>onChange({...r,orderReference:e.target.value})}/></Field>}
  </div>
  <details className="bill-extra-fields"><summary>Références complémentaires <Help label="Références complémentaires" text="Le code service et le numéro d’engagement sont fournis par le client, notamment pour Chorus Pro."/></summary><div className="bill-fields">{([['serviceCode','Code service'],['engagement','N° d’engagement']] as const).map(([k,label])=><Field key={k} label={label}><input value={r[k]} maxLength={300} onChange={e=>onChange({...r,[k]:e.target.value})}/></Field>)}</div></details>
 </>;
}
