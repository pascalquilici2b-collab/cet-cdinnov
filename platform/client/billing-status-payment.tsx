import {useRef,useState} from 'react';
import {Dialog} from 'radix-ui';
import type {BillingDocument,BillingTransport,BillingPaymentEntry,BillingPaymentOperationInput} from '../billing-contracts';
import {billingToday} from '../billing-quote-domain';
import {paymentEuros} from '../billing-payments-domain';
import {formatMinor} from '../billing-domain';

/** Status changes are accounting annotations, never transfers of money. */
export function StatusPaymentDialog({record,mode,transport,onClose,onDocument,onBusy}:{record:BillingDocument;mode:'paid'|'unpaid';transport:BillingTransport;onClose:()=>void;onDocument:(d:BillingDocument)=>void;onBusy:(v:string)=>void}){
 const [date,setDate]=useState(billingToday()),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const attempt=useRef<{version:number;input:BillingPaymentOperationInput}|null>(null),running=useRef(false);
 async function submit(){
  if(running.current||!record.settlement)return;running.current=true;setSaving(true);onBusy('payment-status');setError('');
  try{
   let current=record;
   if(mode==='paid'){
    if(!attempt.current)attempt.current={version:record.settlement.version,input:{id:crypto.randomUUID(),documentVersion:record.version,kind:'receipt',amount:paymentEuros(record.settlement.dueMinor),occurredOn:date,method:'transfer',reference:'',note:'Facture marquée réglée depuis son statut.'}};
    current=await transport.payment(record.id,attempt.current.version,attempt.current.input);
   }else{
    current=await transport.get(record.id);
    if(current.settlement?.version!==record.settlement.version)throw Error('Les règlements ont changé. Fermez cette fenêtre et actualisez la facture.');
    const entries:BillingPaymentEntry[]=[];let before:number|undefined;
    do{const page=await transport.payments(record.id,before);entries.push(...page.entries);before=page.nextBefore??undefined;}while(before);
    // Reversing refunds first prevents transient negative balances.
    const active=entries.filter(e=>e.kind!=='void'&&!e.reversedBy).sort((a,b)=>(a.kind==='refund'?0:1)-(b.kind==='refund'?0:1));
    for(const entry of active)current=await transport.payment(record.id,current.settlement!.version,{id:crypto.randomUUID(),documentVersion:current.version,kind:'void',targetId:entry.id,reason:'Correction du statut : facture à régler.'});
   }
   onDocument(current);onClose();
  }catch(e){setError((e as Error).message);try{onDocument(await transport.get(record.id));}catch{/* Keep the same idempotent receipt for retry. */}}
  finally{running.current=false;setSaving(false);onBusy('');}
 }
 return <Dialog.Root open onOpenChange={v=>{if(!v&&!saving)onClose();}}><Dialog.Portal><Dialog.Overlay className="cdi-dialog-overlay"/><Dialog.Content className="cdi-dialog"><Dialog.Title>{mode==='paid'?'Marquer la facture réglée':'Remettre la facture à régler'}</Dialog.Title><Dialog.Description>{mode==='paid'?'Enregistrer le règlement du solde de '+formatMinor(record.settlement?.dueMinor||'0')+'.':'Cette correction annule les saisies de règlement de cette facture, en conservant leur historique.'}</Dialog.Description><form onSubmit={e=>{e.preventDefault();void submit();}}>{mode==='paid'&&<label className="bill-status-date">Date du règlement<input type="date" required max={billingToday()} value={date} disabled={saving||!!attempt.current} onChange={e=>setDate(e.target.value)}/></label>}{error&&<p className="bill-status-dialog-error" role="alert">{error}</p>}<div className="cdi-dialog-actions"><button type="button" disabled={saving} onClick={onClose}>Annuler</button><button className="is-primary" disabled={saving}>{saving?'Enregistrement…':mode==='paid'?'Confirmer le règlement':'Confirmer la correction'}</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
