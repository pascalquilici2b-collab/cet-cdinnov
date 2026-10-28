import type {BillingDraft,BillingInvoiceSelection} from './billing-contracts';
import {billingPeriods} from './billing-periods';
import {blankDocumentDetails,calculateBilling} from './billing-domain';
const invalid=(message='Sélection de facturation invalide.'):never=>{throw Object.assign(new Error(message),{status:400});};
/** Only quantities and periods may be chosen here. Prices and references come from the accepted quote. */
export function invoiceSelection(source:BillingDraft,input:unknown):BillingDraft{
 if(input===undefined)return source;
 if(!input||typeof input!=='object'||Array.isArray(input))return invalid();
 const v=input as BillingInvoiceSelection;
 if(Object.keys(v).sort().join()!=='customPeriod,periods,quantities'||!Array.isArray(v.periods)||v.periods.length>8||v.periods.some(p=>!billingPeriods.includes(p))||new Set(v.periods).size!==v.periods.length||typeof v.customPeriod!=='string'||v.customPeriod.length>300||!Array.isArray(v.quantities)||v.quantities.length!==source.lines.length)return invalid();
 const quantities=new Map<string,string>();
 for(const q of v.quantities){
  if(!q||typeof q!=='object'||Object.keys(q).sort().join()!=='id,quantity'||typeof q.id!=='string'||!source.lines.some(l=>l.id===q.id)||quantities.has(q.id)||typeof q.quantity!=='string'||!/^\d{1,9}(?:[.,]\d{1,6})?$/.test(q.quantity.trim()))return invalid('Vérifiez les quantités à facturer.');
  quantities.set(q.id,q.quantity.trim().replace(',','.'));
 }
 const lines=source.lines.map(l=>({...l,quantity:quantities.get(l.id)!})).filter(l=>Number(l.quantity)>0);
 if(!lines.length)return invalid('Sélectionnez au moins une prestation à facturer.');
 const result={...source,lines,details:{...blankDocumentDetails(),...source.details,periods:billingPeriods.filter(p=>v.periods.includes(p)),period:'' as const,customPeriod:v.customPeriod.trim()}};
 try{calculateBilling(result);}catch{return invalid('Vérifiez les quantités à facturer.');}
 return result;
}
