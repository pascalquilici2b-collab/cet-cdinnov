import {showSuccess} from './action-feedback';
import {useEffect,useRef,useState} from 'react';
import {ClipboardList,Download,Eye,RefreshCw,X} from 'lucide-react';
import type {BillingContext,BillingDraft,BillingInterventionReport,BillingTransport} from '../billing-contracts';
import {blankDocumentDetails} from '../billing-domain';
import {PDFPreview} from './billing-pdf-preview';
import {Interventions} from './billing-interventions';
import {PeriodSelect} from './billing-period-select';
import {Field} from './billing-fields';
import {BrandMark} from './loading';
import './billing-support.css';
export function InterventionReport({id,number,draft,context,transport,compact=false}:{id:string;number:string;draft:BillingDraft;context:BillingContext|null;transport:BillingTransport;compact?:boolean}){
 const [open,setOpen]=useState(false),[report,setReport]=useState<BillingInterventionReport|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pdf,setPDF]=useState<Blob|null>(null),[dirty,setDirty]=useState(false),[previewing,setPreviewing]=useState(false),[previewError,setPreviewError]=useState(''),[retry,setRetry]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(!open){dialog.current?.close();return;}dialog.current?.showModal();let active=true;setReport(null);setPDF(null);setBusy(true);setError('');transport.report(id).then(r=>{if(active){setReport(r);setDirty(false);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[open,id,transport]);
 const content=report?JSON.stringify({date:report.date,title:report.title,periods:report.periods,...(report.customPeriod?{customPeriod:report.customPeriod}:{}),rows:report.rows}):'';
 // Previewing does not save a report or modify the archived invoice.
 useEffect(()=>{if(!open||!content)return;let active=true;setPreviewing(true);setPreviewError('');const timer=setTimeout(()=>{transport.previewReport(id,JSON.parse(content)).then(blob=>{if(active)setPDF(blob);}).catch(e=>{if(active)setPreviewError(e.message);}).finally(()=>{if(active)setPreviewing(false);});},650);return()=>{active=false;clearTimeout(timer);};},[open,id,content,transport,retry]);
 const close=()=>{if(busy||dirty&&!window.confirm('Fermer sans enregistrer les modifications du relevé ?'))return;setOpen(false);setPDF(null);};
 const change=(patch:Partial<BillingInterventionReport>)=>{if(report){setReport({...report,...patch});setDirty(true);}};
 async function save(download:boolean){if(!report||busy)return;setBusy(true);setError('');try{const {version,...data}=report,updated=dirty||!version?await transport.saveReport(id,version,data):report;setReport(updated);setDirty(false);showSuccess('Relevé enregistré');if(download){const blob=await transport.reportPDF(id);setPDF(blob);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Releve-'+number.replace(/[^A-Za-z0-9_-]/g,'-')+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const details={...draft.details||blankDocumentDetails(),periods:report?.periods||[],customPeriod:report?.customPeriod||'',period:report?.periods[0]||'' as const,interventions:report?.rows||[]};
 const complete=!!report?.rows.length&&report.rows.every(r=>r.label.trim()&&r.description.trim()&&Number(r.days.replace(',','.'))>0);
 return <><button type="button" className="bill-button bill-report-button" title="Générer le relevé d’intervention" aria-label={'Générer le relevé '+number} onClick={()=>setOpen(true)}><ClipboardList size={17}/>{compact?'Relevé':'Générer le relevé'}</button>
 <dialog ref={dialog} className="bill-directory-dialog bill-support-dialog bill-report-dialog" aria-label="Relevé d’intervention" onCancel={e=>{e.preventDefault();close();}}><div className="bill-dialog-top"><strong><ClipboardList size={20}/>Relevé d’intervention</strong><button type="button" aria-label="Fermer le relevé" onClick={close} disabled={busy}><X size={20}/></button></div>
 <div className="bill-report-layout"><div className="bill-support-body bill-report-fields"><p className="bill-support-reference">Relatif à la facture {number}</p>{error&&<p role="alert">{error}</p>}{busy&&!report?<BrandMark/>:report&&<>
 <fieldset disabled={busy} className="bill-fields"><Field label="Date du relevé"><input type="date" value={report.date} onChange={e=>change({date:e.target.value})}/></Field><Field label="Période concernée"><PeriodSelect label="Période du relevé" value={details} onChange={periods=>change({periods})} onCustomChange={customPeriod=>change({customPeriod})}/></Field><Field label="Objet du relevé" wide><input value={report.title} maxLength={300} onChange={e=>change({title:e.target.value})}/></Field></fieldset>
 <fieldset disabled={busy}><Interventions draft={{...draft,details}} context={context} reportOnly onChange={p=>change({rows:p.details!.interventions})}/></fieldset>
 </>}
 </div><div className="bill-report-preview-pane" aria-label="Aperçu du relevé d’intervention" aria-busy={previewing}>
 {previewError?<div className="bill-report-preview-message" role="alert"><p>{previewError}</p><button type="button" className="bill-button" onClick={()=>setRetry(n=>n+1)}><RefreshCw size={16}/>Réessayer l’aperçu</button></div>:pdf?<PDFPreview record={null} file={pdf}/>:<div className="bill-report-preview-message" role="status"><BrandMark/><span>Préparation de l’aperçu…</span></div>}
 {previewing&&pdf&&<span className="bill-report-updating" role="status"><Eye size={14}/>Actualisation…</span>}
 </div></div><div className="bill-support-actions"><button type="button" className="bill-button" disabled={busy||!report||!dirty} onClick={()=>void save(false)}>Enregistrer</button><button type="button" className="bill-button bill-button-primary" disabled={busy||!complete} onClick={()=>void save(true)}><Download size={17}/>{busy?'Préparation…':'Télécharger le relevé'}</button></div></dialog></>;
}
