import type {BillingDocument} from './billing-contracts';
import {addBillingDays} from './billing-domain.ts';
import {billingToday} from './billing-quote-domain.ts';

export type BillingDisplayState='sent'|'accepted'|'refused'|'expired'|'draft'|'finalizing'|'failed'|'finalized'|'overdue'|'partial'|'paid'|'overpaid'|'abandoned'|'revising'|'replaced';
export const billingDisplayLabels:Record<BillingDisplayState,string>={sent:'Envoyé',accepted:'Accepté',refused:'Refusé',expired:'Expiré',revising:'Rectification en cours',replaced:'Remplacée',draft:'Brouillon',finalizing:'Finalisation en cours',failed:'À reprendre',finalized:'Finalisé',overdue:'En retard d’encaissement',partial:'Partiellement réglée',paid:'Réglée',overpaid:'Trop-perçu',abandoned:'Version abandonnée'};
export const invoiceDueDate=(issueDate:string,dueDate='')=>dueDate||addBillingDays(issueDate,30);
export const invoiceIsLate=(issueDate:string,dueDate='',today=billingToday())=>{const due=invoiceDueDate(issueDate,dueDate);return !!due&&due<today;};
export function billingDisplayState(document:BillingDocument|null|undefined,today=billingToday()):BillingDisplayState{
 if(document?.quote?.revision.abandoned)return 'abandoned';
 if(document?.rectification?.replacementId)return document.rectification.replacementState==='issued'?'replaced':'revising';
 if(!document?.issuance)return 'draft';
 if(document.issuance.state!=='ready')return document.issuance.state==='failed'?'failed':'finalizing';
 if(document.data.kind==='quote'&&document.quote&&document.quote.state!=='prepared')return document.quote.state;
 const settlement=document.settlement;
 if(settlement?.state==='paid'||settlement?.state==='overpaid')return settlement.state;
 if(settlement&&settlement.dueMinor!=='0'&&invoiceIsLate(document.data.issueDate,document.data.dueDate,today))return 'overdue';
 return settlement?.state==='partial'?'partial':'finalized';
}
export const billingStateLabel=(document:BillingDocument|null|undefined)=>billingDisplayLabels[billingDisplayState(document)];
