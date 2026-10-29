import type {Database} from './contracts';
import type {BillingEngagementDetails,BillingEngagementTracking} from './billing-contracts';
import type {Market} from './client/markets-contracts';
import {readAnnualQuotes,consumptionForMarket} from '../marches/annual-consumption.mjs';
import {marketTracking} from '../marches/domain.mjs';

const key=(s:string)=>s.trim().toLocaleLowerCase('fr');
export async function linkedEngagements(db:Database,marketId?:string){
 const exists=await db.prepare("SELECT name FROM sqlite_master WHERE name='billing_quote_engagements'").first();
 if(!exists)return [];
 const rows=await db.prepare(`SELECT e.document_id,e.kind,e.filename,e.metadata_json,f.link_json,i.number FROM billing_quote_engagements e
 JOIN billing_issuances i ON i.document_id=e.document_id LEFT JOIN billing_document_followup f ON f.document_id=e.document_id ORDER BY e.created_at DESC`).all<{document_id:string;kind:'order'|'signed_quote';filename:string;metadata_json:string;link_json:string|null;number:string}>();
 return rows.results.map(r=>({documentId:r.document_id,kind:r.kind,filename:r.filename,quoteNumber:r.number,...JSON.parse(r.metadata_json) as BillingEngagementDetails,...(r.link_json?JSON.parse(r.link_json):{})})).filter(r=>!marketId||r.marketId===marketId);
}

