import {useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {Select} from 'radix-ui';
import {Check,ChevronDown,ChevronUp,CheckCircle2,MinusCircle,Clock3} from 'lucide-react';
import type {Activity} from '../project-activity';
import './activity-select.css';

export function ActivityBadge({activity}:{activity?:Activity}){
 const state=activity?.state||'unknown';
 return <span className="cdi-activity" data-state={state} title={activity?.reason}>{state==='active'?<CheckCircle2 size={13} aria-hidden="true"/>:state==='inactive'?<MinusCircle size={13} aria-hidden="true"/>:<Clock3 size={13} aria-hidden="true"/>}{state==='active'?'Actif':state==='inactive'?'Inactif':'Dates à renseigner'}</span>;
}
export type ActivityOption={value:string;label:string;detail?:string;activity?:Activity;name?:string;visual?:ReactNode};
// The shadcn/Radix Select pattern supports rich options, keyboard navigation,
// type-ahead and a portal inside the surrounding dialog when needed.
export function ActivitySelect({label,value,onChange,options,placeholder,disabled=false,required=false,nativeId,id}:{label:string;value:string;onChange:(v:string)=>void;options:ActivityOption[];placeholder:string;disabled?:boolean;required?:boolean;nativeId?:string;id?:string}){
 const trigger=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false);
 const selected=options.find(o=>o.value===value);
 return <div className="cdi-activity-select"><Select.Root open={open} onOpenChange={setOpen} value={value||'__none__'} onValueChange={v=>onChange(v==='__none__'?'':v)} disabled={disabled} required={required}>
  <Select.Trigger ref={trigger} id={id} className="cdi-select-trigger" aria-label={label}>{selected?.visual}<span className="cdi-select-value">{selected?<><strong>{selected.label}</strong>{selected.detail&&<small>{selected.detail}</small>}</>:placeholder}</span>{selected?.activity&&<ActivityBadge activity={selected.activity}/>}<Select.Icon><ChevronDown size={16}/></Select.Icon></Select.Trigger>
  <Select.Portal container={trigger.current?.closest('dialog')||undefined}><Select.Content position="popper" sideOffset={5} className="cdi-select-content" collisionPadding={12}><Select.ScrollUpButton className="cdi-select-scroll"><ChevronUp size={16}/></Select.ScrollUpButton><Select.Viewport>
   <Select.Item value="__none__" className="cdi-select-option"><Select.ItemText>{placeholder}</Select.ItemText></Select.Item>
   {options.map(o=><Select.Item data-value={o.value} key={o.value} value={o.value} textValue={[o.label,o.detail].filter(Boolean).join(' ')} className="cdi-select-option">{o.visual}<span className="cdi-select-value"><Select.ItemText>{o.label}</Select.ItemText>{o.detail&&<small>{o.detail}</small>}</span>{o.activity&&<ActivityBadge activity={o.activity}/>}<Select.ItemIndicator className="cdi-select-check"><Check size={15}/></Select.ItemIndicator></Select.Item>)}
  </Select.Viewport><Select.ScrollDownButton className="cdi-select-scroll"><ChevronDown size={16}/></Select.ScrollDownButton></Select.Content></Select.Portal>
 </Select.Root>{nativeId&&<select id={nativeId} value={value} disabled={disabled} hidden aria-hidden="true" onChange={e=>onChange(e.target.value)}><option value=""/>{options.map(o=><option key={o.value} value={o.value} data-name={o.name||o.label}>{o.label}</option>)}</select>}</div>;
}
