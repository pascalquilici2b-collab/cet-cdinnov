import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Download,Eye,RefreshCw,X} from 'lucide-react';
import type {BillingTransport} from '../billing-contracts';
import {PDFPreview} from './billing-pdf-preview';
import {BrandMark} from './loading';
import './billing-order-preview.css';

type Source={documentId:string;marketId?:string;filename:string};
export function OrderPreview({marketId,projectId,orderId,reference,transport}:{marketId:string;projectId:string;orderId:string;reference:string;transport:BillingTransport}){
 const [open,setOpen]=useState(false),button=useRef<HTMLButtonElement>(null);
 return <><button ref={button} type="button" className="bill-icon-button bill-order-preview-button" title="Voir le bon de commande" aria-label={'Voir le bon de commande '+reference} aria-haspopup="dialog" onClick={()=>setOpen(true)}><Eye size={19}/></button>
 {open&&createPortal(<OrderPreviewDialog marketId={marketId} projectId={projectId} orderId={orderId} reference={reference} transport={transport} onClose={()=>setOpen(false)}/>,button.current?.closest('.bill-app')||document.body)}</>;
}
function OrderPreviewDialog({marketId,projectId,orderId,reference,transport,onClose}:{marketId:string;projectId:string;orderId:string;reference:string;transport:BillingTransport;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[sources,setSources]=useState<Source[]>([]),[selected,setSelected]=useState(0),[file,setFile]=useState<Blob|null>(null),[format,setFormat]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{let active=true;setSources([]);setSelected(0);setFile(null);setError('');
  transport.engagements().then(data=>{if(!active)return;const matches=data.orders.filter(o=>o.id===orderId&&o.marketId===marketId&&(!o.projectId||o.projectId===projectId));
   const files=[...new Map(matches.flatMap(o=>o.files).map(f=>[(f.marketId||'quote')+':'+f.documentId,f])).values()];
   if(!files.length)setError('Aucune pièce n’est jointe à ce bon de commande.');else setSources(files);
  }).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};
 },[marketId,projectId,orderId,transport,retry]);
 const source=sources[selected];
 useEffect(()=>{if(!source)return;let active=true;setFile(null);setFormat('');setError('');
  (source.marketId?transport.marketDocument(source.marketId,source.documentId):transport.engagementFile(source.documentId)).then(async blob=>{
   const pdf=await blob.slice(0,5).text()==='%PDF-';if(!active)return;setFile(blob);setFormat(pdf?'pdf':/^image\/(png|jpeg)$/.test(blob.type)?'image':'other');
  }).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};
 },[source,transport]);
 function download(){if(!file||!source)return;const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=source.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 return <dialog ref={dialog} className="bill-order-preview-dialog" aria-label={'Aperçu du bon de commande '+reference} onCancel={e=>{e.preventDefault();onClose();}}>
  <header><div><Eye size={19}/><strong>Bon de commande {reference}</strong></div><div>{file&&<button type="button" className="bill-icon-button" title="Télécharger le bon de commande" aria-label="Télécharger le bon de commande" onClick={download}><Download size={18}/></button>}<button type="button" className="bill-icon-button" title="Fermer" aria-label="Fermer l’aperçu du bon de commande" onClick={onClose}><X size={20}/></button></div></header>
  {sources.length>1&&<select className="bill-order-preview-source" aria-label="Pièce du bon de commande" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{sources.map((f,i)=><option key={(f.marketId||'quote')+':'+f.documentId} value={i}>{f.filename}</option>)}</select>}
  <div className="bill-order-preview-content">{error?<div className="bill-order-preview-feedback" role="alert"><p>{error}</p><button type="button" className="bill-button" onClick={()=>setRetry(n=>n+1)}><RefreshCw size={16}/>Réessayer</button></div>:!file?<div className="bill-order-preview-feedback" role="status"><BrandMark/><span>Ouverture du bon de commande…</span></div>:format==='pdf'?<PDFPreview record={null} file={file}/>:format==='image'?<ImagePreview file={file} name={source.filename}/>:<div className="bill-order-preview-feedback"><p>L’aperçu n’est pas disponible pour ce format.</p><button type="button" className="bill-button" onClick={download}><Download size={17}/>Télécharger la pièce</button></div>}</div>
 </dialog>;
}
function ImagePreview({file,name}:{file:Blob;name:string}){
 const [url,setURL]=useState('');useEffect(()=>{const value=URL.createObjectURL(file);setURL(value);return()=>URL.revokeObjectURL(value);},[file]);
 return url?<div className="bill-order-preview-image"><img src={url} alt={name}/></div>:null;
}
