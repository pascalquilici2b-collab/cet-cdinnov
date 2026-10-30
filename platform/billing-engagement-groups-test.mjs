import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {groupEngagementOrders,engagementOrderKey,engagementClientOptions,filterEngagementMarkets} from './billing-engagement-groups.ts';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {emptyMarket} from '../marches/domain.mjs';

const market=id=>({id,reference:'MÊME-RÉFÉRENCE',title:'Marché de conseil',client:'Client commun',maximumMinor:100000,quotedMinor:30000,sentQuoteCount:2});
const order=(id,marketId,patch={})=>({id,marketId,kind:'order',reference:'BC-COMMUN',date:'2026-10-01',amountMinor:10000,market:'MÊME-RÉFÉRENCE',client:'Client commun',projectId:'project-'+id,project:'Projet '+id,quoteIds:[],files:[],invoicedMinor:4000,reservedMinor:1000,invoices:[],...patch});
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};

test('des marchés de même client et référence restent distincts par ID, y compris leurs bons de même ID',()=>{
 const a=market('market-a'),b=market('market-b');
 const data={markets:[b,a],orders:[order('same-order','market-a'),order('same-order','market-b')]};
 const groups=groupEngagementOrders(data);
 assert.deepEqual(groups.map(g=>g.marketId),['market-b','market-a']);
 assert.notEqual(groups[0].key,groups[1].key);
 assert.equal(groups[0].market,b);assert.equal(groups[1].market,a);
 assert.notEqual(engagementOrderKey(groups[0].orders[0]),engagementOrderKey(groups[1].orders[0]));
 assert.equal(groups[0].totals.amountMinor,10000);assert.equal(groups[1].totals.amountMinor,10000);
});

test('les bons orphelins sont conservés par ID inconnu ou sans rattachement, sans déduction de libellé',()=>{
 const data={markets:[market('known')],orders:[order('unmatched','missing-one'),order('unmatched','missing-two'),order('free-a',''),order('free-b','',{client:'Autre client'}),order('known','known')]};
 const groups=groupEngagementOrders(data);
 assert.deepEqual(groups.map(g=>g.marketId),['known','missing-one','missing-two','']);
 assert.deepEqual(groups.map(g=>g.orders.length),[1,1,1,2]);
 for(const group of groups.slice(1))assert.equal(group.market,null);
 assert.deepEqual(groups.flatMap(g=>g.orders).map(o=>o.id).sort(),data.orders.map(o=>o.id).sort());
 assert.equal(new Set(groups.map(g=>g.key)).size,4);
 // A string separator in an ID must not collide with another tuple of identifiers.
 assert.notEqual(engagementOrderKey(order('c','a:b',{projectId:'d'})),engagementOrderKey(order('b:c','a',{projectId:'d'})));
});

test('les filtres changent uniquement les enfants visibles et leurs totaux, jamais la consommation annuelle',()=>{
 const m={...market('a'),consumption:{annual:true,resetDate:'2027-01-01',maximumMinor:100000,quotedMinor:30000,sentQuoteCount:2,documentIds:['quote-a','quote-b'],orderedMinor:50000,orders:[{reference:'GLOBAL',date:'2026-01-01',amountMinor:50000}],periods:[{startDate:'2025-01-01',endDate:'2025-12-31',current:false,resetDate:'2026-01-01',maximumMinor:100000,quotedMinor:90000,sentQuoteCount:3,documentIds:['historical'],orders:[],orderedMinor:0}]}};
 const data=freeze({markets:[m],orders:[order('alpha','a',{project:'Étude Alpha'}),order('beta','a',{project:'Mission Beta',amountMinor:40000,invoicedMinor:6000,reservedMinor:2000})]});
 const before=JSON.stringify(data),all=groupEngagementOrders(data),filtered=groupEngagementOrders(data,{search:'ETUDE ALPHA',client:'Client commun'});
 assert.equal(all[0].totals.amountMinor,50000);
 assert.equal(filtered.length,1);assert.equal(filtered[0].allOrderCount,2);assert.equal(filtered[0].orders.length,1);
 assert.equal(filtered[0].orders[0],data.orders[0]);assert.equal(filtered[0].totals.amountMinor,10000);
 assert.equal(filtered[0].totals.invoicedMinor,4000);assert.equal(filtered[0].totals.reservedMinor,1000);
 assert.equal(filtered[0].market,m);assert.equal(filtered[0].market.consumption,m.consumption);
 assert.equal(filtered[0].market.consumption.quotedMinor,30000);assert.equal(filtered[0].market.consumption.periods[0].quotedMinor,90000);
 assert.equal(groupEngagementOrders(data,{search:'MÊME-RÉFÉRENCE'})[0].orders.length,2);
 assert.equal(groupEngagementOrders(data,{search:'conseil'})[0].orders.length,2);
 assert.deepEqual(groupEngagementOrders(data,{client:'Client'}),[],'Client filtering uses an exact existing option.');
 assert.deepEqual(groupEngagementOrders(data,{search:'inexistant'}),[]);
 assert.equal(JSON.stringify(data),before);
});

test('les montants inconnus et historiques incomplets restent explicites dans les sommes affichées',()=>{
 const data=freeze({markets:[market('a')],orders:[order('known','a'),order('unknown','a',{amountMinor:null,invoicedMinor:2000,reservedMinor:500,historyPending:true})]});
 const [group]=groupEngagementOrders(data);
 assert.deepEqual(group.totals,{amountMinor:10000,invoicedMinor:6000,reservedMinor:1500,unknownAmountCount:1,historyPending:true});
 const [filtered]=groupEngagementOrders(data,{search:'Projet known'});
 assert.deepEqual(filtered.totals,{amountMinor:10000,invoicedMinor:4000,reservedMinor:1000,unknownAmountCount:0,historyPending:false});
 assert.equal(group.market.maximumMinor,100000,'Visible order amounts never replace the market ceiling.');
});

