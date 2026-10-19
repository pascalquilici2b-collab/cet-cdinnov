import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {test} from 'node:test';
import {testEnvironment,users} from '../marches/test.mjs';
import {billingSchema,migrateBilling} from './billing-schema.mjs';
import {blankDraft} from './billing-domain.ts';
import {createNumberSeries,reserveIssuance,readIssuance,readIssuanceJob,claimIssuanceJob,failIssuanceJob,completeIssuanceJob} from './billing-issuance.ts';

const series=(kind='invoice',overrides={})=>({id:randomUUID(),issuerSiren:'732829320',kind,prefix:kind==='invoice'?'TEST-F-2026-':'TEST-D-2026-',width:4,firstValue:41,startDate:'2026-01-01',endDate:'2026-12-31',...overrides});
function fixture(kind='invoice',date='2026-10-20'){
 const d=blankDraft(kind,date);d.title='Émission fictive';d.dueDate='2026-11-19';if(kind==='quote')d.validUntil='2026-11-20';
 d.seller={...d.seller,name:'Émetteur fictif',addressLine1:'1 rue du Test',postalCode:'20000',city:'Ajaccio',siren:'732829320',vatId:'FR44732829320',electronicAddress:'732829320',electronicScheme:'0225'};
 d.buyer={...d.buyer,name:'Client fictif',addressLine1:'2 rue du Test',postalCode:'20200',city:'Bastia',siren:'552100554',electronicAddress:'552100554',electronicScheme:'0225'};
 d.lines[0]={...d.lines[0],description:'Prestation fictive',quantity:'1.25',unitPrice:'700',discountPercent:'12.5'};
 d.paymentMeans='10';d.businessProcess='S1';d.legalNotes={recovery:'Test indemnité',penalties:'Test pénalités',discount:'Test escompte'};return d;
}
const status=n=>error=>error.status===n;
const digest=value=>createHash('sha256').update(value).digest('hex');
const manifest=issue=>({schemaVersion:1,envelopeSha256:issue.envelopeSha256,generatorVersion:'synthetic-test',profile:issue.snapshot.kind==='quote'?'quote-pdf':'en16931',
 artifacts:(issue.snapshot.kind==='quote'?['pdf']:['pdf','xml','validation','verapdf']).map(kind=>{const sha256=digest(kind+'-synthetic');return {kind,key:`billing/${issue.id}/${kind}/${sha256}`,sha256,size:200,contentType:{pdf:'application/pdf',xml:'application/xml',validation:'application/json',verapdf:'application/xml'}[kind]};})});

