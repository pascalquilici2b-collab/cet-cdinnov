import {useEffect,useRef,useState} from 'react';
import {CheckCircle2,FlaskConical,Paperclip,Send,Trash2,X,ArrowLeft,RefreshCw} from 'lucide-react';
import type {BillingTransport} from '../billing-contracts';
import type {MailAttachment} from '../billing-mail-attachments';
import {sendMicrosoftTestMail,type MicrosoftSendReceipt} from '../billing-microsoft-send-testmail';
import {OutlookAccount} from './billing-outlook-account';
import {OutlookIcon} from './outlook-icon';
import {PDFIcon} from './billing-pdf-icon';
import {Field} from './billing-fields';
import {captureSuccess} from './action-feedback';
import './outlook-compose-test.css';
type Connection={email:string;connected:boolean;sendEnabled?:boolean};
type Attachment=MailAttachment&{id:string};
export function OutlookComposeTest({transport}:{transport:BillingTransport}){
 const [open,setOpen]=useState(false);return <><button type="button" className="bill-button bill-outlook-test-launch" onClick={()=>setOpen(true)}><FlaskConical size={17}/>Tester la rédaction CDI</button>{open&&<Compose transport={transport} close={()=>setOpen(false)}/>}</>;
}
function Compose({transport,close}:{transport:BillingTransport;close:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),upload=useRef<HTMLInputElement>(null),working=useRef(false);
 const [connection,setConnection]=useState<Connection|null>(null),[subject,setSubject]=useState('Test de rédaction CDI — Outlook'),[message,setMessage]=useState('Bonjour,\n\nCeci est un message de test envoyé depuis l’interface CDInnov avec Microsoft Outlook.\n\nConseil Développement Innovation'),[files,setFiles]=useState<Attachment[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[review,setReview]=useState(false),[receipt,setReceipt]=useState<MicrosoftSendReceipt|null>(null);
 useEffect(()=>{dialog.current?.showModal();let live=true;void(async()=>{try{const {jsPDF}=await import('jspdf'),pdf=new jsPDF();pdf.setCreationDate(new Date('2026-10-26T00:00:00Z'));pdf.setFileId('CD100000000000000000000000000001');pdf.setTextColor(0,90,185);pdf.setFontSize(22);pdf.text('CDInnov',22,28);pdf.setTextColor(35,45,60);pdf.setFontSize(15);pdf.text('Essai de rédaction avec Outlook',22,47);pdf.setFontSize(11);pdf.text(['Document de démonstration joint au message de test.','Aucune facture ni donnée client ne figure dans ce document.'],22,62);if(live)setFiles([{id:'demo',filename:'Test-CDInnov.pdf',blob:pdf.output('blob')}]);}catch{if(live)setError('Le PDF de démonstration n’a pas pu être préparé.');}finally{if(live)setLoading(false);}})();return()=>{live=false;};},[]);
 const locked=busy||loading||review||!!receipt;
 async function send(){if(working.current)return;working.current=true;setBusy(true);setError('');const done=captureSuccess();try{
  const microsoft=await import('./billing-microsoft'),identity=await microsoft.outlookToken(transport,true);
  const result=await sendMicrosoftTestMail({token:identity.token,email:identity.email,documentId:'composer-pilot',recipient:identity.email,subject:subject.trim(),message:message.trim(),attachments:files,currentEmail:async()=>(await transport.session()).email,storage:localStorage,confirmed:review});
  setReceipt(result);if(result.state==='sent')done('Message envoyé');else if(result.state==='accepted')done('Envoi pris en charge');
 }catch(e){setError((e as Error).message);}finally{working.current=false;setBusy(false);}}
 function add(incoming:FileList|null){if(!incoming)return;const next=[...files,...Array.from(incoming).map(blob=>({id:crypto.randomUUID(),filename:blob.name,blob}))];if(next.length>12||next.reduce((n,f)=>n+f.blob.size,0)>=3*1024*1024){setError('Pour cet essai : 12 pièces jointes maximum et moins de 3 Mo au total.');return;}setFiles(next);setError('');}
 return <dialog ref={dialog} className="bill-directory-dialog bill-delivery-dialog bill-compose-test" aria-label="Rédaction CDI avec Outlook" onCancel={e=>{if(busy)e.preventDefault();else close();}}>
  <div className="bill-dialog-top"><strong><OutlookIcon size={27}/>Rédaction CDI <span className="bill-compose-pilot">Essai</span></strong><button type="button" aria-label="Fermer le test" disabled={busy} onClick={close}><X size={18}/></button></div>
  <div className="bill-section"><OutlookAccount transport={transport} disabled={busy} sendAccess onConnection={setConnection}/>
  <p className="bill-compose-hint">Le test est envoyé à votre propre boîte Outlook.</p>
  <form onSubmit={e=>{e.preventDefault();setReview(true);setError('');}}>
   <fieldset className="bill-fields" disabled={locked}>
    <Field label="Destinataire" wide><input type="email" readOnly value={connection?.email||''}/></Field>
    <Field label="Objet du message" wide><input required maxLength={200} value={subject} onChange={e=>setSubject(e.target.value)}/></Field>
    <Field label="Message" wide><textarea required maxLength={9000} rows={7} value={message} onChange={e=>setMessage(e.target.value)}/></Field>
   </fieldset>
   <div className="bill-mail-files">{loading?<span>Préparation du PDF…</span>:files.map(f=><div className="bill-mail-attachment" key={f.id}>{/\.pdf$/i.test(f.filename)?<PDFIcon/>:<Paperclip size={23}/>}<span>{f.filename}<small>{Math.ceil(f.blob.size/1024)} Ko</small></span><button type="button" className="bill-icon-button bill-icon-danger" aria-label={'Retirer '+f.filename} disabled={locked} onClick={()=>setFiles(old=>old.filter(v=>v.id!==f.id))}><Trash2 size={17}/></button></div>)}</div>
   {!review&&!receipt&&<><input ref={upload} type="file" multiple hidden aria-label="Pièces du message de test" onChange={e=>{add(e.target.files);e.target.value='';}}/><button type="button" className="bill-button" disabled={locked} onClick={()=>upload.current?.click()}><Paperclip size={16}/>Joindre une pièce</button></>}
   {error&&<p role="alert">{error}</p>}
   {receipt&&<div className={'bill-compose-result '+receipt.state} role="status"><CheckCircle2 size={22}/><span>{receipt.state==='sent'?'Message envoyé — copie présente dans Outlook':receipt.state==='accepted'?'Envoi pris en charge par Outlook':'Envoi à vérifier dans Outlook — aucun nouvel envoi automatique'}</span></div>}
   <div className="bill-compose-actions">{receipt?<><a className="bill-button" href={receipt.webLink} target="_blank" rel="noopener noreferrer"><OutlookIcon size={18}/>Voir dans Outlook</a>{receipt.state!=='sent'&&<button type="button" className="bill-button bill-button-primary" disabled={busy} onClick={()=>void send()}><RefreshCw size={17}/>{busy?'Vérification…':'Vérifier l’envoi'}</button>}</>:review?<><button type="button" className="bill-button" disabled={busy} onClick={()=>setReview(false)}><ArrowLeft size={16}/>Modifier</button><button type="button" className="bill-button bill-button-primary" disabled={busy||!connection?.sendEnabled} onClick={()=>void send()}><Send size={17}/>{busy?'Envoi…':'Confirmer l’envoi du test'}</button></>:<button type="submit" className="bill-button bill-button-primary" disabled={busy||loading||!connection?.connected||!connection?.sendEnabled||!subject.trim()||!message.trim()}><OutlookIcon size={19}/>Vérifier avant envoi</button>}</div>
  </form></div>
 </dialog>;
}
