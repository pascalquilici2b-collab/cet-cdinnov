import {useEffect,useRef,useState} from 'react';
import {Send} from 'lucide-react';
import type {BillingDocument,BillingTransport} from '../billing-contracts';
import {billingToday} from '../billing-quote-domain';
import {Field} from './billing-fields';
import {showSuccess} from './action-feedback';

export function InvoiceSent({record,transport,onDocument,onClose,onBusy}:{record:BillingDocument;transport:BillingTransport;onDocument:(record:BillingDocument)=>void;onClose:()=>void;onBusy:(s:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),running=useRef(false),[date,setDate]=useState(billingToday()),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();},[]);
 async function save(){if(running.current)return;running.current=true;setBusy(true);onBusy('invoice-sent');setError('');try{const next=await transport.declareSent(record.id,record.version,{sentOn:date,confirmed:true});onDocument(next);onClose();showSuccess('Envoi enregistré');}catch(e){setError((e as Error).message);}finally{running.current=false;setBusy(false);onBusy('');}}
 return <dialog ref={dialog} className="bill-preview-edit-dialog" aria-label="Déclarer la facture envoyée" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}><form onSubmit={e=>{e.preventDefault();void save();}}><h3><Send size={19}/>Déclarer la facture envoyée</h3><Field label="Date de l’envoi"><input type="date" required min={record.data.issueDate} max={billingToday()} value={date} onChange={e=>setDate(e.target.value)} disabled={busy}/></Field>{error&&<p role="alert">{error}</p>}<div><button type="button" className="bill-button" disabled={busy} onClick={onClose}>Annuler</button><button className="bill-button bill-button-primary" disabled={busy}>{busy?'Enregistrement…':'Confirmer l’envoi effectué'}</button></div></form></dialog>;
}
