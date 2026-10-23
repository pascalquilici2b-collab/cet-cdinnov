import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {createNumberSeries,reserveIssuance,claimIssuanceJob,completeIssuanceJob} from './billing-issuance.ts';
import {emptyMarket,validateMarket} from '../marches/domain.mjs';
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


test('received order links market and project; consumption survives invoice trash and restoration',async()=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).token,{call,create,send,input}=await quoteFixtureTools(ctx,token),marketId=randomUUID(),projectId=randomUUID(),orderId=randomUUID();
  const m={...emptyMarket(),title:'Accord-cadre fictif',reference:'M-TEST',clientName:'Atelier Horizon',maximumMinor:1000000,projects:[{id:projectId,name:'Projet test',code:'P-TEST',notes:'',archived:false,orders:[{id:orderId,reference:'BC-TEST',date:'2026-10-23',amountMinor:500000,documentId:'',notes:'',archived:false}]}]};
  await ctx.db.prepare('INSERT INTO markets(id,payload,version,updated_at,updated_by) VALUES(?,?,1,?,?)').bind(marketId,JSON.stringify(m),new Date().toISOString(),users[0]).run();
  const d=quoteFixture();d.references.marketId=marketId;d.references.projectId=projectId;d.references.project='Projet test';d.references.marketReference='M-TEST';let q=await create(d);q=await(await send(q,input(q))).json();
  const params=new URLSearchParams({kind:'order',reference:'BC-TEST',date:'2026-10-23',amountMinor:'500000',marketId,projectId});
  let r=await ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/documents/'+q.id+'/engagement?'+params,{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+token,'If-Match':String(q.version),'X-Filename':'BC.pdf','Content-Type':'application/pdf'},body:samplePDF()});assert.equal(r.status,201,await r.clone().text());
  q=await r.json();assert.equal(q.quote.engagement.details.orderId,orderId);
  r=await ctx.call('markets/'+marketId,{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200);const market=(await r.json()).market;assert.equal(market.linkedEngagements[0].projectId,projectId);
  let tracking=await(await call('/engagements')).json();assert.equal(tracking.orders.length,1);assert.equal(tracking.markets[0].quotedMinor,225000);assert.equal(tracking.orders[0].files.length,1);
  r=await call('/documents/'+q.id+'/convert','POST',{id:randomUUID()},{'If-Match':String(q.version)});assert.equal(r.status,201,await r.clone().text());let f=await r.json();assert.equal(f.data.references.orderId,orderId);assert.equal(f.data.references.orderReference,'BC-TEST');
  tracking=await(await call('/engagements')).json();assert.equal(tracking.orders[0].invoicedMinor,0);
  const series={id:randomUUID(),issuerSiren:'732829320',kind:'invoice',prefix:'TEST-FAC-',width:4,firstValue:1,startDate:'2020-01-01',endDate:'2099-12-31'};await createNumberSeries(ctx.db,series,users[0]);
  const issue=await reserveIssuance(ctx.db,{id:randomUUID(),documentId:f.id,documentVersion:f.version,seriesId:series.id},users[0]),lease=randomUUID();assert.ok(await claimIssuanceJob(ctx.db,issue.id,lease,users[0]));const bytes=samplePDF(),sha256=createHash('sha256').update(bytes).digest('hex'),artifact={kind:'pdf',key:'billing/'+issue.id+'/pdf/'+sha256,sha256,size:bytes.length,contentType:'application/pdf'};
  await(await ctx.worker.getR2Bucket('CET_FILES')).put(artifact.key,bytes,{httpMetadata:{contentType:artifact.contentType}});await completeIssuanceJob(ctx.db,issue.id,lease,{schemaVersion:1,envelopeSha256:issue.envelopeSha256,generatorVersion:'synthetic',profile:'invoice-pdf',artifacts:[artifact]},users[0]);
  const original=await ctx.db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(f.id).first();
  tracking=await(await call('/engagements')).json();assert.equal(tracking.orders[0].invoicedMinor,225000);
  r=await call('/documents/'+f.id,'DELETE',undefined,{'If-Match':String(f.version)});assert.equal(r.status,200,await r.clone().text());assert.equal((await call('/documents/'+f.id)).status,410);
  assert.equal((await(await call('/documents?kind=invoice&state=trash')).json()).total,1);
  tracking=await(await call('/engagements')).json();assert.equal(tracking.orders[0].invoicedMinor,225000);
  r=await call('/documents/'+f.id+'/restore','POST',{}, {'If-Match':String(f.version)});assert.equal(r.status,200,await r.clone().text());assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(f.id).first(),original);
  const file=await call('/documents/'+f.id+'/files/pdf');assert.equal(file.status,200,await file.clone().text());assert.ok(Buffer.from(await file.arrayBuffer()).equals(bytes));
  assert.equal((await call('/documents/'+q.id,'DELETE',undefined,{'If-Match':String(q.version)})).status,409);
 }finally{await ctx.worker.dispose();}
});

test('miscellaneous market information can be validated without citing a source',()=>{
 const m={...emptyMarket(),title:'Marché',clientName:'Client',periods:[{id:'period',label:'Initiale',startDate:'2026-01-01',endDate:'2026-12-31',decision:'Notification',status:'validated',source:{documentId:'',locator:'',note:''}}],conditions:[{id:'condition',label:'Livrable',category:'other',value:'Rapport',status:'validated',source:{documentId:'',locator:'',note:''}}]};
 assert.equal(validateMarket(m,[]).periods[0].status,'validated');assert.equal(validateMarket(m,[]).conditions[0].status,'validated');
});