await test('registre D1 : numérotation, gel et reprise après échec',async t=>{
 const ctx=await testEnvironment();const user=users[0],numbering=series();let header,first,firstInput;
 const call=(path,options={})=>ctx.worker.dispatchFetch('https://preview.example/api/v1/billing'+path,{...options,headers:{Origin:'http://127.0.0.1:5196','Content-Type':'application/json',...header,...options.headers}});
 const create=async(data=fixture())=>{const id=randomUUID();const r=await call('/documents',{method:'POST',body:JSON.stringify({id,data})});assert.equal(r.status,201,await r.clone().text());return r.json();};
 const request=(doc,s=numbering)=>({id:randomUUID(),documentId:doc.id,documentVersion:doc.version,seriesId:s.id});
 const counter=async(s=numbering)=>(await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(s.id).first()).next_value;
 const events=id=>ctx.db.prepare('SELECT * FROM billing_issue_events WHERE issuance_id=? ORDER BY version').bind(id).all();
 try{
  header={Authorization:'Bearer '+(await ctx.login(user)).token};
  await t.test('migration rejouable : brouillons et historique antérieurs conservés, aucune série créée',async()=>{
   await ctx.db.batch(billingSchema.map(sql=>ctx.db.prepare(sql)));
   const before=await create();const history=await ctx.db.prepare('SELECT * FROM billing_document_versions WHERE document_id=?').bind(before.id).all();
   await migrateBilling(ctx.db);await migrateBilling(ctx.db);
   assert.deepEqual(await (await call('/documents/'+before.id)).json(),before);
   assert.deepEqual((await ctx.db.prepare('SELECT * FROM billing_document_versions WHERE document_id=?').bind(before.id).all()).results,history.results);
   assert.equal((await ctx.db.prepare('SELECT count(*) AS n FROM billing_number_series').first()).n,0);
   await assert.rejects(()=>reserveIssuance(ctx.db,request(before),user),status(409));
   assert.equal((await ctx.db.prepare('SELECT count(*) AS n FROM billing_issuances').first()).n,0);
  });
  await t.test('série explicite et idempotente ; format, période, préfixe et chevauchements contrôlés',async()=>{
   for(const bad of [{...numbering,firstValue:0},{...numbering,firstValue:1.5},{...numbering,width:10},{...numbering,issuerSiren:732829320},{...numbering,startDate:'2026-02-30'},{...numbering,prefix:'<script>'},{...numbering,prefix:'X'.repeat(27)}])await assert.rejects(()=>createNumberSeries(ctx.db,bad,user),status(422));
   await assert.rejects(()=>createNumberSeries(ctx.db,{...numbering,nextValue:40},user),status(400));
   const both=await Promise.all([createNumberSeries(ctx.db,numbering,user),createNumberSeries(ctx.db,numbering,user)]);assert.deepEqual(both[0],both[1]);
   assert.equal(await counter(),41);
   await assert.rejects(()=>createNumberSeries(ctx.db,{...numbering,prefix:'OTHER-'},user),status(409));
   await assert.rejects(()=>createNumberSeries(ctx.db,series('invoice',{prefix:'OTHER-'}),user),status(409));
   await assert.rejects(()=>createNumberSeries(ctx.db,series('invoice',{prefix:numbering.prefix,startDate:'2027-01-01',endDate:'2027-12-31'}),user),status(409));
  });
  await t.test('numéro et instantané calculés serveur, un seul effet après réponse perdue',async()=>{
   const doc=await create();firstInput=request(doc);
   const results=await Promise.all([reserveIssuance(ctx.db,firstInput,user),reserveIssuance(ctx.db,firstInput,user)]);first=results[0];assert.deepEqual(results[1],first);
   assert.equal(first.number,'TEST-F-2026-0041');assert.equal(first.sequenceValue,41);assert.equal(await counter(),42);
   assert.deepEqual(first.snapshot,doc.data);assert.equal(first.totals.grossMinor,'91876');assert.equal((await readIssuanceJob(ctx.db,first.id)).state,'pending');
   assert.deepEqual(await reserveIssuance(ctx.db,firstInput,user),first);assert.equal(await counter(),42);
   assert.equal((await events(first.id)).results.length,1);assert.equal(first.snapshotSha256.length,64);assert.notEqual(first.snapshotSha256,first.envelopeSha256);
   await assert.rejects(()=>reserveIssuance(ctx.db,{...firstInput,number:'HACK'},user),status(400));
   await assert.rejects(()=>reserveIssuance(ctx.db,{...firstInput,documentVersion:2},user),status(409));
   await assert.rejects(()=>reserveIssuance(ctx.db,{...firstInput,id:randomUUID()},user),status(409));
  });
  await t.test('dix finalisations concurrentes donnent dix numéros consécutifs',async()=>{
   const docs=await Promise.all(Array.from({length:10},()=>create()));
   const reservations=await Promise.all(docs.map(doc=>reserveIssuance(ctx.db,request(doc),user)));
   assert.deepEqual(reservations.map(i=>i.sequenceValue).sort((a,b)=>a-b),[42,43,44,45,46,47,48,49,50,51]);assert.equal(await counter(),52);
   const doc=await create(),race=await Promise.allSettled([reserveIssuance(ctx.db,request(doc),user),reserveIssuance(ctx.db,request(doc),user)]);
   assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);assert.equal(await counter(),53);
  });
  await t.test('retour de date, mauvais émetteur, mauvais type et brouillon incomplet sans consommation',async()=>{
   const before=await counter();
   for(const d of [fixture('invoice','2026-10-19'),fixture('quote'),{...fixture(),seller:{...fixture().seller,siren:'552100554'}}]){
    await assert.rejects(async()=>reserveIssuance(ctx.db,request(await create(d)),user),status(409));
   }
   const incomplete=await create(blankDraft('invoice'));
   await assert.rejects(()=>reserveIssuance(ctx.db,request(incomplete),user),status(422));
   const precision=fixture();precision.lines[0].quantity='1.123456';await assert.rejects(async()=>reserveIssuance(ctx.db,request(await create(precision)),user),status(422));
   assert.equal(await counter(),before);
  });
  await t.test('course entre modification et réservation : version cohérente ou conflit sans numéro consommé',async()=>{
   const doc=await create(),before=await counter();
   const changed={...doc.data,title:'Modification concurrente'};
   const results=await Promise.allSettled([reserveIssuance(ctx.db,request(doc),user),ctx.db.prepare('UPDATE billing_documents SET version=version+1,data_json=? WHERE id=? AND version=?').bind(JSON.stringify(changed),doc.id,doc.version).run()]);
   const current=await ctx.db.prepare('SELECT version,data_json FROM billing_documents WHERE id=?').bind(doc.id).first();
   if(results[0].status==='fulfilled'){
    assert.equal(results[1].status,'rejected');assert.equal(current.version,1);assert.equal(results[0].value.snapshot.title,doc.data.title);assert.equal(await counter(),before+1);
   }else{
    assert.equal(results[0].reason.status,409);assert.equal(results[1].status,'fulfilled');assert.equal(current.version,2);assert.equal(await counter(),before);
   }
  });
  await t.test('échec dans le journal annule aussi numéro et verrouillage',async()=>{
   const doc=await create(),input=request(doc),before=await counter();
   await ctx.db.prepare("CREATE TRIGGER test_reject_issue_event BEFORE INSERT ON billing_issue_events BEGIN SELECT RAISE(ABORT,'TEST_EVENT_FAILURE'); END").run();
   try{await assert.rejects(()=>reserveIssuance(ctx.db,input,user),/TEST_EVENT_FAILURE/);}finally{await ctx.db.prepare('DROP TRIGGER test_reject_issue_event').run();}
   assert.equal(await counter(),before);assert.equal(await readIssuance(ctx.db,input.id),null);assert.equal(await readIssuanceJob(ctx.db,input.id),null);
   await ctx.db.prepare('UPDATE billing_documents SET version=version+1 WHERE id=?').bind(doc.id).run();
  });
  await t.test('document, série, numéro et historique ne peuvent être réécrits ou supprimés',async()=>{
   const before=await counter();
   for(const sql of ["UPDATE billing_documents SET version=version+1,data_json=json_set(data_json,'$.title','forged') WHERE id=?",'DELETE FROM billing_documents WHERE id=?'])await assert.rejects(()=>ctx.db.prepare(sql).bind(first.documentId).run(),/BILLING_DOCUMENT_RESERVED/);
   for(const sql of ["UPDATE billing_issuances SET number='FORGED' WHERE id=?",'DELETE FROM billing_issuances WHERE id=?'])await assert.rejects(()=>ctx.db.prepare(sql).bind(first.id).run(),/BILLING_ISSUANCE_IMMUTABLE/);
   for(const sql of ['UPDATE billing_number_series SET next_value=next_value-1,version=version+1 WHERE id=?',"UPDATE billing_number_series SET prefix='OTHER-',version=version+1 WHERE id=?",'DELETE FROM billing_number_series WHERE id=?'])await assert.rejects(()=>ctx.db.prepare(sql).bind(numbering.id).run(),/BILLING_SERIES_IMMUTABLE/);
   await assert.rejects(()=>ctx.db.prepare('DELETE FROM billing_issue_events WHERE issuance_id=?').bind(first.id).run(),/BILLING_JOB_IMMUTABLE/);
   assert.equal(await counter(),before);assert.deepEqual(await readIssuance(ctx.db,first.id),first);
  });
  await t.test('un seul traitement, reprise après expiration et rejet des réponses tardives',async()=>{
   const now=Date.parse('2026-10-20T10:00:00Z'),token1=randomUUID(),token2=randomUUID(),before=await counter();
   const claimed=await Promise.all([claimIssuanceJob(ctx.db,first.id,token1,user,now,1000),claimIssuanceJob(ctx.db,first.id,token2,user,now,1000)]);
   const winner=claimed.find(Boolean);assert.equal(claimed.filter(Boolean).length,1);assert.equal(winner.attempts,1);
   assert.equal(await completeIssuanceJob(ctx.db,first.id,winner.lease_token,manifest(first),user,now+1000),false);
   const newer=await claimIssuanceJob(ctx.db,first.id,randomUUID(),user,now+1000,1000);assert.equal(newer.attempts,2);
   assert.equal(await failIssuanceJob(ctx.db,first.id,winner.lease_token,'render',user,now+1001),false);
   assert.equal(await completeIssuanceJob(ctx.db,first.id,winner.lease_token,manifest(first),user,now+1001),false);
   assert.equal(await failIssuanceJob(ctx.db,first.id,newer.lease_token,'storage',user,now+1002),true);
   assert.equal((await readIssuanceJob(ctx.db,first.id)).state,'failed');
   assert.deepEqual(await reserveIssuance(ctx.db,firstInput,user),first);assert.equal(await counter(),before);
   await assert.rejects(()=>claimIssuanceJob(ctx.db,first.id,winner.lease_token,user,now+1003,1000),/UNIQUE constraint/);
   assert.equal((await readIssuanceJob(ctx.db,first.id)).state,'failed');assert.equal((await readIssuanceJob(ctx.db,first.id)).attempts,2);
   const resumed=await claimIssuanceJob(ctx.db,first.id,randomUUID(),user,now+1003,1000);assert.equal(resumed.attempts,3);
   const valid=manifest(first);
   for(const bad of [{...valid,envelopeSha256:'0'.repeat(64)},{...valid,artifacts:valid.artifacts.slice(1)},{...valid,artifacts:valid.artifacts.map(a=>({...a,key:'https://evil.example/a'}))},{...valid,profile:'quote-pdf'}])await assert.rejects(()=>completeIssuanceJob(ctx.db,first.id,resumed.lease_token,bad,user,now+1004),status(422));
   assert.equal(await completeIssuanceJob(ctx.db,first.id,resumed.lease_token,valid,user,now+1004),true);
   assert.equal((await readIssuanceJob(ctx.db,first.id)).state,'ready');assert.equal(await claimIssuanceJob(ctx.db,first.id,randomUUID(),user,now+2005),null);
   assert.equal(await completeIssuanceJob(ctx.db,first.id,resumed.lease_token,valid,user,now+1005),false);
   await assert.rejects(()=>ctx.db.prepare("UPDATE billing_issue_jobs SET state='pending',version=version+1,manifest_json=NULL WHERE issuance_id=?").bind(first.id).run(),/BILLING_JOB_TRANSITION/);
   assert.deepEqual((await events(first.id)).results.map(r=>r.state),['pending','rendering','rendering','failed','rendering','ready']);
   assert.deepEqual(await readIssuance(ctx.db,first.id),first);
  });
  await t.test('devis : série distincte, version figée et manifeste PDF seul',async()=>{
   const s=series('quote');await createNumberSeries(ctx.db,s,user);const doc=await create(fixture('quote'));
   const issue=await reserveIssuance(ctx.db,request(doc,s),user);assert.equal(issue.number,'TEST-D-2026-0041');
   const now=Date.now(),token=randomUUID();await claimIssuanceJob(ctx.db,issue.id,token,user,now);
   assert.equal(await completeIssuanceJob(ctx.db,issue.id,token,manifest(issue),user,now+1),true);
  });
  await t.test('limite de compteur : dernier numéro utilisable puis refus sans dépassement',async()=>{
   const s=series('invoice',{prefix:'TEST-F-2027-',startDate:'2027-01-01',endDate:'2027-12-31',firstValue:999999999});await createNumberSeries(ctx.db,s,user);
   const d=fixture('invoice','2027-01-01');d.dueDate='2027-02-01';
   const issue=await reserveIssuance(ctx.db,request(await create(d),s),user);assert.equal(issue.sequenceValue,999999999);assert.equal(await counter(s),1000000000);
   await assert.rejects(async()=>reserveIssuance(ctx.db,request(await create(d),s),user),status(409));assert.equal(await counter(s),1000000000);
  });
 }finally{await ctx.worker.dispose();}
});
