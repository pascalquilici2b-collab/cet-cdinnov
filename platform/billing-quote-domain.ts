import type {BillingQuoteAction,BillingQuoteState} from './billing-contracts';

/** Calendar dates are evaluated in the company's timezone, including DST. */
export const billingToday=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function quoteState(action:BillingQuoteAction|null,validUntil:string,today=billingToday()):BillingQuoteState {
 if(action==='accepted'||action==='refused')return action;
 if(validUntil&&validUntil<today)return 'expired';
 return action==='sent'||action==='reopened'?'sent':'prepared';
}
export const quoteStateLabels:Record<BillingQuoteState,string>={prepared:'Finalisé',sent:'Envoyé',accepted:'Accepté',refused:'Refusé',expired:'Expiré'};
export const quoteActionLabels:Record<BillingQuoteAction,string>={sent:'Envoi déclaré',accepted:'Accord enregistré',refused:'Refus enregistré',reopened:'Réponse corrigée'};
