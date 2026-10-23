import {useRef} from 'react';
import {DropdownMenu} from 'radix-ui';
import {Check,ChevronDown} from 'lucide-react';
import type {BillingPeriod,BillingDocumentDetails} from '../billing-contracts';
import {billingPeriods,documentPeriods,periodLabel} from '../billing-periods';
import './billing-period-select.css';

export function PeriodSelect({id,label,value,onChange}:{id?:string;label:string;value:BillingDocumentDetails;onChange:(periods:BillingPeriod[])=>void}){
 const trigger=useRef<HTMLButtonElement>(null),selected=documentPeriods(value);
 return <DropdownMenu.Root><DropdownMenu.Trigger asChild><button ref={trigger} id={id} type="button" aria-label={label} className="bill-period-trigger"><span>{periodLabel(value)||'Choisir'}</span><ChevronDown size={16} aria-hidden="true"/></button></DropdownMenu.Trigger><DropdownMenu.Portal container={trigger.current?.closest('dialog')||undefined}><DropdownMenu.Content className="cdi-action-menu bill-period-menu" align="start" sideOffset={5} collisionPadding={12} aria-label="Semestres concernés">
  {billingPeriods.map(period=><DropdownMenu.CheckboxItem key={period} checked={selected.includes(period)} onSelect={event=>event.preventDefault()} onCheckedChange={checked=>onChange(billingPeriods.filter(p=>p===period?checked:selected.includes(p)))}><span className="bill-period-check" aria-hidden="true"><DropdownMenu.ItemIndicator><Check size={13}/></DropdownMenu.ItemIndicator></span>Semestre {period.slice(1)}</DropdownMenu.CheckboxItem>)}
 </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}
