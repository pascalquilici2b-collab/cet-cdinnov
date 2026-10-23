import {invoiceDisplayNumber,importedInvoiceLabel} from './billing-invoice-label';
import {FileCode2,Pencil,Trash2,Upload,Banknote,Clock3} from 'lucide-react';
import type {BillingDocument,BillingPage,BillingTransport} from '../billing-contracts';
import type {Invoice} from './finance-domain';
import {blankDraft,formatMinor} from '../billing-domain';
import {ClientAvatar} from './billing-client-avatar';
import {PDFIcon} from './billing-pdf-icon';

export type ImportedAction='edit'|'delete'|'pdf'|'facturx'|'downloadFacturx'|'upload';
export type ImportedInvoices={invoices:Invoice[];act:(action:ImportedAction,id:string)=>void};
export type BillingListRow=BillingDocument&{imported?:Invoice};
const nameKey=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
const minor=(v:unknown)=>String(Math.round((Number(v)||0)*100));
const date=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)?v.split('-').reverse().join('/'):'—';

// Keep the historical invoice as the single source of truth, including its PDF
// and converter metadata. No copy, renumbering or synthetic issuance is written.
export async function listWithImports(transport:BillingTransport,query:Parameters<BillingTransport['list']>[0],source?:ImportedInvoices):Promise<BillingPage&{documents:BillingListRow[]}>{
 if(query.kind!=='invoice'||!source?.invoices.length)return transport.list(query);
 const needed=query.offset+query.limit;
 const first=await transport.list({...query,offset:0,limit:Math.min(100,needed)}),native=[...first.documents];
 while(native.length<Math.min(needed,first.total)){
  const page=await transport.list({...query,offset:native.length,limit:Math.min(100,needed-native.length)});
  if(!page.documents.length)break;
  native.push(...page.documents);
 }
 const clients=[...first.filters?.clients||[]],projects=[...first.filters?.projects||[]];
 const rows:BillingListRow[]=[],seen=new Set<string>();
 for(const invoice of source.invoices){
  if(seen.has(invoice.id))continue;seen.add(invoice.id);
  const client=invoice.client||'',project=String(invoice.projectName||invoice.project||'');
  let clientOption=clients.find(c=>nameKey(c.label)===nameKey(client));
  if(!clientOption&&client){clientOption={value:'name:'+client,label:client};clients.push(clientOption);}
  let projectOption=projects.find(p=>nameKey(p.label)===nameKey(project));
  if(!projectOption&&project){projectOption={value:invoice.projectId?'id:'+invoice.projectId:'name:'+project,label:project};projects.push(projectOption);}
  if(query.client&&clientOption?.value!==query.client||query.project&&projectOption?.value!==query.project)continue;
  if(query.q&&!nameKey([invoice.number,client,invoice.code,project,invoice.dateFacture].join(' ')).includes(nameKey(query.q)))continue;
  if(query.state&&!['all','issued',invoice.datePaiement?'paid':'unpaid'].includes(query.state))continue;
  const data=blankDraft('invoice');data.title='Facture '+(invoice.number||'importée');data.buyer.name=client;data.issueDate=invoice.dateFacture||'';data.references.businessCode=invoice.code||'';
  rows.push({id:'imported:'+invoice.id,imported:invoice,version:0,status:'issued',data,issuance:null,sourceDocumentId:null,createdAt:data.issueDate,updatedAt:data.issueDate+'T00:00:00.000Z',createdBy:'',updatedBy:'',totals:null,issues:[],quote:null,settlement:null});
 }
 const documents:BillingListRow[]=[...native,...rows];
 documents.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
 return {...first,documents:documents.slice(query.offset,needed),total:first.total+rows.length,offset:query.offset,limit:query.limit,filters:{clients:clients.sort((a,b)=>a.label.localeCompare(b.label,'fr')),projects:projects.sort((a,b)=>a.label.localeCompare(b.label,'fr'))}};
}

export function ImportedInvoiceRow({invoice:f,act,label}:{invoice:Invoice;act:ImportedInvoices['act'];label?:string}){
 return <tr data-imported-invoice={f.id}>
  <td data-column="document"><button className="bill-document-link" onClick={()=>act('edit',f.id)}><span><strong>{invoiceDisplayNumber(f.number)}</strong><small>Importée</small></span></button></td>
  <td data-column="label">{importedInvoiceLabel(f)||label||'—'}</td>
  <td data-column="client"><div className="bill-list-client"><ClientAvatar name={f.client||''}/><span>{f.client||'—'}</span></div></td>
  <td data-column="date">{date(f.dateFacture||'')}</td><td data-column="reference">{f.code||'—'}</td>
  <td data-column="status"><span className="bill-badge" data-status={f.datePaiement?'paid':'unpaid'}>{f.datePaiement?<Banknote size={15}/>:<Clock3 size={15}/>} {f.datePaiement?'Réglée':'À régler'}</span></td>
  <td data-column="amount" className="bill-amount">{formatMinor(minor(f.ttc))}</td>
  <td data-column="action"><div className="bill-import-actions">
   {f.pdfSource?<><button className="bill-button bill-button-pdf" aria-label={'Télécharger le PDF '+f.number} title="Télécharger le PDF" onClick={()=>act('pdf',f.id)}><PDFIcon/></button><button className="bill-button bill-button-primary" aria-label={(f.validFacturx?'Télécharger le Factur-X ':'Créer le Factur-X ')+f.number} title={f.validFacturx?'Télécharger le Factur-X':'Créer le Factur-X'} onClick={()=>act(f.validFacturx?'downloadFacturx':'facturx',f.id)}><FileCode2 size={16}/><span>Factur-X</span></button></>:<button className="bill-button" title="Joindre le PDF original" aria-label={'Joindre le PDF '+f.number} onClick={()=>act('upload',f.id)}><Upload size={16}/>PDF</button>}
   <button className="bill-icon-button" aria-label={'Modifier la facture '+f.number} title="Modifier" onClick={()=>act('edit',f.id)}><Pencil size={17}/></button>
   <button className="bill-icon-button bill-danger" aria-label={'Supprimer la facture '+f.number} title="Supprimer" onClick={()=>act('delete',f.id)}><Trash2 size={17}/></button>
  </div></td>
 </tr>;
}
