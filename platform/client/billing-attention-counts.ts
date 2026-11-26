import type {BillingAttentionCounts,BillingTransport} from '../billing-contracts';
import {importedInvoiceState,listWithImports,type ImportedInvoices} from './billing-imports';

export async function attentionCounts(transport:BillingTransport,imported?:ImportedInvoices):Promise<BillingAttentionCounts>{
 if(!transport.attention){
  const states=['overdue','finalized','prepared'] as const;
  const pages=await Promise.all(states.map(state=>listWithImports(transport,{kind:state==='prepared'?'quote':'invoice',state,q:'',offset:0,limit:1},imported)));
  return {overdue:pages[0].total,finalized:pages[1].total,prepared:pages[2].total};
 }
 const counts={...await transport.attention()},seen=new Set<string>();
 for(const invoice of imported?.invoices||[]){
  if(seen.has(invoice.id))continue;seen.add(invoice.id);
  const state=importedInvoiceState(invoice);
  if(state==='overdue'||state==='finalized')counts[state]++;
 }
 return counts;
}
