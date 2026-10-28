import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {FilePlus2,X} from 'lucide-react';
import type {BillingDocument,BillingInvoiceSelection} from '../billing-contracts';
import {blankDocumentDetails,calculateBilling,formatMinor} from '../billing-domain';
import {documentPeriods,periodLabel} from '../billing-periods';
import {invoiceSelection} from '../billing-invoice-selection';
import {Field} from './billing-fields';
import {PeriodSelect} from './billing-period-select';
import './billing-quote-invoice-create.css';

export function QuoteInvoiceCreate({record,disabled,onConvert}:{record:BillingDocument;disabled:boolean;onConvert:(d:BillingDocument,s?:BillingInvoiceSelection)=>Promise<void>}){
 const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null);
 const linked=record.quote?.invoices??(record.quote?.invoice?[record.quote.invoice]:[]);
 return <><button ref={trigger} type="button" className="bill-button bill-button-primary" disabled={disabled} onClick={()=>setOpen(true)}><FilePlus2 size={17}/>{linked.length?'Créer une autre facture':'Créer la facture'}</button>
 {open&&createPortal(<InvoiceSelectionDialog record={record} onConvert={onConvert} onClose={()=>setOpen(false)}/>,trigger.current?.closest('.bill-app')||document.body)}</>;
}
function InvoiceSelectionDialog({record,onConvert,onClose}:{record:BillingDocument;onConvert:(d:BillingDocument,s?:BillingInvoiceSelection)=>Promise<void>;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[pending,setPending]=useState(false),[error,setError]=useState('');
 const linked=record.quote?.invoices??(record.quote?.invoice?[record.quote.invoice]:[]);
 const [selection,setSelection]=useState<BillingInvoiceSelection>(()=>({periods:documentPeriods(record.data.details).filter(p=>!linked.some(i=>i.periods?.includes(p))),customPeriod:record.data.details?.customPeriod||'',quantities:record.data.lines.map(l=>({id:l.id,quantity:linked.length?'0':l.quantity}))}));
 useEffect(()=>{dialog.current?.showModal();},[]);
 let total:string|null=null;try{total=calculateBilling(invoiceSelection(record.data,selection)).netMinor;}catch{}
 const details={...blankDocumentDetails(),periods:selection.periods,customPeriod:selection.customPeriod};
 async function submit(){if(pending)return;setPending(true);setError('');try{await onConvert(record,selection);onClose();}catch(e){setError((e as Error).message);}finally{setPending(false);}}
 return <dialog ref={dialog} className="bill-support-dialog bill-invoice-selection" aria-label="Facturer le devis" onCancel={e=>{e.preventDefault();if(!pending)onClose();}}>
  <div className="bill-dialog-top"><strong><FilePlus2 size={20}/>Facturer {record.issuance?.number}</strong><button type="button" aria-label="Fermer la facturation du devis" disabled={pending} onClick={onClose}><X size={20}/></button></div>
  <form onSubmit={e=>{e.preventDefault();void submit();}}><div className="bill-support-body"><fieldset disabled={pending}>
   {!!linked.length&&<div className="bill-invoice-selection-existing">{linked.map(i=><span key={i.id}><strong>{i.number||'Facture en préparation'}</strong>{periodLabel({period:'',periods:i.periods,customPeriod:i.customPeriod})&&<small>{periodLabel({period:'',periods:i.periods,customPeriod:i.customPeriod})}</small>}</span>)}</div>}
   <Field label="Périodes à facturer"><PeriodSelect label="Périodes à facturer" value={details} onChange={periods=>setSelection(s=>({...s,periods}))} onCustomChange={customPeriod=>setSelection(s=>({...s,customPeriod}))}/></Field>
   <div className="bill-invoice-selection-lines">{record.data.lines.map((l,index)=><div key={l.id}><span>{l.description}<small>{formatMinor(String(Math.round(Number(l.unitPrice.replace(',','.'))*100)))} HT</small></span><Field label="Quantité à facturer" hint="Une quantité de 0 exclut cette prestation."><input aria-label={'Quantité à facturer — '+l.description} inputMode="decimal" required value={selection.quantities[index].quantity} onChange={e=>setSelection(s=>({...s,quantities:s.quantities.map((q,i)=>i===index?{...q,quantity:e.target.value}:q)}))}/></Field></div>)}</div>
   <div className="bill-invoice-selection-total"><span>Cette facture · HT</span><strong>{total===null?'—':formatMinor(total)}</strong></div>
  </fieldset>{error&&<p role="alert">{error}</p>}</div><div className="bill-support-actions"><button type="button" className="bill-button" disabled={pending} onClick={onClose}>Annuler</button><button className="bill-button bill-button-primary" disabled={pending||total===null}><FilePlus2 size={17}/>{pending?'Création…':'Créer la facture'}</button></div></form>
 </dialog>;
}
