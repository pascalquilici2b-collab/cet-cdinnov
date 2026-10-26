import {useEffect,useRef,useState} from 'react';
import {Send,CheckCircle2,Download,Paperclip,Trash2,File,RefreshCw,PenLine,ChevronLeft,UserRound,Check} from 'lucide-react';
import {captureSuccess} from './action-feedback';
import {OutlookIcon} from './outlook-icon';
import {OutlookAccount} from './billing-outlook-account';
import {PDFIcon} from './billing-pdf-icon';
import {Field} from './billing-fields';
import {MailSignatureEditor,MailSignaturePreview} from './billing-mail-signature';
import {emptySignature,signedMail,validateMail,mailAddresses,type MailSignatureRecord} from '../billing-mail-content';
import {defaultBillingEmail} from '../billing-email-default';
import {outlookMessage} from '../billing-outlook-message';
import {createMicrosoftDraft} from '../billing-microsoft-draft';
import {sendMicrosoftMail} from '../billing-microsoft-send';
import type {MicrosoftSendReceipt} from '../billing-microsoft-send-testmail';
import type {MailAttachment} from '../billing-mail-attachments';
import type {BillingClientContact,BillingDocument,BillingTransport} from '../billing-contracts';
import {sameClient} from '../billing-client-match';
import './billing-mail-composer.css';
const certificateText='Vous trouverez également le certificat de dépôt Chorus.';
type Attachment=MailAttachment&{id:string;certificate?:boolean};
export function EmailDocument({record,transport,onDocument}:{record:BillingDocument;transport:BillingTransport;onDocument?:(doc:BillingDocument)=>void}){
 const invoice=record.data.kind==='invoice',number=record.issuance?.number||record.id,stem=(invoice?'Facture-':'Devis-')+number.replace(/[^a-zA-Z0-9_-]/g,'_');
 const [connection,setConnection]=useState<{email:string;connected:boolean;sendEnabled?:boolean}|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[reportError,setReportError]=useState('');
 const [contacts,setContacts]=useState<BillingClientContact[]>([]),[recipient,setRecipient]=useState(''),[cc,setCc]=useState(invoice?'cdi@cdinnov.com':''),[bcc,setBcc]=useState(''),[showCc,setShowCc]=useState(invoice),[showBcc,setShowBcc]=useState(false),[subject,setSubject]=useState(`${invoice?'Facture':'Devis'} ${number} — ${record.data.title}`),[message,setMessage]=useState(defaultBillingEmail(record));
 const [files,setFiles]=useState<Attachment[]>([]),[certificate,setCertificate]=useState(false),[ready,setReady]=useState<{url:string;filename:string}|null>(null),[draft,setDraft]=useState<{webLink:string}|null>(null),[confirmed,setConfirmed]=useState(false),[retry,setRetry]=useState(0),[review,setReview]=useState(false),[receipt,setReceipt]=useState<MicrosoftSendReceipt|null>(null);
 const [signature,setSignature]=useState<MailSignatureRecord>({version:0,data:emptySignature()}),[includeSignature,setIncludeSignature]=useState(true);
 const dialog=useRef<HTMLDialogElement>(null),upload=useRef<HTMLInputElement>(null),certUpload=useRef<HTMLInputElement>(null),sending=useRef(false),receiptKey=useRef(''),autoChecks=useRef(0),recipientsInitialized=useRef(false);
 const locked=busy||loading||review||!!receipt;
 useEffect(()=>()=>{if(ready)URL.revokeObjectURL(ready.url);},[ready]);
 const invalidate=()=>{setReady(null);setDraft(null);setReview(false);};
 useEffect(()=>{
  if(!open){dialog.current?.close();return;}dialog.current?.showModal();let active=true;setLoading(true);setError('');setReportError('');
  const identity=async()=>{
   const session=await transport.session();receiptKey.current='cdi-mail-receipt:'+session.email.toLowerCase()+':'+record.id+':'+record.version;
   try{const saved=JSON.parse(localStorage.getItem(receiptKey.current)||'null');if(active&&saved?.id)setReceipt(saved);}catch{/* Existing Graph ledger remains the second duplicate guard. */}
   const ownSignature=await transport.mailSignature();
   if(active)setSignature(ownSignature.version?ownSignature:{...ownSignature,data:{...emptySignature(),text:[session.name?.trim(),session.email].filter((v,i,a)=>v&&a.indexOf(v)===i).join('\n')}});
  };
  const attachments=async()=>{
   const reportFile=async()=>{const value=await transport.report(record.id);if(!value.version&&value.rows.length&&value.rows.every(r=>r.label.trim()&&r.description.trim()&&Number(r.days.replace(',','.'))>0)){const {version,...data}=value;await transport.saveReport(record.id,version,data);}return transport.reportPDF(record.id);};
   const [pdf,report]=await Promise.all([transport.issuedFile(record.id,'pdf'),invoice?reportFile().catch(e=>{if(active)setReportError(e.message);return null;}):Promise.resolve(null)]);
   if(active){setFiles([{id:'document',filename:stem+'.pdf',blob:pdf},...(report?[{id:'report',filename:'Releve-'+number+'.pdf',blob:report}]:[])]);setCertificate(false);}
  };
  const recipients=async()=>{
   let list:BillingClientContact[]=[];
   if(record.data.clientId){const client=await transport.directoryGet('clients',record.data.clientId);if(client.kind==='clients')list=client.data.contacts||[];}
   else{const matches:BillingClientContact[][]=[];for(let offset=0;;){const page=await transport.directoryList('clients',{q:'',offset,limit:100,archived:false});for(const c of page.records)if(c.kind==='clients'&&sameClient(c.data,record.data.buyer))matches.push(c.data.contacts||[]);offset+=page.records.length;if(offset>=page.total||!page.records.length)break;}if(matches.length===1)list=matches[0];}
   const seen=new Set<string>();list=list.filter(c=>{try{const addresses=mailAddresses(c.email,true);if(addresses.length!==1||seen.has(addresses[0]))return false;seen.add(addresses[0]);return true;}catch{return false;}}).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
   if(active){setContacts(list);if(!recipientsInitialized.current){setRecipient(list.length?'':record.data.buyer.email);recipientsInitialized.current=true;}}
  };
  void Promise.allSettled([identity(),attachments(),recipients()]).then(results=>{if(!active)return;const failed=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(failed.length)setError(failed.map(r=>r.reason?.message||'Chargement impossible.').join(' '));setLoading(false);});return()=>{active=false;};
 },[open,record.id,retry,transport]);
 const reportSentence=`Le relevé d’intervention relatif à la facture ${number} est également joint à ce message.`;
 const reportAttached=invoice&&files.some(f=>f.id==='report'),certificateAttached=certificate&&files.some(f=>f.certificate);
 useEffect(()=>{setMessage(old=>{let text=old;for(const [sentence,include] of [[reportSentence,reportAttached],[certificateText,certificateAttached]] as const){if(!include)text=text.replace(sentence+'\n\n','').replace('\n\n'+sentence,'');else if(!text.includes(sentence)){const closing=text.indexOf('Vous en souhaitant bonne réception');text=closing>=0?text.slice(0,closing)+sentence+'\n\n'+text.slice(closing):text+'\n\n'+sentence;}}return text;});},[reportAttached,certificateAttached,reportSentence]);
 function content(){
  if(certificate&&!files.some(f=>f.certificate))throw Error('Importez le certificat de dépôt Chorus ou décochez cette option.');
  const signed=signedMail(message.trim(),signature.data,includeSignature),input={recipient:recipient.trim(),cc:cc.trim(),bcc:bcc.trim(),subject:subject.trim(),message:signed.message,html:signed.html,attachments:[...files.filter(f=>!f.certificate||certificate),...signed.inline]};
  validateMail(input);return input;
 }
 function add(incoming:FileList|null,isCertificate=false){if(!incoming)return;invalidate();const added=Array.from(incoming).map(f=>({id:crypto.randomUUID(),filename:f.name,blob:f,certificate:isCertificate}));const next=[...files.filter(f=>!isCertificate||!f.certificate),...added];if(next.length>11||next.reduce((n,f)=>n+f.blob.size,0)>20*1024*1024){setError('Limite de 11 pièces jointes et 20 Mo par message, en plus de la signature.');return;}setFiles(next);if(isCertificate)setCertificate(true);}
 function download(value:{url:string;filename:string}){const a=document.createElement('a');a.href=value.url;a.download=value.filename;a.click();}
 async function checkDocument(){const current=await transport.get(record.id);if(current.rectification?.replacementId)throw Error('Cette facture a été remplacée. Ouvrez sa rectification.');if(current.status!=='issued'||current.version!==record.version)throw Error('Le document a changé. Fermez ce message et rechargez le document.');}
 async function prepare(online:boolean){if(sending.current)return;const completed=captureSuccess();sending.current=true;setBusy(true);setError('');let target:Window|null=null;
  try{
   const input=content();if(online){target=window.open('about:blank','_blank');if(target){target.opener=null;target.document.title='Outlook · CDInnov';target.document.body.textContent='Préparation du brouillon Outlook…';}}
   await checkDocument();
   if(online){const microsoft=await import('./billing-microsoft'),identity=await microsoft.outlookToken(transport),result=await createMicrosoftDraft({...input,token:identity.token,email:identity.email,documentId:record.id,currentEmail:async()=>(await transport.session()).email,storage:localStorage});setDraft(result);if(target&&!target.closed)target.location.replace(result.webLink);completed('Brouillon créé');}
   else{const blob=await outlookMessage(input),value={url:URL.createObjectURL(blob),filename:stem+'.eml'};setReady(value);download(value);completed('Message prêt');}
  }catch(e){target?.close();setError((e as Error).message);}finally{sending.current=false;setBusy(false);}
 }
 async function syncSent(accessToken?:string,messageId?:string){const current=await transport.get(record.id),input=content(),updated=await transport.confirmSent(record.id,current.version,{recipient:input.recipient,subject:input.subject,message:input.message,...(accessToken&&messageId?{graph:{accessToken,messageId}}:{})});setConfirmed(true);onDocument?.(updated);}
 async function send(){if(sending.current)return;sending.current=true;setBusy(true);setError('');const done=captureSuccess();
  try{const input=content(),microsoft=await import('./billing-microsoft'),identity=await microsoft.outlookToken(transport,true);const result=await sendMicrosoftMail({...input,token:identity.token,email:identity.email,documentId:record.id+':'+record.version,confirmed:true,currentEmail:async()=>(await transport.session()).email,storage:localStorage,beforeSend:checkDocument});setReceipt(result);localStorage.setItem(receiptKey.current,JSON.stringify(result));if(result.state==='sent'){await syncSent(identity.token,result.id);done('Message envoyé');}}
  catch(e){setError((e as Error).message);}finally{sending.current=false;setBusy(false);}
 }
 async function verifySent(){if(sending.current||!receipt)return;sending.current=true;setBusy(true);setError('');const done=captureSuccess();try{const microsoft=await import('./billing-microsoft'),identity=await microsoft.outlookToken(transport);await syncSent(identity.token,receipt.id);const sent={...receipt,state:'sent' as const};setReceipt(sent);localStorage.setItem(receiptKey.current,JSON.stringify(sent));done('Envoi confirmé');}catch(e){setError((e as Error).message);}finally{sending.current=false;setBusy(false);}}
 async function confirmSent(){if(sending.current)return;sending.current=true;const done=captureSuccess();setBusy(true);setError('');try{await syncSent();done('Envoi confirmé');}catch(e){setError((e as Error).message);}finally{sending.current=false;setBusy(false);}}
 useEffect(()=>{if(!open||busy||loading||!receipt||confirmed||autoChecks.current>=3)return;const timer=setTimeout(()=>{autoChecks.current++;void verifySent();},2000*(autoChecks.current+1));return()=>clearTimeout(timer);},[open,busy,loading,receipt,confirmed]);
 function reviewMessage(){setError('');try{const input=content();if(input.attachments.reduce((n,f)=>n+f.blob.size,0)>=3*1024*1024)throw Error('Pour un message de 3 Mo ou plus, téléchargez-le avec le bouton flèche puis envoyez-le dans Outlook.');setReview(true);}catch(e){setError((e as Error).message);}}
 return <><button type="button" className="bill-button" onClick={()=>setOpen(true)}><Send size={16}/>Envoyer par e-mail</button><dialog ref={dialog} className="bill-directory-dialog bill-delivery-dialog bill-cdi-mail" aria-label="Envoyer par e-mail" onCancel={e=>{if(busy)e.preventDefault();else setOpen(false);}}><div className="bill-dialog-top"><strong><OutlookIcon size={25}/>Rédaction CDI</strong><button type="button" disabled={busy} aria-label="Fermer" onClick={()=>setOpen(false)}>×</button></div><form className="bill-section" onSubmit={e=>{e.preventDefault();if(!review)reviewMessage();else void send();}}>
 {open&&<OutlookAccount transport={transport} disabled={busy||!!receipt} sendAccess onConnection={setConnection}/>}
 <fieldset disabled={locked} className="bill-fields" onChange={invalidate}>
 {contacts.length>0&&<div className="bill-mail-contacts" role="group" aria-label="Contacts du client"><div className="bill-mail-contacts-title"><UserRound size={15}/>Contacts du client</div><div className="bill-mail-contact-list">{contacts.map(c=>{const address=c.email.trim().toLowerCase(),chosen=recipient.split(/[;,]/).some(a=>a.trim().toLowerCase()===address);return <button type="button" key={c.id} className="bill-mail-contact" aria-pressed={chosen} onClick={()=>{setRecipient(old=>{const rest=old.split(/[;,]/).map(a=>a.trim()).filter(a=>a&&a.toLowerCase()!==address);return (chosen?rest:[...rest,c.email.trim()]).join('; ');});invalidate();}}><span className="bill-mail-contact-check">{chosen?<Check size={14}/>:<UserRound size={14}/>}</span><span><strong>{c.name||c.email}</strong><small>{c.role?c.role+' · ':''}{c.email}</small></span></button>;})}</div></div>}
 <div className="bill-mail-recipient"><Field label="Destinataire" wide><input type="text" inputMode="email" autoComplete="off" required placeholder={contacts.length?'Choisir un contact ci-dessus ou saisir une adresse…':'nom@exemple.fr ; autre@exemple.fr'} value={recipient} onChange={e=>setRecipient(e.target.value)}/></Field><div className="bill-mail-recipient-options"><button type="button" aria-pressed={showCc} onClick={()=>setShowCc(!showCc)}>Cc</button><button type="button" aria-pressed={showBcc} onClick={()=>setShowBcc(!showBcc)}>Cci</button></div></div>
 {showCc&&<Field label="Copie (Cc)" wide><input inputMode="email" value={cc} placeholder="nom@exemple.fr ; autre@exemple.fr" onChange={e=>setCc(e.target.value)}/></Field>}{showBcc&&<Field label="Copie cachée (Cci)" wide><input inputMode="email" value={bcc} placeholder="nom@exemple.fr" onChange={e=>setBcc(e.target.value)}/></Field>}
 <Field label="Objet du message" wide><input maxLength={200} required value={subject} onChange={e=>setSubject(e.target.value)}/></Field><Field label="Message" wide><textarea rows={9} maxLength={9000} required value={message} onChange={e=>setMessage(e.target.value)}/></Field>
 </fieldset>
 {includeSignature&&<MailSignaturePreview value={signature.data}/>}
 {!review&&!receipt&&<MailSignatureEditor value={signature} transport={transport} disabled={locked} enabled={includeSignature} onEnabled={v=>{setIncludeSignature(v);invalidate();}} onChange={v=>{setSignature(v);invalidate();}}/>}
 <div className="bill-mail-files" aria-busy={loading}>{loading?<span>Préparation des pièces jointes…</span>:files.map(f=><div className="bill-mail-attachment" key={f.id}>{/\.pdf$/i.test(f.filename)?<PDFIcon/>:<File size={24}/>}<span>{f.filename}<small>{f.blob.size<1024*1024?Math.ceil(f.blob.size/1024)+' Ko':(f.blob.size/1024/1024).toFixed(1)+' Mo'}</small></span><button className="bill-icon-button bill-icon-danger" type="button" disabled={locked} aria-label={'Retirer '+f.filename} onClick={()=>{setFiles(old=>old.filter(x=>x.id!==f.id));if(f.certificate)setCertificate(false);invalidate();}}><Trash2 size={17}/></button></div>)}</div>
 {!review&&!receipt&&<fieldset disabled={busy||loading} className="bill-mail-add-controls"><input ref={upload} hidden type="file" multiple aria-label="Pièces jointes supplémentaires" onChange={e=>{add(e.target.files);e.target.value='';}}/><button type="button" className="bill-button" onClick={()=>upload.current?.click()}><Paperclip size={17}/>Joindre une pièce</button>{invoice&&<div className="bill-mail-certificate"><label><input type="checkbox" checked={certificate} onChange={e=>{setCertificate(e.target.checked);invalidate();}}/><span>Joindre un certificat de dépôt Chorus</span></label>{certificate&&<><input ref={certUpload} hidden type="file" accept=".pdf" onChange={e=>{add(e.target.files,true);e.target.value='';}}/><button type="button" className="bill-button" onClick={()=>certUpload.current?.click()}><Paperclip size={16}/>Importer le certificat</button></>}</div>}</fieldset>}
 {reportError&&<p className="bill-mail-report-warning">Relevé non joint : {reportError}<button className="bill-icon-button" disabled={locked} type="button" title="Recharger le relevé" onClick={()=>setRetry(n=>n+1)}><RefreshCw size={15}/></button></p>}
 {error&&<p role="alert">{error}</p>}
 {receipt?<div className="bill-mail-result"><div role="status"><CheckCircle2 size={20}/>{confirmed?'Message envoyé — document mis à jour':receipt.state==='sent'?'Message envoyé — statut à synchroniser':receipt.state==='accepted'?'Envoi pris en charge par Outlook':'Envoi à vérifier dans Outlook'}</div><div className="bill-mail-actions"><a className="bill-button" href={receipt.webLink} target="_blank" rel="noopener noreferrer"><OutlookIcon/>Voir dans Outlook</a>{!confirmed&&<button type="button" className="bill-button" disabled={busy} onClick={()=>void verifySent()}><RefreshCw size={16}/>Vérifier l’envoi</button>}</div></div>:<>
 {review&&<div className="bill-mail-review" role="status"><span>À : {recipient}</span>{cc&&<span>Cc : {cc}</span>}{bcc&&<span>Cci : {bcc}</span>}</div>}
 <div className="bill-mail-actions bill-mail-toolbar">{review?<button type="button" className="bill-button" disabled={busy} onClick={()=>setReview(false)}><ChevronLeft size={16}/>Modifier</button>:<div className="bill-mail-secondary"><button type="button" className="bill-icon-button" aria-label="Télécharger le message" title="Télécharger le message Outlook" disabled={busy||loading||!recipient.trim()} onClick={()=>ready?download(ready):void prepare(false)}><Download size={18}/></button>{draft?<a className="bill-button bill-mail-draft" href={draft.webLink} target="_blank" rel="noopener noreferrer"><OutlookIcon size={17}/>Ouvrir le brouillon</a>:<button type="button" className="bill-button bill-mail-draft" title="Créer le brouillon dans votre boîte Outlook" disabled={busy||loading||!connection?.connected} onClick={()=>void prepare(true)}><OutlookIcon size={17}/>Brouillon Outlook</button>}</div>}
 <button type="submit" className="bill-button bill-button-primary" disabled={busy||loading||!connection?.sendEnabled||confirmed}><Send size={17}/>{busy?'Envoi…':review?'Confirmer l’envoi':'Envoyer avec Outlook'}</button></div>
 {(draft||ready)&&<button type="button" className="bill-button bill-mail-confirm" disabled={busy||loading||confirmed||!recipient.trim()} onClick={()=>void confirmSent()}><CheckCircle2 size={18}/>{confirmed?'Envoi confirmé':'Confirmer l’envoi depuis Outlook'}</button>}
 </>}
 </form></dialog></>;
}
