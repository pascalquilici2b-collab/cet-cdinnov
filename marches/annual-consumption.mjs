import {marketTracking,dateValid} from './domain.mjs';
const addYears=(date,n)=>{const [y,m,d]=date.split('-').map(Number),last=new Date(Date.UTC(y+n,m,0)).getUTCDate();return `${y+n}-${String(m).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;};
const previousDay=date=>new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
export function annualWindows(m,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date())){
 const annual=(m.ceilings||[]).filter(c=>c.scope==='annual'&&c.basis==='HT'&&c.amountMinor!=null);
 const amounts=[...new Set(annual.map(c=>c.amountMinor))];
 if(!annual.length)return {annual:false,maximumMinor:marketTracking(m).maximumMinor,periods:[],resetDate:null};
 // Conflicting ceilings or unknown contractual anniversary must never silently become calendar-year limits.
 const maximumMinor=amounts.length===1?amounts[0]:null;
 const contractStart=marketTracking(m).startDate||m.notificationDate;
 let anchor=m.periodBasis==='calendar'?(dateValid(contractStart)?contractStart.slice(0,4):String(Number(today.slice(0,4))-1))+'-01-01':m.periodBasis==='notification'?m.notificationDate:contractStart;
 if(m.periodBasis==='custom')anchor=(m.periods||[]).filter(p=>p.status==='validated'&&dateValid(p.startDate)).map(p=>p.startDate).sort()[0]||anchor;
 if(!dateValid(anchor))return {annual:true,maximumMinor,periods:[],resetDate:null};
 let year=Number(today.slice(0,4))-Number(anchor.slice(0,4));
 if(addYears(anchor,year)>today)year--;
 year=Math.max(0,year);
 const current=addYears(anchor,year),resetDate=addYears(anchor,year+1);
 return {annual:true,maximumMinor,resetDate,periods:Array.from({length:Math.min(21,year+1)},(_,i)=>({startDate:addYears(anchor,year-i),endDate:previousDay(addYears(anchor,year-i+1)),resetDate:addYears(anchor,year-i+1),current:i===0})),startDate:current};
}
/** Per-period latest submitted version; a later revision does not erase the preceding year's history. */
export function consumptionForMarket(m,quotes,today){
 const windows=annualWindows(m,today),periods=windows.periods.length?windows.periods:[{startDate:'0000-01-01',endDate:'9999-12-31',resetDate:null,current:true}];
 const values=periods.map(period=>{
  const families=new Map();
  for(const q of quotes){if(q.marketId!==m.id||q.abandonedAt&&q.abandonedAt.slice(0,10)<=period.endDate)continue;
   const events=q.events.filter(e=>e.occurredOn<=period.endDate).sort((a,b)=>a.version-b.version),first=events.find(e=>['sent','accepted'].includes(e.action));
   if(!first)continue;
   const key=q.rootId||q.id,old=families.get(key);if(!old||q.ordinal>old.ordinal)families.set(key,{...q,submitted:first.occurredOn,state:events.at(-1)?.action});
  }
  const documents=[...families.values()].filter(q=>q.submitted>=period.startDate&&['sent','accepted','reopened'].includes(q.state));
  const orders=new Map();for(const o of [...(m.orders||[]),...(m.projects||[]).flatMap(p=>p.orders||[]),...(m.linkedEngagements||[]).filter(e=>e.kind==='order')]){if(o.date>=period.startDate&&o.date<=period.endDate)orders.set(o.orderId||o.id||o.reference,o);}
  return {...period,maximumMinor:windows.maximumMinor,quotedMinor:documents.reduce((n,q)=>n+q.netMinor,0),sentQuoteCount:documents.length,documentIds:documents.map(q=>q.id),orders:[...orders.values()].map(o=>({reference:o.reference,date:o.date,amountMinor:o.amountMinor??null})),orderedMinor:[...orders.values()].reduce((n,o)=>n+(o.amountMinor??0),0)};
 });
 return {...windows,...values[0],periods:windows.periods.length?values:[]};
}
export async function readAnnualQuotes(db){
 // Tracking corrections move consumption without rewriting an issued quote or its PDF.
 // Resolve each revision independently: its commercial root is not the quote revision family.
 const rows=await db.prepare(`SELECT d.id,d.totals_json,r.root_document_id,r.ordinal,r.abandoned_at,
 coalesce(json_extract(f.link_json,'$.marketId'),json_extract(commitment.metadata_json,'$.marketId'),json_extract(d.data_json,'$.references.marketId')) AS market_id,
 (SELECT json_group_array(json_object('version',e.version,'action',e.action,'occurredOn',e.occurred_on)) FROM billing_quote_events e WHERE e.document_id=d.id) AS events
 FROM billing_documents d LEFT JOIN billing_quote_revisions r ON r.document_id=d.id
 LEFT JOIN billing_link_roots links ON links.id=d.id
 LEFT JOIN billing_document_followup f ON f.document_id=links.root_id
 LEFT JOIN billing_quote_engagements commitment ON commitment.document_id=links.root_id
 WHERE d.kind='quote' AND EXISTS(SELECT 1 FROM billing_issuances i JOIN billing_issue_jobs j ON j.issuance_id=i.id WHERE i.document_id=d.id AND j.state='ready')`).all();
 return rows.results.map(r=>({id:r.id,marketId:r.market_id,netMinor:Number(JSON.parse(r.totals_json||'{}').netMinor||0),rootId:r.root_document_id||r.id,ordinal:r.ordinal||1,abandonedAt:r.abandoned_at,events:JSON.parse(r.events||'[]')}));
}
