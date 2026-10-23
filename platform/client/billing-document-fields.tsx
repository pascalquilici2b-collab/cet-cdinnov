import {ActivitySelect} from './activity-select';
import {projectActivity} from '../project-activity';
import type {BillingDraft,BillingContext,BillingDocumentDetails} from '../billing-contracts';
import {blankDocumentDetails,addBillingMonths,defaultFundingProgrammes} from '../billing-domain';
import {ProgrammeField,ConsultantAvatar} from './billing-programme-field';
import {Field} from './billing-fields';
export function DocumentFields({draft:d,context,onChange}:{draft:BillingDraft;context:BillingContext|null;onChange:(p:Partial<BillingDraft>)=>void}){
 const details=d.details||blankDocumentDetails(),patch=(p:Partial<BillingDocumentDetails>)=>onChange({details:{...details,...p}});
 const market=context?.markets.find(m=>m.id===d.references.marketId),people=context?.people||[],programmes=context?.settings.data.fundingProgrammes||defaultFundingProgrammes;
 return <>
  {d.kind==='quote'&&<Field path="details.validityMonths" label="Validité du devis (mois)"><input type="number" min={1} max={36} value={details.validityMonths} onChange={e=>onChange({details:{...details,validityMonths:e.target.value},validUntil:addBillingMonths(d.issueDate,e.target.value)})}/></Field>}
  <Field label="Période concernée"><select value={details.period} onChange={e=>patch({period:e.target.value as BillingDocumentDetails['period']})}><option value="">Choisir</option>{Array.from({length:8},(_,i)=><option key={i} value={"S"+(i+1)}>Semestre {i+1}</option>)}</select></Field>
  <Field label="Personne en charge"><ActivitySelect label="Personne en charge" value={details.personInCharge} placeholder="Choisir" onChange={value=>patch({personInCharge:value})} options={[...(details.personInCharge&&!people.some(p=>p.name===details.personInCharge)?[{value:details.personInCharge,label:details.personInCharge,visual:<ConsultantAvatar/>}]:[]),...people.map(p=>({value:p.name,label:p.name,visual:<ConsultantAvatar photo={p.photo}/>}))]}/></Field>
  <ProgrammeField label="Programme de financement" value={details.fundingProgramme} programmes={programmes} onChange={value=>patch({fundingProgramme:value})}/>

  <Field label="Marché lié" wide><ActivitySelect label="Marché lié" value={d.references.marketId} onChange={value=>{const m=context?.markets.find(m=>m.id===value);onChange({references:{...d.references,marketId:value,marketReference:m?.reference||'',projectId:'',project:'',orderId:'',orderReference:''},details:{...details,marketObject:m?.title||''}});}} placeholder="Sans marché lié" options={[...(d.references.marketId&&!market?[{value:d.references.marketId,label:d.references.marketReference||'Marché enregistré'}]:[]),...(context?.markets||[]).map(m=>({value:m.id,label:m.clientName||'Client à renseigner',detail:[m.reference,m.title].filter(Boolean).join(' · '),activity:m.activity}))]}/></Field>
  {(market||details.marketObject)&&<Field label="Objet du marché" wide><textarea rows={2} maxLength={500} value={details.marketObject} onChange={e=>patch({marketObject:e.target.value})}/></Field>}
  <Field label="Projet lié" wide><ActivitySelect label="Projet lié" value={d.references.projectId||''} onChange={value=>{const m=context?.markets.find(m=>m.projects?.some(p=>p.id===value)),p=m?.projects?.find(p=>p.id===value);onChange({references:{...d.references,projectId:p?.id||'',project:p?.name||'',orderId:'',orderReference:'',...(m?{marketId:m.id,marketReference:m.reference}:{})},details:{...details,...(m?{marketObject:m.title}:{}),...(p?.programme?{fundingProgramme:p.programme}:{})}});}} placeholder="Sans projet lié" options={[...(d.references.projectId&&!context?.markets.some(m=>m.projects?.some(p=>p.id===d.references.projectId))?[{value:d.references.projectId,label:d.references.project}]:[]),...(market?[market]:context?.markets||[]).flatMap(m=>(m.projects||[]).filter(p=>!p.archived||p.id===d.references.projectId).map(p=>({value:p.id,label:p.name,detail:[m.clientName,m.reference].filter(Boolean).join(' · '),activity:projectActivity(p)})))]}/></Field>
 </>;
}
