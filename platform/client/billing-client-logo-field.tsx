import {useRef,useState} from 'react';
import {Upload} from 'lucide-react';
import type {BillingClientData} from '../billing-contracts';
import {validClientLogoData} from '../billing-client-logo';
import {ClientAvatar} from './billing-client-avatar';

export function ClientLogoField({data,onChange}:{data:BillingClientData;onChange:(v:BillingClientData)=>void}){
 const input=useRef<HTMLInputElement>(null),[error,setError]=useState('');
 async function upload(file?:File){
  if(!file)return;setError('');
  try{
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>256*1024)throw Error('Choisissez un PNG, JPEG ou WebP de moins de 256 Ko.');
   const value=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Lecture du logo impossible.'));reader.readAsDataURL(file);});
   if(!validClientLogoData(value))throw Error('Image non reconnue.');
   onChange({...data,logoData:value});
  }catch(e){setError((e as Error).message);}finally{if(input.current)input.current.value='';}
 }
 return <div className="bill-client-logo-field"><ClientAvatar name={data.party.name} identifier={data.party.siren||data.party.siret} logoKey={data.logoKey} logoData={data.logoData}/><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Importer le logo du client" onChange={e=>void upload(e.target.files?.[0])}/><button type="button" className="bill-button" onClick={()=>input.current?.click()}><Upload size={16}/>{data.logoData?'Changer le logo':'Importer le logo'}</button>{error&&<span role="alert">{error}</span>}</div>;
}
