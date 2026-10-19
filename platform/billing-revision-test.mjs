import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {billingToday} from './billing-quote-domain.ts';
import {reserveIssuance} from './billing-issuance.ts';
import {quoteFixture,quoteFixtureTools} from './billing-quote-fixture.mjs';

await test('révisions liées : intégrité des versions, abandon, concurrence et facturation unique',async t=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);const admin=await ctx.login(users[0]),reader=await ctx.login(users[1]);const {call,create,send,input,finalize,series}=await quoteFixtureTools(ctx,admin.token);
  const read=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
  const fresh=(title='Proposition à réviser')=>create({...quoteFixture(title),issueDate:billingToday()});
  const get=id=>call('/documents/'+id).then(r=>read(r));
  const data=(d,reason='Périmètre ajusté')=>({id:randomUUID(),familyVersion:d.quote.revision.familyVersion,reason});
  const revise=(d,v=data(d),version=d.version)=>call('/documents/'+d.id+'/revise','POST',v,{'If-Match':String(version)});
  const abandon=(d,v=data(d,'Proposition maintenue dans sa version précédente'),version=d.version)=>call('/documents/'+d.id+'/abandon-revision','POST',v,{'If-Match':String(version)});
  const accept=d=>send(d,input(d,'accepted','Accord reçu par e-mail',billingToday())).then(r=>read(r,201));
  const save=d=>call('/documents/'+d.id,'PUT',{data:{...d.data,validUntil:'2099-12-31'}},{'If-Match':String(d.version)}).then(r=>read(r));
  const convert=d=>call('/documents/'+d.id+'/convert','POST',{id:randomUUID()},{'If-Match':String(d.version)});
  let source=await fresh(),child;
  const original=await ctx.db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(source.id).first();
  await t.test('droits, version source et intention stricte ; aucune migration HTTP',async()=>{
   for(const auth of ['', 'Bearer '+reader.token])for(const suffix of ['/quote-versions','/revise','/abandon-revision'])assert.equal((await call('/documents/'+source.id+suffix,suffix==='/quote-versions'?'GET':'POST',suffix==='/quote-versions'?undefined:data(source),{Authorization:auth,'If-Match':'1'})).status,auth?403:401);
   await read(await call('/documents/'+source.id+'/revise','POST',data(source)),428);
   for(const patch of [{reason:''},{reason:' '.repeat(3)},{familyVersion:-1},{familyVersion:0.5},{id:'bad'},{extra:1}])await read(await revise(source,{...data(source),...patch}),400);
   await read(await revise(source,data(source),2),409);
   const draft=await create(quoteFixture(),false);await read(await revise(draft),409);
  });
  await t.test('création atomique idempotente, copie indépendante et aucune reprise implicite de l’accord',async()=>{
   source=await accept(source);const intent=data(source),races=await Promise.all([revise(source,intent),revise(source,intent)]);assert.deepEqual(races.map(r=>r.status).sort(),[200,201]);child=await races[0].json();
   assert.equal(child.quote.revision.ordinal,2);assert.equal(child.quote.revision.currentId,child.id);assert.equal(child.quote.revision.parentId,source.id);assert.equal(child.data.issueDate,billingToday());assert.equal(child.data.validUntil,'');assert.equal(child.quote.version,0);assert.equal(child.quote.state,'prepared');
   assert.deepEqual(child.data.buyer,source.data.buyer);assert.deepEqual(child.totals.grossMinor,source.totals.grossMinor);assert.notEqual(child.data.lines[0].id,source.data.lines[0].id);assert.match(child.data.notes,new RegExp(source.issuance.number));
   assert.equal((await read(await revise(source,intent))).id,child.id);await read(await revise(source,{...intent,reason:'Autre motif'}),409);
   await read(await revise(source),409);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM billing_quote_revisions WHERE root_document_id=?').bind(source.id).first()).n,1);
   const previous=await get(source.id);assert.equal(previous.quote.state,'accepted');assert.equal(previous.quote.revision.currentId,child.id);assert.deepEqual(previous.data,source.data);assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(source.id).first(),original);
   await read(await convert(previous),409);await read(await send(previous,input(previous,'reopened','Ne doit pas passer',billingToday())),409);
  });
  await t.test('abandon versionné : conservation du brouillon, retour au parent, reprises sans double effet',async()=>{
   const v=data(child,'Retour au périmètre initial'),r=await abandon(child,v);const cancelled=await read(r);assert.equal(cancelled.quote.revision.abandoned,true);assert.equal(cancelled.quote.revision.currentId,source.id);
   assert.deepEqual(await read(await abandon(child,v)),cancelled);await read(await abandon(child,{...v,reason:'Autre'}),409);
   await read(await call('/documents/'+child.id,'PUT',{data:child.data},{'If-Match':'1'}),409);await read(await convert(cancelled),409);
   await assert.rejects(()=>ctx.db.prepare('UPDATE billing_documents SET version=version+1 WHERE id=?').bind(child.id).run(),/BILLING_REVISION_INACTIVE/);
   await assert.rejects(()=>ctx.db.prepare('DELETE FROM billing_quote_revisions WHERE document_id=?').bind(child.id).run(),/BILLING_REVISION_HISTORY/);
   source=await get(source.id);assert.equal(source.quote.state,'accepted');assert.equal(source.quote.revision.currentId,source.id);assert.equal(source.quote.revision.count,2);
  });
  await t.test('les listes montrent la version courante et offrent les historiques séparément',async()=>{
   const current=await read(await call('/documents?kind=quote'));assert.ok(current.documents.some(d=>d.id===source.id));assert.ok(!current.documents.some(d=>d.id===child.id));
   const abandoned=await read(await call('/documents?kind=quote&state=abandoned'));assert.equal(abandoned.total,1);assert.equal(abandoned.documents[0].id,child.id);
   const next=await read(await revise(source),201);assert.equal(next.quote.revision.ordinal,3);child=next;
   const previous=await read(await call('/documents?kind=quote&state=previous'));assert.equal(previous.documents[0].id,source.id);
   const found=await read(await call('/documents?kind=quote&q='+encodeURIComponent(source.issuance.number)));assert.equal(found.total,1);assert.equal(found.documents[0].id,source.id);
   const first=await read(await call('/documents/'+child.id+'/quote-versions'));assert.deepEqual(first.versions.map(v=>v.ordinal),[3,2,1]);assert.ok(first.versions[1].abandonedAt);assert.equal(first.nextBefore,null);
   assert.deepEqual((await read(await call('/documents/'+child.id+'/quote-versions?before=3'))).versions.map(v=>v.ordinal),[2,1]);
   for(const q of ['before=0','before=a','before=2&before=3','unknown=1'])await read(await call('/documents/'+child.id+'/quote-versions?'+q),400);
   await read(await call('/documents?kind=invoice&state=previous'),400);
  });
  await t.test('révision émise : nouveau numéro, nouvel accord, une facture pour toute la proposition',async()=>{
   child=await finalize(await save(child));assert.notEqual(child.issuance.number,source.issuance.number);assert.equal(child.quote.version,0);
   await read(await convert(child),409);child=await accept(child);const invoice=await read(await convert(child),201);
   assert.equal(invoice.sourceDocumentId,child.id);assert.equal((await get(source.id)).quote.invoice.id,invoice.id);assert.equal((await get(child.id)).quote.invoice.id,invoice.id);
   await read(await revise(child),409);await read(await convert(source),409);
   assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(source.id).first(),original);
   const before=await ctx.db.prepare('SELECT * FROM billing_quote_family_history WHERE root_document_id=? ORDER BY version').bind(source.id).all();await migrateBilling(ctx.db);assert.deepEqual((await ctx.db.prepare('SELECT * FROM billing_quote_family_history WHERE root_document_id=? ORDER BY version').bind(source.id).all()).results,before.results);
  });
  await t.test('créations concurrentes : une révision, aucun brouillon orphelin',async()=>{
   const d=await fresh('Révision concurrente'),ids=[data(d),data(d)];const count=(await ctx.db.prepare('SELECT count(*) n FROM billing_documents').first()).n;
   const race=await Promise.all(ids.map(v=>revise(d,v)));assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM billing_documents').first()).n,count+1);
   const current=await get(d.id);assert.equal(current.quote.revision.count,2);const losing=ids[race.findIndex(r=>r.status===409)].id;assert.equal(await ctx.db.prepare('SELECT id FROM billing_documents WHERE id=?').bind(losing).first(),null);
  });
  await t.test('course révision/facture : une seule branche commerciale',async()=>{
   const d=await accept(await fresh('Révision contre facturation'));const race=await Promise.all([revise(d),convert(d)]);assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
   const latest=await get(d.id);if(latest.quote.invoice)assert.equal(latest.quote.revision.currentId,d.id);else assert.notEqual(latest.quote.revision.currentId,d.id);
  });
  await t.test('course abandon/numéro : pas d’abandon d’un document figé ni de numéro pour une version abandonnée',async()=>{
   const d=await fresh('Abandon contre émission'),revision=await save(await read(await revise(d),201));
   const counter=(await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(series.id).first()).next_value;
   const race=await Promise.allSettled([abandon(revision).then(r=>{if(r.status!==200)throw Object.assign(new Error('conflict'),{status:r.status});return r.json();}),reserveIssuance(ctx.db,{id:randomUUID(),documentId:revision.id,documentVersion:revision.version,seriesId:series.id},users[0])]);
   assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
   const latest=await get(revision.id);assert.notEqual(!!latest.issuance,latest.quote.revision.abandoned);
   assert.equal((await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(series.id).first()).next_value,counter+(latest.issuance?1:0));
  });
  await t.test('historique au-delà de 50 versions : curseur sans perte et notes complètes conservées',async()=>{
   let d=await create({...quoteFixture('Historique de démonstration'),issueDate:billingToday(),notes:'N'.repeat(10000)});
   for(let n=0;n<51;n++){
    const child=await read(await revise(d,data(d,'Révision '+(n+2))),201);assert.equal(child.data.notes.length,10000);
    if(n<50){await read(await abandon(child));d=await get(d.id);}
   }
   const first=await read(await call('/documents/'+d.id+'/quote-versions'));assert.equal(first.versions.length,50);assert.equal(first.nextBefore,3);assert.equal(first.versions[0].ordinal,52);
   const second=await read(await call('/documents/'+d.id+'/quote-versions?before='+first.nextBefore));assert.deepEqual(second.versions.map(v=>v.ordinal),[2,1]);assert.equal(second.nextBefore,null);
  });
 }finally{await ctx.worker.dispose();}
});
