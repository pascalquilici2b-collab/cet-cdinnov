import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {paymentFixtureTools,invoiceFixture} from './billing-payments-fixture.mjs';
import {paymentMinor,normalizePaymentOperation} from './billing-payments-domain.ts';

await test('montants français exacts et opérations strictes',()=>{
 for(const [v,expected] of [['0,01','1'],['1 234,5','123450'],['1\u202f234\u202f567.89','123456789'],['999999999999.99','99999999999999']])assert.equal(paymentMinor(v),expected);
 for(const v of [0,NaN,'','0','-1','+1','1e3','1,001','12 34','1.234,56','1000000000000','<script>'])assert.throws(()=>paymentMinor(v));
 const base={id:randomUUID(),documentVersion:1,kind:'receipt',amount:'5',occurredOn:'2020-01-01',method:'cash',reference:'',note:''};
 for(const v of [{...base,extra:1},{...base,method:null},{...base,occurredOn:'2020-02-30'},{...base,occurredOn:'2099-01-01'},{...base,reference:'\0'},{...base,id:'x'}])assert.throws(()=>normalizePaymentOperation(v,'2026-10-20'));
});
await test('règlements : écritures atomiques, concurrence et historique',async t=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).token,f=await paymentFixtureTools(ctx,token),{call,create,input,send}=f;
  const read=async doc=>(await call('/documents/'+doc.id)).json(),history=async doc=>(await call('/documents/'+doc.id+'/payments')).json();
  const ok=async(res,status=201)=>{assert.equal(res.status,status,await res.clone().text());return res.json();};
  let doc=await create();const original=structuredClone(doc),files={};for(const kind of doc.issuance.files)files[kind]=await (await call('/documents/'+doc.id+'/files/'+kind)).text();
  await t.test('migration rejouable et projection initiale, devis/brouillon exclus',async()=>{
   await migrateBilling(ctx.db);assert.deepEqual(await read(doc),doc);assert.deepEqual(doc.settlement,{version:0,receivedMinor:'0',refundedMinor:'0',netPaidMinor:'0',dueMinor:'270000',overpaidMinor:'0',state:'unpaid',overdue:true});
   const draft=await create(undefined,false),quote=await f.quoteCreate();assert.equal(draft.settlement,null);assert.equal(quote.settlement,null);assert.equal((await send(draft,input(draft))).status,409);assert.equal((await send(quote,input(quote))).status,400);
  });
  let first;
  await t.test('réponse perdue et appels concurrents identiques : un mouvement',async()=>{
   first=input(doc,'receipt','1 000,50');const results=await Promise.all([send(doc,first),send(doc,first)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);doc=await read(doc);
   assert.equal(doc.settlement.netPaidMinor,'100050');assert.equal(doc.settlement.dueMinor,'169950');assert.equal(doc.settlement.state,'partial');assert.equal((await history(doc)).entries.length,1);
   assert.equal((await send(doc,first,0)).status,200);assert.equal((await send(doc,{...first,amount:'1000'},0)).status,409);
  });
  await t.test('deux saisies distinctes au même solde : un succès et un conflit',async()=>{
   const results=await Promise.all([send(doc,input(doc,'receipt','1')),send(doc,input(doc,'receipt','2'))]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);doc=await read(doc);assert.equal(doc.settlement.version,2);
  });
  await t.test('trop-perçu explicite puis remboursement partiel et solde exact',async()=>{
   doc=await ok(await send(doc,input(doc,'receipt','3000')));assert.equal(doc.settlement.state,'overpaid');assert.equal(doc.settlement.dueMinor,'0');assert.equal(doc.settlement.overdue,false);
   const excess=BigInt(doc.settlement.overpaidMinor);doc=await ok(await send(doc,input(doc,'refund',String(excess/100n)+'.'+String(excess%100n).padStart(2,'0'))));assert.equal(doc.settlement.state,'paid');assert.equal(doc.settlement.netPaidMinor,'270000');
   const before=await history(doc);assert.equal((await send(doc,input(doc,'refund','2700.01'))).status,422);assert.deepEqual(await history(doc),before);assert.deepEqual(await read(doc),doc);
  });
  await t.test('correction atomique d’un reçu déjà remboursé et date antérieure à facture',async()=>{
   let d=await create();const receipt=input(d,'receipt','1000');receipt.occurredOn='2019-12-31';d=await ok(await send(d,receipt));d=await ok(await send(d,input(d,'refund','900')));
   const correction={...input(d,'replace','950'),targetId:receipt.id,reason:'Erreur de relevé'};d=await ok(await send(d,correction));assert.equal(d.settlement.netPaidMinor,'5000');assert.equal(d.settlement.version,4);assert.equal(d.settlement.receivedMinor,'95000');
   const h=(await history(d)).entries;assert.equal(h.length,4);assert.equal(h.find(e=>e.id===receipt.id).reversedBy,correction.id+':void');assert.equal(h.find(e=>e.id===correction.id).replacementFor,receipt.id);assert.equal(h[0].reason,'Erreur de relevé');
   assert.equal((await send(d,{...input(d,'replace','1000'),targetId:receipt.id,reason:'Encore'})).status,409);
  });
  await t.test('correction de remboursement et annulation de saisie conservent les originaux',async()=>{
   let d=await create();const r=input(d);d=await ok(await send(d,r));const refund=input(d,'refund','900');d=await ok(await send(d,refund));
   const correction={...input(d,'replace','950'),targetId:refund.id,reason:'Montant du remboursement corrigé'};d=await ok(await send(d,correction));assert.equal(d.settlement.netPaidMinor,'5000');assert.equal(d.settlement.refundedMinor,'95000');
   d=await ok(await send(d,{id:randomUUID(),documentVersion:d.version,kind:'void',targetId:correction.id,reason:'Remboursement saisi sur la mauvaise facture'}));assert.equal(d.settlement.netPaidMinor,'100000');assert.equal(d.settlement.refundedMinor,'0');
   d=await ok(await send(d,{id:randomUUID(),documentVersion:d.version,kind:'void',targetId:r.id,reason:'Reçu saisi deux fois'}));assert.equal(d.settlement.netPaidMinor,'0');assert.equal(d.settlement.state,'unpaid');assert.equal((await history(d)).entries.length,6);
  });
  await t.test('mauvaise cible, montant ou version : aucune écriture partielle',async()=>{
   let d=await create();const r=input(d,'receipt','50');d=await ok(await send(d,r));d=await ok(await send(d,input(d,'refund','40')));const before=await history(d);
   for(const [operation,status] of [[{id:randomUUID(),documentVersion:1,kind:'void',targetId:r.id,reason:'Erreur'},422],[{...input(d,'replace','30'),targetId:r.id,reason:'Erreur'},422],[{...input(d,'replace','50'),targetId:first.id,reason:'Autre facture'},409],[{...input(d),documentVersion:2},409]])assert.equal((await send(d,operation)).status,status);
   assert.deepEqual(await history(d),before);assert.deepEqual(await read(d),d);
   await ctx.db.prepare("CREATE TRIGGER test_payment_failure BEFORE INSERT ON billing_payment_entries WHEN NEW.kind='void' BEGIN SELECT RAISE(ABORT,'TEST_PAYMENT_FAILURE'); END").run();
   const replacement={...input(d,'replace','60'),targetId:r.id,reason:'Test transaction'};
   try{assert.equal((await send(d,replacement)).status,503);}finally{await ctx.db.prepare('DROP TRIGGER test_payment_failure').run();}
   assert.deepEqual(await history(d),before);assert.deepEqual(await read(d),d);assert.equal(await ctx.db.prepare('SELECT id FROM billing_payment_operations WHERE id=?').bind(replacement.id).first(),null);
   d=await ok(await send(d,replacement));assert.equal(d.settlement.netPaidMinor,'2000');
  });
  await t.test('historique et compte protégés même en SQL direct',async()=>{
   for(const sql of ["UPDATE billing_payment_entries SET amount_minor=1",'DELETE FROM billing_payment_entries',"UPDATE billing_payment_operations SET note='changed'",'DELETE FROM billing_payment_operations','DELETE FROM billing_payment_accounts'])await assert.rejects(()=>ctx.db.prepare(sql).run(),/BILLING_PAYMENT_HISTORY/);
   await assert.rejects(()=>ctx.db.prepare('UPDATE billing_payment_accounts SET balance_minor=balance_minor+1').run(),/BILLING_PAYMENT_ACCOUNT/);
   await assert.rejects(()=>ctx.db.prepare("INSERT INTO billing_payment_entries SELECT id||'x',operation_id,document_id,version+100,kind,amount_minor,delta_minor,balance_after_minor,occurred_on,method,reference,note,reason,reversal_of,replacement_for,recorded_at,recorded_by FROM billing_payment_entries WHERE id=?").bind(first.id).run(),/BILLING_PAYMENT_ENTRY/);
  });
  await t.test('projection exacte au-delà de Number.MAX_SAFE_INTEGER et historique paginé',async()=>{
   let d=await create();for(let i=0;i<92;i++)d=await ok(await send(d,input(d,'receipt','999999999999.99')));
   assert.equal(d.settlement.netPaidMinor,'9199999999999908');assert.equal(d.settlement.overpaidMinor,'9199999999729908');
   const page=await history(d),page2=await ok(await call('/documents/'+d.id+'/payments?before='+page.nextBefore),200);assert.equal(page.entries.length,50);assert.equal(page2.entries.length,42);assert.equal(page2.nextBefore,null);assert.equal(new Set([...page.entries,...page2.entries].map(e=>e.id)).size,92);
  });
  await t.test('filtres de règlement, zéro TTC et échéance future',async()=>{
   const zero=invoiceFixture();zero.lines[0].unitPrice='0';const z=await create(zero);assert.equal(z.settlement.state,'paid');assert.equal(z.settlement.overdue,false);
   const future=invoiceFixture();future.dueDate='2099-01-01';const f=await create(future);assert.equal(f.settlement.overdue,false);
   for(const state of ['unpaid','partial','paid','overpaid','overdue']){const page=await ok(await call('/documents?kind=invoice&state='+state),200);assert.ok(page.total>0);for(const d of page.documents)assert.ok(state==='overdue'?d.settlement.overdue:d.settlement.state===state);}
   assert.equal((await call('/documents?kind=quote&state=paid')).status,400);
  });
  await t.test('authentification, origine, préconditions et document figé',async()=>{
   assert.equal((await call('/documents/'+doc.id+'/payments','POST',input(doc))).status,428);
   assert.equal((await call('/documents/'+doc.id+'/payments','POST',input(doc),{'If-Match':String(doc.settlement.version),Authorization:'Bearer absent'})).status,401);
   assert.equal((await call('/documents/'+doc.id+'/payments','POST',input(doc),{'If-Match':String(doc.settlement.version),Origin:'https://evil.example'})).status,403);
   const other=(await ctx.login(users[1])).token;assert.equal((await call('/documents/'+doc.id+'/payments','GET',undefined,{Authorization:'Bearer '+other})).status,403);
   const now=await read(doc);for(const field of ['data','version','issuance','updatedAt','totals'])assert.deepEqual(now[field],original[field]);for(const kind of doc.issuance.files)assert.equal(await (await call('/documents/'+doc.id+'/files/'+kind)).text(),files[kind]);
   const count=(await ctx.db.prepare('SELECT count(*) AS n FROM billing_payment_entries').first()).n;await migrateBilling(ctx.db);assert.equal((await ctx.db.prepare('SELECT count(*) AS n FROM billing_payment_entries').first()).n,count);
  });
 }finally{await ctx.worker.dispose();}
});
