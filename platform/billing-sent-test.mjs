import assert from 'node:assert/strict';
import {test} from 'node:test';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {paymentFixtureTools,invoiceFixture} from './billing-payments-fixture.mjs';
import {billingDisplayState} from './billing-display-state.ts';
import {billingToday} from './billing-quote-domain.ts';

test('envoi, échéance inchangée, listes et confirmation manuelle protégée',async()=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).token,f=await paymentFixtureTools(ctx,token),{call,create,input,send}=f;
  const read=async d=>(await call('/documents/'+d.id)).json(),mark=(d,body={sentOn:billingToday(),confirmed:true},headers={})=>call('/documents/'+d.id+'/sent','POST',body,{'If-Match':String(d.version),...headers});
  const pending=await create(invoiceFixture('Échéance passée sans envoi')),before=structuredClone(pending);
  assert.equal(billingDisplayState(pending),'finalized');assert.equal(pending.settlement.overdue,false);
  const ids=async state=>(await(await call('/documents?kind=invoice&state='+state)).json()).documents.map(d=>d.id);
  assert.ok((await ids('finalized')).includes(pending.id));assert.ok(!(await ids('overdue')).includes(pending.id));
  for(const body of [{sentOn:'2099-01-01',confirmed:true},{sentOn:'2019-01-01',confirmed:true},{sentOn:'2026-02-30',confirmed:true},{sentOn:billingToday(),confirmed:false},{sentOn:billingToday(),confirmed:true,extra:true}])assert.equal((await mark(pending,body)).status,422);
  assert.equal((await mark(pending,undefined,{Authorization:'Bearer absent'})).status,401);
  assert.equal((await mark(pending,undefined,{'If-Match':'999'})).status,409);
  assert.equal((await mark(pending,undefined,{Origin:'https://foreign.invalid'})).status,403);
  const restricted=(await ctx.login(users[1])).token;assert.equal((await mark(pending,undefined,{Authorization:'Bearer '+restricted})).status,403);
  const draft=await create(undefined,false),quote=await f.quoteCreate();assert.equal((await mark(draft)).status,409);assert.equal((await mark(quote)).status,409);
  const results=await Promise.all([mark(pending),mark(pending)]);assert.deepEqual(results.map(r=>r.status),[200,200]);let late=await read(pending);
  assert.equal(late.settlement.overdue,true);assert.equal(billingDisplayState(late),'overdue');assert.deepEqual(late.data,before.data);assert.deepEqual(late.issuance,before.issuance);
  assert.equal((await ctx.db.prepare("SELECT count(*) n FROM billing_email_deliveries WHERE document_id=? AND state='sent'").bind(pending.id).first()).n,1);
  assert.ok((await ids('overdue')).includes(pending.id));assert.ok(!(await ids('finalized')).includes(pending.id));
  const future=await create({...invoiceFixture('Envoyée non échue'),dueDate:'2099-01-01'}),response=await mark(future);assert.equal(response.status,200);const sent=await response.json();
  assert.equal(billingDisplayState(sent),'sent');assert.equal(sent.settlement.overdue,false);assert.equal(sent.data.dueDate,'2099-01-01');assert.ok((await ids('sent')).includes(sent.id));
  late=await(await send(late,input(late,'receipt','1000'))).json();assert.equal(billingDisplayState(late),'overdue');
  late=await(await send(late,input(late,'receipt','1700'))).json();assert.equal(billingDisplayState(late),'paid');assert.equal(late.settlement.overdue,false);assert.ok(!(await ids('overdue')).includes(late.id));
 }finally{await ctx.worker.dispose();}
});
