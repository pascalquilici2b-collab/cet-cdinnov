import type {BillingContext} from '../billing-contracts';
import {billingToday} from '../billing-quote-domain.ts';

/** An indicative display only: allocation still belongs to creation/finalization. */
export function billingNumberPreview(series:NonNullable<BillingContext['numbering']>[number],now=new Date()):string{
 const date=billingToday(now).replace(/-/g,'');
 const prefix=series.format==='monthly'?series.prefix.slice(0,4)+date.slice(0,6):series.format==='dated'?series.prefix+date+'-':series.prefix;
 return prefix+String(series.nextValue).padStart(series.width,'0');
}
