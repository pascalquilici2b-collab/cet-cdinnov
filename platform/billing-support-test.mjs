import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {quoteFixtureTools,quoteFixture,samplePDF} from './billing-quote-fixture.mjs';
import {defaultBillingEmail} from './billing-email-default.ts';
import {outlookMessage} from './billing-outlook-message.ts';
import {billingDisplayState} from './billing-display-state.ts';

test('accepted quote → private engagement → one invoice; document snapshots stay immutable',async()=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).token,{call,create,send,input}=await quoteFixtureTools(ctx,token);
  let q=await create(quoteFixture());const original=q.data,pdf=samplePDF(),conversion=randomUUID();
  const convert=()=>call('/documents/'+q.id+'/convert','POST',{id:conversion},{'If-Match':String(q.version)});
  assert.equal((await convert()).status,409);
  q=await(await send(q,input(q,'sent',''))).json();assert.equal(billingDisplayState(q),'sent');
  q=await(await send(q,input(q))).json();assert.equal(billingDisplayState(q),'accepted');assert.equal((await convert()).status,409);
  const upload=(body=pdf,headers={})=>ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/documents/'+q.id+'/engagement?kind=signed_quote',{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+token,'If-Match':String(q.version),'X-Filename':encodeURIComponent('Devis signé.pdf'),'Content-Type':'application/pdf',...headers},body});
  assert.equal((await upload('malformed')).status,422);assert.equal((await upload(pdf,{'If-Match':'99'})).status,409);
  let result=await upload();assert.equal(result.status,201,await result.clone().text());q=await result.json();assert.equal(q.quote.engagement.filename,'Devis signé.pdf');assert.deepEqual(q.data,original);
  assert.equal((await upload()).status,200);assert.equal((await upload(Buffer.concat([pdf,Buffer.from('changed')]))).status,409);
  assert.deepEqual(Buffer.from(await(await call('/documents/'+q.id+'/engagement')).arrayBuffer()),pdf);
  result=await convert();assert.equal(result.status,201,await result.clone().text());const invoice=await result.json();assert.equal(invoice.sourceDocumentId,q.id);assert.equal(invoice.data.references.quoteNumber,q.issuance.number);
  assert.equal((await convert()).status,200);assert.equal((await call('/documents/'+q.id+'/convert','POST',{id:randomUUID()},{'If-Match':String(q.version)})).status,409);
  assert.deepEqual((await(await call('/documents/'+q.id)).json()).data,original);
  const cors=await ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/documents/'+q.id+'/engagement',{method:'OPTIONS',headers:{Origin:'https://app.cdinnov.eu'}});assert.match(cors.headers.get('Access-Control-Allow-Headers'),/X-Filename/);
 }finally{await ctx.worker.dispose();}
});

test('legacy report has independent versioning, persists and rejects concurrent overwrites',async()=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);await ctx.setPortal(JSON.stringify({auth:{accounts:ctx.accounts,allowed:users},factures:[{id:'legacy-test',number:'2610065',client:'Client fictif',dateFacture:'2026-10-06',title:'Suivi administratif'}]}));
  const token=(await ctx.login(users[0])).token,{call}=await quoteFixtureTools(ctx,token),path='/imported-invoices/legacy-test/intervention-report';
  let r=await call(path);assert.equal(r.status,200,await r.clone().text());let report=await r.json();assert.equal(report.title,'Suivi administratif');
  const data={date:'2026-10-23',title:report.title,periods:['S1','S3'],rows:[{id:randomUUID(),priceId:'',label:'Consultant senior',description:'Animation des partenaires',days:'2.5'}]};
  r=await call(path,'PUT',data,{'If-Match':'0'});assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).version,1);
  assert.equal((await call(path,'PUT',data,{'If-Match':'0'})).status,409);
  r=await call(path,'PUT',{...data,rows:[{...data.rows[0],days:'3'}]},{'If-Match':'1'});assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).version,2);
  assert.equal((await(await call(path)).json()).rows[0].days,'3');
  assert.equal((await call('/imported-invoices/absent/intervention-report')).status,404);
  assert.equal((await call(path,'PUT',{...data,date:'2026-02-30'},{'If-Match':'2'})).status,422);
  const history=await ctx.db.prepare('SELECT count(*) AS n FROM billing_intervention_report_versions').first();assert.equal(history.n,2);
 }finally{await ctx.worker.dispose();}
});

test('invoice Outlook message includes the fixed blind copy and platform sentence, quote does not',async()=>{
 const data=quoteFixture(),invoice={data:{...data,kind:'invoice'},issuance:{number:'F-TEST'}};
 const message=defaultBillingEmail(invoice);assert.match(message,/La facture électronique vous sera également adressée sur votre plateforme agréée/);assert.doesNotMatch(defaultBillingEmail({data}),/plateforme agréée/);
 const input={recipient:'contact@example.test',bcc:'cdi@cdinnov.com',subject:'Facture F-TEST',message,filename:'facture.pdf',pdf:new Blob([samplePDF()])};
 assert.match(await(await outlookMessage(input)).text(),/\r\nBcc: cdi@cdinnov.com\r\n/);
 assert.doesNotMatch(await(await outlookMessage({...input,bcc:undefined})).text(),/\r\nBcc:/);
});
