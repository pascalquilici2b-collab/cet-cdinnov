import type {BillingClientData} from '../billing-contracts';
import {blankClientDetails} from '../billing-client-details';
import {Field} from './billing-fields';
import {BriefcaseBusiness,Landmark,UserRound} from 'lucide-react';
export function ClientLegalFields({data,onChange}:{data:BillingClientData;onChange:(data:BillingClientData)=>void}){
 const d=data.details||blankClientDetails();
 const patch=(value:Partial<typeof d>)=>onChange({...data,details:{...d,...value}});
 return <details className="bill-extra-fields bill-client-legal" open={!!d.legalForm||!!d.representatives}>
  <summary><Landmark size={17} aria-hidden="true"/> Informations juridiques</summary>
  <div className="bill-fields">
   <Field label="Forme juridique" wide><input value={d.legalForm} maxLength={400} onChange={e=>patch({legalForm:e.target.value})}/></Field>
   <Field label="Représentant légal / dirigeants" wide hint="Noms et fonctions déclarés au RNE. Plusieurs personnes peuvent être mentionnées ; vérifiez la personne habilitée à signer votre contrat."><textarea rows={2} value={d.representatives} maxLength={2000} onChange={e=>patch({representatives:e.target.value})}/></Field>
   <Field label="Capital social" wide hint="L’API publique actuelle ne fournit pas le capital. Renseignez le montant et sa devise, ou la mention capital variable, à partir d’un justificatif."><input placeholder="Non renseigné" value={d.shareCapital} maxLength={400} onChange={e=>patch({shareCapital:e.target.value})}/></Field>
   {d.vatNumbers.length>1&&<Field label="TVA déclarées — choisir le numéro applicable" wide><select value={d.vatNumbers.includes(data.party.vatId)?data.party.vatId:''} onChange={e=>onChange({...data,party:{...data.party,vatId:e.target.value}})}><option value="">Choisir une TVA</option>{d.vatNumbers.map(v=><option key={v}>{v}</option>)}</select></Field>}
  </div>
  {d.source&&<a className="bill-data-source" href={d.source} target="_blank" rel="noreferrer">Annuaire des entreprises · consulté le {d.retrievedAt.split('-').reverse().join('/')} ↗</a>}
 </details>;
}
