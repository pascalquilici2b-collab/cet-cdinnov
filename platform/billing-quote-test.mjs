import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {billingToday,quoteState} from './billing-quote-domain.ts';
import {quoteFixture,quoteFixtureTools} from './billing-quote-fixture.mjs';

test('expiration du devis : calendrier Paris, validité inclusive, réponses conservées',()=>{
 assert.equal(billingToday(new Date('2026-07-01T22:30:00Z')),'2026-07-02');assert.equal(billingToday(new Date('2026-01-01T22:30:00Z')),'2026-01-01');
 assert.equal(quoteState(null,'2026-10-20','2026-10-20'),'prepared');assert.equal(quoteState('sent','2026-10-20','2026-10-21'),'expired');
 assert.equal(quoteState('accepted','2026-10-20','2026-10-21'),'accepted');assert.equal(quoteState('refused','2026-10-20','2026-10-21'),'refused');assert.equal(quoteState('reopened','2026-10-20','2026-10-21'),'expired');
});
await test('suivi réel D1 : journal immuable, reprises, réponses et facturation liée',async t=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);const admin=await ctx.login(users[0]),reader=await ctx.login(users[1]);const {call,create,input,send}=await quoteFixtureTools(ctx,admin.token);
  const read=async(r,status)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
  const doc=await create();
  await t.test('direction uniquement, JSON strict, versions et dates contrôlées',async()=>{
   for(const auth of ['', 'Bearer '+reader.token])for(const method of ['GET','POST'])assert.equal((await call('/documents/'+doc.id+'/quote-events',method,method==='POST'?input(doc):undefined,{Authorization:auth})).status,auth?403:401);
   assert.equal((await call('/documents/'+doc.id+'/quote-events','POST',input(doc))).status,428);
   for(const patch of [{action:'paid'},{occurredOn:'2026-02-30'},{id:'bad'},{documentVersion:1.5},{extra:1}])await read(await send(doc,{...input(doc),...patch}),400);
   for(const patch of [{occurredOn:'2099-01-01'},{occurredOn:'2019-12-31'},{note:'   '}])await read(await send(doc,{...input(doc),...patch}),422);
   const draft=await create(quoteFixture(),false);await read(await send(draft),409);
   const i=await create({...quoteFixture(),kind:'invoice',validUntil:''},false);await read(await call('/documents/'+i.id+'/quote-events'),400);
  });
  let accepted;
  await t.test('envoi, accord et réponse perdue : un seul événement sans modifier PDF ni document',async()=>{
   const before=(await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(doc.id).first()),issueBefore=await ctx.db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(doc.id).first();
   const sent=await read(await send(doc,input(doc,'sent','','2020-01-02')),201);assert.equal(sent.quote.state,'sent');assert.equal(sent.quote.version,1);
   await read(await send(sent,input(sent,'accepted','Accord par e-mail','2020-01-01')),422);
   const data=input(sent,'accepted','Devis signé reçu par e-mail','2020-01-03'),races=await Promise.all([send(sent,data),send(sent,data)]);assert.deepEqual(races.map(r=>r.status).sort(),[200,201]);accepted=await races[0].json();
   assert.equal(accepted.quote.version,2);assert.equal(accepted.quote.state,'accepted');assert.deepEqual(await read(await send(sent,data),200),accepted);
   await read(await send(sent,{...data,note:'Autre accord'}),409);
   assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(doc.id).first(),before);assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(doc.id).first(),issueBefore);
   const history=await read(await call('/documents/'+doc.id+'/quote-events'),200);assert.deepEqual(history.events.map(e=>e.action),['accepted','sent']);assert.doesNotMatch(JSON.stringify(history),/request_hash|data_json/);
   assert.equal((await read(await call('/documents/'+doc.id+'/quote-events?before=2'),200)).events.length,1);
   for(const q of ['before=0','before=a','before=2&before=3','extra=x'])await read(await call('/documents/'+doc.id+'/quote-events?'+q),400);
   await assert.rejects(()=>ctx.db.prepare('DELETE FROM billing_quote_events WHERE document_id=?').bind(doc.id).run(),/BILLING_QUOTE_HISTORY/);
   await assert.rejects(()=>ctx.db.prepare("UPDATE billing_quote_events SET note='rewritten' WHERE document_id=?").bind(doc.id).run(),/BILLING_QUOTE_HISTORY/);
  });
  await t.test('correction explicite puis refus : historique conservé, migration rejouable',async()=>{
   await read(await send(accepted,input(accepted,'refused','Refus')),409);
   const reopened=await read(await send(accepted,input(accepted,'reopened','Accord enregistré sur le mauvais devis','2020-01-04')),201);assert.equal(reopened.quote.state,'sent');
   const refused=await read(await send(reopened,input(reopened,'refused','Refus par e-mail','2020-01-03')),201);assert.equal(refused.quote.state,'refused');
   await migrateBilling(ctx.db);assert.deepEqual(await read(await call('/documents/'+doc.id),200),refused);
  });
  await t.test('concurrence : une seule réponse, version périmée refusée',async()=>{
   const d=await create();const result=await Promise.all([send(d,input(d,'accepted')),send(d,input(d,'refused','Refus par appel'))]);assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);
   assert.equal((await read(await call('/documents/'+d.id+'/quote-events'),200)).events.length,1);
  });
  await t.test('expiration dérivée, accord réel antérieur et filtres cohérents avec la pagination',async()=>{
   const expired=await create(quoteFixture('Proposition expirée','2020-01-05'));assert.equal(expired.quote.state,'expired');
   await read(await send(expired,input(expired,'accepted','Accord tardif','2020-01-06')),422);
   const prior=await read(await send(expired,input(expired,'accepted','Accord signé pendant la validité','2020-01-05')),201);assert.equal(prior.quote.state,'accepted');
   const d=await create(quoteFixture('Encore expirée','2020-01-05'));
   const list=await read(await call('/documents?kind=quote&state=expired&limit=1'),200);assert.equal(list.total,1);assert.equal(list.documents[0].id,d.id);assert.equal(list.documents[0].quote.state,'expired');
   const empty=await read(await call('/documents?kind=quote&state=expired&limit=1&offset=1'),200);assert.equal(empty.total,1);assert.deepEqual(empty.documents,[]);
   assert.equal((await read(await call('/documents?kind=quote&state=draft'),200)).total,1);
   for(const q of ['kind=invoice&state=accepted','state=paid','kind=quote&state=sent&state=accepted'])await read(await call('/documents?'+q),400);
  });
  await t.test('facture liée : accord requis pour devis émis, conversion unique et suivi verrouillé',async()=>{
   const d=await create(),target=randomUUID();const convert=id=>call('/documents/'+d.id+'/convert','POST',{id},{'If-Match':String(d.version)});
   await read(await convert(target),409);const agreement=await read(await send(d),201);
   const invoice=await read(await convert(target),201);assert.equal(invoice.sourceDocumentId,d.id);assert.equal(invoice.status,'draft');
   assert.equal((await read(await convert(target),200)).id,target);await read(await convert(randomUUID()),409);
   const linked=await read(await call('/documents/'+d.id),200);assert.deepEqual(linked.quote.invoice,{id:target,number:null,state:'draft'});
   await read(await send(agreement,input(agreement,'reopened','Correction')),409);
  });
  await t.test('course correction/facture : jamais de facture liée à une réponse corrigée',async()=>{
   const d=await create(),accepted=await read(await send(d),201);
   const result=await Promise.all([send(accepted,input(accepted,'reopened','Correction requise')),call('/documents/'+d.id+'/convert','POST',{id:randomUUID()},{'If-Match':'1'})]);assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);
   const current=await read(await call('/documents/'+d.id),200);if(current.quote.invoice)assert.equal(current.quote.state,'accepted');else assert.equal(current.quote.state,'sent');
  });
  await t.test('historique paginé : pas de doublon ni de saut, entrée directe invalide refusée',async()=>{
   let d=await create();
   for(let n=0;n<52;n++)d=await read(await send(d,input(d,n%2?'reopened':'accepted',n%2?'Correction de démonstration':'Accord de démonstration')),201);
   const first=await read(await call('/documents/'+d.id+'/quote-events'),200);assert.equal(first.events.length,50);assert.equal(first.nextBefore,3);
   const second=await read(await call('/documents/'+d.id+'/quote-events?before='+first.nextBefore),200);assert.deepEqual(second.events.map(e=>e.version),[2,1]);assert.equal(second.nextBefore,null);
   const row=await ctx.db.prepare('SELECT * FROM billing_quote_events WHERE document_id=? ORDER BY version DESC LIMIT 1').bind(d.id).first();
   await assert.rejects(()=>ctx.db.prepare('INSERT INTO billing_quote_events VALUES(?,?,?,?,?,?,?,?,?,?)').bind(randomUUID(),row.document_id,row.document_version,53,'accepted','2026-02-30','Invalid date',row.request_hash,row.recorded_at,row.recorded_by).run(),/CHECK constraint/);
  });
 }finally{await ctx.worker.dispose();}
});
