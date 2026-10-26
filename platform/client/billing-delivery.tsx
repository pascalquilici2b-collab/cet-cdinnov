import {useEffect,useRef,useState} from 'react';
import {Send,ExternalLink} from 'lucide-react';
import {PDFIcon} from './billing-pdf-icon';
export {EmailDocument} from './billing-mail-composer';
export function ElectronicDelivery({ready,onDownload}:{ready:boolean;onDownload:()=>void}){
 const [open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 return <><button type="button" className="bill-button" disabled={!ready} title={ready?'Déposer le Factur-X sur AGIRIS':'Finalisez la facture pour préparer son envoi'} onClick={()=>setOpen(true)}><Send size={16}/> Déposer sur AGIRIS</button>
 <dialog ref={dialog} className="bill-directory-dialog bill-delivery-dialog" aria-label="Déposer sur AGIRIS" onCancel={()=>setOpen(false)}><div className="bill-dialog-top"><strong>Déposer sur AGIRIS</strong><button type="button" aria-label="Fermer" onClick={()=>setOpen(false)}>×</button></div><div className="bill-section"><p>Téléchargez le Factur-X, importez-le dans « Factures émises » sur AGIRIS, puis validez son envoi sur la plateforme.</p><div className="bill-reference-tools"><button className="bill-button bill-button-pdf" type="button" onClick={onDownload}><PDFIcon/> Télécharger le Factur-X</button><a className="bill-button" href="https://agiris.cecurity.com/demat/v2/dd0d33f1-9dd6-4ea2-9761-e20ccd30aa73/app/einvoice-outbound/invoices/follow-up" target="_blank" rel="noreferrer"><ExternalLink size={16}/> Ouvrir AGIRIS</a></div></div></dialog></>;
}
