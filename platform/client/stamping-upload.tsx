import {useRef,useState} from 'react';
import {Upload,LoaderCircle} from 'lucide-react';
import {StampFileIcon} from './stamping-file-icon';
import './stamping-upload.css';

// Adapted from extend-hq / File Upload (21st.dev, demo 21308).
// Keeps its icon fan, nested drag depth and keyboard access, using our theme
// and real import lifecycle instead of a simulated upload progress indicator.
export function StampUpload({payment=false,disabled=false,busy=false,onFiles}:{payment?:boolean;disabled?:boolean;busy?:boolean;onFiles:(files:File[])=>void}){
 const input=useRef<HTMLInputElement>(null),depth=useRef(0);
 const [dragging,setDragging]=useState(false),[error,setError]=useState('');
 const title=payment?'Document de paiement':'Pièces à tamponner';
 const accept=payment?'.xlsx,.csv,.pdf':'.pdf,application/pdf';
 const commit=(files:File[])=>{
  if(disabled||!files.length)return;
  if(payment&&files.length!==1){setError('Déposez un seul document de paiement à la fois.');return;}
  if(files.some(f=>!(payment?/\.(xlsx|csv|pdf)$/i:/\.pdf$/i).test(f.name))){setError(payment?'Choisissez un fichier Excel (.xlsx), CSV ou PDF.':'Choisissez uniquement des fichiers PDF.');return;}
  if(files.some(f=>f.size>(payment?5:20)*1024*1024)){setError(`Maximum ${payment?5:20} Mo par fichier.`);return;}
  setError('');onFiles(files);
 };
 const active=dragging&&!disabled;
 return <div className={'stamp-upload'+(active?' is-dragging':'')+(disabled?' is-disabled':'')}>
  <div className="stamp-upload-zone" role="button" tabIndex={disabled?-1:0} aria-disabled={disabled} aria-label={title}
   onClick={e=>{if(e.target!==input.current&&!disabled)input.current?.click();}}
   onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&e.target===e.currentTarget){e.preventDefault();if(!disabled)input.current?.click();}}}
   onDragEnter={e=>{e.preventDefault();if(e.dataTransfer.types.includes('Files')){depth.current++;setDragging(true);}}}
   onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect=disabled?'none':'copy';}}
   onDragLeave={e=>{e.preventDefault();depth.current=Math.max(0,depth.current-1);if(!depth.current)setDragging(false);}}
   onDrop={e=>{e.preventDefault();depth.current=0;setDragging(false);commit(Array.from(e.dataTransfer.files));}}>
   <span className={'stamp-upload-icons'+(payment?' has-excel':'')} aria-hidden="true"><span><StampFileIcon name="document.pdf"/></span><span><StampFileIcon name={payment?'document.xlsx':'piece.pdf'}/></span><span><StampFileIcon name="document.pdf"/></span></span>
   <strong>{title}</strong><small>{payment?'Excel ou PDF · 5 Mo maximum':'100 pièces maximum · 20 Mo par pièce'}</small>
   <span className="stamp-upload-cta">{busy?<LoaderCircle size={15}/>:<Upload size={15}/>}<span>{busy?'Import en cours…':active?'Relâchez pour importer':'Choisir ou glisser les fichiers'}</span></span>
   <input ref={input} aria-label={payment?'Importer le document de paiement':'Importer les PDF'} type="file" accept={accept} multiple={!payment} disabled={disabled} hidden onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';commit(files);}}/>
  </div>
  {error&&<p role="alert" className="stamp-upload-error">{error}</p>}
 </div>;
}
