import {useState} from 'react';
import {Globe2,UserRound} from 'lucide-react';
import {Field} from './billing-fields';
import {ActivitySelect} from './activity-select';
const programmeLogo=(name:string)=>{const key=name.toLowerCase().replace(/[^a-z]/g,'');return key.includes('maritime')||key.includes('marittimo')?'maritime.png':key.includes('euromed')?'euro-med.png':key.includes('nextmed')?'next-med.svg':key.includes('horizon')?'europe.svg':'';};
export function ProgrammeIcon({name}:{name:string}){const logo=programmeLogo(name);return logo?<span className="bill-programme-logo"><img src={'/platform/programme-logos/'+logo} alt=""/></span>:<Globe2 size={20} aria-hidden="true"/>;}
export function ConsultantAvatar({photo}:{photo?:string}){const [failed,setFailed]=useState(false);return <span className="bill-consultant-avatar">{photo&&!failed?<img src={photo} alt="" onError={()=>setFailed(true)}/>:<UserRound size={18} aria-hidden="true"/>}</span>;}
export function ProgrammeField({value,programmes,onChange,label='Programme'}:{value:string;programmes:string[];onChange:(v:string)=>void;label?:string}){
 const [custom,setCustom]=useState(false),other=custom||!!value&&!programmes.includes(value);
 return <><Field label={label}><ActivitySelect label={label} placeholder="Aucun" value={other?'__other__':value} onChange={v=>{setCustom(v==='__other__');onChange(v==='__other__'?'':v);}} options={[...programmes.filter(Boolean).map(p=>({value:p,label:p,visual:<ProgrammeIcon name={p}/>})),{value:'__other__',label:'Autre : préciser',visual:<Globe2 size={20}/>} ]}/></Field>{other&&<Field label="Autre programme"><input maxLength={160} value={value} onChange={e=>onChange(e.target.value)}/></Field>}</>;
}
