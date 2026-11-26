import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {paymentFixtureTools,invoiceFixture} from './billing-payments-fixture.mjs';
import {quoteFixture} from './billing-quote-fixture.mjs';

test('small attention response matches filtered lists through invoice and quote transitions',async()=>{
 const ctx=await testEnvironment();
 try{
  await migrateBilling(ctx.db);const admin=await ctx.login(users[0]),reader=await ctx.login(users[1]);
  const f=await paymentFixtureTools(ctx,admin.cookie);
  const ok=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
  const states=[['overdue','invoice'],['finalized','invoice'],['prepared','quote']];
  const compare=async()=>{
   const response=await f.call('/attention'),text=await response.clone().text();assert.ok(text.length<120);
   const counts=await ok(response);assert.deepEqual(Object.keys(counts).sort(),['finalized','overdue','prepared']);
   for(const [state,kind] of states){const page=await ok(await f.call('/documents?'+new URLSearchParams({kind,state,limit:'1'})));assert.equal(counts[state],page.total,state);}
   return counts;
  };
  for(const [cookie,status] of [['',401],[reader.cookie,403]])await ok(await f.call('/attention','GET',undefined,{Cookie:cookie}),status);
  await ok(await f.call('/attention?kind=invoice'),400);await ok(await f.call('/attention','POST',{}),405);
  assert.deepEqual(await compare(),{overdue:0,finalized:0,prepared:0});
  await f.create(invoiceFixture('Draft only'),false);await f.quoteCreate(quoteFixture('Draft quote'),false);
  assert.deepEqual(await compare(),{overdue:0,finalized:0,prepared:0});
  let invoice=await f.create(invoiceFixture('Awaiting transmission'));
  assert.equal((await compare()).finalized,1);
  invoice=await ok(await f.call('/documents/'+invoice.id+'/sent','POST',{confirmed:true,sentOn:'2020-01-02'},{'If-Match':String(invoice.version)}));
  assert.deepEqual(await compare(),{overdue:1,finalized:0,prepared:0});
  invoice=await ok(await f.send(invoice,f.input(invoice,'receipt','1000')),201);assert.equal((await compare()).overdue,1);
  invoice=await ok(await f.send(invoice,f.input(invoice,'receipt','1700')),201);assert.equal((await compare()).overdue,0);
  const quote=await f.quoteCreate(quoteFixture('Quote awaiting transmission'));
  await f.quoteCreate(quoteFixture('Expired quote','2020-01-02'));
  assert.equal((await compare()).prepared,1);
  const revision=await ok(await f.call('/documents/'+quote.id+'/revise','POST',{id:randomUUID(),familyVersion:quote.quote.revision.familyVersion,reason:'Synthetic revision'},{'If-Match':String(quote.version)}),201);
  assert.equal((await compare()).prepared,0);
  await ok(await f.call('/documents/'+revision.id+'/abandon-revision','POST',{id:randomUUID(),familyVersion:revision.quote.revision.familyVersion,reason:'Keep original synthetic quote'},{'If-Match':String(revision.version)}));
  assert.equal((await compare()).prepared,1);
  await ok(await f.call('/documents/'+quote.id,'DELETE',undefined,{'If-Match':String(quote.version)}));
  assert.equal((await compare()).prepared,0);
  await ok(await f.call('/documents/'+quote.id+'/restore','POST',{}, {'If-Match':String(quote.version)}));
  assert.equal((await compare()).prepared,1);
  await ok(await f.call('/documents/'+quote.id+'/quote-events','POST',{id:randomUUID(),documentVersion:quote.version,action:'refused',occurredOn:'2020-01-02',note:'Synthetic client refusal'},{'If-Match':String(quote.quote.version)}),201);
  assert.equal((await compare()).prepared,0);
 }finally{await ctx.worker.dispose();}
});

test('one aggregate call retains imported invoice counts and ignores duplicate IDs',async()=>{
 await mkdir('.private/billing-attention-test',{recursive:true});
 await build({entryPoints:['platform/client/billing-attention-counts.ts'],outfile:'.private/billing-attention-test/client.mjs',bundle:true,platform:'node',format:'esm',jsx:'automatic'});
 const {attentionCounts}=await import('../.private/billing-attention-test/client.mjs');
 let calls=0;const transport={attention:async()=>{calls++;return {overdue:2,finalized:3,prepared:4};},list:()=>{throw Error('Full document listing must not be fetched for aggregate counters');}};
 const invoices=[{id:'late',dateFacture:'2020-01-01',sentConfirmed:true},{id:'unsent',dateFacture:'2020-01-01'},{id:'paid',dateFacture:'2020-01-01',paymentConfirmed:true},{id:'future',dateFacture:'2099-01-01',sentConfirmed:true}];
 const source={invoices:[...invoices,invoices[0]],act:()=>{}};
 assert.deepEqual(await attentionCounts(transport,source),{overdue:3,finalized:4,prepared:4});assert.equal(calls,1);
 const fallback={list:async q=>({documents:[],total:q.state==='prepared'?4:q.state==='overdue'?2:3,limit:1,offset:0})};
 assert.deepEqual(await attentionCounts(fallback,source),{overdue:3,finalized:4,prepared:4});
});
