import type {BillingDocument} from './billing-contracts';
import {billingToday} from './billing-quote-domain.ts';

/** Recheck the current document before preparing or dispatching a message. */
export function assertBillingMailDocument(record:BillingDocument,version:number,today=billingToday()){
 if(record.rectification?.replacementId)throw Error('Cette facture a été remplacée. Ouvrez sa rectification.');
 if(record.status!=='issued'||!record.issuance||record.version!==version)throw Error('Le document a changé. Fermez ce message et rechargez le document.');
 if(record.data.issueDate>today)throw Error('La date du document est future.');
 if(record.quote&&(record.quote.state==='refused'||record.quote.revision.abandoned||record.quote.revision.currentId!==record.id))throw Error('Utilisez le devis en cours avant de l’envoyer.');
}
