import {useEffect,useRef,useState} from 'react';
import type {BillingDocument,BillingQuoteAction,BillingQuoteEvent,BillingTransport} from '../billing-contracts';
import {billingToday,quoteActionLabels,quoteStateLabels} from '../billing-quote-domain';
import {Field} from './billing-fields';
import {Help} from './billing-help';

const date=(value:string)=>value.split('-').reverse().join('/');
const actionLabels:Record<BillingQuoteAction,string>={sent:'Marquer comme envoyé',accepted:'Enregistrer un accord',refused:'Enregistrer un refus',reopened:'Corriger la réponse'};
export function QuoteFollowUp({record,transport,busy,onBusy,onDocument,onDirty,onInvoice}:{record:BillingDocument;transport:BillingTransport;busy:boolean;onBusy:(v:string)=>void;onDocument:(v:BillingDocument)=>void;onDirty:(v:boolean)=>void;onInvoice:(id:string)=>void}){
 const [form,setForm]=useState<{action:BillingQuoteAction;occurredOn:string;note:string}|null>(null),[error,setError]=useState(''),[conflict,setConflict]=useState(false),[notice,setNotice]=useState('');
 const [events,setEvents]=useState<BillingQuoteEvent[]>([]),[nextBefore,setNextBefore]=useState<number|null>(null),[historyError,setHistoryError]=useState(''),[historyBusy,setHistoryBusy]=useState(false),[historyRevision,setHistoryRevision]=useState(0);
 const live=useRef(true),attempt=useRef<{key:string;id:string}|null>(null),firstField=useRef<HTMLInputElement>(null),actionArea=useRef<HTMLDivElement>(null);
 const summary=record.quote;
 useEffect(()=>{live.current=true;return()=>{live.current=false;onDirty(false);};},[onDirty]);
 useEffect(()=>{onDirty(!!form);if(form)firstField.current?.focus();},[!!form,onDirty]);
 useEffect(()=>{let current=true;setHistoryBusy(true);setHistoryError('');transport.quoteEvents(record.id).then(page=>{if(current){setEvents(page.events);setNextBefore(page.nextBefore);}}).catch(e=>{if(current)setHistoryError(e.message);}).finally(()=>{if(current)setHistoryBusy(false);});return()=>{current=false;};},[record.id,summary?.version,historyRevision,transport]);
 const cancel=()=>{if(busy)return;if(form&&(form.note||form.occurredOn!==billingToday())&&!window.confirm('Quitter sans enregistrer cette réponse ?'))return;setForm(null);onDirty(false);setError('');actionArea.current?.focus();};
 async function submit(){
  if(!form||busy||!summary)return;onBusy('quote-event');setError('');setNotice('');
  const key=JSON.stringify([record.id,record.version,summary.version,form]);if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};
  try{const doc=await transport.quoteEvent(record.id,summary.version,{id:attempt.current.id,documentVersion:record.version,...form});if(live.current){setForm(null);onDirty(false);setConflict(false);onDocument(doc);setNotice('Suivi enregistré.');actionArea.current?.focus();}}
  catch(e){if(live.current){setError(e instanceof Error?e.message:'Le suivi n’a pas pu être enregistré.');setConflict(!!e&&typeof e==='object'&&'status' in e&&e.status===409);}}
  finally{if(live.current)onBusy('');}
 }
 async function reload(){onBusy('quote-reload');try{const doc=await transport.get(record.id);if(live.current){onDocument(doc);setError('');setConflict(false);setNotice('Suivi actualisé. Vérifiez la réponse avant de l’enregistrer.');}}catch(e){if(live.current)setError((e as Error).message);}finally{if(live.current)onBusy('');}}
 async function more(){if(!nextBefore||historyBusy)return;setHistoryBusy(true);setHistoryError('');try{const page=await transport.quoteEvents(record.id,nextBefore);if(live.current){setEvents(old=>[...old,...page.events.filter(e=>!old.some(o=>o.id===e.id))]);setNextBefore(page.nextBefore);}}catch(e){if(live.current)setHistoryError((e as Error).message);}finally{if(live.current)setHistoryBusy(false);}}
 if(!summary||record.status!=='issued')return null;
 const inactive=summary.revision.abandoned||summary.revision.currentId!==record.id;
 const terminal=summary.state==='accepted'||summary.state==='refused';
 return <section className="bill-quote-followup" aria-label="Suivi du devis">
  <div className="bill-quote-heading"><h3>Suivi du devis</h3><span className="bill-quote-state" data-state={summary.state}>{quoteStateLabels[summary.state]}</span></div>
  <p className="bill-quote-hint">{inactive?'Cette version reste consultable. Utilisez la version en cours pour enregistrer une réponse.':summary.invoice?'Une facture est liée à ce devis.':summary.state==='prepared'?'Le PDF est prêt. Vous pouvez l’envoyer à votre client puis déclarer cet envoi.':summary.state==='sent'?'Le devis a été envoyé. Enregistrez la réponse du client dès sa réception.':summary.state==='accepted'?'Accord enregistré. Vous pouvez préparer la facture liée.':summary.state==='refused'?'Le client a refusé cette proposition. Son contenu et la réponse restent consultables.':'La date de validité est dépassée. Vous pouvez enregistrer un accord reçu pendant sa période de validité.'}</p>
  {summary.invoice&&<button type="button" className="bill-button bill-button-primary" disabled={busy} onClick={()=>onInvoice(summary.invoice!.id)}>Ouvrir {summary.invoice.number||'la facture brouillon'}</button>}
  {notice&&<p className="bill-quote-notice" role="status">{notice}</p>}
  <div ref={actionArea} tabIndex={-1} className="bill-quote-actions">
   {!form&&!summary.invoice&&!inactive&&(terminal?<button className="bill-quote-correction" type="button" disabled={busy} onClick={()=>{setNotice('');setForm({action:'reopened',occurredOn:billingToday(),note:''});}}>Corriger la réponse</button>:<>
    {summary.version===0&&summary.state!=='expired'&&<button className="bill-button" disabled={busy} type="button" onClick={()=>setForm({action:'sent',occurredOn:billingToday(),note:''})}>Marquer comme envoyé</button>}
    <button className="bill-button bill-button-primary" disabled={busy} type="button" onClick={()=>setForm({action:'accepted',occurredOn:billingToday(),note:''})}>Enregistrer un accord</button>
    <button className="bill-button bill-button-quiet" disabled={busy} type="button" onClick={()=>setForm({action:'refused',occurredOn:billingToday(),note:''})}>Enregistrer un refus</button>
   </>)}
  </div>
  {form&&<form className="bill-quote-form" onSubmit={e=>{e.preventDefault();submit();}}><h4 className="bill-title-help">{actionLabels[form.action]}<Help label="Suivi du devis" text={form.action==='sent'?'Déclarez un envoi déjà effectué. Cette action n’envoie aucun e-mail.':form.action==='reopened'?'Le devis revient en attente (ou expiré). La réponse précédente reste dans l’historique.':'Indiquez la date et l’origine de la réponse. Ce suivi ne constitue pas une signature électronique.'}/></h4><fieldset disabled={busy}>
   <Field label={form.action==='sent'?'Date de l’envoi':form.action==='reopened'?'Date de la correction':'Date de la réponse'}><input ref={firstField} required type="date" min={record.data.issueDate} max={billingToday()} value={form.occurredOn} onChange={e=>{setForm({...form,occurredOn:e.target.value});if(!conflict)setError('');}}/></Field>
   <Field label={form.action==='reopened'?'Raison de la correction':form.action==='sent'?'Note interne (facultatif)':'Origine de la réponse'} hint={form.action==='accepted'?'Ex. Devis signé reçu par e-mail, référence du message.':undefined}><textarea required={form.action!=='sent'} maxLength={2000} rows={3} value={form.note} onChange={e=>{setForm({...form,note:e.target.value});if(!conflict)setError('');}}/></Field>
  </fieldset>{error&&<div className="bill-quote-error" role="alert"><p>{error}</p>{conflict&&<button type="button" disabled={busy} onClick={reload}>Actualiser le suivi</button>}</div>}<div className="bill-quote-form-actions"><button type="button" className="bill-button" disabled={busy} onClick={cancel}>Annuler</button><button className="bill-button bill-button-primary" disabled={busy||inactive}>{busy?'Enregistrement…':'Enregistrer le suivi'}</button></div></form>}
  <details className="bill-quote-history"><summary>Historique du suivi <span>{summary.version}</span></summary>{historyError&&<p role="alert">{historyError} <button type="button" onClick={()=>setHistoryRevision(n=>n+1)}>Réessayer</button></p>}{!events.length&&!historyBusy&&!historyError&&<p>Aucune action enregistrée.</p>}<ol>{events.map(e=><li key={e.id}><div><strong>{quoteActionLabels[e.action]}</strong><time dateTime={e.occurredOn}>{date(e.occurredOn)}</time></div>{e.note&&<p>{e.note}</p>}<small>Déclaré le {new Date(e.recordedAt).toLocaleString('fr-FR')} par {e.recordedBy}</small></li>)}</ol>{historyBusy&&<p role="status">Chargement de l’historique…</p>}{nextBefore&&<button className="bill-button" type="button" disabled={historyBusy} onClick={more}>Voir les événements précédents</button>}</details>
 </section>;
}
