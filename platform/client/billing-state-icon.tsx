import {Send,CheckCheck,Banknote,CheckCircle2,Clock3,FilePenLine,LoaderCircle} from 'lucide-react';
import type {BillingDisplayState} from '../billing-display-state';
export function BillingStateIcon({state,size=17}:{state:BillingDisplayState;size?:number}){
 const Icon=state==='sent'?Send:state==='accepted'?CheckCheck:state==='paid'||state==='overpaid'?Banknote:state==='overdue'||state==='partial'?Clock3:state==='draft'?FilePenLine:state==='finalizing'?LoaderCircle:CheckCircle2;
 return <Icon size={size} aria-hidden="true"/>;
}
