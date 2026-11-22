import {useEffect,useRef,useState} from 'react';
import type {BillingDocument,BillingTransport} from '../billing-contracts';
import {Field} from './billing-fields';
import {showSuccess} from './action-feedback';

export function InvoiceNumberReview({record,saved,busy,transport,onDocument,onBusy}:{record:BillingDocument;saved:boolean;busy:boolean;transport:BillingTransport;onDocument:(doc:BillingDocument)=>void;onBusy:(value:string)=>void}){
 const [open,setOpen]=useState(false),[confirmed,setConfirmed]=useState(false),[reason,setReason]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),live=useRef(true);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{if(open)dialog.current?.showModal();},[open]);
 if(record.data.kind!=='invoice'||record.issuance||!record.numberingReview)return null;
 const close=()=>{if(!pending)setOpen(false);};
 async function retire(){
  if(pending||busy||!saved||!confirmed||reason.trim().length<10)return;
  setPending(true);onBusy('number-review');setError('');
  try{
   const next=await transport.retireDraftNumber(record.id,record.version,{notTransmitted:true,reason:reason.trim()});
   if(!live.current)return;setOpen(false);onDocument(next);showSuccess('Ancien numéro retiré · brouillon conservé');
  }catch(error){if(live.current)setError(error instanceof Error?error.message:'La régularisation n’a pas abouti.');}
  finally{if(live.current)setPending(false);onBusy('');}
 }
 return <section className="bill-number-review" aria-label="Contrôle de l’ancien numéro">
  {record.numberingReviewNumber&&<p>Ancienne réservation à retirer : <strong>{record.numberingReviewNumber}</strong></p>}
  <p>Un numéro avait été réservé pour ce brouillon. Vérifiez sa non-transmission avant de le retirer. La finalisation reste bloquée pendant ce contrôle.</p>
  <button type="button" className="bill-button" disabled={busy||!saved} onClick={()=>{setConfirmed(false);setReason('');setError('');setOpen(true);}}>Régulariser ce brouillon</button>
  {!saved&&<small>Enregistrez vos modifications avant ce contrôle.</small>}
  {open&&<dialog ref={dialog} className="bill-preview-edit-dialog" aria-label="Régulariser l’ancien numéro" onCancel={event=>{event.preventDefault();close();}}><form onSubmit={event=>{event.preventDefault();void retire();}}>
   <h3>Régulariser l’ancien numéro</h3>
   {record.numberingReviewNumber&&<p>Ancienne réservation : <strong>{record.numberingReviewNumber}</strong></p>}
   <p>L’ancien numéro restera dans l’historique. Le brouillon reste modifiable et aucun nouveau numéro ne sera attribué par cette action.</p>
   <label className="bill-check"><input type="checkbox" disabled={pending} checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>{record.numberingReviewNumber?'J’atteste que le brouillon portant l’ancienne réservation '+record.numberingReviewNumber+' n’a pas été transmis au client.':'J’atteste que ce brouillon et son ancien numéro n’ont pas été transmis au client.'}</label>
   <Field label="Motif du retrait de l’ancien numéro"><textarea disabled={pending} required minLength={10} maxLength={2000} rows={3} value={reason} onChange={event=>setReason(event.target.value)}/></Field>
   {error&&<p role="alert">{error}</p>}
   <div><button type="button" className="bill-button" disabled={pending} onClick={close}>Annuler</button><button className="bill-button bill-button-primary" disabled={pending||!confirmed||reason.trim().length<10}>{pending?'Régularisation…':'Retirer l’ancien numéro'}</button></div>
  </form></dialog>}
 </section>;
}
