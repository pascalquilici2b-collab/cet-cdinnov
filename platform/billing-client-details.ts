import type {BillingClientDetails} from './billing-contracts';
export const blankClientDetails=():BillingClientDetails=>({legalForm:'',legalFormCode:'',representatives:'',shareCapital:'',vatNumbers:[],source:'',retrievedAt:''});
export function normalizeClientDetails(raw:unknown):BillingClientDetails{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Informations juridiques invalides.');
 const r=raw as Record<string,unknown>,empty=blankClientDetails(),keys=Object.keys(empty);
 if(Object.keys(r).some(k=>!keys.includes(k)))throw new Error('Champ juridique non reconnu.');
 const result={...empty};
 for(const k of keys.filter(k=>k!=='vatNumbers') as Exclude<keyof BillingClientDetails,'vatNumbers'>[]){
  const v=r[k]??'';
  if(typeof v!=='string'||v.length>(k==='representatives'?2000:400)||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))throw new Error('Information juridique invalide : '+k);
  result[k]=v.normalize('NFC');
 }
 if(!Array.isArray(r.vatNumbers)||r.vatNumbers.length>20||r.vatNumbers.some(v=>typeof v!=='string'||!/^FR[A-Z0-9]{2}\d{9}$/.test(v)))throw new Error('Liste de TVA invalide.');
 result.vatNumbers=[...new Set(r.vatNumbers)] as string[];
 if(result.source&&!/^https:\/\/annuaire-entreprises\.data\.gouv\.fr\/etablissement\/\d{14}$/.test(result.source))throw new Error('Source juridique invalide.');
 if(result.retrievedAt&&!/^\d{4}-\d{2}-\d{2}$/.test(result.retrievedAt))throw new Error('Date de consultation invalide.');
 return result;
}
