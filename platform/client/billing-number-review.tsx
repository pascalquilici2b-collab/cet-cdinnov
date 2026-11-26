import {useEffect,useId,useRef,useState} from 'react';
import {CheckCircle2,Hash,Link2,LoaderCircle,RotateCw,X} from 'lucide-react';
import type {BillingDocument,BillingRegularizationQuote,BillingRegularizationReference,BillingTransport} from '../billing-contracts';
import {Field} from './billing-fields';
import {showSuccess} from './action-feedback';

const quoteDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8)+'/'+value.slice(5,7)+'/'+value.slice(0,4):value;
type ReviewMode='linked'|'provided';
export function InvoiceNumberReview({record,saved,busy,transport,onDocument,onBusy}:{record:BillingDocument;saved:boolean;busy:boolean;transport:BillingTransport;onDocument:(doc:BillingDocument)=>void;onBusy:(value:string)=>void}){
 const [mode,setMode]=useState<ReviewMode|null>(null),[query,setQuery]=useState(''),[items,setItems]=useState<BillingRegularizationQuote[]>([]),[total,setTotal]=useState(0),[selected,setSelected]=useState<BillingRegularizationQuote|null>(null),[reference,setReference]=useState<BillingRegularizationReference|null>(null),[confirmed,setConfirmed]=useState(false),[reason,setReason]=useState(''),[pending,setPending]=useState(false),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null),live=useRef(true),submitting=useRef(false),blockedId=useId();
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{if(mode)dialog.current?.showModal();},[mode]);
 useEffect(()=>{
  if(!mode)return;
  let current=true;setLoading(true);setLoadError('');if(mode==='provided'){setConfirmed(false);setReference(null);}
  const timer=setTimeout(()=>{
   const request=mode==='linked'?transport.regularizationQuotes(record.id,query.trim()).then(result=>{
    if(!current)return;setItems(result.items);setTotal(result.total);
    setSelected(previous=>result.items.find(item=>item.id===previous?.id)||previous||result.items.find(item=>item.selectedSource)||null);
   }):transport.regularizationReference(record.id,record.version).then(result=>{
    if(!current)return;
    if(result.documentVersion!==record.version||result.quoteNumber!==(record.data.references.quoteNumber||''))throw new Error('La référence du devis a changé. Rechargez le brouillon.');
    setReference(result);
   });
   void request.catch(error=>{if(current)setLoadError(error instanceof Error?error.message:'Les informations n’ont pas pu être chargées.');}).finally(()=>{if(current)setLoading(false);});
  },mode==='linked'&&query?250:0);
  return()=>{current=false;clearTimeout(timer);};
 },[mode,query,record.id,record.version,record.data.references.quoteNumber,transport,refresh]);
 if(record.data.kind!=='invoice'||record.issuance||record.regularization||(!record.numberingReview&&!record.retiredNumber))return null;
 const close=()=>{if(!submitting.current)setMode(null);};
 const open=(next:ReviewMode)=>{setQuery('');setItems([]);setTotal(0);setSelected(null);setReference(null);setConfirmed(false);setReason('');setError('');setLoadError('');setMode(next);};
 const choices=selected&&!items.some(item=>item.id===selected.id)?[selected,...items]:items;
 const plan=mode==='linked'?selected:reference;
 const enabled=!!plan?.invoiceNumber&&(mode==='linked'?!!selected:!!reference?.quoteNumber&&reference.documentVersion===record.version&&reference.quoteNumber===(record.data.references.quoteNumber||'')&&confirmed);
 async function regularize(){
  if(submitting.current||busy||!saved||!enabled||!plan||plan.blockedReason||loading||loadError)return;
  submitting.current=true;setPending(true);onBusy('number-review');setError('');
  try{
   const note=reason.trim()?{reason:reason.trim()}:{};
   const next=mode==='provided'&&reference?await transport.regularizeInvoiceReference(record.id,record.version,{quoteNumber:reference.quoteNumber,referenceConfirmed:true,...note}):await transport.regularizeInvoice(record.id,record.version,{quoteId:selected!.id,quoteVersion:selected!.version,...note});
   if(!live.current)return;setMode(null);onDocument(next);showSuccess(mode==='provided'?'Brouillon régularisé · référence confirmée':'Brouillon régularisé · devis rattaché');
  }catch(error){if(live.current)setError(error instanceof Error?error.message:'La régularisation n’a pas abouti.');}
  finally{submitting.current=false;if(live.current)setPending(false);onBusy('');}
 }
 return <section className="bill-number-review" aria-label="Régularisation du brouillon">
  <p>Régularisez ce brouillon à partir de son devis.</p>
  <div className="bill-number-review-modes"><button type="button" className="bill-button" disabled={busy||!saved} onClick={()=>open('linked')}><Link2 size={17} aria-hidden="true"/>Régulariser en rattachant le devis correspondant</button><button type="button" className="bill-button" disabled={busy||!saved} onClick={()=>open('provided')}><Hash size={17} aria-hidden="true"/>Régulariser selon le numéro de devis fourni</button></div>
  {!saved&&<small>Enregistrez vos modifications avant de régulariser ce brouillon.</small>}
  {mode&&<dialog ref={dialog} className="bill-preview-edit-dialog bill-number-review-dialog" aria-label={mode==='linked'?'Régulariser le brouillon':'Régulariser selon le numéro de devis fourni'} onCancel={event=>{event.preventDefault();close();}}><form onSubmit={event=>{event.preventDefault();void regularize();}}>
   <h3>{mode==='linked'?<Link2 size={21} aria-hidden="true"/>:<Hash size={21} aria-hidden="true"/>}{mode==='linked'?'Régulariser le brouillon':'Numéro de devis fourni'}</h3>
   {mode==='linked'?<><p>Choisissez le devis de {record.data.buyer.name||'ce client'}.</p>
    <Field label="Rechercher un devis"><input type="search" autoFocus disabled={pending} value={query} maxLength={200} placeholder="Numéro ou objet du devis" onChange={event=>setQuery(event.target.value)}/></Field>
    <Field label="Devis à rattacher"><select required disabled={pending||loading||!!loadError} value={selected?.id||''} onChange={event=>{setSelected(choices.find(item=>item.id===event.target.value)||null);setError('');}}><option value="">Choisir un devis</option>{choices.map(item=><option key={item.id} value={item.id}>{item.number} · {quoteDate(item.issueDate)} · {item.title||'Sans objet'}</option>)}</select></Field></>:<>
    <Field label="Référence du devis"><input value={record.data.references.quoteNumber||''} readOnly placeholder="Ex. 260318004"/></Field>
    <p className="bill-number-review-hint">Référence enregistrée dans « Affaire, marché & références ».</p>
   </>}
   {loading?<p className="bill-number-review-hint" role="status">{mode==='linked'?'Chargement des devis…':'Vérification de la référence…'}</p>:loadError?<div className="bill-number-review-error" role="alert"><p>{loadError}</p><button type="button" className="bill-button" disabled={pending} onClick={()=>setRefresh(value=>value+1)}><RotateCw size={16} aria-hidden="true"/>Réessayer</button></div>:mode==='linked'&&!items.length?<p className="bill-number-review-hint" role="status">{query?'Aucun devis ne correspond à cette recherche.':'Aucun devis disponible pour ce client.'}</p>:mode==='linked'&&total>items.length?<p className="bill-number-review-hint">{total} devis correspondent. Précisez la recherche pour retrouver le vôtre.</p>:null}
   {mode==='linked'&&plan?.blockedReason&&<p role="alert">{plan.blockedReason}</p>}
   {plan&&<div className="bill-number-review-selection">{mode==='linked'&&selected?<><strong>{selected.number}</strong><span>{selected.title||'Sans objet'}</span><small>{selected.clientName} · {quoteDate(selected.issueDate)}</small></>:<strong>{record.data.buyer.name||'Client du brouillon'}</strong>}<span className="bill-number-review-projection">Numéro de facture prévu : <strong>{plan.invoiceNumber||'Indisponible'}</strong></span>{plan.reservationAction==='preserve'&&<small>Numéro existant conservé</small>}</div>}
   {mode==='provided'&&<label className="bill-number-reference-confirm"><input type="checkbox" aria-describedby={reference?.blockedReason?blockedId:undefined} checked={confirmed} disabled={pending||loading||!!loadError||!reference?.quoteNumber||!!reference?.blockedReason} onChange={event=>setConfirmed(event.target.checked)}/><span>Je confirme que la référence du devis « {record.data.references.quoteNumber||'à renseigner'} » correspond à cette facture.</span></label>}
   {mode==='provided'&&reference?.blockedReason&&<p id={blockedId} className="bill-status-error" role="alert">{reference.blockedReason}</p>}
   <p className="bill-number-review-hint">Le numéro de facture reprendra celui du devis à la finalisation. Les prestations et les montants restent inchangés.{record.numberingReview&&plan?.reservationAction!=='preserve'?' L’ancien numéro restera dans l’historique.':''}</p>
   <Field label="Note (facultatif)"><textarea disabled={pending} maxLength={2000} rows={2} value={reason} onChange={event=>setReason(event.target.value)}/></Field>
   {error&&<p role="alert">{error}</p>}
   <div className="bill-number-review-actions"><button type="button" className="bill-button" disabled={pending} onClick={close}><X size={17} aria-hidden="true"/>Annuler</button><button className="bill-button bill-button-primary" disabled={pending||!enabled||!plan||!!plan.blockedReason||loading||!!loadError}>{pending?<LoaderCircle size={17} aria-hidden="true"/>:<CheckCircle2 size={17} aria-hidden="true"/>}{pending?'Régularisation…':mode==='linked'?'Rattacher et régulariser':'Confirmer et régulariser'}</button></div>
  </form></dialog>}
 </section>;
}
