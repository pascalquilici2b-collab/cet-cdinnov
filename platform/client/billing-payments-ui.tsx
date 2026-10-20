import {Loading} from './loading';
import {useEffect,useRef,useState} from 'react';
import type {BillingDocument,BillingPaymentEntry,BillingPaymentMethod,BillingPaymentOperationInput,BillingTransport} from '../billing-contracts';
import {formatMinor} from '../billing-domain';
import {paymentEuros,paymentMethodLabels,settlementLabels} from '../billing-payments-domain';
import {billingToday} from '../billing-quote-domain';
import {Field} from './billing-fields';
import {Help} from './billing-help';

type Form={kind:'receipt'|'refund'|'replace'|'void';target:BillingPaymentEntry|null;amount:string;occurredOn:string;method:BillingPaymentMethod;reference:string;note:string;reason:string};
const date=(value:string)=>value.split('-').reverse().join('/');
export function PaymentFollowUp({record,transport,busy,onBusy,onDocument,onDirty}:{record:BillingDocument;transport:BillingTransport;busy:boolean;onBusy:(v:string)=>void;onDocument:(v:BillingDocument)=>void;onDirty:(v:boolean)=>void}){
 const summary=record.settlement;
 const [form,setForm]=useState<Form|null>(null),[error,setError]=useState(''),[conflict,setConflict]=useState(false),[uncertain,setUncertain]=useState(false),[notice,setNotice]=useState('');
 const [entries,setEntries]=useState<BillingPaymentEntry[]>([]),[nextBefore,setNextBefore]=useState<number|null>(null),[historyError,setHistoryError]=useState(''),[historyBusy,setHistoryBusy]=useState(false),[historyRevision,setHistoryRevision]=useState(0);
 const live=useRef(true),first=useRef<HTMLInputElement>(null),reasonField=useRef<HTMLTextAreaElement>(null),actions=useRef<HTMLDivElement>(null),attempt=useRef<{key:string;version:number;input:BillingPaymentOperationInput}|null>(null);
 useEffect(()=>{live.current=true;return()=>{live.current=false;onDirty(false);};},[onDirty]);
 useEffect(()=>{onDirty(!!form);if(form)(form.kind==='void'?reasonField.current:first.current)?.focus();},[!!form,onDirty]);
 useEffect(()=>{let active=true;setHistoryBusy(true);setHistoryError('');transport.payments(record.id).then(page=>{if(active){setEntries(page.entries);setNextBefore(page.nextBefore);}}).catch(e=>{if(active)setHistoryError(e.message);}).finally(()=>{if(active)setHistoryBusy(false);});return()=>{active=false;};},[record.id,summary?.version,historyRevision,transport]);
 const begin=(kind:Form['kind'],target:BillingPaymentEntry|null=null)=>{setForm({kind,target,amount:target?paymentEuros(target.amountMinor):kind==='receipt'&&summary?.dueMinor!=='0'?paymentEuros(summary!.dueMinor):kind==='refund'&&summary?.overpaidMinor!=='0'?paymentEuros(summary!.overpaidMinor):'',occurredOn:target?.occurredOn||billingToday(),method:target?.method||'transfer',reference:target?.reference||'',note:target?.note||'',reason:''});attempt.current=null;setError('');setNotice('');setConflict(false);setUncertain(false);};
 const cancel=()=>{if(busy)return;if(form&&!window.confirm('Quitter sans enregistrer cette saisie de règlement ?'))return;setForm(null);onDirty(false);setError('');setConflict(false);setUncertain(false);actions.current?.focus();};
 const changed=(patch:Partial<Form>)=>{setForm(f=>f?{...f,...patch}:f);if(!conflict)setError('');};
 const completed=(doc:BillingDocument)=>{setForm(null);onDirty(false);setConflict(false);setUncertain(false);setError('');attempt.current=null;onDocument(doc);setNotice('Règlements mis à jour.');actions.current?.focus();};
 async function submit(){
  if(!form||busy||!summary)return;onBusy('payment');setError('');setNotice('');
  const key=JSON.stringify([record.id,record.version,summary.version,form]);
  if(!uncertain&&attempt.current?.key!==key){
   const base={id:crypto.randomUUID(),documentVersion:record.version},fields={amount:form.amount,occurredOn:form.occurredOn,method:form.method,reference:form.reference,note:form.note};
   const input:BillingPaymentOperationInput=form.kind==='void'?{...base,kind:'void',targetId:form.target!.id,reason:form.reason}:form.kind==='replace'?{...base,...fields,kind:'replace',targetId:form.target!.id,reason:form.reason}:{...base,...fields,kind:form.kind};
   attempt.current={key,version:summary.version,input};
  }
  try{const doc=await transport.payment(record.id,attempt.current!.version,attempt.current!.input);if(live.current)completed(doc);}
  catch(e){if(live.current){const status=e&&typeof e==='object'&&'status' in e?Number(e.status):0;setError(e instanceof Error?e.message:'Le règlement n’a pas pu être enregistré.');setConflict(status===409);setUncertain(!status||status>=500);}}
  finally{if(live.current)onBusy('');}
 }
 async function reload(){
  onBusy('payment-reload');try{
   const doc=await transport.get(record.id);let found=false;
   // Resolve a lost acknowledgement before allowing a new operation with the same values.
   if(attempt.current){let before:number|undefined;do{const page=await transport.payments(record.id,before);found=page.entries.some(e=>e.id===attempt.current!.input.id||e.id===attempt.current!.input.id+':void');before=page.nextBefore??undefined;}while(!found&&before&&before>attempt.current.version);}
   if(live.current){if(found)completed(doc);else{onDocument(doc);attempt.current=null;setError('');setConflict(false);setUncertain(false);setNotice('Règlements actualisés. Vérifiez votre saisie avant de l’enregistrer.');}}
  }catch(e){if(live.current)setError((e as Error).message);}finally{if(live.current)onBusy('');}
 }
 async function more(){if(!nextBefore||historyBusy)return;setHistoryBusy(true);setHistoryError('');try{const page=await transport.payments(record.id,nextBefore);if(live.current){setEntries(old=>[...old,...page.entries.filter(e=>!old.some(o=>o.id===e.id))]);setNextBefore(page.nextBefore);}}catch(e){if(live.current)setHistoryError((e as Error).message);}finally{if(live.current)setHistoryBusy(false);}}
 if(!summary)return null;
 const correction=form?.kind==='void'||form?.kind==='replace',title=form?.kind==='void'?'Annuler une saisie':form?.kind==='replace'?'Corriger une saisie':form?.kind==='refund'?'Enregistrer un remboursement':'Enregistrer un paiement';
 return <section className="bill-payments" aria-label="Règlements de la facture">
  <div className="bill-payment-heading"><h3>Règlements</h3><span className="bill-payment-state" data-state={summary.state}>{settlementLabels[summary.state]}</span></div>
  <div className="bill-payment-balance" data-overdue={summary.overdue}><span>{summary.state==='overpaid'?'Trop-perçu':'Reste à encaisser'}</span><strong>{formatMinor(summary.state==='overpaid'?summary.overpaidMinor:summary.dueMinor)}</strong>{summary.overdue&&<small>Échéance dépassée depuis le {date(record.data.dueDate)}</small>}</div>
  <dl className="bill-payment-totals"><div><dt>Paiements reçus</dt><dd>{formatMinor(summary.receivedMinor)}</dd></div>{summary.refundedMinor!=='0'&&<><div><dt>Remboursements</dt><dd>{formatMinor(summary.refundedMinor)}</dd></div><div><dt>Net encaissé</dt><dd>{formatMinor(summary.netPaidMinor)}</dd></div></>}</dl>
  {notice&&<p role="status" className="bill-quote-notice">{notice}</p>}
  <div className="bill-payment-actions" ref={actions} tabIndex={-1}>{!form&&<><button type="button" className="bill-button bill-button-primary" disabled={busy} onClick={()=>begin('receipt')}>Enregistrer un paiement</button>{summary.netPaidMinor!=='0'&&<button type="button" className="bill-button bill-button-quiet" disabled={busy} onClick={()=>begin('refund')}>Enregistrer un remboursement</button>}</>}</div>
  {form&&<form className="bill-payment-form" onSubmit={e=>{e.preventDefault();submit();}}><h4 className="bill-title-help">{title}<Help label="Saisie d’un règlement" text={correction?'La saisie initiale reste dans l’historique. La correction ne déclenche aucun mouvement d’argent.':'Enregistrez un paiement reçu ou un remboursement déjà effectué. Cette saisie ne déclenche aucun mouvement d’argent.'}/></h4>{form.target&&<div className="bill-payment-original">{form.target.kind==='receipt'?'Paiement':'Remboursement'} du {date(form.target.occurredOn)} · {formatMinor(form.target.amountMinor)}</div>}<fieldset disabled={busy||uncertain}>
   {form.kind!=='void'&&<><Field label="Montant (€)"><input ref={first} inputMode="decimal" required maxLength={40} value={form.amount} onChange={e=>changed({amount:e.target.value})}/></Field><Field label={form.kind==='refund'||form.target?.kind==='refund'?'Date du remboursement':'Date du paiement'}><input type="date" required max={billingToday()} value={form.occurredOn} onChange={e=>changed({occurredOn:e.target.value})}/></Field><Field label="Mode de règlement"><select value={form.method} onChange={e=>changed({method:e.target.value as BillingPaymentMethod})}>{Object.entries(paymentMethodLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field><Field label="Référence (facultatif)"><input maxLength={300} placeholder="Référence du virement, du chèque…" value={form.reference} onChange={e=>changed({reference:e.target.value})}/></Field><Field label="Note interne (facultatif)"><textarea rows={2} maxLength={2000} value={form.note} onChange={e=>changed({note:e.target.value})}/></Field></>}
   {correction&&<Field label="Motif de la correction"><textarea ref={reasonField} rows={2} maxLength={2000} required value={form.reason} onChange={e=>changed({reason:e.target.value})}/></Field>}
  </fieldset>{error&&<div className="bill-quote-error" role="alert"><p>{error}</p>{uncertain&&<p>La confirmation n’a pas été reçue. Réessayez ou vérifiez les règlements avant de modifier cette saisie.</p>}{(conflict||uncertain)&&<button type="button" disabled={busy} onClick={reload}>{uncertain?'Vérifier les règlements':'Actualiser les règlements'}</button>}</div>}<div className="bill-payment-form-actions"><button type="button" className="bill-button" disabled={busy||uncertain} onClick={cancel}>Annuler</button><button className="bill-button bill-button-primary" disabled={busy}>{busy?'Enregistrement…':uncertain?'Réessayer l’enregistrement':'Enregistrer'}</button></div></form>}
  <details className="bill-payment-history"><summary>Historique des règlements <span>{summary.version}</span></summary>{historyError&&<p role="alert">{historyError} <button type="button" onClick={()=>setHistoryRevision(n=>n+1)}>Réessayer</button></p>}{!entries.length&&!historyBusy&&!historyError&&<p>Aucun règlement enregistré.</p>}<ol>{entries.map(e=><li key={e.id} data-voided={!!e.reversedBy}>
   <div className="bill-payment-entry-heading"><strong>{e.kind==='void'?'Annulation de saisie':e.kind==='receipt'?'Paiement reçu':'Remboursement'}</strong><b>{formatMinor(e.amountMinor)}</b></div><small>{date(e.occurredOn)}{e.kind!=='void'?' · '+paymentMethodLabels[e.method]:''}{e.reversedBy?' · Saisie corrigée':''}{e.replacementFor?' · Nouvelle saisie':''}</small>{e.reference&&<p>{e.reference}</p>}{e.note&&<p>{e.note}</p>}{e.reason&&<p><b>Motif :</b> {e.reason}</p>}
   <details className="bill-payment-audit"><summary>Trace de la saisie</summary><p>Enregistré le {new Date(e.recordedAt).toLocaleString('fr-FR')} par {e.recordedBy}</p>{e.reversalOf&&<p>Annule la saisie du mouvement initial, conservée dans cet historique.</p>}</details>
   {e.kind!=='void'&&!e.reversedBy&&!form&&<div className="bill-payment-entry-actions"><button type="button" disabled={busy} onClick={()=>begin('replace',e)}>Corriger</button><button type="button" disabled={busy} onClick={()=>begin('void',e)}>Annuler la saisie</button></div>}
  </li>)}</ol>{historyBusy&&<Loading compact label="Chargement des règlements…"/>}{nextBefore&&<button type="button" className="bill-button" disabled={historyBusy} onClick={more}>Voir les règlements précédents</button>}</details>
 </section>;
}
