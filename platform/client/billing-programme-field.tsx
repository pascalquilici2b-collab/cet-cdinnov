import {useState} from 'react';
import {Field} from './billing-fields';
export function ProgrammeField({value,programmes,onChange}:{value:string;programmes:string[];onChange:(v:string)=>void}){
 const [custom,setCustom]=useState(false),other=custom||!!value&&!programmes.includes(value);
 return <><Field label="Programme"><select value={other?'__other__':value} onChange={e=>{setCustom(e.target.value==='__other__');onChange(e.target.value==='__other__'?'':e.target.value);}}><option value="">Aucun</option>{programmes.filter(Boolean).map(p=><option key={p}>{p}</option>)}<option value="__other__">Autre : préciser</option></select></Field>{other&&<Field label="Autre programme"><input maxLength={160} value={value} onChange={e=>onChange(e.target.value)}/></Field>}</>;
}
