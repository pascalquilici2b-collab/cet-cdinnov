export interface DirectInvoice {project:string;programme:string;basis:'HT'|'TTC';vatRate:string;manualTotal?:string;manualConfirmed?:boolean;}
export function normalizeDirectInvoice(value:unknown):DirectInvoice{
 const v=value as DirectInvoice,fail=():never=>{throw Object.assign(Error('Renseignez le projet, la base HT ou TTC et un taux de TVA de 0 à 100 %.'),{status:422});};
 if(!v||typeof v.project!=='string'||!v.project.trim()||v.project.length>300||typeof v.programme!=='string'||v.programme.length>300||!['HT','TTC'].includes(v.basis)||typeof v.vatRate!=='string'||!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(v.vatRate)||Number(v.vatRate.replace(',','.'))>100)fail();
 if(v.manualTotal!==undefined&&(typeof v.manualTotal!=='string'||v.manualTotal!==''&&!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(v.manualTotal)))fail();
 if(v.manualTotal&&v.manualConfirmed!==true)throw Object.assign(Error('Confirmez le montant TTC relu sur la facture.'),{status:422});
 return {project:v.project.trim(),programme:v.programme.trim(),basis:v.basis,vatRate:v.vatRate.replace(',','.'),...(v.manualTotal?{manualTotal:v.manualTotal,manualConfirmed:true}:{})};
}
