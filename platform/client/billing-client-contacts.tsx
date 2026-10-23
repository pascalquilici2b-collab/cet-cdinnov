import {Plus,Trash2,UsersRound} from 'lucide-react';
import type {BillingClientContact} from '../billing-contracts';
import {Field} from './billing-fields';

export function ClientContacts({contacts,onChange,disabled}:{contacts:BillingClientContact[];onChange:(value:BillingClientContact[])=>void;disabled:boolean}){
 const patch=(id:string,value:Partial<BillingClientContact>)=>onChange(contacts.map(c=>c.id===id?{...c,...value}:c));
 return <div className="bill-client-contacts"><header><h3><UsersRound size={17}/> Contacts</h3>{contacts.length>0&&<button type="button" className="bill-icon-button" disabled={disabled||contacts.length>=30} title="Ajouter un contact" aria-label="Ajouter un contact" onClick={()=>onChange([...contacts,{id:crypto.randomUUID(),name:'',email:'',role:''}])}><Plus size={18}/></button>}</header>
  <fieldset disabled={disabled}>{contacts.map((c,i)=><section key={c.id} className="bill-contact-card"><div className="bill-contact-heading"><strong>Contact {i+1}</strong><button type="button" className="bill-icon-button bill-icon-danger" aria-label={'Supprimer le contact '+(i+1)} onClick={()=>onChange(contacts.filter(item=>item.id!==c.id))}><Trash2 size={15}/></button></div><Field label={'Nom du contact '+(i+1)}><input autoComplete="off" required maxLength={160} value={c.name} onChange={e=>patch(c.id,{name:e.target.value})}/></Field><Field label={'E-mail du contact '+(i+1)}><input type="email" autoComplete="off" required maxLength={254} value={c.email} onChange={e=>patch(c.id,{email:e.target.value})}/></Field><Field label={'Fonction du contact '+(i+1)}><input autoComplete="off" maxLength={120} value={c.role} onChange={e=>patch(c.id,{role:e.target.value})}/></Field></section>)}</fieldset>
  {!contacts.length&&<button type="button" className="bill-button" disabled={disabled} onClick={()=>onChange([{id:crypto.randomUUID(),name:'',email:'',role:''}])}><Plus size={15}/> Ajouter un contact</button>}
 </div>;
}