test('les options clients et la vue marchés partagent les filtres sans inventer d’identité client',()=>{
 const data=freeze({markets:[market('a'),{...market('b'),client:'Autre client'}],orders:[order('a','a'),order('orphan','absent',{client:'Client orphelin'})]});
 assert.deepEqual(engagementClientOptions(data),[{value:'Autre client',label:'Autre client'},{value:'Client commun',label:'Client commun'},{value:'Client orphelin',label:'Client orphelin'}]);
 assert.deepEqual(filterEngagementMarkets(data,{client:'Autre client',search:'MEME-REFERENCE'}),[data.markets[1]]);
 assert.equal(filterEngagementMarkets(data,{search:'conseil'})[0],data.markets[0]);
 assert.equal(groupEngagementOrders(data,{client:'Client orphelin'})[0].marketId,'absent');
});

await test('API engagements : identités des marchés, tous les bons historiques et absence de mutation pendant le regroupement',async()=>{
 const ctx=await testEnvironment();
 try{
  await migrateBilling(ctx.db);
  const first=randomUUID(),second=randomUUID(),sharedOrder=randomUUID(),historicOrder=randomUUID(),projectId=randomUUID();
  const year=Number(new Intl.DateTimeFormat('en-US',{year:'numeric',timeZone:'Europe/Paris'}).format(new Date()));
  const oldDate=(year-1)+'-03-01',newDate=year+'-03-01';
  const a={...emptyMarket(),title:'Marché de test identique',reference:'REF-IDENTIQUE',clientName:'Client identique',periodBasis:'notification',notificationDate:(year-1)+'-01-01',ceilings:[{scope:'annual',basis:'HT',amountMinor:1000000}],orders:[{id:sharedOrder,reference:'BC-IDENTIQUE',date:newDate,amountMinor:300000}],projects:[{id:projectId,name:'Mission historique',orders:[{id:historicOrder,reference:'BC-ANCIEN',date:oldDate,amountMinor:50000}]}]};
  const b={...emptyMarket(),title:a.title,reference:a.reference,clientName:a.clientName,orders:[{id:sharedOrder,reference:'BC-IDENTIQUE',date:newDate,amountMinor:400000}],projects:[]};
  for(const [id,payload] of [[first,a],[second,b]])await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(id,JSON.stringify(payload),new Date().toISOString(),users[0]).run();
  await ctx.setPortal(JSON.stringify({auth:{accounts:ctx.accounts,allowed:users},factures:[
   {id:'imported-first',number:'LOCAL-A',ht:100,marketId:first,orderId:sharedOrder,orderReference:'BC-IDENTIQUE'},
   {id:'imported-second',number:'LOCAL-B',ht:200,marketId:second,orderId:sharedOrder,orderReference:'BC-IDENTIQUE'},
   {id:'imported-history',number:'LOCAL-H',ht:50,marketId:first,projectId,orderId:historicOrder,orderReference:'BC-ANCIEN'}
  ]}));
  const token=(await ctx.login(users[0])).token;
  const get=()=>ctx.worker.dispatchFetch('https://preview.example/api/v1/billing/engagements',{headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+token}});
  const snapshot=async()=>{
   const result={};for(const table of ['markets','market_versions','portal_invoices','billing_documents','billing_document_versions','billing_order_allocations','billing_document_followup'])result[table]=(await ctx.db.prepare('SELECT * FROM '+table).all()).results;
   return result;
  };
  const before=await snapshot(),response=await get();assert.equal(response.status,200,await response.clone().text());
  const data=await response.json();assert.equal(data.markets.length,2);assert.equal(data.orders.length,3);
  assert.deepEqual(data.orders.filter(o=>o.id===sharedOrder).map(o=>[o.marketId,o.invoicedMinor]).sort(),[[first,10000],[second,20000]].sort());
  assert.equal(data.orders.find(o=>o.id===historicOrder).invoicedMinor,5000);
  const groups=groupEngagementOrders(data);assert.equal(groups.length,2);
  const firstGroup=groups.find(g=>g.marketId===first),secondGroup=groups.find(g=>g.marketId===second);
  assert.equal(firstGroup.orders.length,2);assert.equal(secondGroup.orders.length,1);
  assert.equal(firstGroup.totals.amountMinor,350000);assert.equal(firstGroup.totals.invoicedMinor,15000);
  assert.equal(secondGroup.totals.amountMinor,400000);assert.equal(secondGroup.totals.invoicedMinor,20000);
  const current=firstGroup.market.consumption,previous=current.periods.find(p=>p.startDate===(year-1)+'-01-01');
  assert.equal(current.orderedMinor,300000);assert.equal(previous.orderedMinor,50000);
  const filtered=groupEngagementOrders(data,{search:'Mission historique'});
  assert.equal(filtered.length,1);assert.equal(filtered[0].orders.length,1);assert.equal(filtered[0].allOrderCount,2);
  assert.equal(filtered[0].totals.amountMinor,50000);assert.equal(filtered[0].market.consumption,current);
  assert.equal(filtered[0].market.consumption.orderedMinor,300000);
  assert.equal(groupEngagementOrders(data,{search:'REF-IDENTIQUE'}).length,2);
  assert.deepEqual(await(await get()).json(),data);
  assert.deepEqual(await snapshot(),before,'GET projections and client-side filters do not write records, versions or allocations.');
 }finally{await ctx.worker.dispose();}
});
