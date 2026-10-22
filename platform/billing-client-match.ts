import type {BillingClientData,BillingClientDetails,BillingParty} from './billing-contracts';
import {clientBrand} from './billing-client-brands.ts';
const digits=(v:string)=>v.replace(/\s/g,'');
const nameKey=(v:string)=>v.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
/** Different establishments stay distinct. Names/brands only match an identity without conflicting IDs. */
export function sameClient(current:BillingClientData,party:BillingParty){
 const a=current.party,as=digits(a.siret),bs=digits(party.siret),an=digits(a.siren||as.slice(0,9)),bn=digits(party.siren||bs.slice(0,9));
 if(as&&bs)return as===bs;
 if(an&&bn)return an===bn;
 if(nameKey(a.name)===nameKey(party.name))return true;
 const brand=current.logoKey||clientBrand(a.name,an),other=clientBrand(party.name,bn);
 return !!brand&&brand===other;
}
export function enrichClient(current:BillingClientData,party:BillingParty,details?:BillingClientDetails):BillingClientData{
 const same=sameClient(current,party),logoKey=same?(current.logoKey||clientBrand(current.party.name,current.party.siren)||clientBrand(party.name,party.siren)):clientBrand(party.name,party.siren);
 const merged={...party};
 // The directory omits contact/routing fields. Preserve them only for the same client.
 if(same)for(const key of ['email','legal','vatId','electronicAddress','electronicScheme'] as const)if(!merged[key])merged[key]=current.party[key];
 return {...current,party:merged,logoKey:logoKey||'',...(details?{details:{...details,...(same?{shareCapital:details.shareCapital||current.details?.shareCapital||'',representatives:details.representatives||current.details?.representatives||'',legalForm:details.legalForm||current.details?.legalForm||'',vatNumbers:details.vatNumbers.length?details.vatNumbers:current.details?.vatNumbers||[]}:{} )}}:{})};
}
