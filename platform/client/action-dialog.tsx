import {useEffect,useRef,useState} from 'react';
import {Dialog} from 'radix-ui';
import './action-dialog.css';
type Confirmation={title:string;message:string;accept:string;danger?:boolean};
export function useConfirmation(){
 const [content,setContent]=useState<Confirmation|null>(null),resolve=useRef<((v:boolean)=>void)|null>(null);
 const answer=(v:boolean)=>{resolve.current?.(v);resolve.current=null;setContent(null);};
 useEffect(()=>()=>{resolve.current?.(false);},[]);
 const confirm=(value:Confirmation)=>new Promise<boolean>(r=>{resolve.current?.(false);resolve.current=r;setContent(value);});
 return {confirm,dialog:<Dialog.Root open={!!content} onOpenChange={open=>{if(!open)answer(false);}}><Dialog.Portal><Dialog.Overlay className="cdi-dialog-overlay"/><Dialog.Content className="cdi-dialog"><Dialog.Title>{content?.title}</Dialog.Title><Dialog.Description>{content?.message}</Dialog.Description><div className="cdi-dialog-actions"><button type="button" onClick={()=>answer(false)}>Annuler</button><button type="button" className={content?.danger?'is-danger':'is-primary'} onClick={()=>answer(true)}>{content?.accept}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>};
}
