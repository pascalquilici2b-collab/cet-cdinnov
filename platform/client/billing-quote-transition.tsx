import {AgreementOrigin} from './billing-agreement-origin';
import {showSuccess} from './action-feedback';
import {useRef,useEffect,useState} from 'react';
import type {BillingDocument,BillingTransport} from '../billing-contracts';
import {billingToday} from '../billing-quote-domain';
import {Field} from './billing-fields';
export function QuoteTransition({action,record,transport,onDocument,onClose,onBusy}:{action:'sent'|'accepted';record:BillingDocument;transport:BillingTransport;onDocument:(r:BillingDocument)=>void;onClose:()=>void;onBusy:(s:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[date,setDate]=useState(billingToday()),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),attempt=useRef({id:crypto.randomUUID(),signature:''});
 useEffect(()=>{dialog.current?.showModal();},[]);
 async function save(){if(busy||!record.quote)return;setBusy(true);onBusy('quote-status');setError('');const signature=JSON.stringify([date,note]);if(attempt.current.signature!==signature)attempt.current={id:crypto.randomUUID(),signature};try{const next=await transport.quoteEvent(record.id,record.quote.version,{id:attempt.current.id,documentVersion:record.version,action,occurredOn:date,note});onDocument(next);onClose();showSuccess(action==='accepted'?'Devis accepté':'Envoi enregistré');}catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy('');}}
 return <dialog ref={dialog} className="bill-preview-edit-dialog" aria-label={action==='sent'?'Déclarer l’envoi':'Accepter le devis'} onCancel={e=>{if(busy)e.preventDefault();else onClose();}}><form onSubmit={e=>{e.preventDefault();void save();}}><h3>{action==='sent'?'Déclarer l’envoi':'Accepter le devis'}</h3><Field label={action==='sent'?'Date de l’envoi':'Date de l’accord'}><input type="date" required min={record.data.issueDate} max={action==='accepted'&&record.data.validUntil< billingToday()?record.data.validUntil:billingToday()} value={date} onChange={e=>setDate(e.target.value)}/></Field>{action==='accepted'&&<AgreementOrigin value={note} onChange={setNote}/>}{error&&<p role="alert">{error}</p>}<div><button type="button" className="bill-button" disabled={busy} onClick={onClose}>Annuler</button><button className="bill-button bill-button-primary" disabled={busy}>{busy?'Enregistrement…':'Enregistrer'}</button></div></form></dialog>;
}
