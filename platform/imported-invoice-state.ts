// Historical confirmations do not invent payment or transmission dates.
export const importedInvoicePaid=(invoice:{datePaiement?:unknown;paymentConfirmed?:unknown})=>!!invoice.datePaiement||invoice.paymentConfirmed===true;
export const importedInvoiceSent=(invoice:{dateEnvoi?:unknown;sentConfirmed?:unknown})=>!!invoice.dateEnvoi||invoice.sentConfirmed===true;
