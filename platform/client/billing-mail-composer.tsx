import {useEffect,useRef,useState} from 'react';
import {Send,CheckCircle2,Download,Upload,Trash2,File,RefreshCw} from 'lucide-react';
import {captureSuccess} from './action-feedback';
import {OutlookIcon} from './outlook-icon';
import {OutlookAccount} from './billing-outlook-account';
import {PDFIcon} from './billing-pdf-icon';
import {Field} from './billing-fields';
import {defaultBillingEmail} from '../billing-email-default';
import {outlookMessage} from '../billing-outlook-message';
import {createMicrosoftDraft} from '../billing-microsoft-draft';
import type {MailAttachment} from '../billing-mail-attachments';
import type {BillingClientContact,BillingDocument,BillingTransport} from '../billing-contracts';
import {sameClient} from '../billing-client-match';
import './billing-mail-composer.css';
const certificateText='Vous trouverez également le certificat de dépôt Chorus.';
type Attachment=MailAttachment&{id:string;certificate?:boolean};
export function EmailDocument({record,transport,onDocument}:{record:BillingDocument;transport:BillingTransport;onDocument?:(doc:BillingDocument)=>void}){
 const invoice=record.data.kind==='invoice',number=record.issuance?.number||record.id,stem=(invoice?'Facture-':'Devis-')+number.replace(/[^a-zA-Z0-9_-]/g,'_');
 const [connection,setConnection]=useState<{email:string;connected:boolean}|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[reportError,setReportError]=useState('');
 const [contacts,setContacts]=useState<BillingClientContact[]>([]),[selected,setSelected]=useState(''),[recipient,setRecipient]=useState(record.data.buyer.email),[subject,setSubject]=useState(`${invoice?'Facture':'Devis'} ${number} — ${record.data.title}`),[message,setMessage]=useState(defaultBillingEmail(record));
 const [files,setFiles]=useState<Attachment[]>([]),[certificate,setCertificate]=useState(false),[ready,setReady]=useState<{url:string;filename:string}|null>(null),[draft,setDraft]=useState<{webLink:string}|null>(null),[confirmed,setConfirmed]=useState(false),[retry,setRetry]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null),upload=useRef<HTMLInputElement>(null),certUpload=useRef<HTMLInputElement>(null);
 useEffect(()=>()=>{if(ready)URL.revokeObjectURL(ready.url);},[ready]);
 const invalidate=()=>{setReady(null);setDraft(null);};
 useEffect(()=>{if(!open){dialog.current?.close();return;}dialog.current?.showModal();let active=true;setLoading(true);setError('');setReportError('');
  void (async()=>{
   const reportFile=async()=>{const value=await transport.report(record.id);if(!value.version&&value.rows.length&&value.rows.every(r=>r.label.trim()&&r.description.trim()&&Number(r.days.replace(',','.'))>0)){const {version,...data}=value;await transport.saveReport(record.id,version,data);}return transport.reportPDF(record.id);};
   const [pdf,report]=await Promise.all([transport.issuedFile(record.id,'pdf'),invoice?reportFile().catch(e=>{if(active)setReportError(e.message);return null;}):Promise.resolve(null)]);
   if(active){setFiles([{id:'document',filename:stem+'.pdf',blob:pdf},...(report?[{id:'report',filename:'Releve-'+number+'.pdf',blob:report}]:[])]);setCertificate(false);}
   let list:BillingClientContact[]=[];
   if(record.data.clientId){const client=await transport.directoryGet('clients',record.data.clientId);if(client.kind==='clients')list=client.data.contacts||[];}
   else{const matches:BillingClientContact[][]=[];for(let offset=0;;){const page=await transport.directoryList('clients',{q:'',offset,limit:100,archived:false});for(const c of page.records)if(c.kind==='clients'&&sameClient(c.data,record.data.buyer))matches.push(c.data.contacts||[]);offset+=page.records.length;if(offset>=page.total||!page.records.length)break;}if(matches.length===1)list=matches[0];}
   if(active)setContacts(list);
  })().catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
 },[open,record.id,retry,transport]);
 const reportSentence=`Le relevé d’intervention relatif à la facture ${number} est également joint à ce message.`;
 const reportAttached=invoice&&files.some(f=>f.id==='report'),certificateAttached=certificate&&files.some(f=>f.certificate);
 useEffect(()=>{setMessage(old=>{let text=old;for(const [sentence,include] of [[reportSentence,reportAttached],[certificateText,certificateAttached]] as const){if(!include)text=text.replace(sentence+'\n\n','').replace('\n\n'+sentence,'');else if(!text.includes(sentence)){const closing=text.indexOf('Vous en souhaitant bonne réception');text=closing>=0?text.slice(0,closing)+sentence+'\n\n'+text.slice(closing):text+'\n\n'+sentence;}}return text;});},[reportAttached,certificateAttached,reportSentence]);
 const body=message.trim();
 function add(incoming:FileList|null,isCertificate=false){if(!incoming)return;invalidate();const added=Array.from(incoming).map(f=>({id:crypto.randomUUID(),filename:f.name,blob:f,certificate:isCertificate}));if(added.some(f=>f.blob.size>20*1024*1024)){setError('Une pièce jointe ne peut pas dépasser 20 Mo.');return;}setFiles(old=>[...old.filter(f=>!isCertificate||!f.certificate),...added]);if(isCertificate)setCertificate(true);}
 function download(value:{url:string;filename:string}){const a=document.createElement('a');a.href=value.url;a.download=value.filename;a.click();}
 async function prepare(online:boolean){if(busy)return;const completed=captureSuccess();setBusy(true);setError('');let target:Window|null=null;
  if(online){target=window.open('about:blank','_blank');if(target){target.opener=null;target.document.title='Outlook · CDInnov';target.document.body.textContent='Préparation du brouillon Outlook…';}}
  try{
   if((await transport.get(record.id)).rectification?.replacementId)throw Error('Cette facture a été remplacée. Ouvrez sa rectification.');
   if(certificate&&!files.some(f=>f.certificate))throw Error('Importez le certificat de dépôt Chorus ou décochez cette option.');
   const contact=contacts.find(c=>c.id===selected&&c.email===recipient),input={recipient:recipient.trim(),recipientName:contact?.name,subject,message:body,attachments:files.filter(f=>!f.certificate||certificate),...(invoice?{cc:'cdi@cdinnov.com' as const}:{})};
   if(online){const microsoft=await import('./billing-microsoft'),identity=await microsoft.outlookToken(transport),result=await createMicrosoftDraft({...input,token:identity.token,email:identity.email,documentId:record.id,currentEmail:async()=>(await transport.session()).email,storage:sessionStorage});setDraft(result);if(target&&!target.closed)target.location.replace(result.webLink);completed('Brouillon créé');}
   else{const blob=await outlookMessage(input),value={url:URL.createObjectURL(blob),filename:stem+'.eml'};setReady(value);download(value);completed('Message prêt');}
  }catch(e){target?.close();setError((e as Error).message);}finally{setBusy(false);}
 }
 async function confirmSent(){if(busy)return;const done=captureSuccess();setBusy(true);setError('');try{const current=await transport.get(record.id),updated=await transport.confirmSent(record.id,current.version,{recipient:recipient.trim(),subject,message:body});setConfirmed(true);onDocument?.(updated);done('Envoi confirmé');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <><button type="button" className="bill-button" onClick={()=>setOpen(true)}><Send size={16}/>Envoyer par e-mail</button><dialog ref={dialog} className="bill-directory-dialog bill-delivery-dialog" aria-label="Envoyer par e-mail" onCancel={e=>{if(busy)e.preventDefault();else setOpen(false);}}><div className="bill-dialog-top"><strong><OutlookIcon size={25}/>Préparer dans Outlook</strong><button type="button" disabled={busy} aria-label="Fermer" onClick={()=>setOpen(false)}>×</button></div><form className="bill-section" onSubmit={e=>{e.preventDefault();void prepare(true);}}>
 {open&&<OutlookAccount transport={transport} disabled={busy} onConnection={setConnection}/>}<fieldset disabled={busy||loading} className="bill-fields" onChange={invalidate}>
 <Field label="Contact du client" wide><select value={selected} onChange={e=>{setSelected(e.target.value);setRecipient(contacts.find(c=>c.id===e.target.value)?.email||'');}}><option value="">Saisir un destinataire</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}</select></Field><Field label="Destinataire" wide><input type="email" required value={recipient} onChange={e=>{setRecipient(e.target.value);setSelected('');}}/></Field>{invoice&&<Field label="Copie (Cc)" wide><input value="cdi@cdinnov.com" readOnly/></Field>}
 <Field label="Objet du message" wide><input maxLength={200} required value={subject} onChange={e=>setSubject(e.target.value)}/></Field><Field label="Message" wide><textarea rows={8} maxLength={9000} required value={message} onChange={e=>setMessage(e.target.value)}/></Field>
 <div className="bill-mail-add"><input ref={upload} hidden type="file" multiple onChange={e=>{add(e.target.files);e.target.value='';}}/><button type="button" className="bill-button" onClick={()=>upload.current?.click()}><Upload size={17}/>Joindre également une pièce facultative</button></div>
 {invoice&&<div className="bill-mail-certificate"><label><input type="checkbox" checked={certificate} onChange={e=>setCertificate(e.target.checked)}/><span>Joindre un certificat de dépôt Chorus</span></label>{certificate&&<><input ref={certUpload} hidden type="file" accept=".pdf" onChange={e=>{add(e.target.files,true);e.target.value='';}}/><button type="button" className="bill-button" onClick={()=>certUpload.current?.click()}><Upload size={16}/>Importer le certificat</button></>}</div>}
 </fieldset><div className="bill-mail-files" aria-busy={loading}>{loading?<span>Préparation des pièces jointes…</span>:files.map(f=><div className="bill-mail-attachment" key={f.id}>{/\.pdf$/i.test(f.filename)?<PDFIcon/>:<File size={24}/>}<span>{f.filename}</span><button className="bill-icon-button bill-icon-danger" type="button" disabled={busy||loading} aria-label={'Retirer '+f.filename} onClick={()=>{setFiles(old=>old.filter(x=>x.id!==f.id));if(f.certificate)setCertificate(false);invalidate();}}><Trash2 size={17}/></button></div>)}</div>
 {reportError&&<p className="bill-mail-report-warning">Relevé non joint : {reportError}<button className="bill-icon-button" type="button" title="Recharger le relevé" onClick={()=>setRetry(n=>n+1)}><RefreshCw size={15}/></button></p>}
 {error&&<p role="alert">{error}</p>}
 <div className="bill-mail-actions"><button type="button" className="bill-button bill-mail-download" aria-label="Télécharger le message" title="Télécharger le message Outlook" disabled={busy||loading||!recipient.trim()} onClick={()=>ready?download(ready):void prepare(false)}><Download size={19}/></button>{draft?<a className="bill-button bill-button-primary" href={draft.webLink} target="_blank" rel="noopener noreferrer"><OutlookIcon/>Ouvrir Outlook</a>:<button className="bill-button bill-button-primary" disabled={busy||loading||!connection?.connected}><OutlookIcon/>{busy?'Préparation…':'Créer le brouillon Outlook'}</button>}</div>
 {invoice&&<button type="button" className="bill-button bill-mail-confirm" disabled={busy||loading||confirmed||!recipient.trim()} onClick={()=>void confirmSent()}><CheckCircle2 size={18}/>{confirmed?'Envoi confirmé':'Confirmer l’envoi depuis Outlook'}</button>}
 </form></dialog></>;
}
