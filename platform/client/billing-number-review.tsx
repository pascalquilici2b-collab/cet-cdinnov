import {useEffect,useRef,useState} from 'react';
import {CheckCircle2,Link2,LoaderCircle,RotateCw,X} from 'lucide-react';
import type {BillingDocument,BillingRegularizationQuote,BillingTransport} from '../billing-contracts';
import {Field} from './billing-fields';
import {showSuccess} from './action-feedback';

const quoteDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8)+'/'+value.slice(5,7)+'/'+value.slice(0,4):value;
export function InvoiceNumberReview({record,saved,busy,transport,onDocument,onBusy}:{record:BillingDocument;saved:boolean;busy:boolean;transport:BillingTransport;onDocument:(doc:BillingDocument)=>void;onBusy:(value:string)=>void}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[items,setItems]=useState<BillingRegularizationQuote[]>([]),[total,setTotal]=useState(0),[selected,setSelected]=useState<BillingRegularizationQuote|null>(null),[reason,setReason]=useState(''),[pending,setPending]=useState(false),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null),live=useRef(true),submitting=useRef(false);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{if(open)dialog.current?.showModal();},[open]);
 useEffect(()=>{
  if(!open)return;
  let current=true;setLoading(true);setLoadError('');
  const timer=setTimeout(()=>{
   void transport.regularizationQuotes(record.id,query.trim()).then(result=>{
    if(!current)return;setItems(result.items);setTotal(result.total);
    setSelected(previous=>result.items.find(item=>item.id===previous?.id)||previous||result.items.find(item=>item.selectedSource)||null);
   }).catch(error=>{if(current)setLoadError(error instanceof Error?error.message:'Les devis n’ont pas pu être chargés.');}).finally(()=>{if(current)setLoading(false);});
  },query?250:0);
  return()=>{current=false;clearTimeout(timer);};
 },[open,query,record.id,transport,refresh]);
 if(record.data.kind!=='invoice'||record.issuance||record.regularization||(!record.numberingReview&&!record.retiredNumber))return null;
 const close=()=>{if(!submitting.current)setOpen(false);};
 const choices=selected&&!items.some(item=>item.id===selected.id)?[selected,...items]:items;
 async function regularize(){
  if(submitting.current||busy||!saved||!selected||selected.blockedReason||loading||loadError)return;
  submitting.current=true;setPending(true);onBusy('number-review');setError('');
  try{
   const next=await transport.regularizeInvoice(record.id,record.version,{quoteId:selected.id,quoteVersion:selected.version,...(reason.trim()?{reason:reason.trim()}:{})});
   if(!live.current)return;setOpen(false);onDocument(next);showSuccess('Brouillon régularisé · devis rattaché');
  }catch(error){if(live.current)setError(error instanceof Error?error.message:'La régularisation n’a pas abouti.');}
  finally{submitting.current=false;if(live.current)setPending(false);onBusy('');}
 }
 return <section className="bill-number-review" aria-label="Régularisation du brouillon">
  <p>{record.numberingReview?'Rattachez ce brouillon à son devis pour le régulariser.':'Rattachez ce brouillon à son devis pour conserver sa référence.'}</p>
  <button type="button" className="bill-button" disabled={busy||!saved} onClick={()=>{setQuery('');setItems([]);setTotal(0);setSelected(null);setReason('');setError('');setLoadError('');setOpen(true);}}><Link2 size={17} aria-hidden="true"/>Régulariser ce brouillon</button>
  {!saved&&<small>Enregistrez vos modifications avant de régulariser ce brouillon.</small>}
  {open&&<dialog ref={dialog} className="bill-preview-edit-dialog bill-number-review-dialog" aria-label="Régulariser le brouillon" onCancel={event=>{event.preventDefault();close();}}><form onSubmit={event=>{event.preventDefault();void regularize();}}>
   <h3><Link2 size={21} aria-hidden="true"/>Régulariser le brouillon</h3>
   <p>Choisissez le devis de {record.data.buyer.name||'ce client'}.</p>
   <Field label="Rechercher un devis"><input type="search" autoFocus disabled={pending} value={query} maxLength={200} placeholder="Numéro ou objet du devis" onChange={event=>setQuery(event.target.value)}/></Field>
   <Field label="Devis à rattacher"><select required disabled={pending||loading||!!loadError} value={selected?.id||''} onChange={event=>{setSelected(choices.find(item=>item.id===event.target.value)||null);setError('');}}><option value="">Choisir un devis</option>{choices.map(item=><option key={item.id} value={item.id}>{item.number} · {quoteDate(item.issueDate)} · {item.title||'Sans objet'}</option>)}</select></Field>
   {loading?<p className="bill-number-review-hint" role="status">Chargement des devis…</p>:loadError?<div className="bill-number-review-error" role="alert"><p>{loadError}</p><button type="button" className="bill-button" disabled={pending} onClick={()=>setRefresh(value=>value+1)}><RotateCw size={16} aria-hidden="true"/>Réessayer</button></div>:!items.length?<p className="bill-number-review-hint" role="status">{query?'Aucun devis ne correspond à cette recherche.':'Aucun devis disponible pour ce client.'}</p>:total>items.length?<p className="bill-number-review-hint">{total} devis correspondent. Précisez la recherche pour retrouver le vôtre.</p>:null}
   {selected?.blockedReason&&<p role="alert">{selected.blockedReason}</p>}
   {selected&&<div className="bill-number-review-selection"><strong>{selected.number}</strong><span>{selected.title||'Sans objet'}</span><small>{selected.clientName} · {quoteDate(selected.issueDate)}</small><span className="bill-number-review-projection">Numéro de facture prévu : <strong>{selected.invoiceNumber||'Indisponible'}</strong></span>{selected.reservationAction==='preserve'&&<small>Numéro existant conservé</small>}</div>}
   <p className="bill-number-review-hint">Le numéro de facture reprendra celui du devis à la finalisation. Sa référence sera conservée. Les prestations et les montants restent inchangés.{record.numberingReview&&selected?.reservationAction!=='preserve'?' L’ancien numéro restera dans l’historique.':''}</p>
   <Field label="Note (facultatif)"><textarea disabled={pending} maxLength={2000} rows={2} value={reason} onChange={event=>setReason(event.target.value)}/></Field>
   {error&&<p role="alert">{error}</p>}
   <div className="bill-number-review-actions"><button type="button" className="bill-button" disabled={pending} onClick={close}><X size={17} aria-hidden="true"/>Annuler</button><button className="bill-button bill-button-primary" disabled={pending||!selected||!!selected.blockedReason||loading||!!loadError}>{pending?<LoaderCircle size={17} aria-hidden="true"/>:<CheckCircle2 size={17} aria-hidden="true"/>}{pending?'Régularisation…':'Rattacher et régulariser'}</button></div>
  </form></dialog>}
 </section>;
}
