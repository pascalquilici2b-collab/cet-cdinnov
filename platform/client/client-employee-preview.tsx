import {useEffect,useRef,useState} from 'react';
import {Download,X} from 'lucide-react';
import {clientMissionHTML} from './client-employee-preview-html';
import {RhPDFPreview} from './rh-pdf-preview';
export function ClientEmployeePreview({blob,filename,onClose}:{blob:Blob;filename:string;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[html,setHTML]=useState(''),[error,setError]=useState('');const pdf=/\.pdf$/i.test(filename)||blob.type==='application/pdf';
 useEffect(()=>{dialog.current?.showModal();let active=true;if(!pdf)void clientMissionHTML(blob).then(value=>{if(active)setHTML(value);},reason=>{if(active)setError(reason.message);});return()=>{active=false;};},[blob,pdf]);
 const download=()=>{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),20000);};
 return <dialog ref={dialog} className="bill-directory-dialog client-mission-preview" aria-label={'Aperçu '+filename} onCancel={e=>{e.preventDefault();onClose();}}><div className="bill-dialog-top"><strong>{filename}</strong><div><button type="button" className="bill-button" onClick={download}><Download size={16}/>Télécharger</button><button type="button" className="bill-icon-button" aria-label="Fermer l’aperçu" onClick={onClose}><X size={20}/></button></div></div><div className="client-mission-preview-body">{pdf?<RhPDFPreview blob={blob} title={filename}/>:error?<p role="alert">{error}</p>:html?<article className="client-mission-paper" aria-label="Contenu de la lettre de mission" dangerouslySetInnerHTML={{__html:html}}/>:<p role="status">Lecture du document…</p>}</div></dialog>;
}
