import type {BillingClientData,BillingParty} from './billing-contracts';
import {sameClient} from './billing-client-match.ts';

/** Creating a known establishment requires its own SIRET. A company name,
 * SIREN or logo can suggest an older record, but cannot identify its site.
 * Name-only creation retains the existing directory matching behaviour. */
export function sameClientForCreation(current:BillingClientData,party:BillingParty):boolean {
 const siret=party.siret.replace(/\s/g,'');
 return siret?current.party.siret.replace(/\s/g,'')===siret:sameClient(current,party);
}
