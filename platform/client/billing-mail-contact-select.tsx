import {useEffect,useRef,useState} from 'react';
import {DropdownMenu} from 'radix-ui';
import {Check,ChevronDown} from 'lucide-react';
import type {BillingClientContact} from '../billing-contracts';

export function MailContactSelect({id,label,value,contacts,onChange,disabled=false,error=''}:{id?:string;label:string;value:string;contacts:BillingClientContact[];onChange:(value:string)=>void;disabled?:boolean;error?:string}){
 const trigger=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false);
 const addresses=value.split(/[;,]/).map(a=>a.trim().toLowerCase()).filter(Boolean);
 const selected=contacts.filter(c=>addresses.includes(c.email.trim().toLowerCase()));
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 function toggle(contact:BillingClientContact,checked:boolean){
  const address=contact.email.trim(),rest=value.split(/[;,]/).map(a=>a.trim()).filter(a=>a&&a.toLowerCase()!==address.toLowerCase());
  onChange((checked?[...rest,address]:rest).join('; '));
 }
 return <DropdownMenu.Root open={open} onOpenChange={setOpen}><DropdownMenu.Trigger asChild><button ref={trigger} id={id} type="button" aria-label={label} disabled={disabled} className="bill-mail-contact-trigger"><span>{selected.length?selected.map(c=>c.name||c.email).join(', '):'Choisir des contacts'}</span>{selected.length>0&&<small>{selected.length}</small>}<ChevronDown size={16} aria-hidden="true"/></button></DropdownMenu.Trigger><DropdownMenu.Portal container={trigger.current?.closest('dialog')||undefined}><DropdownMenu.Content className="cdi-action-menu bill-mail-contact-menu" align="start" sideOffset={5} collisionPadding={12} aria-label="Contacts du client">
  {error?<DropdownMenu.Label className="bill-mail-contact-empty" role="alert">{error}</DropdownMenu.Label>:contacts.length?contacts.map(contact=><DropdownMenu.CheckboxItem key={contact.id} checked={addresses.includes(contact.email.trim().toLowerCase())} disabled={disabled} textValue={contact.name+' '+contact.email} onSelect={e=>e.preventDefault()} onCheckedChange={checked=>toggle(contact,checked)}><span className="bill-mail-contact-check" aria-hidden="true"><DropdownMenu.ItemIndicator><Check size={13}/></DropdownMenu.ItemIndicator></span><span className="bill-mail-contact-text"><strong>{contact.name||contact.email}</strong><small>{contact.role?contact.role+' · ':''}{contact.email}</small></span></DropdownMenu.CheckboxItem>):<DropdownMenu.Label className="bill-mail-contact-empty">Aucun contact enregistré dans la fiche client.</DropdownMenu.Label>}
 </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}
