import {useState,useRef} from 'react';
import {FilePenLine} from 'lucide-react';
import {useConfirmation} from './action-dialog';
import type {BillingDocument,BillingTransport} from '../billing-contracts';
export function RectifyInvoice({record,transport,busy,onBusy,onDocument,onOpen}:{record:BillingDocument;transport:BillingTransport;busy:boolean;onBusy:(value:string)=>void;onDocument:(value:BillingDocument)=>void;onOpen:(id:string)=>void}){
 const {confirm,dialog}=useConfirmation(),[error,setError]=useState(''),attempt=useRef(crypto.randomUUID());
 const next=record.rectification?.replacementId;
 async function run(){if(busy)return;if(next){onOpen(next);return;}
  if(!await confirm({title:'Rectifier avant transmission',message:'Confirmez que cette facture n’a pas été transmise au client. Une version modifiable avec un nouveau numéro sera ouverte ; l’original et son PDF resteront archivés.',accept:'Facture non transmise · Rectifier'}))return;
  onBusy('rectify');setError('');try{onDocument(await transport.rectify(record.id,record.version,{id:attempt.current,notTransmitted:true}));}catch(e){setError((e as Error).message);}finally{onBusy('');}
 }
 return <><button type="button" className="bill-button bill-button-quiet" disabled={busy||(!next&&!!record.settlement?.version)} title={record.settlement?.version?'La facture possède un historique de règlement':undefined} onClick={()=>void run()}><FilePenLine size={17}/>{next?'Ouvrir la rectification':'Rectifier la facture'}</button>{error&&<span className="bill-status-error" role="alert">{error}</span>}{dialog}</>;
}
