import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Clock3,FileCheck2,FilePenLine,RefreshCw} from 'lucide-react';
import type {BillingKind,BillingListState,BillingTransport} from '../billing-contracts';
import {listWithImports,type ImportedInvoices} from './billing-imports';
import './billing-attention.css';

const shortcuts=[
 {kind:'invoice',state:'overdue',label:'En retard d’encaissement',short:'En retard',icon:Clock3},
 {kind:'invoice',state:'finalized',label:'Factures à envoyer',short:'Factures à envoyer',icon:FileCheck2},
 {kind:'quote',state:'prepared',label:'Devis à envoyer',short:'Devis à envoyer',icon:FilePenLine},
] as const;
export function BillingAttention({transport,imported,revision,active,disabled,onSelect}:{transport:BillingTransport;imported?:ImportedInvoices;revision:number;active:{kind:BillingKind;state:BillingListState}|null;disabled:boolean;onSelect:(kind:BillingKind,state:BillingListState)=>void}){
 const [counts,setCounts]=useState<(number|null)[]>([null,null,null]),[refresh,setRefresh]=useState(0),[error,setError]=useState(false);
 useEffect(()=>{const update=()=>setRefresh(n=>n+1);window.addEventListener('focus',update);return()=>window.removeEventListener('focus',update);},[]);
 useEffect(()=>{let alive=true;setError(false);Promise.all(shortcuts.map(s=>listWithImports(transport,{kind:s.kind,state:s.state,q:'',offset:0,limit:1},imported))).then(results=>{if(alive)setCounts(results.map(r=>r.total));},()=>{if(alive){setCounts([null,null,null]);setError(true);}});return()=>{alive=false;};},[transport,imported,revision,refresh]);
 const content=<nav className="bill-attention" aria-label="Documents à suivre">{shortcuts.map((s,i)=><button type="button" key={s.kind+s.state} data-tone={s.state} title={s.label} aria-label={s.label+(counts[i]===null?'':' : '+counts[i])} aria-pressed={active?.kind===s.kind&&active.state===s.state} disabled={disabled} onClick={()=>onSelect(s.kind,s.state)}><s.icon size={16}/><span className="bill-attention-label">{s.short}</span><b aria-hidden="true">{counts[i]??'—'}</b></button>)}{error&&<button type="button" className="bill-attention-retry" title="Actualiser les compteurs" aria-label="Actualiser les compteurs" onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={15}/></button>}</nav>;
 const target=document.getElementById('billingAttention');
 return target?createPortal(content,target):content;
}
