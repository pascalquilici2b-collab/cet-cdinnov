import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {testEnvironment,users} from '../marches/test.mjs';
import {dashboardEnvironment,readDashboard} from './dashboard.ts';
import {dashboardFixture,insertDashboardTrips,shiftDay} from './dashboard-fixture.mjs';
process.env.MARCHES_TEST_WORKER=fileURLToPath(new URL('../.build/entry.mjs',import.meta.url));
process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const ctx=await testEnvironment();let count=0;
const check=async(name,fn)=>{await fn();console.log('OK '+name);count++;};
const day='2026-10-19',now=new Date(day+'T08:00:00Z');
const extra='unmapped@example.invalid',accounts={...ctx.accounts,[extra]:{...ctx.accounts[users[1]],name:'Unmapped test'}};
const fixture=dashboardFixture(accounts,day);
try{
 await ctx.kv.put('markets-test',JSON.stringify(fixture));
 await insertDashboardTrips(ctx.db,day,users[0],users[1]);
 const sessions=await Promise.all([ctx.login(users[0]),ctx.login(users[1]),ctx.login(extra)]);
 const call=(token=sessions[0].token,query='?week='+day,options={})=>ctx.worker.dispatchFetch('https://test/api/v1/dashboard'+query,{...options,headers:{Origin:'https://app.cdinnov.eu',...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});
 await check('Authentification, méthode et origine contrôlées',async()=>{
  assert.equal((await call(null)).status,401);assert.equal((await call(undefined,'',{method:'POST'})).status,405);
  assert.equal((await call(undefined,'',{headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await call(null,'',{method:'OPTIONS'})).status,204);
  assert.equal((await call(undefined,'?week=2026-02-30')).status,400);
 });
 await check('Périodes continues, refus exclus et documents récents',async()=>{
  const response=await call();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const d=await response.json();assert.equal(d.counts.pending,1);assert.equal(d.pending[0].days,2);assert.equal(d.leaves.length,2);assert.equal(d.trips.length,1);
  assert.equal(d.invoices[0].id,'invoice-1');assert.equal(d.invoices[0].dateSource,'created');assert.equal(d.invoices[1].dateSource,'document');
  assert.equal(d.expenses[0].number,'12');assert.equal(d.expenses[0].amount,52.3);
  assert.equal(d.expenses.length,2);assert.equal(d.members.length,3);
  assert.ok(!JSON.stringify(d).includes('PRIVATE_'));assert.ok(!JSON.stringify(d).includes(accounts[users[0]].hash));
 });
 await check('Filtrage financier effectué par le serveur',async()=>{
  const d=await(await call(sessions[1].token)).json();assert.equal(d.admin,false);assert.equal(d.invoices,null);
  assert.deepEqual(d.expenses.map(e=>e.id),['expense-1']);assert.equal(d.members.length,3);
  const unmapped=await(await call(sessions[2].token)).json();assert.deepEqual(unmapped.expenses,[]);assert.equal(unmapped.invoices,null);
 });
 await check('Un seul accès KV, compteurs du jour et aucune écriture',async()=>{
  let reads=0;const before=await ctx.kv.get('markets-test');
  const env=dashboardEnvironment({CET_WORKSPACE_KEY:'markets-test',CET_KV:{get:async()=>{reads++;return structuredClone(fixture)}}});
  await env.CET_KV.get('markets-test','json'); // Same access as identity().
  const d=await readDashboard(new Request('https://test/api/v1/dashboard?week='+day),env,ctx.db,users[0],now);
  assert.equal(reads,1);assert.equal(d.counts.leaveToday,1);assert.equal(d.counts.travelToday,2);
  const future=await readDashboard(new Request('https://test/api/v1/dashboard?week='+shiftDay(day,28)),env,ctx.db,users[0],now);
  assert.equal(future.trips.length,0);assert.equal(future.leaves.length,0);assert.equal(future.counts.travelToday,2);assert.equal(future.pending.length,1);
  assert.equal(await ctx.kv.get('markets-test'),before);
 });
 await check('Limite à cinq documents et conservation des dates historiques',async()=>{
  const more=structuredClone(fixture);more.factures.push(...Array.from({length:20},(_,i)=>({id:'old-'+i,number:'OLD-'+i,client:'Archive',dateFacture:'2025-01-01',ht:i})));
  await ctx.kv.put('markets-test',JSON.stringify(more));const d=await(await call()).json();assert.equal(d.invoices.length,5);assert.equal(d.invoices[0].id,'invoice-1');
  assert.ok(!(await ctx.kv.get('markets-test','json')).factures[1].createdAt);
 });
 await check('Portail vide traité sans données fictives',async()=>{
  await ctx.kv.put('markets-test',JSON.stringify({auth:fixture.auth}));const d=await(await call()).json();assert.deepEqual(d.expenses,[]);assert.deepEqual(d.invoices,[]);assert.deepEqual(d.leaves,[]);
 });
 console.log(count+' dashboard checks passed');
}finally{await ctx.worker.dispose();}
