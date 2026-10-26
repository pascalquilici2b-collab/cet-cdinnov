import {ProjectAvatar} from './project-logo';
import {ActivitySelect} from './activity-select';
import {projectActivity} from '../project-activity';
import type {BillingDraft,BillingContext,BillingDocumentDetails} from '../billing-contracts';
import {blankDocumentDetails,addBillingMonths,defaultFundingProgrammes} from '../billing-domain';
import {ProgrammeField,ConsultantAvatar} from './billing-programme-field';
import {Field} from './billing-fields';
import {PeriodSelect} from './billing-period-select';
export function DocumentFields({draft:d,context,onChange}:{draft:BillingDraft;context:BillingContext|null;onChange:(p:Partial<BillingDraft>)=>void}){
 const details=d.details||blankDocumentDetails(),patch=(p:Partial<BillingDocumentDetails>)=>onChange({details:{...details,...p}});
 const market=context?.markets.find(m=>m.id===d.references.marketId),people=context?.people||[],programmes=context?.settings.data.fundingProgrammes||defaultFundingProgrammes;
 return <>
  {d.kind==='quote'&&<Field path="details.validityMonths" label="Validité du devis (mois)"><input type="number" min={1} max={36} value={details.validityMonths} onChange={e=>onChange({details:{...details,validityMonths:e.target.value},validUntil:addBillingMonths(d.issueDate,e.target.value)})}/></Field>}
  <Field label="Période concernée"><PeriodSelect label="Période concernée" value={details} onCustomChange={customPeriod=>patch({customPeriod})} onChange={periods=>patch({periods,period:periods[0]||''})}/></Field>
  <Field label="Personne en charge"><ActivitySelect label="Personne en charge" value={details.personInCharge} placeholder="Choisir" onChange={value=>patch({personInCharge:value})} options={[...(details.personInCharge&&!people.some(p=>p.name===details.personInCharge)?[{value:details.personInCharge,label:details.personInCharge,visual:<ConsultantAvatar/>}]:[]),...people.map(p=>({value:p.name,label:p.name,visual:<ConsultantAvatar photo={p.photo}/>}))]}/></Field>
  <ProgrammeField label="Programme de financement" value={details.fundingProgramme} programmes={programmes} onChange={value=>patch({fundingProgramme:value})}/>

 </>;
}
