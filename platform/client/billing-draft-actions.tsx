import {useState} from 'react';
import {Trash2,RotateCcw} from 'lucide-react';
import type {BillingDocument,BillingTransport} from '../billing-contracts';
import {useConfirmation} from './action-dialog';
export function DraftActions({record,transport,trash=false,onChanged,disabled=false}:{record:BillingDocument;transport:BillingTransport;trash?:boolean;onChanged:()=>void;disabled?:boolean}){
 const {confirm,dialog}=useConfirmation(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(record.issuance&&(record.data.kind!=='invoice'||record.status!=='issued'))return null;
 const label=record.issuance?'la facture':'le brouillon';
 async function run(){
  if(busy||disabled)return;
  if(!trash&&!await confirm({title:record.issuance?'Supprimer cette facture ?':'Supprimer ce brouillon ?',message:record.issuance?'La facture sera masquée dans la corbeille. Son PDF, son numéro et son historique seront conservés ; elle restera comptabilisée dans les engagements.':'Il sera placé dans la corbeille. Son numéro restera réservé.',accept:'Supprimer',danger:true}))return;
  setBusy(true);setError('');try{if(trash)await transport.restore(record.id,record.version);else await transport.trash(record.id,record.version);onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <span className="bill-draft-actions"><button type="button" className={'bill-icon-button'+(!trash?' bill-danger':'')} disabled={disabled||busy} aria-label={(trash?'Restaurer ':'Supprimer ')+label+' '+(record.issuance?.number||record.reservedNumber?.number||record.data.title||'sans titre')} title={trash?'Restaurer':'Supprimer '+label} onClick={()=>{void run();}}>{trash?<RotateCcw size={17}/>:<Trash2 size={17}/>}</button>{error&&<span role="alert" className="bill-status-error">{error}</span>}{dialog}</span>;
}
