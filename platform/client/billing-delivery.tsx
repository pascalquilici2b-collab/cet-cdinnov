import {defaultBillingEmail} from '../billing-email-default';
import {OutlookIcon} from './outlook-icon';
import {OutlookAccount} from './billing-outlook-account';
import {createMicrosoftDraft} from '../billing-microsoft-draft';
import {PDFIcon} from './billing-pdf-icon';
import {useEffect,useRef,useState} from 'react';
import {Send,ExternalLink,CheckCircle2,Download} from 'lucide-react';
import type {BillingClientContact,BillingDocument,BillingTransport} from '../billing-contracts';
import {outlookMessage} from '../billing-outlook-message';
import {sameClient} from '../billing-client-match';
import {Field} from './billing-fields';

export function EmailDocument({record,transport}:{record:BillingDocument;transport:BillingTransport}){
 const [connection,setConnection]=useState<{email:string;connected:boolean}|null>(null),[outlookDraft,setOutlookDraft]=useState<{webLink:string}|null>(null);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[contacts,setContacts]=useState<BillingClientContact[]>([]),[selected,setSelected]=useState('');
 const [recipient,setRecipient]=useState(record.data.buyer.email),[subject,setSubject]=useState(`${record.data.kind==='quote'?'Devis':'Facture'} ${record.issuance?.number||''} — ${record.data.title}`),[message,setMessage]=useState(defaultBillingEmail(record));
 const [ready,setReady]=useState<{url:string;filename:string}|null>(null),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>()=>{if(ready)URL.revokeObjectURL(ready.url);},[ready]);
 useEffect(()=>{if(!open){dialog.current?.close();return;}dialog.current?.showModal();let active=true;setLoading(true);setError('');
  void (async()=>{
   if(record.data.clientId){const client=await transport.directoryGet('clients',record.data.clientId);if(client.kind==='clients')return client.data.contacts||[];}
   // Older documents may not carry a directory ID. Only use an unambiguous identity match.
   const found:BillingClientContact[][]=[];let offset=0;
   for(;;){const page=await transport.directoryList('clients',{q:'',offset,limit:100,archived:false});for(const row of page.records)if(row.kind==='clients'&&sameClient(row.data,record.data.buyer))found.push(row.data.contacts||[]);offset+=page.records.length;if(offset>=page.total||!page.records.length)break;}
   return found.length===1?found[0]:[];
  })().then(value=>{if(active)setContacts(value);}).catch(()=>{if(active){setContacts([]);setError('Contacts indisponibles. Vous pouvez saisir le destinataire.');}}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[open,record.id,transport]);
 const download=(value:{url:string;filename:string})=>{const link=document.createElement('a');link.href=value.url;link.download=value.filename;document.body.append(link);link.click();link.remove();};
 async function prepare(){
  if(busy)return;setBusy(true);setError('');setReady(null);
  try{if((await transport.get(record.id)).rectification?.replacementId)throw Error('Cette facture a été remplacée. Ouvrez sa rectification.');const filename=(record.data.kind==='quote'?'Devis-':'Facture-')+(record.issuance?.number||record.id).replace(/[^a-zA-Z0-9_-]/g,'_'),pdf=await transport.issuedFile(record.id,'pdf');
   const chosen=contacts.find(c=>c.id===selected&&c.email===recipient),blob=await outlookMessage({recipient:recipient.trim(),recipientName:chosen?.name,subject,message,filename:filename+'.pdf',pdf});
   const result={url:URL.createObjectURL(blob),filename:filename+'.eml'};setReady(result);download(result);
  }catch(e){setError(e instanceof Error?e.message:'Le message n’a pas pu être préparé.');}finally{setBusy(false);}
 }
 async function prepareOnline(){
  if(busy)return;setBusy(true);setError('');
  const outlookWindow=window.open('about:blank','_blank');if(outlookWindow){outlookWindow.opener=null;outlookWindow.document.title='Outlook · CDInnov';outlookWindow.document.body.textContent='Préparation du brouillon Outlook…';}
  try{if((await transport.get(record.id)).rectification?.replacementId)throw Error('Cette facture a été remplacée. Ouvrez sa rectification.');const microsoft=await import('./billing-microsoft'),identity=await microsoft.outlookToken(transport),pdf=await transport.issuedFile(record.id,'pdf'),contact=contacts.find(c=>c.id===selected&&c.email===recipient);
   const result=await createMicrosoftDraft({token:identity.token,email:identity.email,documentId:record.id,recipient:recipient.trim(),recipientName:contact?.name,subject,message,filename:(record.data.kind==='quote'?'Devis-':'Facture-')+(record.issuance?.number||record.id)+'.pdf',pdf,currentEmail:async()=>(await transport.session()).email,storage:sessionStorage});setOutlookDraft(result);if(outlookWindow&&!outlookWindow.closed)outlookWindow.location.replace(result.webLink);
  }catch(e){if(outlookWindow&&!outlookWindow.closed)outlookWindow.close();setError(e instanceof Error?e.message:'Le brouillon Outlook n’a pas pu être préparé.');}finally{setBusy(false);}
 }
 return <><button type="button" className="bill-button" onClick={()=>setOpen(true)}><Send size={16}/> Envoyer par e-mail</button><dialog ref={dialog} className="bill-directory-dialog bill-delivery-dialog" aria-label="Envoyer par e-mail" onCancel={e=>{if(busy)e.preventDefault();else setOpen(false);}}><div className="bill-dialog-top"><strong><OutlookIcon size={25}/>Préparer dans Outlook</strong><button type="button" disabled={busy} aria-label="Fermer" onClick={()=>setOpen(false)}>×</button></div><form className="bill-section" onSubmit={e=>{e.preventDefault();void prepareOnline();}}>
  {open&&<OutlookAccount transport={transport} disabled={busy} onConnection={setConnection}/>}<fieldset disabled={busy} className="bill-fields" onChange={()=>{setReady(null);setOutlookDraft(null);}}><Field label="Contact du client" wide><select disabled={loading} value={selected} onChange={e=>{setSelected(e.target.value);const contact=contacts.find(c=>c.id===e.target.value);setRecipient(contact?.email||'');}}><option value="">{loading?'Chargement des contacts…':'Saisir un destinataire'}</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name}{c.role?' · '+c.role:''} — {c.email}</option>)}</select></Field><Field label="Destinataire" wide><input type="email" required maxLength={254} value={recipient} onChange={e=>{setRecipient(e.target.value);setSelected('');}}/></Field><Field label="Objet du message" wide><input required maxLength={200} value={subject} onChange={e=>setSubject(e.target.value)}/></Field><Field label="Message" wide><textarea required rows={8} maxLength={10000} value={message} onChange={e=>setMessage(e.target.value)}/></Field></fieldset>
  <div className="bill-mail-attachment"><PDFIcon/><span>{record.issuance?.number}.pdf</span></div>{error&&<p role="alert">{error}</p>}
  {outlookDraft?<p className="bill-delivery-ready" role="status"><CheckCircle2 size={18}/> Brouillon créé dans votre Outlook avec le PDF joint</p>:ready?<><p className="bill-delivery-ready" role="status"><CheckCircle2 size={18}/> Message prêt avec le PDF joint</p><p className="bill-outlook-help">Ouvrez le fichier téléchargé avec Outlook pour vérifier le message et l’envoyer.</p></>:<p className="bill-outlook-help">Le message sera préparé dans votre dossier Brouillons. Vous l’enverrez depuis Outlook.</p>}
  <div className="bill-mail-actions"><button type="button" className="bill-button bill-mail-download" aria-label="Télécharger le message" title="Télécharger le message Outlook avec le PDF joint" disabled={busy||loading||!recipient.trim()||!subject.trim()} onClick={()=>ready?download(ready):void prepare()}><Download size={19}/></button>{outlookDraft?<a className="bill-button bill-button-primary" href={outlookDraft.webLink} target="_blank" rel="noopener noreferrer"><OutlookIcon/> Ouvrir Outlook</a>:<button type="submit" className="bill-button bill-button-primary" disabled={busy||loading||!connection?.connected}><OutlookIcon/>{busy?'Préparation…':'Créer le brouillon Outlook'}</button>}</div>
 </form></dialog></>;
}

