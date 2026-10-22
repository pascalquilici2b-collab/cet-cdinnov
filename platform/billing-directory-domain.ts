import {clientBrands} from './billing-client-brands.ts';
import type {BillingClientData,BillingDirectoryData,BillingDirectoryKind,BillingLine,BillingServiceData} from './billing-contracts';
import {blankDraft,blankParty,calculateBilling,inspectDraft,newLine,normalizeBillingParty} from './billing-domain.ts';
import {normalizeClientDetails} from './billing-client-details.ts';

export const blankClient=():BillingClientData=>({schemaVersion:1,party:blankParty(),notes:'',archived:false});
export const blankService=():BillingServiceData=>({schemaVersion:1,reference:'',label:'',description:'',unitCode:'DAY',unitPrice:'',vatRate:'20',vatCategory:'S',exemptionReason:'',archived:false});
const fail=(message:string):never=>{throw Object.assign(new Error(message),{status:422});};
const field=(object:Record<string,unknown>,key:string,max:number)=>{
 const value=object[key];if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))return fail(key+' : texte invalide ou trop long.');return value.normalize('NFC');
};
export function normalizeDirectory(kind:BillingDirectoryKind,raw:unknown):BillingDirectoryData{
 const keys=kind==='clients'?['schemaVersion','party','notes','archived']:['schemaVersion','reference','label','description','unitCode','unitPrice','vatRate','vatCategory','exemptionReason','archived'];
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||keys.some(key=>!Object.hasOwn(raw,key))||Object.keys(raw).some(key=>!keys.includes(key)&&!(kind==='clients'&&['details','logoKey'].includes(key))))return fail('Champs de fiche invalides.');
 const value=raw as Record<string,unknown>;
 if(value.schemaVersion!==1||typeof value.archived!=='boolean')return fail('Version ou état de fiche invalide.');
 if(kind==='clients'){
  const party=normalizeBillingParty(value.party);party.name=party.name.trim();party.country=party.country.trim().toUpperCase();
  if(!party.name)return fail('Renseignez le nom du client.');
  const d={...blankDraft('quote'),buyer:party};
  const issues=inspectDraft(d).filter(i=>i.path.startsWith('buyer.')&&!['buyer.addressLine1','buyer.postalCode','buyer.city'].includes(i.path));
  if(issues.length)return fail(issues[0].message);
  if(value.logoKey!==undefined&&(typeof value.logoKey!=='string'||value.logoKey!==''&&!clientBrands.some(b=>b[0]===value.logoKey)))return fail('Logo client non reconnu.');
  let details;try{if(value.details!==undefined)details=normalizeClientDetails(value.details);}catch(e){return fail((e as Error).message);}
  return {schemaVersion:1,party,notes:field(value,'notes',4000),archived:value.archived,...(details?{details}:{}),...(value.logoKey!==undefined?{logoKey:value.logoKey as string}:{})};
 }
 const data:BillingServiceData={schemaVersion:1,reference:field(value,'reference',80).trim(),label:field(value,'label',160).trim(),description:field(value,'description',3500),unitCode:field(value,'unitCode',3),unitPrice:field(value,'unitPrice',40),vatRate:field(value,'vatRate',40),vatCategory:field(value,'vatCategory',2) as BillingServiceData['vatCategory'],exemptionReason:field(value,'exemptionReason',1000),archived:value.archived};
 data.reference=data.reference.toUpperCase();if(data.reference.length>80)return fail('La référence de prestation est trop longue.');
 if(!data.label)return fail('Renseignez le nom de la prestation.');
 if(!['S','Z','E','AE','O'].includes(data.vatCategory))return fail('Catégorie de TVA non reconnue.');
 const d={...blankDraft('invoice'),lines:[{...lineFromService(data),unitPrice:data.unitPrice||'0'}]};calculateBilling(d);
 const issue=inspectDraft(d).find(i=>i.path.startsWith('lines.'));if(issue)return fail(issue.message);
 return data;
}
/** A selection copies commercial values; later catalogue changes never reprice a document. */
export function lineFromService(data:BillingServiceData):BillingLine{
 return {...newLine(),description:[data.label,data.description].filter(Boolean).join('\n'),unitCode:data.unitCode,unitPrice:data.unitPrice,vatRate:data.vatRate,vatCategory:data.vatCategory,exemptionReason:data.exemptionReason};
}
