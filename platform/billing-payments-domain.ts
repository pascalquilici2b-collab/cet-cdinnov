import type {BillingPaymentMethod,BillingPaymentOperationInput,BillingSettlementState} from './billing-contracts';
import {billingId,validBillingDate} from './billing-domain.ts';

export const paymentMethodLabels:Record<BillingPaymentMethod,string>={transfer:'Virement',card:'Carte bancaire',cash:'Espèces',cheque:'Chèque',direct_debit:'Prélèvement',other:'Autre'};
export const settlementLabels:Record<BillingSettlementState,string>={unpaid:'Finalisé',partial:'Partiellement réglée',paid:'Réglée',overpaid:'Trop-perçu'};
const fail=(message:string):never=>{throw Object.assign(new Error(message),{status:422});};
/** Accept common French grouping, never exponents, signed values or rounded cents. */
export function paymentMinor(value:unknown):string {
 if(typeof value!=='string'||value.length>40)return fail('Renseignez un montant en euros.');
 const s=value.trim();if(!/^(?:\d{1,12}|\d{1,3}(?:[ \u00a0\u202f]\d{3}){1,3})(?:[.,]\d{1,2})?$/.test(s))return fail('Le montant doit être positif, avec au plus deux décimales.');
 const [whole,decimal='']=s.replace(/[ \u00a0\u202f]/g,'').replace(',','.').split('.'),minor=BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'));
 if(minor<1n||minor>99999999999999n)return fail('Le montant doit être compris entre 0,01 € et 999 999 999 999,99 €.');
 return String(minor);
}
export function paymentEuros(minor:string){const amount=BigInt(minor);return String(amount/100n)+','+String(amount%100n).padStart(2,'0');}
function text(raw:unknown,name:string,max:number,required=false){if(typeof raw!=='string'||raw.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw)||(required&&!raw.trim()))return fail(name+' : texte requis ou trop long.');return raw.trim().normalize('NFC');}
export interface NormalizedPaymentOperation {id:string;documentVersion:number;kind:'receipt'|'refund'|'void'|'replace';targetId:string|null;amountMinor:string|null;occurredOn:string|null;method:BillingPaymentMethod|null;reference:string;note:string;reason:string;}
export function normalizePaymentOperation(raw:unknown,today:string):NormalizedPaymentOperation {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail('Opération de règlement invalide.');
 const v=raw as BillingPaymentOperationInput;
 const keys=['id','documentVersion','kind',...(v.kind==='void'?['targetId','reason']:v.kind==='replace'?['targetId','amount','occurredOn','method','reference','note','reason']:['amount','occurredOn','method','reference','note'])];
 if(!['receipt','refund','void','replace'].includes(v.kind)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw Object.assign(new Error('Champs de règlement invalides.'),{status:400});
 if(!billingId(v.id)||!Number.isSafeInteger(v.documentVersion)||v.documentVersion<1)return fail('Identifiant ou version de facture invalide.');
 const correction=v.kind==='void'||v.kind==='replace';
 if(correction&&!billingId(v.targetId))return fail('Saisie à corriger invalide.');
 const reason=correction?text(v.reason,'Motif',2000,true):'';
 if(v.kind==='void')return {id:v.id.toLowerCase(),documentVersion:v.documentVersion,kind:v.kind,targetId:v.targetId.toLowerCase(),amountMinor:null,occurredOn:null,method:null,reference:'',note:'',reason};
 if(typeof v.occurredOn!=='string'||!validBillingDate(v.occurredOn)||v.occurredOn>today)return fail('Indiquez la date réelle du mouvement, au plus tard aujourd’hui.');
 if(typeof v.method!=='string'||!Object.hasOwn(paymentMethodLabels,v.method))return fail('Choisissez un mode de règlement.');
 return {id:v.id.toLowerCase(),documentVersion:v.documentVersion,kind:v.kind,targetId:v.kind==='replace'?v.targetId.toLowerCase():null,amountMinor:paymentMinor(v.amount),occurredOn:v.occurredOn,method:v.method,reference:text(v.reference,'Référence',300),note:text(v.note,'Note',2000),reason};
}
