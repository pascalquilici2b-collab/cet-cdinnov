import {Children,cloneElement,isValidElement,useId} from 'react';
import type {ReactNode} from 'react';
import type {BillingParty} from '../billing-contracts';
export function Field({label,children,hint,wide=false}:{label:string;children:ReactNode;hint?:string;wide?:boolean}){
 const hintId=useId();
 // Explicit control names stay stable after a textarea is filled or a select changes.
 const controls=Children.map(children,child=>isValidElement<Record<string,unknown>>(child)&&typeof child.type==='string'&&['input','textarea','select'].includes(child.type)?cloneElement(child,{'aria-label':child.props['aria-label']||label,...(hint?{'aria-describedby':hintId}:{})}):child);
 return <label className={'bill-field'+(wide?' bill-wide':'')}><span>{label}</span>{controls}{hint&&<small id={hintId}>{hint}</small>}</label>;
}
export function PartyFields({party,onChange,prefix}:{party:BillingParty;onChange:(patch:Partial<BillingParty>)=>void;prefix:string}){
 const schemeId=useId();
 const field=(key:keyof BillingParty,label:string,wide=false,max=300)=> <Field label={label} wide={wide}><input aria-label={prefix+' — '+label} value={party[key]} maxLength={max} onChange={e=>onChange({[key]:key==='country'?e.target.value.toUpperCase():e.target.value})}/></Field>;
 return <><div className="bill-fields">{field('name','Raison sociale',true)}{field('addressLine1','Adresse',true)}{field('addressLine2','Complément d’adresse',true)}{field('postalCode','Code postal')}{field('city','Ville')}{field('country','Pays (code ISO)',false,2)}{field('email','E-mail')}{field('siren','SIREN',false,30)}{field('siret','SIRET',false,30)}{field('vatId','N° de TVA',false,40)}<Field label="Mentions de l’entreprise" wide><textarea aria-label={prefix+' — Mentions de l’entreprise'} value={party.legal} maxLength={1000} rows={2} onChange={e=>onChange({legal:e.target.value})}/></Field></div><details className="bill-extra-fields"><summary>Adresse de facturation électronique</summary><p>Identifiant utilisé pour la facturation électronique, distinct de l’e-mail de contact. Renseignez les coordonnées communiquées par votre plateforme.</p><div className="bill-fields">{field('electronicAddress','Adresse de facturation électronique',true)}<Field label="Type d’adresse électronique" wide hint="0225 : SIREN · 0009 : SIRET · EM : e-mail. Un autre code peut être saisi."><input aria-label={prefix+' — Type d’adresse électronique'} list={schemeId} value={party.electronicScheme} maxLength={300} onChange={e=>onChange({electronicScheme:e.target.value})}/><datalist id={schemeId}><option value="0225">SIREN</option><option value="0009">SIRET</option><option value="EM">E-mail</option></datalist></Field></div></details></>;
}