export function ElectronicDelivery({ready,onDownload}:{ready:boolean;onDownload:()=>void}){
 const [open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 return <><button type="button" className="bill-button" disabled={!ready} title={ready?'Déposer le Factur-X sur AGIRIS':'Finalisez la facture pour préparer son envoi'} onClick={()=>setOpen(true)}><Send size={16}/> Déposer sur AGIRIS</button>
 <dialog ref={dialog} className="bill-directory-dialog bill-delivery-dialog" aria-label="Déposer sur AGIRIS" onCancel={()=>setOpen(false)}><div className="bill-dialog-top"><strong>Déposer sur AGIRIS</strong><button type="button" aria-label="Fermer" onClick={()=>setOpen(false)}>×</button></div><div className="bill-section"><p>Téléchargez le Factur-X, importez-le dans « Factures émises » sur AGIRIS, puis validez son envoi sur la plateforme.</p><div className="bill-reference-tools"><button className="bill-button bill-button-pdf" type="button" onClick={onDownload}><PDFIcon/> Télécharger le Factur-X</button><a className="bill-button" href="https://agiris.cecurity.com/demat/v2/dd0d33f1-9dd6-4ea2-9761-e20ccd30aa73/app/einvoice-outbound/invoices/follow-up" target="_blank" rel="noreferrer"><ExternalLink size={16}/> Ouvrir AGIRIS</a></div></div></dialog></>;
}