/** Read projections: files stay archived once, markets and the billing list share the same links. */
export async function engagementTracking(db:Database):Promise<BillingEngagementTracking>{
 const [marketRows,linked,consumption,invoices,legacy,documents,allocations]=await Promise.all([
  db.prepare('SELECT id,payload FROM markets ORDER BY updated_at DESC').all<{id:string;payload:string}>(),linkedEngagements(db),readAnnualQuotes(db),
  db.prepare(`SELECT d.id,d.source_document_id,d.data_json,d.totals_json,i.number,EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=d.id) AS trashed FROM billing_documents d JOIN billing_issuances i ON i.document_id=d.id JOIN billing_issue_jobs j ON j.issuance_id=i.id
   WHERE d.kind='invoice' AND j.state='ready' AND NOT EXISTS(SELECT 1 FROM billing_invoice_rectifications r JOIN billing_issuances ri ON ri.document_id=r.replacement_id JOIN billing_issue_jobs rj ON rj.issuance_id=ri.id WHERE r.original_id=d.id AND rj.state='ready')`).all<{id:string;source_document_id:string|null;data_json:string;totals_json:string;number:string;trashed:number}>(),
  db.prepare("SELECT json_extract(payload,'$.factures') AS invoices FROM app_portal_workspace WHERE id='shared'").first<{invoices:string}>(),
  db.prepare('SELECT id,market_id,name FROM market_documents').all<{id:string;market_id:string;name:string}>(),
  db.prepare('SELECT market_id,order_id,sum(amount_minor) AS total FROM billing_order_allocations GROUP BY market_id,order_id').all<{market_id:string;order_id:string;total:number}>()
 ]);
 const followups=(await db.prepare('SELECT document_id,link_json FROM billing_document_followup WHERE link_json IS NOT NULL').all<{document_id:string;link_json:string}>()).results;
 const roots=(await db.prepare('SELECT id,root_id FROM billing_link_roots').all<{id:string;root_id:string}>()).results;
 const markets=marketRows.results.map(r=>({...JSON.parse(r.payload),id:r.id} as Market));
 const orders:BillingEngagementTracking['orders']=[];
 for(const m of markets)for(const p of [...(m.projects||[]),{id:'',name:'Engagement global — tous les projets',orders:m.orders||[]}])for(const o of p.orders||[]){
  const source=documents.results.find(d=>d.id===o.documentId&&d.market_id===m.id);
  orders.push({id:o.id,kind:'order',reference:o.reference,date:o.date,amountMinor:o.amountMinor,marketId:m.id,market:m.reference||m.title,client:m.clientName,projectId:p.id,project:p.name,quoteIds:[],notes:o.notes,historyPending:o.historyPending,files:source?[{documentId:source.id,marketId:m.id,filename:source.name}]:[],invoicedMinor:0,invoices:[]});
 }
 for(const original of linked){
  const override=followups.find(f=>f.document_id===original.documentId),link=override?JSON.parse(override.link_json):null,e=link?{...original,...link,market:link.marketReference}:original;
  const m=markets.find(m=>m.id===e.marketId),p=markets.flatMap(m=>m.projects||[]).find(p=>p.id===e.projectId);
  let o=orders.find(o=>e.kind==='order'&&o.marketId===e.marketId&&(!o.projectId||o.projectId===e.projectId)&&(o.id===e.orderId||key(o.reference)===key(e.reference)));
  if(!o){o={id:e.orderId||'engagement:'+e.documentId,kind:e.kind,reference:e.reference||e.quoteNumber,date:e.date,amountMinor:e.amountMinor,marketId:e.marketId,market:m?.reference||m?.title||'',client:e.client||m?.clientName||'',projectId:e.projectId,project:p?.name||e.project||'',quoteIds:[],files:[],invoicedMinor:0,invoices:[]};orders.push(o);}
  for(const field of ['serviceCode','engagement','otherReference'] as const)if(e[field])o[field]=e[field];
  if(!o.quoteIds.includes(e.documentId))o.quoteIds.push(e.documentId);if(link)o.files.push(...link.files.filter((f:any)=>!o!.files.some(x=>x.documentId===f.documentId&&x.marketId===f.marketId)));else o.files.push({documentId:e.documentId,filename:e.filename});
 }
 const native=invoices.results.map(r=>{const d=JSON.parse(r.data_json);return {id:r.id,number:r.number,trashed:!!r.trashed,sourceId:roots.find(x=>x.id===r.id)?.root_id||r.source_document_id,refs:(()=>{const f=followups.find(f=>f.document_id===(roots.find(x=>x.id===r.id)?.root_id||r.id));if(!f)return d.references;const l=JSON.parse(f.link_json);return {...d.references,...l,orderReference:l.reference};})(),amountMinor:Number(JSON.parse(r.totals_json).netMinor)*(d.creditNote?-1:1)};});
 const legacyRecords=JSON.parse(legacy?.invoices||'[]') as Record<string,unknown>[];
 const reviews=legacyRecords.filter(f=>!f.orderId&&f.orderLinkReview).map(f=>{const r=f.orderLinkReview as {reference?:string;reason?:string};return {id:String(f.id),number:String(f.number||''),client:String(f.client||''),reference:r.reference||'',reason:r.reason||''};});
 const imported=legacyRecords.map(f=>({id:'imported:'+f.id,number:String(f.number||''),trashed:false,sourceId:null,refs:{marketId:f.marketId,projectId:f.projectId,orderId:f.orderId,orderReference:f.orderReference},amountMinor:Math.round(Number(f.ht||0)*100)}));
 for(const f of [...native,...imported]){
  const source=orders.filter(o=>!!f.sourceId&&o.quoteIds.includes(f.sourceId));
  const matches=source.length?source:orders.filter(o=>o.marketId===f.refs.marketId&&(!o.projectId||o.projectId===f.refs.projectId)&&(o.id===f.refs.orderId||!!f.refs.orderReference&&key(o.reference)===key(String(f.refs.orderReference))));
  // Ambiguous historical references never cause an invoice to be counted twice.
  if(matches.length===1){matches[0].invoicedMinor+=f.amountMinor;matches[0].invoices.push({id:f.id,number:f.number,amountMinor:f.amountMinor,trashed:f.trashed});}
 }
 for(const o of orders)o.reservedMinor=Math.max(0,(allocations.results.find(a=>a.market_id===o.marketId&&a.order_id===o.id)?.total||0)-o.invoicedMinor);
 return {orders,reviews,markets:markets.map(m=>({id:m.id,reference:m.reference,title:m.title,client:m.clientName,...consumptionForMarket({...m,linkedEngagements:linked.filter(e=>e.marketId===m.id)},consumption),consumption:consumptionForMarket({...m,linkedEngagements:linked.filter(e=>e.marketId===m.id)},consumption)}))};
}
