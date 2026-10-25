import {Field} from './billing-fields';
export const agreementOrigins=['Devis signé','Bon de commande','Accord par e-mail','Courrier du client','Autre accord écrit'];
export function AgreementOrigin({value,onChange}:{value:string;onChange:(value:string)=>void}){
 return <Field label="Origine de l’accord"><select required value={value} onChange={e=>onChange(e.target.value)}><option value="" disabled>Choisir une origine</option>{agreementOrigins.map(origin=><option key={origin}>{origin}</option>)}</select></Field>;
}
