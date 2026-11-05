import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
import {emptyMarket} from '../marches/domain.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {migrateRh} from './rh-schema.mjs';
import {normalizeRhDraft,normalizeRhPayments,rhDefaultPayments,rhCompletePaymentSlots,rhPaymentsForAgent,rhIssues,rhLines} from './rh-domain.ts';
import ExcelJS from 'exceljs';

let checks=0,engineCalls=0;
const headOfficeSiret='12345678900011',payrollEstablishmentSiret='12345678900029';
const check=async(name,fn)=>{await fn();checks++;console.log('OK '+name);};
const ctx=await testEnvironment({bindings:{BILLING_PDF_SERVICE_URL:'https://rh-engine.test',BILLING_PDF_SERVICE_KEY:'x'.repeat(40)},outboundService:async request=>{
 assert.equal(new URL(request.url).origin,'https://rh-engine.test');const form=await request.formData(),payload=JSON.parse(form.get('payload'));assert.equal(payload.action,'extract');engineCalls++;const bytes=new Uint8Array(await form.get('file').arrayBuffer());
 return Response.json({ok:true,result:{fields:{employee_name:'Alex Test',period:'2026-01',document_type:'PAYSLIP',supplier_ref:payrollEstablishmentSiret},proofs:{employee_name:'Alex Test',period:'Janvier 2026'},bases:{EMPLOYER_COST:{amount_cents:432167,method:'monthly_total',evidence:'Total employeur 4 321,67'}},source_sha256:createHash('sha256').update(bytes).digest('hex'),algorithm:'fixture-extract-1',pages:[{width:600,height:800,method:'text'}],warnings:[],evidence:[]}});
}});
try{
 const admin=await ctx.login(users[0]),other=await ctx.login(users[1]);
 const call=async(path,options={})=>{if(options.body instanceof FormData){const r=new Request('https://preview.example',{method:'POST',body:options.body});options={...options,body:Buffer.from(await r.arrayBuffer()),headers:{...options.headers,'Content-Type':r.headers.get('content-type')}};}return ctx.worker.dispatchFetch('https://preview.example/api/v1/rh'+path,{...options,headers:{Origin:'http://127.0.0.1:5196','X-CDInnov-Request':'1','Content-Type':'application/json',Cookie:admin.cookie,...options.headers}});};
 const send=(method,path,body,version)=>call(path,{method,headers:version!==undefined?{'If-Match':String(version)}:{},body:JSON.stringify(body)});
 const read=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
 const upload=(path,parts,version)=>{const body=new FormData();for(const [key,value] of Object.entries(parts))body.append(key,value instanceof Blob?value:String(value),...(value instanceof Blob?[key==='file'?'bulletin-test.pdf':key==='excel'?'retour.xlsx':'retour.pdf']:[]));return call(path,{method:'POST',headers:{'If-Match':String(version)},body});};
 await check('Authorization, origin and explicit migration',async()=>{
  await read(await call('/documents',{headers:{Cookie:''}}),401);await read(await call('/documents',{headers:{Cookie:other.cookie}}),403);await read(await call('/documents',{headers:{Origin:'https://hostile.example'}}),403);await read(await call('/documents',{method:'POST',headers:{'X-CDInnov-Request':''},body:'{}'}),403);await read(await call('/documents'),503);
  await migrateBilling(ctx.db);await migrateRh(ctx.db);await migrateRh(ctx.db);assert.equal((await read(await call('/documents'))).documents.length,0);
 });
 const clientId='client-rh-test',otherClient='other-client-test',projectId='project-rh-test',foreignProject='project-foreign-test',agentId=randomUUID(),periodId=randomUUID(),documentId=randomUUID(),stamp=new Date().toISOString();
 for(const [id,name] of [[clientId,'Client de démonstration'],[otherClient,'Autre client fictif']])await ctx.db.prepare("INSERT INTO billing_directory VALUES('clients',?,1,?,?,?,'fixture',?,'fixture')").bind(id,JSON.stringify({archived:false,party:{name,siret:headOfficeSiret},logoData:''}),'hash-'+id,stamp,stamp).run();
 for(const [id,client,project] of [['market-rh-test',clientId,projectId],['market-other-test',otherClient,foreignProject]])await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(id,JSON.stringify({...emptyMarket(),title:'Marché fictif',clientId:client,clientName:'Client fictif',projects:[{id:project,name:'Projet fictif '+project,code:'IF TEST001',programme:'Interreg test',notes:'',archived:false,orders:[],clientIds:[client]}]}),stamp,'fixture').run();
 let doc,versionId,sourceId;
 await check('Shared agent creation and rate-free remembered link',async()=>{
  const person=await read(await send('POST',`/clients/${clientId}/agents`,{id:agentId,name:'Alex Test'},0),201);assert.equal(person.version,1);assert.equal(person.agent.allocations.length,0);
  const draft={id:documentId,name:'RH janvier — fictif',clientId,periods:[{id:periodId,projectId,startDate:'2026-01-01',endDate:'2026-01-31',agents:[{agentId,rateBasisPoints:null}]}]};doc=await read(await send('POST','/documents',draft),201);
  assert.equal((await read(await call(`/clients/${clientId}/agents`))).links[0].projectId,projectId);assert.equal((await read(await call(`/projects/${projectId}/agents`))).agents[0].id,agentId);
  assert.equal(JSON.parse((await ctx.db.prepare('SELECT data_json FROM client_employee_spaces WHERE client_id=?').bind(clientId).first()).data_json).agents.length,1);
  await read(await send('PUT',`/documents/${doc.id}`,{...doc.draft,periods:[{...doc.draft.periods[0],projectId:foreignProject}]},doc.version),422);
  await read(await send('POST',`/documents/${doc.id}/freeze`,{},doc.version),422);
 });
 await check('Document concurrency rollback and unmodified shared assignments',async()=>{
  const changed={...doc.draft,periods:doc.draft.periods.map(p=>({...p,agents:[{agentId,rateBasisPoints:3333}]}))};const results=await Promise.all([send('PUT',`/documents/${doc.id}`,changed,doc.version),send('PUT',`/documents/${doc.id}`,changed,doc.version)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);doc=await read(await call(`/documents/${doc.id}`));assert.equal(doc.version,2);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM rh_write_guards').first()).n,0);assert.equal((await read(await call(`/clients/${clientId}/agents`))).version,1);
 });
 await check('Oversized drafts are rejected before creation or update commits',async()=>{
  const agents=Array.from({length:11},(_,i)=>({id:randomUUID(),name:'Agent limite '+i,role:'',supervisor:'',allocations:[]}));
  await ctx.db.prepare('INSERT INTO client_employee_spaces VALUES(?,1,?,?,?)').bind(otherClient,JSON.stringify({agents,payments:[]}),stamp,'fixture').run();
  const oversizedId=randomUUID(),draft={id:oversizedId,name:'Plafond fictif',clientId:otherClient,periods:[{id:randomUUID(),projectId:foreignProject,startDate:'2026-01-01',endDate:'2035-12-31',agents:agents.map(a=>({agentId:a.id,rateBasisPoints:null}))}]};
  const rejected=await read(await send('POST','/documents',draft),422);assert.match(rejected.error,/1 200/);assert.equal(await ctx.db.prepare('SELECT id FROM rh_documents WHERE id=?').bind(oversizedId).first(),null);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM rh_document_history WHERE document_id=?').bind(oversizedId).first()).n,0);
  const valid=await read(await send('POST','/documents',{...draft,periods:draft.periods.map(p=>({...p,endDate:'2026-01-31'}))}),201);
  const update=await read(await send('PUT',`/documents/${valid.id}`,draft,valid.version),422);assert.match(update.error,/1 200/);
  const unchanged=await read(await call(`/documents/${valid.id}`));assert.equal(unchanged.version,valid.version);assert.deepEqual(unchanged.draft,valid.draft);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM rh_document_history WHERE document_id=?').bind(valid.id).first()).n,1);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM rh_write_guards').first()).n,0);
 });
 const pdf=new Blob(['%PDF-1.7\nSynthetic payroll fixture\n%%EOF'],{type:'application/pdf'});
 await check('PDF confirmation accepts another establishment SIRET without a reason, retaining agent/month/amount checks',async()=>{
  doc=await read(await upload(`/documents/${doc.id}/payroll`,{file:pdf},doc.version),201);sourceId=doc.payroll[0].id;assert.equal(engineCalls,1);assert.equal(doc.payroll[0].employerCostCents,432167);assert.equal(doc.payroll[0].agentId,agentId);assert.equal(doc.payroll[0].month,'2026-01');assert.equal(doc.payroll[0].confirmed,false);
  const same=await read(await upload(`/documents/${doc.id}/payroll`,{file:pdf},doc.version));assert.equal(same.duplicate,true);assert.equal(engineCalls,1);assert.equal(same.version,doc.version);
  await read(await send('PATCH',`/documents/${doc.id}/payroll/${sourceId}`,{agentId,month:'2026-02',confirmed:true},doc.version),422);
  await read(await send('PATCH',`/documents/${doc.id}/payroll/${sourceId}`,{agentId:randomUUID(),month:'2026-01',confirmed:true},doc.version),422);
  await read(await send('PATCH',`/documents/${doc.id}/payroll/${sourceId}`,{agentId,month:'2026-01',netBeforeTaxCents:-1,confirmed:true},doc.version),422);
  assert.equal((await read(await call('/context'))).clients.find(c=>c.id===clientId).siret,headOfficeSiret);assert.equal(doc.payroll[0].reading.fields.supplier_ref,payrollEstablishmentSiret);assert.notEqual(headOfficeSiret,payrollEstablishmentSiret);
  doc=await read(await send('PATCH',`/documents/${doc.id}/payroll/${sourceId}`,{agentId,month:'2026-01',netBeforeTaxCents:280000,employerCostCents:1,confirmed:true},doc.version));assert.equal(doc.payroll[0].confirmed,true);assert.equal(doc.payroll[0].identityReason,'');assert.equal(doc.payroll[0].employerCostCents,432167);assert.equal(doc.payroll[0].netBeforeTaxCents,280000);
  const source=await call(`/payroll/${sourceId}/source`);assert.equal(source.status,200);assert.deepEqual(Buffer.from(await source.arrayBuffer()),Buffer.from(await pdf.arrayBuffer()));
  const denied=await ctx.worker.dispatchFetch('https://preview.example/files/'+doc.payroll[0].objectKey,{headers:{Origin:'http://127.0.0.1:5196',Cookie:admin.cookie}});assert.equal(denied.status,403);
 });
 await check('Manual payments preserve partial entries and zero, validate scope and never certify a financial return',async()=>{
  const payments=rhDefaultPayments(doc.draft);assert.equal(payments.length,5);assert.ok(payments.every(p=>p.agentId===''));assert.deepEqual(payments,rhDefaultPayments({...doc.draft,periods:[...doc.draft.periods,...doc.draft.periods]}));payments[0].amountCents=0;payments[1].organism='Organisme fictif';
  doc=await read(await send('PUT',`/documents/${doc.id}`,{...doc.draft,payments},doc.version));assert.equal(doc.draft.payments[0].amountCents,0);assert.equal(doc.draft.payments[1].amountCents,null);assert.equal(doc.draft.payments[0].date,'');
  for(const change of [{month:'2026-02'},{agentId:randomUUID()},{date:'2026-02-30'},{amountCents:-1},{amountCents:''}])await read(await send('PUT',`/documents/${doc.id}`,{...doc.draft,payments:payments.map((p,i)=>i===0?{...p,...change}:p)},doc.version),422);
  await read(await send('PUT',`/documents/${doc.id}`,{...doc.draft,payments:[...payments,payments[0]]},doc.version),422);
  await read(await send('PUT',`/documents/${doc.id}`,{...doc.draft,periods:doc.draft.periods.map(p=>({...p,startDate:'2026-02-01',endDate:'2026-02-28'}))},doc.version),422);
  assert.equal((await read(await call(`/documents/${doc.id}`))).version,doc.version);
  const {payments:omitted,...oldClientDraft}=doc.draft;doc=await read(await send('PUT',`/documents/${doc.id}`,oldClientDraft,doc.version));assert.deepEqual(doc.draft.payments,payments);
  assert.equal((await ctx.db.prepare('SELECT count(*) n FROM rh_returns').first()).n,0);assert.deepEqual(JSON.parse((await ctx.db.prepare('SELECT data_json FROM client_employee_spaces WHERE client_id=?').bind(clientId).first()).data_json).payments,[]);
  const personal={...payments[0],id:'personal-salary',agentId,amountCents:123};const combined=normalizeRhPayments([...payments,personal],doc.draft.periods);const shown=rhPaymentsForAgent(combined,agentId,'2026-01');assert.equal(shown.filter(p=>p.kind==='salary').length,1);assert.equal(shown.find(p=>p.kind==='salary').id,'personal-salary');assert.equal(shown.filter(p=>p.kind==='contribution').length,4);
 });
 await check('Frozen exact cents, source hash and immutable history',async()=>{
  const frozen=await read(await send('POST',`/documents/${doc.id}/freeze`,{},doc.version),201);versionId=frozen.version.id;doc=frozen.document;assert.equal(frozen.version.lines[0].allocatedCents,Math.round(432167*3333/10000));assert.equal(frozen.version.payroll[0].sha256,createHash('sha256').update(Buffer.from(await pdf.arrayBuffer())).digest('hex'));
  assert.deepEqual(frozen.version.payments,doc.draft.payments);assert.equal(frozen.version.payments[0].amountCents,0);
  await assert.rejects(ctx.db.prepare("UPDATE rh_versions SET data_json='{}' WHERE id=?").bind(versionId).run(),/IMMUTABLE/);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM rh_payroll_history WHERE payroll_id=?').bind(sourceId).first()).n,2);
  doc=await read(await send('PUT',`/documents/${doc.id}`,{...doc.draft,name:'Brouillon modifié'},doc.version));assert.equal((await read(await call(`/versions/${versionId}`))).snapshot.name,'RH janvier — fictif');
 });
 await check('Reopening financial entry preserves newer drafts and rejects stale RH or payroll versions',async()=>{
  const path=`/versions/${versionId}`,before=JSON.stringify((await read(await call(path))).snapshot);assert.equal((await read(await call(path))).canReopen,false);await read(await send('POST',path+'/reopen',{},doc.version),409);
  doc=await read(await send('PUT',`/documents/${doc.id}`,{...doc.draft,name:'RH janvier — fictif'},doc.version));const view=await read(await call(path));assert.equal(view.canReopen,true);assert.equal(view.documentVersion,doc.version);assert.equal(view.paymentSource,'snapshot');assert.equal(view.currentPayments.length,5);
  await read(await send('POST',path+'/reopen',{},doc.version-1),409);const attempts=await Promise.all([send('POST',path+'/reopen',{},doc.version),send('POST',path+'/reopen',{},doc.version)]);assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);doc=await read(await call(`/documents/${doc.id}`));
  doc=await read(await send('PUT',`/documents/${doc.id}`,{...doc.draft,payments:doc.draft.payments.map((p,i)=>i===0?{...p,amountCents:125000,date:'2026-02-02',reference:'MANUEL'}:p)},doc.version));const preserved=await read(await send('POST',path+'/reopen',{},doc.version));assert.equal(preserved.paymentDraftPreserved,true);assert.equal(preserved.draft.payments[0].amountCents,125000);doc=preserved;
  doc=await read(await send('PATCH',`/documents/${doc.id}/payroll/${sourceId}`,{agentId,month:'2026-01',netBeforeTaxCents:280001,confirmed:true},doc.version));assert.equal((await read(await call(path))).canReopen,false);await read(await send('POST',path+'/reopen',{},doc.version),409);
  doc=await read(await send('PATCH',`/documents/${doc.id}/payroll/${sourceId}`,{agentId,month:'2026-01',netBeforeTaxCents:280000,confirmed:true},doc.version));assert.equal((await read(await call(path))).canReopen,true);assert.equal(JSON.stringify((await read(await call(path))).snapshot),before);
 });
 await check('Future documents reuse shared agents and confirmed PDFs without uploading',async()=>{
  const available=await read(await call(`/clients/${clientId}/payroll`));assert.equal(available.payroll[0].id,sourceId);
  const next=await read(await send('POST','/documents',{name:'Réemploi fictif',clientId,periods:doc.draft.periods}),201);const reused=await read(await send('POST',`/documents/${next.id}/reuse-payroll`,{payrollIds:[sourceId]},next.version));assert.equal(reused.payroll.length,1);assert.equal(reused.payroll[0].objectKey,doc.payroll[0].objectKey);await read(await send('POST',`/documents/${next.id}/freeze`,{},reused.version),422);
 });
 await check('V3 financial return remains external, PDF-only is pending, original retained',async()=>{
  const exported=await call(`/versions/${versionId}/export`);assert.equal(exported.status,200);const bytes=new Uint8Array(await exported.arrayBuffer());assert.equal(bytes[0],80);
  const result=await read(await upload(`/versions/${versionId}/returns`,{signedPdf:pdf}),201);assert.equal(result.status,'received');assert.equal(result.inspection.complete,false);await read(await send('POST',`/versions/${versionId}/returns/${result.id}/validate`,{signatureReviewed:true,concordanceReviewed:true}),422);
  const original=await call(`/versions/${versionId}/returns/${result.id}/files/0`);assert.equal(original.status,200);assert.deepEqual(Buffer.from(await original.arrayBuffer()),Buffer.from(await pdf.arrayBuffer()));
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);assert.equal(workbook.getWorksheet('_CDI_RH').getCell('A1').value,'CDINNOV_RH_3');assert.equal(workbook.getWorksheet('Paiements'),undefined);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM rh_returns').first()).n,1);
  const salaryId='payment-2026-01-salary',chargesId='payment-2026-01-contribution-1';let filled=0;
  for(const sheet of workbook.worksheets)for(let row=1;row<=sheet.rowCount;row++){
   if(sheet.getCell(row,14).value===salaryId){sheet.getCell(row,7).value='MANDAT-SALAIRE';sheet.getCell(row,8).value=new Date('2026-02-04T00:00:00Z');sheet.getCell(row,9).value=2800;filled++;}
   if(sheet.getCell(row,15).value===chargesId){sheet.getCell(row,10).value='Organisme fictif';sheet.getCell(row,11).value=500;sheet.getCell(row,12).value=new Date('2026-02-04T00:00:00Z');filled++;}
  }assert.equal(filled,2);
  const completed=await read(await upload(`/versions/${versionId}/returns`,{signedPdf:pdf,excel:new Blob([await workbook.xlsx.writeBuffer()])}),201);assert.equal(completed.inspection.complete,true,JSON.stringify(completed.inspection));assert.equal(completed.inspection.payments.length,2);
  await read(await send('POST',`/versions/${versionId}/returns/${completed.id}/validate`,{signatureReviewed:true}),422);
  const accepted=await read(await send('POST',`/versions/${versionId}/returns/${completed.id}/validate`,{signatureReviewed:true,concordanceReviewed:true}));assert.equal(accepted.status,'validated');assert.equal(accepted.inspection.payments.find(p=>p.kind==='salary').amountCents,280000);assert.ok(accepted.inspection.payments.every(p=>p.agentId===''));assert.equal(accepted.inspection.payments.find(p=>p.kind==='contribution').reference,'');
  const frozenBefore=JSON.stringify((await read(await call(`/versions/${versionId}`))).snapshot);workbook.worksheets[0].getCell('A4').value='Version altérée';
  const modified=await read(await upload(`/versions/${versionId}/returns`,{signedPdf:pdf,excel:new Blob([await workbook.xlsx.writeBuffer()])}),201);assert.equal(modified.inspection.complete,false);await read(await send('POST',`/versions/${versionId}/returns/${modified.id}/validate`,{signatureReviewed:true,concordanceReviewed:true}),422);assert.equal(JSON.stringify((await read(await call(`/versions/${versionId}`))).snapshot),frozenBefore);
 });
 await check('Validated returns overlay fixed slots without adding them, manual corrections create a new unsigned RH revision',async()=>{
  const path=`/versions/${versionId}`,view=await read(await call(path)),original=JSON.stringify(view.snapshot);assert.equal(view.paymentSource,'validated-return');assert.equal(view.currentPayments.length,5);assert.equal(view.currentPayments[0].amountCents,280000);assert.equal(view.currentPayments[1].amountCents,50000);assert.equal(view.currentPayments[2].amountCents,null);assert.equal(view.snapshot.payments[0].amountCents,0);
  const receipt=await ctx.db.prepare('SELECT * FROM rh_returns WHERE id=?').bind(view.paymentReturnId).first(),receiptJSON=JSON.stringify(receipt);
  const exported=await call(path+'/export'),wb=new ExcelJS.Workbook();await wb.xlsx.load(await exported.arrayBuffer());let salary=0;for(const sheet of wb.worksheets)for(let row=1;row<=sheet.rowCount;row++)if(sheet.getCell(row,14).value==='payment-2026-01-salary'){assert.equal(sheet.getCell(row,9).value,2800);salary++;}assert.equal(salary,1);
  const kept=await read(await send('POST',path+'/reopen',{},doc.version));assert.equal(kept.paymentDraftPreserved,true);assert.equal(kept.draft.payments[0].amountCents,125000);doc=kept;
  doc=await read(await send('PUT',`/documents/${doc.id}`,{...doc.draft,payments:view.snapshot.payments},doc.version));doc=await read(await send('POST',path+'/reopen',{},doc.version));assert.equal(doc.paymentDraftPreserved,false);assert.equal(doc.draft.payments[0].amountCents,280000);
  doc=await read(await send('PUT',`/documents/${doc.id}`,{...doc.draft,payments:doc.draft.payments.map((p,i)=>i===0?{...p,amountCents:285000,reference:'CORRECTION MANUELLE'}:p)},doc.version));assert.equal((await read(await call(path))).currentPayments[0].amountCents,280000);
  const revised=await read(await send('POST',`/documents/${doc.id}/freeze`,{},doc.version),201);doc=revised.document;assert.equal(revised.version.revision,2);assert.equal(revised.version.payments[0].amountCents,285000);
  const next=await read(await call(`/versions/${revised.version.id}`));assert.equal(next.paymentSource,'snapshot');assert.equal(next.returns.length,0);assert.equal(next.currentPayments[0].amountCents,285000);assert.equal(next.currentPayments[0].signatureReviewed,undefined);
  assert.equal((await read(await call(path))).canReopen,false);await read(await send('POST',path+'/reopen',{},doc.version),409);assert.equal(JSON.stringify((await read(await call(path))).snapshot),original);assert.equal(JSON.stringify(await ctx.db.prepare('SELECT * FROM rh_returns WHERE id=?').bind(view.paymentReturnId).first()),receiptJSON);
 });
 await check('A validated return can clear a previously filled slot without resurrecting or doubling its amount',async()=>{
  const extra={id:'second-salary',agentId:'',month:'2026-01',kind:'salary',organism:'',amountCents:null,date:'',reference:''};
  doc=await read(await send('PUT',`/documents/${doc.id}`,{...doc.draft,payments:[...doc.draft.payments,extra]},doc.version));const frozen=await read(await send('POST',`/documents/${doc.id}/freeze`,{},doc.version),201);doc=frozen.document;const path=`/versions/${frozen.version.id}`,wb=new ExcelJS.Workbook();await wb.xlsx.load(await(await call(path+'/export')).arrayBuffer());
  for(const sheet of wb.worksheets)for(let row=1;row<=sheet.rowCount;row++){
   if(sheet.getCell(row,14).value==='payment-2026-01-salary')for(const col of [7,8,9])sheet.getCell(row,col).value=null;
   if(sheet.getCell(row,14).value===extra.id){sheet.getCell(row,7).value='REMPLACE LE VERSEMENT';sheet.getCell(row,8).value=new Date('2026-02-08T00:00:00Z');sheet.getCell(row,9).value=2800;}
  }
  const received=await read(await upload(path+'/returns',{signedPdf:pdf,excel:new Blob([await wb.xlsx.writeBuffer()])}),201);assert.equal(received.inspection.complete,true,JSON.stringify(received.inspection));await read(await send('POST',path+'/returns/'+received.id+'/validate',{signatureReviewed:true,concordanceReviewed:true}));
  const view=await read(await call(path));assert.equal(view.currentPayments.length,6);assert.equal(view.snapshot.payments[0].amountCents,285000);assert.equal(view.currentPayments[0].amountCents,null);assert.equal(view.currentPayments[0].reference,'');assert.equal(view.currentPayments.find(p=>p.id===extra.id).amountCents,280000);assert.equal(view.currentPayments.filter(p=>p.kind==='salary').reduce((sum,p)=>sum+(p.amountCents||0),0),280000);
 });
 await check('Historical archives keep V1 exports and individual financial returns, reopening adds editable slots',async()=>{
  let legacy=await read(await send('POST','/documents',{name:'Archive historique fictive',clientId,periods:doc.draft.periods}),201);legacy=await read(await send('POST',`/documents/${legacy.id}/reuse-payroll`,{payrollIds:[sourceId]},legacy.version));
  const {payments:removed,...basis}=(await read(await call(`/versions/${versionId}`))).snapshot,legacyVersion=randomUUID(),historical={...basis,id:legacyVersion,documentId:legacy.id,name:legacy.draft.name,revision:1,payroll:legacy.payroll,lines:rhLines(legacy.draft,legacy.payroll)};
  await ctx.db.prepare('INSERT INTO rh_versions VALUES(?,?,?,?,?,?,?)').bind(legacyVersion,legacy.id,clientId,1,JSON.stringify(historical),historical.createdAt,'fixture').run();const path=`/versions/${legacyVersion}`;
  legacy=await read(await send('POST',path+'/reopen',{},legacy.version));assert.equal(legacy.draft.payments.length,5);assert.ok(legacy.draft.payments.every(p=>p.agentId===''&&p.amountCents===null));
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await(await call(path+'/export')).arrayBuffer());const sheet=workbook.getWorksheet('Paiements');assert.ok(sheet);assert.equal(workbook.getWorksheet('_CDI_RH').getCell('A1').value,'CDINNOV_RH_1');
  for(const row of [10,11]){sheet.getCell(row,5).value=row===11?'Organisme historique':'';sheet.getCell(row,6).value=row===11?400:2700;sheet.getCell(row,7).value=new Date('2026-02-06T00:00:00Z');sheet.getCell(row,8).value='HISTORIQUE-'+row;}
  const returned=await read(await upload(path+'/returns',{signedPdf:pdf,excel:new Blob([await workbook.xlsx.writeBuffer()])}),201);assert.equal(returned.inspection.complete,true,JSON.stringify(returned.inspection));await read(await send('POST',path+'/returns/'+returned.id+'/validate',{signatureReviewed:true,concordanceReviewed:true}));
  const view=await read(await call(path));assert.equal(view.snapshot.payments,undefined);assert.equal(view.paymentSource,'validated-return');assert.equal(view.currentPayments.length,2);assert.ok(view.currentPayments.every(p=>p.agentId===agentId));
  const reexport=new ExcelJS.Workbook();await reexport.xlsx.load(await(await call(path+'/export')).arrayBuffer());assert.equal(reexport.getWorksheet('Paiements').getCell(10,6).value,2700);
  legacy=await read(await send('POST',path+'/reopen',{},legacy.version));assert.equal(legacy.paymentDraftPreserved,false);assert.equal(legacy.draft.payments.length,7);assert.equal(rhPaymentsForAgent(legacy.draft.payments,agentId,'2026-01').find(p=>p.kind==='salary').amountCents,270000);assert.equal(JSON.stringify((await read(await call(path))).snapshot),JSON.stringify(historical));
 });
 await check('Explicit zero financial returns need no invented date, mandate or organism and still need signature review',async()=>{
  const id=doc.versions[0].id,path=`/versions/${id}`,wb=new ExcelJS.Workbook();await wb.xlsx.load(await(await call(path+'/export')).arrayBuffer());
  for(const sheet of wb.worksheets)for(let row=1;row<=sheet.rowCount;row++){
   const salary=sheet.getCell(row,14).value,charges=sheet.getCell(row,15).value;
   if(salary==='payment-2026-01-salary'||salary==='second-salary'){for(const col of [7,8,9])sheet.getCell(row,col).value=null;if(salary==='payment-2026-01-salary')sheet.getCell(row,9).value=0;}
   if(charges==='payment-2026-01-contribution-1'){for(const col of [10,11,12])sheet.getCell(row,col).value=null;sheet.getCell(row,11).value=0;}
  }
  const returned=await read(await upload(path+'/returns',{signedPdf:pdf,excel:new Blob([await wb.xlsx.writeBuffer()])}),201);assert.equal(returned.inspection.complete,true,JSON.stringify(returned.inspection));assert.equal(returned.inspection.payments.length,2);assert.ok(returned.inspection.payments.every(p=>p.amountCents===0&&p.date===''));
  await read(await send('POST',path+'/returns/'+returned.id+'/validate',{signatureReviewed:true}),422);await read(await send('POST',path+'/returns/'+returned.id+'/validate',{signatureReviewed:true,concordanceReviewed:true}));const current=(await read(await call(path))).currentPayments;assert.equal(current.find(p=>p.id==='payment-2026-01-salary').amountCents,0);assert.equal(current.find(p=>p.id==='payment-2026-01-contribution-1').amountCents,0);assert.equal(current.find(p=>p.id==='second-salary').amountCents,null);
 });
 await check('Domain rejects invented partial months, duplicate agent/project months and overallocations',async()=>{
  const base={name:'Test',clientId,periods:[{id:periodId,projectId,startDate:'2026-01-01',endDate:'2026-01-31',agents:[{agentId,rateBasisPoints:5000}]}]};assert.throws(()=>normalizeRhDraft({...base,periods:[{...base.periods[0],startDate:'2026-01-02'}]}));assert.throws(()=>normalizeRhDraft({...base,periods:[...base.periods,{...base.periods[0],id:randomUUID()}]}));
  const files=[{id:sourceId,agentId,month:'2026-01',confirmed:true,employerCostCents:432167,netBeforeTaxCents:null}];assert.equal(rhLines(base,files)[0].allocatedCents,216084);assert.ok(rhIssues(base,files,[{id:agentId,name:'Alex Test',allocations:[{projectId:'elsewhere',percent:'60',startDate:'2026-01-01',endDate:'2026-01-31'}]}]).some(s=>s.includes('100')));
  const blank=rhDefaultPayments(base),extended={...base,periods:base.periods.map(p=>({...p,endDate:'2026-02-28'})),payments:blank};assert.equal(rhCompletePaymentSlots(extended).length,10);assert.equal(rhCompletePaymentSlots({...base,payments:[]}).length,5);assert.equal(normalizeRhDraft({...base,periods:base.periods.map(p=>({...p,startDate:'2026-02-01',endDate:'2026-02-28'})),payments:blank}).payments.length,5);assert.throws(()=>normalizeRhDraft({...extended,periods:extended.periods.map(p=>({...p,startDate:'2026-02-01'})),payments:blank.map((p,i)=>i===0?{...p,amountCents:0}:p)}));
 });
 console.log(JSON.stringify({checks,engineCalls,status:'passed',environment:'isolated D1/R2 with synthetic payroll engine'}));
}finally{await ctx.worker.dispose();}
