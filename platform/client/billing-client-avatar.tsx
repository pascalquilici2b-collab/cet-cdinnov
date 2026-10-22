import {useState} from 'react';
import {clientBrand,clientBrands} from '../billing-client-brands';
export function clientLogo(name:string,identifier='',logoKey=''){const key=clientBrands.some(b=>b[0]===logoKey)?logoKey:clientBrand(name,identifier);return key?'platform/client-logos/'+key:undefined;}
export function ClientAvatar({name,identifier='',logoKey=''}:{name:string;identifier?:string;logoKey?:string}){
 const source=clientLogo(name,identifier,logoKey),[failed,setFailed]=useState('');
 return <span className={'bill-directory-monogram'+(source&&source!==failed?' bill-client-logo':'')} aria-hidden="true">{source&&source!==failed?<img src={source} alt="" width={48} height={48} loading="lazy" onError={()=>setFailed(source)}/>:name.trim().slice(0,2).toUpperCase()||'·'}</span>;
}
