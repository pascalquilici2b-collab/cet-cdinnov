import {useEffect,useRef,useState} from 'react';
import {Trash2,UserRound} from 'lucide-react';

export type StampCreator={name:string;photo?:string};
export function StampAvatar({creator}:{creator?:StampCreator}){
 const [failed,setFailed]=useState(''),source=creator?.photo||'';
 const safe=/^(https?:\/\/|blob:https?:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(source);
 return <span className="stamp-avatar" title={creator?.name?`Créé par ${creator.name}`:'Créateur du lot'}>{safe&&failed!==source?<img src={source} alt={creator?.name||'Créateur du lot'} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(source)}/>:<UserRound size={20} aria-hidden="true"/>}</span>;
}
export function StampDeleteDialog({name,kind='lot',busy,error,onClose,onDelete}:{name:string;kind?:'lot'|'document'|'payment';busy:boolean;error:string;onClose:()=>void;onDelete:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 const copy=kind==='payment'?{title:'Supprimer le document de paiement ?',description:'Les répartitions et les aperçus calculés seront réinitialisés. Les bulletins et factures joints seront conservés.',button:'Supprimer le document'}:kind==='document'?{title:'Supprimer cette pièce ?',description:'La pièce et ses aperçus seront supprimés du lot.',button:'Supprimer la pièce'}:{title:'Supprimer ce lot ?',description:'Les pièces importées, les résultats et l’historique de ce lot seront définitivement supprimés.',button:'Supprimer le lot'};
 useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
 return <dialog ref={ref} className="stamp-delete-dialog" aria-labelledby="stamp-delete-title" aria-describedby="stamp-delete-description" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <span className="stamp-delete-symbol"><Trash2 size={22}/></span><h2 id="stamp-delete-title">{copy.title}</h2><strong className="stamp-delete-name">{name}</strong>
  <p id="stamp-delete-description">{copy.description}</p>
  {error&&<p role="alert" className="stamp-delete-error">{error}</p>}
  <div className="stamp-actions"><button type="button" autoFocus disabled={busy} onClick={onClose}>Annuler</button><button type="button" className="stamp-delete-confirm" disabled={busy} onClick={onDelete}><Trash2 size={16}/>{busy?'Suppression…':copy.button}</button></div>
 </dialog>;
}
