import type {BillingDocumentDetails,BillingPeriod} from './billing-contracts';
export const billingPeriods:BillingPeriod[]=['S1','S2','S3','S4','S5','S6','S7','S8'];
/** Keep the legacy scalar intact on archived documents; an explicit array is authoritative. */
export function documentPeriods(details?:Pick<BillingDocumentDetails,'period'|'periods'|'customPeriod'>){
 const values=details?.periods??(details?.period?[details.period]:[]);
 return billingPeriods.filter(period=>values.includes(period));
}
export function periodLabel(details?:Pick<BillingDocumentDetails,'period'|'periods'|'customPeriod'>){
 const numbers=documentPeriods(details).map(period=>period.slice(1));
 if(details?.customPeriod?.trim())return [numbers.length?('Semestre'+(numbers.length>1?'s':'')+' '+numbers.join(', ')):'',details.customPeriod.trim()].filter(Boolean).join(' · ');
 if(!numbers.length)return '';
 return (numbers.length===1?'Semestre ':'Semestres ')+(numbers.length<2?numbers[0]:numbers.slice(0,-1).join(', ')+' et '+numbers.at(-1));
}
