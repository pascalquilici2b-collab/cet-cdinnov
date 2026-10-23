import {useEffect,useRef,useState} from 'react';
import {ClipboardList,Download,X} from 'lucide-react';
import type {BillingContext,BillingDraft,BillingInterventionReport,BillingTransport} from '../billing-contracts';
import {blankDocumentDetails} from '../billing-domain';
import {PDFPreview} from './billing-pdf-preview';
import {Interventions} from './billing-interventions';
import {PeriodSelect} from './billing-period-select';
import {Field} from './billing-fields';
import {BrandMark} from './loading';
import './billing-support.css';
export function InterventionReport({id,number,draft,context,transport,compact=false}:{id:string;number:string;draft:BillingDraft;context:BillingContext|null;transport:BillingTransport;compact?:boolean}){
 const [open,setOpen]=useState(false),[report,setReport]=useState<BillingInterventionReport|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pdf,setPDF]=useState<{blob:Blob;url:string}|null>(null),[dirty,setDirty]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(!open){dialog.current?.close();return;}dialog.current?.showModal();let active=true;setBusy(true);setError('');transport.report(id).then(r=>{if(active){setReport(r);setDirty(false);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[open,id,transport]);
 useEffect(()=>()=>{if(pdf)URL.revokeObjectURL(pdf.url);},[pdf]);
 const close=()=>{if(busy||dirty&&!window.confirm('Fermer sans enregistrer les modifications du relevé ?'))return;setOpen(false);setPDF(null);};
 const change=(patch:Partial<BillingInterventionReport>)=>{if(report){setReport({...report,...patch});setDirty(true);setPDF(null);}};
 async function save(generate:boolean){if(!report||busy)return;setBusy(true);setError('');try{const {version,...data}=report,updated=await transport.saveReport(id,version,data);setReport(updated);setDirty(false);if(generate){const blob=await transport.reportPDF(id);setPDF({blob,url:URL.createObjectURL(blob)});}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const details={...draft.details||blankDocumentDetails(),periods:report?.periods||[],period:report?.periods[0]||'' as const,interventions:report?.rows||[]};
 return <><button type="button" className="bill-button" title="Générer le relevé d’intervention" aria-label={'Générer le relevé '+number} onClick={()=>setOpen(true)}><ClipboardList size={17}/>{compact?'Relevé':'Générer le relevé'}</button>
 <dialog ref={dialog} className="bill-directory-dialog bill-support-dialog" aria-label="Relevé d’intervention" onCancel={e=>{e.preventDefault();close();}}><div className="bill-dialog-top"><strong><ClipboardList size={20}/>Relevé d’intervention</strong><button type="button" aria-label="Fermer le relevé" onClick={close} disabled={busy}><X size={20}/></button></div>
 <div className="bill-support-body"><p className="bill-support-reference">Relatif à la facture {number}</p>{error&&<p role="alert">{error}</p>}{busy&&!report?<BrandMark/>:report&&<>
 <fieldset disabled={busy} className="bill-fields"><Field label="Date du relevé"><input type="date" value={report.date} onChange={e=>change({date:e.target.value})}/></Field><Field label="Période concernée"><PeriodSelect label="Période du relevé" value={details} onChange={periods=>change({periods})}/></Field><Field label="Objet du relevé" wide><input value={report.title} maxLength={300} onChange={e=>change({title:e.target.value})}/></Field></fieldset>
 <fieldset disabled={busy}><Interventions draft={{...draft,details}} context={context} reportOnly onChange={p=>change({rows:p.details!.interventions})}/></fieldset>
 {pdf&&<PDFPreview record={null} file={pdf.blob}/>}</>}
 </div><div className="bill-support-actions"><button type="button" className="bill-button" disabled={busy||!report||!dirty} onClick={()=>void save(false)}>Enregistrer</button>{pdf?<a className="bill-button bill-button-primary" href={pdf.url} download={'Releve-'+number.replace(/[^A-Za-z0-9_-]/g,'-')+'.pdf'}><Download size={17}/>Télécharger le relevé</a>:<button type="button" className="bill-button bill-button-primary" disabled={busy||!report?.rows.length} onClick={()=>void save(true)}><ClipboardList size={17}/>{busy?'Génération…':'Générer le PDF du relevé'}</button>}</div></dialog></>;
}
