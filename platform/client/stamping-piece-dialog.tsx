import {useEffect,useRef,type ReactNode} from 'react';
export function StampPieceDialog({children,onClose}:{children:ReactNode;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
 return <dialog ref={ref} className="stamp-piece-dialog" aria-label="Aperçu et contrôle de la pièce" onCancel={e=>{e.preventDefault();onClose();}}>{children}</dialog>;
}
