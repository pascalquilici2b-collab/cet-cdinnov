import type {Invoice} from './finance-domain';
/** Display only: archived PDF numbers and the accounting ledger are unchanged. */
export const invoiceDisplayNumber=(number?:string)=>number?'FAC-'+number.replace(/^(?:FAC|F)[-\s]*/i,'').replace(/\s/g,''):'FAC-…';
export function importedInvoiceLabel(f:Invoice){return [f.libelle,f.label,f.title,f.objet,f.description].find(v=>typeof v==='string'&&v.trim()) as string|undefined;}
