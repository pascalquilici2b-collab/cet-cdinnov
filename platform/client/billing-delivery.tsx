import {PDFIcon} from './billing-pdf-icon';
import {useEffect,useRef,useState} from 'react';
import {Send,ExternalLink,Download} from 'lucide-react';
import type {BillingDocument,BillingTransport} from '../billing-contracts';
import type {EmailDelivery,EmailInput} from '../billing-delivery';

export function EmailDocument({record,transport,onSent}:{record:BillingDocument;transport:BillingTransport;onSent:()=>void}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[history,setHistory]=useState<EmailDelivery[]>([]),[attempt,setAttempt]=useState<EmailInput|null>(null);
 const [recipient,setRecipient]=useState(record.data.buyer.email),[subject,setSubject]=useState(`${record.data.kind==='quote'?'Devis':'Facture'} ${record.issuance?.number||''} — ${record.data.title}`),[message,setMessage]=useState('Bonjour,\n\nVeuillez trouver ci-joint notre '+(record.data.kind==='quote'?'devis':'facture')+'.\n\nBien cordialement,\nConseil Développement Innovation');
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(open){dialog.current?.showModal();void transport.emailHistory(record.id).then(r=>setHistory(r.deliveries)).catch(e=>setError(e.message));}else dialog.current?.close();},[open,record.id,transport]);
 const refresh=async()=>{try{setHistory((await transport.emailHistory(record.id)).deliveries);setError('');}catch(e){setError((e as Error).message);}};
 async function send(){
  const input=attempt||{id:crypto.randomUUID(),recipient,subject,message};setAttempt(input);setBusy(true);setError('');
  try{const {delivery}=await transport.email(record.id,record.version,input);setHistory(h=>[delivery,...h.filter(x=>x.id!==delivery.id)]);if(delivery.state==='sent')onSent();}
  catch(e){setError((e as Error).message);if([400,422].includes((e as {status?:number}).status||0))setAttempt(null);}finally{setBusy(false);}
 }
 const status=(s:EmailDelivery['state'])=>({sending:'En cours',sent:'Accepté par le service d’envoi',failed:'Refusé par le service d’envoi',unknown:'Résultat à vérifier avant tout nouvel envoi'})[s];
 return <><button type="button" className="bill-button" onClick={()=>setOpen(true)}><Send size={16}/> Envoyer par e-mail</button><dialog ref={dialog} className="bill-directory-dialog bill-delivery-dialog" aria-label="Envoyer par e-mail" onCancel={e=>{if(busy)e.preventDefault();else setOpen(false);}}><div className="bill-dialog-top"><strong>Envoyer par e-mail</strong><button type="button" disabled={busy} aria-label="Fermer" onClick={()=>setOpen(false)}>×</button></div><form className="bill-section" onSubmit={e=>{e.preventDefault();void send();}}>
  <fieldset disabled={busy||!!attempt} className="bill-fields"><label className="bill-field bill-wide">Destinataire<input type="email" required maxLength={254} value={recipient} onChange={e=>setRecipient(e.target.value)}/></label><label className="bill-field bill-wide">Objet<input required maxLength={200} value={subject} onChange={e=>setSubject(e.target.value)}/></label><label className="bill-field bill-wide">Message<textarea required rows={6} maxLength={10000} value={message} onChange={e=>setMessage(e.target.value)}/></label></fieldset>
  <p className="bill-muted">Pièce jointe : {record.issuance?.number}.pdf</p>{error&&<p role="alert">{error}</p>}
  <div className="bill-reference-tools"><button type="button" className="bill-button" disabled={busy} onClick={()=>setOpen(false)}>Fermer</button>{attempt&&history.some(h=>h.id===attempt.id&&['sent','failed'].includes(h.state))?<button type="button" className="bill-button" onClick={()=>setAttempt(null)}>Nouveau message</button>:<button type="submit" className="bill-button bill-button-primary" disabled={busy||!!attempt&&history.some(h=>h.id===attempt.id)}>{busy?'Envoi…':attempt?'Vérifier cet envoi':'Envoyer avec le PDF'}</button>}</div>
  {!!history.length&&<section className="bill-email-history" aria-label="Historique des envois"><h4>Envois</h4>{history.map(h=><p key={h.id}><b>{h.recipient}</b><br/>{new Date(h.created_at).toLocaleString('fr-FR')} · {status(h.state)}</p>)}<button type="button" className="bill-button" onClick={()=>void refresh()}>Actualiser</button></section>}
 </form></dialog></>;
}
export function ElectronicDelivery({ready,onDownload}:{ready:boolean;onDownload:()=>void}){
 const [open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 return <><button type="button" className="bill-button" disabled={!ready} title={ready?'Déposer le Factur-X sur AGIRIS':'Finalisez la facture pour préparer son envoi'} onClick={()=>setOpen(true)}><Send size={16}/> Déposer sur AGIRIS</button>
 <dialog ref={dialog} className="bill-directory-dialog bill-delivery-dialog" aria-label="Déposer sur AGIRIS" onCancel={()=>setOpen(false)}><div className="bill-dialog-top"><strong>Déposer sur AGIRIS</strong><button type="button" aria-label="Fermer" onClick={()=>setOpen(false)}>×</button></div><div className="bill-section"><p>Téléchargez le Factur-X, importez-le dans « Factures émises » sur AGIRIS, puis validez son envoi sur la plateforme.</p><div className="bill-reference-tools"><button className="bill-button bill-button-pdf" type="button" onClick={onDownload}><PDFIcon/> Télécharger le Factur-X</button><a className="bill-button" href="https://agiris.cecurity.com/demat/v2/dd0d33f1-9dd6-4ea2-9761-e20ccd30aa73/app/einvoice-outbound/invoices/follow-up" target="_blank" rel="noreferrer"><ExternalLink size={16}/> Ouvrir AGIRIS</a></div></div></dialog></>;
}
