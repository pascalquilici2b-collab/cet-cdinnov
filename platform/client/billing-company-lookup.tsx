import {useEffect,useId,useRef,useState} from 'react';
import type {BillingParty,BillingClientDetails} from '../billing-contracts';
import {applyCompany,searchCompanies} from './billing-company-search';
import type {CompanySearch,CompanyCandidate} from './billing-company-search';
import {ClientAvatar} from './billing-client-avatar';
import {Help} from './billing-help';

export function CompanyLookup({party,onSelect,disabled=false}:{party:BillingParty;onSelect:(party:BillingParty,details:BillingClientDetails)=>void;disabled?:boolean}){
 const [query,setQuery]=useState(party.siret||party.siren||party.name),[result,setResult]=useState<CompanySearch|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState('');
 const request=useRef<AbortController|null>(null),current=useRef({party,onSelect,disabled}),input=useRef<HTMLInputElement>(null),id=useId();current.current={party,onSelect,disabled};
 useEffect(()=>()=>{request.current?.abort();request.current=null;},[]);
 const cancel=()=>{request.current?.abort();request.current=null;setPending(false);};
 async function search(){
  if(current.current.disabled)return;cancel();const controller=new AbortController();request.current=controller;
  setPending(true);setError('');setResult(null);setSelected('');
  const timer=setTimeout(()=>controller.abort('timeout'),12000);
  try{const data=await searchCompanies(query,controller.signal);if(request.current===controller&&!controller.signal.aborted)setResult(data);}
  catch(e){if(request.current===controller)setError(controller.signal.aborted?'La recherche a pris trop de temps. Réessayez ou saisissez les coordonnées.':e instanceof TypeError?'L’annuaire est injoignable. Votre saisie est conservée.':e instanceof Error?e.message:'La recherche n’a pas abouti.');}
  finally{clearTimeout(timer);if(request.current===controller){request.current=null;setPending(false);}}
 }
 function pick(candidate:CompanyCandidate){
  if(current.current.disabled)return;
  current.current.onSelect(applyCompany(current.current.party,candidate.party),candidate.details);
  setResult(null);setSelected(candidate.party.name);input.current?.focus();
 }
 return <div className="bill-company-lookup">
  <div className="bill-field-label"><label htmlFor={id}>Préremplir les coordonnées</label><Help label="Préremplissage du client" text="Choisissez l’établissement par nom, SIREN ou SIRET. L’annuaire fournit l’identité, la forme juridique, les dirigeants déclarés et la TVA active lorsqu’ils sont disponibles. Le capital, l’e-mail et le routage électronique restent à compléter. Les données sont modifiables ; aucun enregistrement n’est automatique."/></div>
  <div className="bill-company-search"><input ref={input} id={id} type="search" aria-label="Nom, SIREN ou SIRET du client" autoComplete="off" placeholder="Nom, SIREN ou SIRET" value={query} maxLength={200} disabled={disabled} onChange={e=>{cancel();setQuery(e.target.value);setResult(null);setError('');setSelected('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();if(!pending)void search();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();setResult(null);setError('');}}}/><button className="bill-button" type="button" disabled={disabled||pending||query.trim().length<3} onClick={()=>void search()}>{pending?<><span className="bill-spinner"/>Recherche…</>:'Rechercher'}</button></div>
  <div role="status" aria-live="polite" className="bill-company-status">{pending?'Recherche dans l’annuaire…':selected?<span className="bill-company-complete"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12"/><path d="m6.5 12 3.5 3.5 7.5-7.5"/></svg>Coordonnées préremplies</span>:result&&!result.candidates.length?'Aucun établissement trouvé. Précisez le nom ou saisissez les coordonnées.':''}</div>
  {error&&<p className="bill-field-error" role="alert">{error}</p>}
  {!!result?.candidates.length&&<div className="bill-company-results"><ul aria-label="Établissements trouvés">{result.candidates.map(candidate=><li key={candidate.party.siret}><button type="button" disabled={disabled} onClick={()=>pick(candidate)} aria-label={'Utiliser '+candidate.party.name+' — SIRET '+candidate.party.siret}><ClientAvatar name={candidate.party.name} identifier={candidate.party.siren}/><span><strong>{candidate.party.name}</strong><small>{candidate.party.addressLine1} · {candidate.party.postalCode} {candidate.party.city}</small><small>SIRET {candidate.party.siret}{candidate.headquarters?' · Siège':''}</small></span><span aria-hidden="true">↗</span></button></li>)}</ul>{result.hasMore&&<small className="bill-company-more">D’autres établissements existent. Précisez le SIRET.</small>}<a href="https://annuaire-entreprises.data.gouv.fr" target="_blank" rel="noreferrer">Annuaire des entreprises ↗</a></div>}
 </div>;
}
