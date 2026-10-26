import assert from 'node:assert/strict';
import {test} from 'node:test';
import {blankDocumentDetails,normalizeDraft} from './billing-domain.ts';
import {documentPeriods,periodLabel} from './billing-periods.ts';
import {defaultBillingEmail} from './billing-email-default.ts';
import {quoteFixture,quoteFixtureTools,samplePDF} from './billing-quote-fixture.mjs';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';

test('semestres multiples : anciens documents inchangés, sélection triée et désélection totale',()=>{
 const data={...quoteFixture(),details:{...blankDocumentDetails(),period:'S4'}};
 assert.deepEqual(normalizeDraft(data).details,data.details);assert.deepEqual(documentPeriods(data.details),['S4']);
 data.details.periods=['S8','S1','S3','S1'];const normalized=normalizeDraft(data);
 assert.deepEqual(normalized.details.periods,['S1','S3','S8']);assert.equal(normalized.details.period,'S1');
 assert.equal(periodLabel(normalized.details),'Semestres 1, 3 et 8');
 assert.match(defaultBillingEmail({data:normalized,reservedNumber:{number:'20261023-001'}}),/pour les périodes Semestres 1, 3 et 8/);
 data.details.periods=[];assert.equal(normalizeDraft(data).details.period,'');assert.equal(periodLabel(normalizeDraft(data).details),'');
 for(const bad of [['S9'],'S1',null,['S1',3],Array(9).fill('S1')])assert.throws(()=>normalizeDraft({...data,details:{...data.details,periods:bad}}),/Périodes/);
});

test('API : sauvegarde et conversion devis → facture conservent les semestres non consécutifs',async()=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).token,{create,call,send}=await quoteFixtureTools(ctx,token);
  const data={...quoteFixture(),details:{...blankDocumentDetails(),period:'S1',periods:['S1','S3','S8']}};
  let doc=await create(data),id=crypto.randomUUID();
  let accepted=await send(doc);assert.equal(accepted.status,201,await accepted.clone().text());doc=await accepted.json();
  const engagement=await ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/documents/'+doc.id+'/engagement?kind=signed_quote',{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+token,'If-Match':String(doc.version),'X-Filename':'Signed.pdf','Content-Type':'application/pdf'},body:samplePDF()});assert.equal(engagement.status,201,await engagement.clone().text());
  const response=await call('/documents/'+doc.id+'/convert','POST',{id},{'If-Match':String(doc.version)});
  assert.equal(response.status,201,await response.clone().text());const invoice=await response.json();assert.deepEqual(invoice.data.details.periods,data.details.periods);
  assert.deepEqual((await(await call('/documents/'+invoice.id)).json()).data.details.periods,data.details.periods);
  const update=await call('/documents/'+invoice.id,'PUT',{data:{...invoice.data,details:{...invoice.data.details,periods:[],period:''}}},{'If-Match':String(invoice.version)});
  assert.equal(update.status,200);assert.equal((await update.json()).data.details.period,'');
 }finally{await ctx.worker.dispose();}
});
