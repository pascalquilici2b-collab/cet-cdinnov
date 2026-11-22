import type {BillingDocument,BillingLinkedInvoice} from '../billing-contracts';

export const invoiceDraftNumberNotice='Numéro attribué à la finalisation';

/** Only issuance identifies an invoice. A quote keeps its draft reservation. */
export function billingDocumentNumber(record:BillingDocument|null|undefined):string {
 return record?.issuance?.number||(record?.data.kind==='quote'?record.reservedNumber?.number:'')||'';
}

export function linkedInvoiceNumber(record:BillingLinkedInvoice):string {
 return record.state==='draft'?'':record.number||'';
}
