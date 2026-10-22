import {useEffect,useRef,useState} from 'react';
import {FileCheck2} from 'lucide-react';
import type {BillingDocument,BillingTransport} from '../billing-contracts';
import {billingToday} from '../billing-quote-domain';

export function InvoiceFromQuote({record,disabled,transport,onBusy,onDocument,onConvert}:{record:BillingDocument;disabled:boolean;transport:BillingTransport;onBusy:(v:string)=>void;onDocument:(d:BillingDocument)=>void;onConvert:(d:BillingDocument)=>Promise<void>}){
 const [open,setOpen]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[date,setDate]=useState(billingToday());
 const dialog=useRef<HTMLDialogElement>(null),attempt=useRef<{key:string;id:string}|null>(null);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 const quote=record.quote,inactive=!quote||quote.revision.abandoned||quote.revision.currentId!==record.id||quote.state==='refused';
 async function confirm(){
  if(pending||!quote)return;setPending(true);onBusy('quote-accept');setError('');
  const input={action:'accepted' as const,occurredOn:date,note:note.trim()},key=JSON.stringify([record.id,record.version,quote.version,input]);
  if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};
  try{const updated=await transport.quoteEvent(record.id,quote.version,{...input,id:attempt.current.id,documentVersion:record.version});onDocument(updated);setOpen(false);await onConvert(updated);}
  catch(e){setError((e as Error).message);}finally{setPending(false);onBusy('');}
 }
 if(quote?.invoice)return null;
 return <><button type="button" className="bill-button bill-button-primary" disabled={disabled||inactive} title={record.status!=='issued'?'Passez le devis en statut Finalisé.':quote?.state==='refused'?'Corrigez la réponse du client dans le suivi du devis.':''} onClick={()=>{if(quote?.state==='accepted')void onConvert(record);else setOpen(true);}}><FileCheck2 size={17}/>Facturer</button>
  <dialog ref={dialog} className="bill-preview-edit-dialog" aria-label="Accord du client" onCancel={e=>{if(pending)e.preventDefault();else setOpen(false);}}>
   <form onSubmit={e=>{e.preventDefault();void confirm();}}><h3>Accord du client</h3><label>Date de l’accord<input type="date" required min={record.data.issueDate} max={record.data.validUntil< billingToday()?record.data.validUntil:billingToday()} value={date} onChange={e=>setDate(e.target.value)}/></label><label>Origine de l’accord<textarea required maxLength={2000} rows={2} placeholder="Devis signé, e-mail du client…" value={note} onChange={e=>setNote(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<div><button type="button" className="bill-button" disabled={pending} onClick={()=>setOpen(false)}>Annuler</button><button className="bill-button bill-button-primary" disabled={pending||!note.trim()}>{pending?'Création…':'Confirmer et facturer'}</button></div></form>
  </dialog></>;
}
