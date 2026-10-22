import {useState} from 'react';
import {Trash2,RotateCcw} from 'lucide-react';
import type {BillingDocument,BillingTransport} from '../billing-contracts';
import {useConfirmation} from './action-dialog';
export function DraftActions({record,transport,trash=false,onChanged,disabled=false}:{record:BillingDocument;transport:BillingTransport;trash?:boolean;onChanged:()=>void;disabled?:boolean}){
 const {confirm,dialog}=useConfirmation(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(record.issuance)return null;
 async function run(){
  if(busy||disabled)return;
  if(!trash&&!await confirm({title:'Supprimer ce brouillon ?',message:'Il sera placé dans la corbeille. Son numéro restera réservé.',accept:'Supprimer',danger:true}))return;
  setBusy(true);setError('');try{if(trash)await transport.restore(record.id,record.version);else await transport.trash(record.id,record.version);onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <span className="bill-draft-actions"><button type="button" className={'bill-icon-button'+(!trash?' bill-danger':'')} disabled={disabled||busy} aria-label={(trash?'Restaurer le brouillon ':'Supprimer le brouillon ')+(record.reservedNumber?.number||record.data.title||'sans titre')} title={trash?'Restaurer':'Supprimer le brouillon'} onClick={()=>{void run();}}>{trash?<RotateCcw size={17}/>:<Trash2 size={17}/>}</button>{error&&<span role="alert" className="bill-status-error">{error}</span>}{dialog}</span>;
}
