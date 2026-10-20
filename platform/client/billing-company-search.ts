import type {BillingParty,BillingClientDetails} from '../billing-contracts';
import legalForms from './billing-legal-forms.json' with {type:'json'};
import {blankClientDetails} from '../billing-client-details.ts';

export type CompanyIdentity=Pick<BillingParty,'name'|'siren'|'siret'|'addressLine1'|'addressLine2'|'postalCode'|'city'|'country'>&Partial<Pick<BillingParty,'vatId'>>;
export interface CompanyCandidate {party:CompanyIdentity;details:BillingClientDetails;headquarters:boolean;url:string;}
export interface CompanySearch {candidates:CompanyCandidate[];hasMore:boolean;}
const endpoint='https://recherche-entreprises.api.gouv.fr/search';
const text=(value:unknown,max=300)=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,max):'';
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const luhn=(value:string)=>[...value].reverse().reduce((sum,n,i)=>{const v=Number(n)*(i%2?2:1);return sum+(v>9?v-9:v);},0)%10===0;
const validSiren=(value:string)=>/^\d{9}$/.test(value)&&!/^0+$/.test(value)&&luhn(value);
const validSiret=(value:string)=>/^\d{14}$/.test(value)&&validSiren(value.slice(0,9))&&(luhn(value)||(value.startsWith('356000000')&&[...value].reduce((sum,n)=>sum+Number(n),0)%5===0));
export function companyQuery(value:string):string {
 const query=value.trim().replace(/\s+/g,' '),digits=query.replace(/\s/g,'');
 if(query.length<3||query.length>200)throw Error('Saisissez au moins 3 caractères.');
 if(/^\d+$/.test(digits)){
  if(!validSiren(digits)&&!validSiret(digits))throw Error('Vérifiez le SIREN (9 chiffres) ou le SIRET (14 chiffres).');
  return digits;
 }
 return query;
}
/** Keep names and declared executive roles only: no birth dates or personal addresses. */
function legalDetails(company:Record<string,unknown>,siret:string):BillingClientDetails{
 const code=text(company.nature_juridique,4);
 const representatives=(Array.isArray(company.dirigeants)?company.dirigeants:[]).map(object).filter(d=>/^(gérant|gérante|co-gérant|co-gérante|président|présidente|directeur général|directrice générale|personne ayant le pouvoir)/i.test(text(d.qualite))&&!/conseil de surveillance/i.test(text(d.qualite))).map(d=>{
  const name=text(d.denomination)||[text(d.prenoms),text(d.nom)].filter(Boolean).join(' ');
  return name?name+' — '+text(d.qualite):'';
 }).filter(Boolean);
 const vatNumbers=[...new Set((Array.isArray(company.tva)?company.tva:[]).map(v=>text(v).replace(/\s/g,'').toUpperCase()).filter(v=>/^FR[A-Z0-9]{2}\d{9}$/.test(v)))].slice(0,20);
 return {...blankClientDetails(),legalForm:(legalForms as Record<string,string>)[code]||'',legalFormCode:code,representatives:[...new Set(representatives)].join('\n').slice(0,2000),vatNumbers,source:'https://annuaire-entreprises.data.gouv.fr/etablissement/'+siret,retrievedAt:new Date().toISOString().slice(0,10)};
}
/** Allowlist public identity fields. TVA comes from the explicit DGFiP response, never a calculated key. */
export function companyResults(raw:unknown,query:string):CompanySearch {
 const data=object(raw);
 if(!Array.isArray(data.results))throw Error('L’annuaire a renvoyé une réponse illisible. Réessayez.');
 const candidates:CompanyCandidate[]=[],seen=new Set<string>(),identifier=query.replace(/\s/g,'');
 let hasMore=typeof data.total_results==='number'&&data.total_results>5;
 for(const value of data.results.slice(0,5)){
  const company=object(value),siren=text(company.siren),name=text(company.nom_raison_sociale)||text(company.nom_complet);
  if(!validSiren(siren)||company.etat_administratif!=='A'||company.statut_diffusion!=='O'||!name)continue;
  if(/^\d+$/.test(identifier)&&siren!==identifier.slice(0,9))continue;
  const establishments=[company.siege,...(Array.isArray(company.matching_etablissements)?company.matching_etablissements.slice(0,10):[])];
  const companySites=new Set<string>();
  for(const site of establishments){
   const e=object(site),siret=text(e.siret);
   if(!validSiret(siret)||!siret.startsWith(siren)||e.etat_administratif!=='A'||e.statut_diffusion_etablissement!=='O'||e.code_pays_etranger)continue;
   if(identifier.length===14&&/^\d+$/.test(identifier)&&siret!==identifier)continue;
   companySites.add(siret);
   if(seen.has(siret))continue;
   const postalCode=text(e.cedex)||text(e.code_postal),city=text(e.libelle_cedex)||text(e.libelle_commune);
   let addressLine1=['numero_voie','indice_repetition','type_voie','libelle_voie'].map(k=>text(e[k])).filter(Boolean).join(' ');
   let addressLine2=[text(e.complement_adresse),text(e.distribution_speciale)].filter(Boolean).join(' ');
   if(!addressLine1){
    const address=text(e.adresse),suffix=' '+text(e.code_postal)+' '+text(e.libelle_commune);
    if(address.toLocaleUpperCase('fr').endsWith(suffix.toLocaleUpperCase('fr')))addressLine1=address.slice(0,-suffix.length).trim();
    // A flattened address already includes its complement.
    addressLine2='';
   }
   if(!/^\d{5}$/.test(postalCode)||!city||!addressLine1)continue;
   seen.add(siret);
   const details=legalDetails(company,siret);
   candidates.push({party:{name,siren,siret,addressLine1,addressLine2,postalCode,city,country:'FR',...(details.vatNumbers.length===1?{vatId:details.vatNumbers[0]}:{})},details,headquarters:e.est_siege===true,url:details.source});
  }
  if(identifier.length!==14&&typeof company.nombre_etablissements_ouverts==='number'&&company.nombre_etablissements_ouverts>companySites.size)hasMore=true;
 }
 return {candidates:candidates.slice(0,20),hasMore:hasMore||candidates.length>20};
}
export async function searchCompanies(value:string,signal:AbortSignal):Promise<CompanySearch> {
 const query=companyQuery(value);
 const response=await fetch(endpoint+'?'+new URLSearchParams({q:query,page:'1',per_page:'5',minimal:'true',include:'siege,matching_etablissements,dirigeants,tva',limite_matching_etablissements:'10'}),{signal,credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/json'}});
 if(response.status===429)throw Error('L’annuaire reçoit trop de demandes. Réessayez dans quelques secondes.');
 if(!response.ok)throw Error('L’annuaire est momentanément indisponible. Vous pouvez saisir les coordonnées.');
 const reader=response.body?.getReader();if(!reader)throw Error('La réponse de l’annuaire est vide.');
 const chunks:Uint8Array[]= [];let size=0;
 try{
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw Error('Précisez la recherche avec un SIRET.');}chunks.push(value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let data:unknown;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('La réponse de l’annuaire est illisible. Réessayez.');}
 return companyResults(data,query);
}
export function applyCompany(current:BillingParty,identity:CompanyIdentity):BillingParty {
 const oldSiren=(current.siren||current.siret.slice(0,9)).replace(/\s/g,'');
 const different=oldSiren?oldSiren!==identity.siren:!!current.name.trim()&&current.name.trim().toLocaleUpperCase('fr')!==identity.name.toLocaleUpperCase('fr');
 return {...current,...(different?{vatId:'',email:'',legal:'',electronicAddress:'',electronicScheme:''}:current.siret&&current.siret.replace(/\s/g,'')!==identity.siret?{electronicAddress:'',electronicScheme:''}:{}),...identity};
}
