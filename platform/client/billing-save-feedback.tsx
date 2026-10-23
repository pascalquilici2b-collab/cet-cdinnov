import {useEffect,useState} from 'react';

export function SaveFeedback({event}:{event:{id:number;label:string}|null}){
 const [visible,setVisible]=useState(false);
 useEffect(()=>{if(!event)return;setVisible(true);const timer=setTimeout(()=>setVisible(false),3000);return()=>clearTimeout(timer);},[event]);
 return <span className="bill-save-feedback" role="status" aria-live="polite">{visible&&event&&<span key={event.id}><svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13"/><path d="m8 14 4 4 8-8"/></svg>{event.label}</span>}</span>;
}
