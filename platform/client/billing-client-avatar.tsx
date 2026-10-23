import {createContext,useContext,useState} from 'react';
import type {BillingContext} from '../billing-contracts';
import {validClientLogoData} from '../billing-client-logo';
import {clientBrand,clientBrands} from '../billing-client-brands';
export function clientLogo(name:string,identifier='',logoKey=''){const selected=clientBrands.some(b=>b[0]===logoKey)?logoKey:clientBrand(name,identifier);const key=selected==='cci-corse.webp'?'epci-corse.png':selected;return key?'platform/client-logos/'+key:undefined;}
export const ClientLogosContext=createContext<NonNullable<BillingContext['clientLogos']>>([]);
const normalized=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function ClientAvatar({name,identifier='',logoKey='',logoData=''}:{name:string;identifier?:string;logoKey?:string;logoData?:string}){
 const directory=useContext(ClientLogosContext),matches=directory.filter(c=>identifier?(c.siren===identifier.slice(0,9)||c.siret===identifier):normalized(c.name)===normalized(name)),found=matches.length===1?matches[0]:undefined;
 const custom=logoData||found?.logoData,source=validClientLogoData(custom)?custom:clientLogo(name,identifier,logoKey||found?.logoKey),[failed,setFailed]=useState('');
 return <span className={'bill-directory-monogram'+(source&&source!==failed?' bill-client-logo':'')} aria-hidden="true">{source&&source!==failed?<img src={source} alt="" width={48} height={48} loading="lazy" onError={()=>setFailed(source)}/>:name.trim().slice(0,2).toUpperCase()||'·'}</span>;
}
