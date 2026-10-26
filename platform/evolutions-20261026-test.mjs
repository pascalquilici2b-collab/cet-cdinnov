import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {unzipSync,strFromU8} from 'fflate';
import {randomUUID,createHash} from 'node:crypto';
import {annualWindows,consumptionForMarket} from '../marches/annual-consumption.mjs';
import {emptyMarket,validateMarket} from '../marches/domain.mjs';
import {normalizeClientEmployees,normalizeClientPayments} from './client-employees-domain.ts';
import {allocatedAmount} from './client-employee-money.ts';
import {normalizeDirectInvoice} from './stamping-direct.ts';
import {outlookMessage} from './billing-outlook-message.ts';
import {blankClient} from './billing-directory-domain.ts';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {quoteFixtureTools,quoteFixture,samplePDF} from './billing-quote-fixture.mjs';
import {createNumberSeries,reserveIssuance,claimIssuanceJob,completeIssuanceJob} from './billing-issuance.ts';
import {billingDisplayState} from './billing-display-state.ts';

const allocation=(percent='40',startDate='2026-01-01',endDate='2026-12-31')=>({id:randomUUID(),projectId:'project-1',project:'Projet test',projectCode:'IF001',programme:'Interreg Italie-France Maritime',percent,startDate,endDate,tasks:'Coordination et suivi.'});
const agent=()=>({id:randomUUID(),name:'Agent fictif',role:'Chargé de projet',supervisor:'Responsable fictif',allocations:[allocation()]});
test('new market kinds, six months, annual reset and revision history',()=>{
 for(const type of ['consultation','direct'])assert.equal(validateMarket({...emptyMarket(),title:'Test',clientName:'Test',type,initialDurationMonths:6}).initialDurationMonths,6);
 const m={...emptyMarket(),id:'m',periodBasis:'notification',notificationDate:'2024-02-29',ceilings:[{scope:'annual',basis:'HT',amountMinor:100000}],orders:[{id:'bc',date:'2025-10-01',reference:'BC 2025',amountMinor:30000}]};
 assert.equal(annualWindows(m,'2026-03-02').resetDate,'2027-02-28');
 const q=(id,ordinal,date,amount,state='sent')=>({id,ordinal,rootId:'family',marketId:'m',netMinor:amount,events:[{version:1,action:'sent',occurredOn:date},...(state==='refused'?[{version:2,action:state,occurredOn:date}]:[])]});
 const current=consumptionForMarket(m,[q('one',1,'2025-07-01',20000),q('two',2,'2026-06-01',25000)],'2026-10-26');
 assert.equal(current.quotedMinor,25000);assert.equal(current.periods[1].quotedMinor,20000);assert.equal(current.periods[1].orderedMinor,30000);assert.equal(current.periods[1].orders[0].reference,'BC 2025');
 assert.equal(consumptionForMarket(m,[q('one',1,'2026-04-01',20000),q('two',2,'2026-06-01',25000,'refused')],'2026-10-26').quotedMinor,0);
 assert.equal(annualWindows({...m,notificationDate:''},'2026-10-26').resetDate,null);
 assert.equal(annualWindows({...m,notificationDate:'2027-01-01'},'2026-10-26').resetDate,'2028-01-01');
});
test('employee allocations validate overlaps and payment references',()=>{
 assert.equal(allocatedAmount('0.29','50'),0.15);assert.equal(allocatedAmount('3521.38','40'),1408.55);
 const a=agent();a.allocations.push(allocation('61'));assert.throws(()=>normalizeClientEmployees([a]),/100/);a.allocations[1]=allocation('100','2027-01-01','2027-12-31');assert.equal(normalizeClientEmployees([a]).length,1);
 assert.throws(()=>normalizeClientPayments([{employeeId:'unknown',month:'2026-10'}],[a]),/Salarié/);
 assert.equal(normalizeDirectInvoice({project:'Test',programme:'Maritime',basis:'HT',vatRate:'20'}).basis,'HT');assert.throws(()=>normalizeDirectInvoice({project:'Test',programme:'',basis:'HT',vatRate:'101'}));
 const direct={project:'Test',programme:'Maritime',basis:'HT',vatRate:'20'};
 for(const amount of [undefined,'','0','-10','1.001','abc'])assert.throws(()=>normalizeDirectInvoice({...direct,amount},true),/montant/);
 assert.equal(normalizeDirectInvoice({...direct,amount:'29,15'},true).amount,'29.15');
});
test('Outlook MIME contains Cc and removable multiple attachments, never Bcc',async()=>{
 const pdf=new Blob([samplePDF()],{type:'application/pdf'}),input={recipient:'client@example.test',subject:'Facture',message:'Bonjour',cc:'cdi@cdinnov.com',attachments:[{filename:'Facture.pdf',blob:pdf},{filename:'Releve.pdf',blob:pdf}]};
 const mime=await(await outlookMessage(input)).text();assert.match(mime,/Cc: cdi@cdinnov.com/);assert.doesNotMatch(mime,/Bcc:/);assert.equal((mime.match(/Content-Disposition: attachment/g)||[]).length,2);assert.equal((await(await outlookMessage({...input,attachments:[]})).text()).includes('Content-Disposition: attachment'),false);
});
test('client GED concurrency, archived documents, selective export and sent confirmation',async()=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);const login=await ctx.login(users[0]),{call,create}=await quoteFixtureTools(ctx,login.token),id=randomUUID(),client=blankClient();client.party.name='Client test';
  const c=await call('/clients','POST',{id,data:client});assert.equal(c.status,201,await c.clone().text());
  assert.equal((await call('/client-employees/'+id)).status,200);
  const a=agent();let r=await call('/client-employees/'+id,'PUT',{agents:[a],payments:[]},{'If-Match':'0'});assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).version,1);
  assert.equal((await call('/client-employees/'+id,'PUT',{agents:[a],payments:[]},{'If-Match':'0'})).status,409);
  const bytes=samplePDF(),upload=await ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/client-employees/'+id+'/documents?kind=mission&employeeId='+a.id,{method:'POST',headers:{Authorization:'Bearer '+login.token,'If-Match':'1','X-Filename':'Mission.pdf','Content-Type':'application/pdf',Origin:'https://app.cdinnov.eu'},body:bytes});assert.equal(upload.status,201,await upload.clone().text());const space=await upload.json();assert.equal(space.documents[0].snapshot.agents[0].allocations[0].percent,'40');
  assert.equal((await ctx.worker.dispatchFetch('https://preview.test/files/client-employees/test',{headers:{Authorization:'Bearer '+login.token,Origin:'https://app.cdinnov.eu'}})).status,403);
  const exported=await ctx.worker.dispatchFetch('https://preview.test/api/v1/data-export',{headers:{Authorization:'Bearer '+login.token,Origin:'https://app.cdinnov.eu'}});assert.equal(exported.status,200,await exported.clone().text());assert.ok((await exported.json()).tables.some(t=>t.name==='client_employee_documents'&&t.section==='clients'));
  const bundle=await build({entryPoints:['platform/client/data-export.tsx'],bundle:true,platform:'node',format:'esm',write:false});const {exportArchive}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const chunks=[];await exportArchive(q=>ctx.worker.dispatchFetch('https://preview.test/api/v1/data-export'+q,{headers:{Authorization:'Bearer '+login.token,Origin:'https://app.cdinnov.eu'}}),['clients'],()=>{},{write:b=>chunks.push(Buffer.from(b)),close:()=>{},abort:()=>{throw Error('ZIP aborted');}});
  const archive=unzipSync(Buffer.concat(chunks)),names=Object.keys(archive);assert.ok(names.some(n=>n.endsWith('Mission.pdf')));assert.ok(names.every(n=>n==='inventaire.json'||n.startsWith('Clients et salariés/')));assert.ok(names.some(n=>n.includes('client_employee_versions')));assert.deepEqual(Buffer.from(archive[names.find(n=>n.endsWith('Mission.pdf'))]),bytes);assert.deepEqual(JSON.parse(strFromU8(archive['inventaire.json'])).sections,['Clients et salariés']);
  const personal=await ctx.login(users[1]);assert.equal((await ctx.worker.dispatchFetch('https://preview.test/api/v1/data-export',{headers:{Authorization:'Bearer '+personal.token,Origin:'https://app.cdinnov.eu'}})).status,403);
  const series={id:randomUUID(),issuerSiren:'732829320',kind:'invoice',prefix:'EVOL-',width:4,firstValue:1,startDate:'2020-01-01',endDate:'2099-12-31'};await createNumberSeries(ctx.db,series,users[0]);
  const f=await create({...quoteFixture(),kind:'invoice',issueDate:'2026-10-26',dueDate:'2026-11-25',validUntil:''},false),issue=await reserveIssuance(ctx.db,{id:randomUUID(),documentId:f.id,documentVersion:f.version,seriesId:series.id},users[0]),lease=randomUUID();await claimIssuanceJob(ctx.db,issue.id,lease,users[0]);const sha=createHash('sha256').update(bytes).digest('hex'),artifact={kind:'pdf',key:'billing/'+issue.id+'/pdf/'+sha,sha256:sha,size:bytes.length,contentType:'application/pdf'};await(await ctx.worker.getR2Bucket('CET_FILES')).put(artifact.key,bytes);await completeIssuanceJob(ctx.db,issue.id,lease,{schemaVersion:1,envelopeSha256:issue.envelopeSha256,generatorVersion:'test',profile:'invoice-pdf',artifacts:[artifact]},users[0]);
  const final=await(await call('/documents/'+f.id)).json(),payload={recipient:'client@example.test',subject:'Facture',message:'Bonjour'};
  r=await call('/documents/'+f.id+'/outlook-sent','POST',payload,{'If-Match':String(final.version)});assert.equal(r.status,200,await r.clone().text());const sent=await r.json();assert.ok(sent.sentAt);assert.equal(billingDisplayState(sent,'2026-10-26'),'sent');assert.deepEqual(sent.data,final.data);
  r=await call('/documents?kind=invoice&state=sent');assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).total,1);assert.equal((await(await call('/documents?kind=invoice&state=finalized')).json()).total,0);
  assert.equal((await call('/documents/'+f.id+'/outlook-sent','POST',payload,{'If-Match':String(final.version)})).status,200);assert.equal((await ctx.db.prepare('SELECT count(*) AS n FROM billing_email_deliveries').first()).n,1);
 }finally{await ctx.worker.dispose();}
});

test('engagement AI retains proven references and drops contradictions and inventions',async()=>{
 const text='Bon BC-2026-54. Total HT 1 200,00 EUR. Engagement Chorus ENG-42. Service Chorus SVC-01. Service Chorus SVC-02.';
 const ctx=await testEnvironment({ai:async()=>({response:JSON.stringify({facts:[{field:'reference',value:'BC-2026-54',quote:'Bon BC-2026-54.'},{field:'amountMinor',value:120000,quote:'Total HT 1 200,00 EUR.'},{field:'engagement',value:'ENG-42',quote:'Engagement Chorus ENG-42.'},{field:'serviceCode',value:'SVC-01',quote:'Service Chorus SVC-01.'},{field:'serviceCode',value:'SVC-02',quote:'Service Chorus SVC-02.'},{field:'marketReference',value:'invented',quote:'Not in document'}]})})});try{await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).token,{call}=await quoteFixtureTools(ctx,token);const r=await call('/engagement-analysis','POST',{text});assert.equal(r.status,200,await r.clone().text());assert.deepEqual((await r.json()).fields,{reference:'BC-2026-54',amountMinor:120000,engagement:'ENG-42'});}finally{await ctx.worker.dispose();}
});
