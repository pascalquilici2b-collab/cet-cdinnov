import {useEffect,useRef,type ReactNode} from 'react';
export function StampPieceDialog({children,onClose,label='Aperçu et contrôle de la pièce'}:{children:ReactNode;onClose:()=>void;label?:string}){
 const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
 return <dialog ref={ref} className="stamp-piece-dialog" aria-label={label} onCancel={e=>{e.preventDefault();onClose();}}>{children}</dialog>;
}
