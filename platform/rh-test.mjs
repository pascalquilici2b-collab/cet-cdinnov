import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
import {emptyMarket} from '../marches/domain.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {migrateRh} from './rh-schema.mjs';
import {normalizeRhDraft,rhIssues,rhLines} from './rh-domain.ts';
import ExcelJS from 'exceljs';

let checks=0,engineCalls=0;
const check=async(name,fn)=>{await fn();checks++;console.log('OK '+name);};
const ctx=await testEnvironment({bindings:{BILLING_PDF_SERVICE_URL:'https://rh-engine.test',BILLING_PDF_SERVICE_KEY:'x'.repeat(40)},outboundService:async request=>{
 assert.equal(new URL(request.url).origin,'https://rh-engine.test');const form=await request.formData(),payload=JSON.parse(form.get('payload'));assert.equal(payload.action,'extract');engineCalls++;const bytes=new Uint8Array(await form.get('file').arrayBuffer());
 return Response.json({ok:true,result:{fields:{employee_name:'Alex Test',period:'2026-01',document_type:'PAYSLIP'},proofs:{employee_name:'Alex Test',period:'Janvier 2026'},bases:{EMPLOYER_COST:{amount_cents:432167,method:'monthly_total',evidence:'Total employeur 4 321,67'}},source_sha256:createHash('sha256').update(bytes).digest('hex'),algorithm:'fixture-extract-1',pages:[{width:600,height:800,method:'text'}],warnings:[],evidence:[]}});
}});
try{
 const admin=await ctx.login(users[0]),other=await ctx.login(users[1]);
 const call=async(path,options={})=>{if(options.body instanceof FormData){const r=new Request('https://preview.example',{method:'POST',body:options.body});options={...options,body:Buffer.from(await r.arrayBuffer()),headers:{...options.headers,'Content-Type':r.headers.get('content-type')}};}return ctx.worker.dispatchFetch('https://preview.example/api/v1/rh'+path,{...options,headers:{Origin:'http://127.0.0.1:5196','Content-Type':'application/json',Authorization:'Bearer '+admin.token,...options.headers}});};
 const send=(method,path,body,version)=>call(path,{method,headers:version!==undefined?{'If-Match':String(version)}:{},body:JSON.stringify(body)});
 const read=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
 const upload=(path,parts,version)=>{const body=new FormData();for(const [key,value] of Object.entries(parts))body.append(key,value instanceof Blob?value:String(value),...(value instanceof Blob?[key==='file'?'bulletin-test.pdf':key==='excel'?'retour.xlsx':'retour.pdf']:[]));return call(path,{method:'POST',headers:{'If-Match':String(version)},body});};
 await check('Authorization, origin and explicit migration',async()=>{
  await read(await call('/documents',{headers:{Authorization:''}}),401);await read(await call('/documents',{headers:{Authorization:'Bearer '+other.token}}),403);await read(await call('/documents',{headers:{Origin:'https://hostile.example'}}),403);await read(await call('/documents'),503);
  await migrateBilling(ctx.db);await migrateRh(ctx.db);await migrateRh(ctx.db);assert.equal((await read(await call('/documents'))).documents.length,0);
 });
 const clientId='client-rh-test',otherClient='other-client-test',projectId='project-rh-test',foreignProject='project-foreign-test',agentId=randomUUID(),periodId=randomUUID(),documentId=randomUUID(),stamp=new Date().toISOString();
 for(const [id,name] of [[clientId,'Client de démonstration'],[otherClient,'Autre client fictif']])await ctx.db.prepare("INSERT INTO billing_directory VALUES('clients',?,1,?,?,?,'fixture',?,'fixture')").bind(id,JSON.stringify({archived:false,party:{name},logoData:''}),'hash-'+id,stamp,stamp).run();
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
 await check('PDF intake, deduplication, server extraction and controlled confirmation',async()=>{
  doc=await read(await upload(`/documents/${doc.id}/payroll`,{file:pdf},doc.version),201);sourceId=doc.payroll[0].id;assert.equal(engineCalls,1);assert.equal(doc.payroll[0].employerCostCents,432167);assert.equal(doc.payroll[0].agentId,agentId);assert.equal(doc.payroll[0].month,'2026-01');assert.equal(doc.payroll[0].confirmed,false);
  const same=await read(await upload(`/documents/${doc.id}/payroll`,{file:pdf},doc.version));assert.equal(same.duplicate,true);assert.equal(engineCalls,1);assert.equal(same.version,doc.version);
  await read(await send('PATCH',`/documents/${doc.id}/payroll/${sourceId}`,{agentId,month:'2026-02',confirmed:true},doc.version),422);
  doc=await read(await send('PATCH',`/documents/${doc.id}/payroll/${sourceId}`,{agentId,month:'2026-01',netBeforeTaxCents:280000,employerCostCents:1,confirmed:true},doc.version));assert.equal(doc.payroll[0].employerCostCents,432167);assert.equal(doc.payroll[0].netBeforeTaxCents,280000);
  const source=await call(`/payroll/${sourceId}/source`);assert.equal(source.status,200);assert.deepEqual(Buffer.from(await source.arrayBuffer()),Buffer.from(await pdf.arrayBuffer()));
  const denied=await ctx.worker.dispatchFetch('https://preview.example/files/'+doc.payroll[0].objectKey,{headers:{Origin:'http://127.0.0.1:5196',Authorization:'Bearer '+admin.token}});assert.equal(denied.status,403);
 });
 await check('Frozen exact cents, source hash and immutable history',async()=>{
  const frozen=await read(await send('POST',`/documents/${doc.id}/freeze`,{},doc.version),201);versionId=frozen.version.id;doc=frozen.document;assert.equal(frozen.version.lines[0].allocatedCents,Math.round(432167*3333/10000));assert.equal(frozen.version.payroll[0].sha256,createHash('sha256').update(Buffer.from(await pdf.arrayBuffer())).digest('hex'));
  await assert.rejects(ctx.db.prepare("UPDATE rh_versions SET data_json='{}' WHERE id=?").bind(versionId).run(),/IMMUTABLE/);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM rh_payroll_history WHERE payroll_id=?').bind(sourceId).first()).n,2);
  doc=await read(await send('PUT',`/documents/${doc.id}`,{...doc.draft,name:'Brouillon modifié'},doc.version));assert.equal((await read(await call(`/versions/${versionId}`))).snapshot.name,'RH janvier — fictif');
 });
 await check('Future documents reuse shared agents and confirmed PDFs without uploading',async()=>{
  const available=await read(await call(`/clients/${clientId}/payroll`));assert.equal(available.payroll[0].id,sourceId);
  const next=await read(await send('POST','/documents',{name:'Réemploi fictif',clientId,periods:doc.draft.periods}),201);const reused=await read(await send('POST',`/documents/${next.id}/reuse-payroll`,{payrollIds:[sourceId]},next.version));assert.equal(reused.payroll.length,1);assert.equal(reused.payroll[0].objectKey,doc.payroll[0].objectKey);await read(await send('POST',`/documents/${next.id}/freeze`,{},reused.version),422);
 });
 await check('Financial return remains external, PDF-only is pending, original retained',async()=>{
  const exported=await call(`/versions/${versionId}/export`);assert.equal(exported.status,200);const bytes=new Uint8Array(await exported.arrayBuffer());assert.equal(bytes[0],80);
  const result=await read(await upload(`/versions/${versionId}/returns`,{signedPdf:pdf}),201);assert.equal(result.status,'received');assert.equal(result.inspection.complete,false);await read(await send('POST',`/versions/${versionId}/returns/${result.id}/validate`,{signatureReviewed:true,concordanceReviewed:true}),422);
  const original=await call(`/versions/${versionId}/returns/${result.id}/files/0`);assert.equal(original.status,200);assert.deepEqual(Buffer.from(await original.arrayBuffer()),Buffer.from(await pdf.arrayBuffer()));
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);assert.ok(workbook.getWorksheet('Paiements'));assert.equal((await ctx.db.prepare('SELECT count(*) n FROM rh_returns').first()).n,1);
  const sheet=workbook.getWorksheet('Paiements');for(const row of [10,11]){sheet.getCell(row,5).value=row===11?'Organisme fictif':'';sheet.getCell(row,6).value=row===11?500:2800;sheet.getCell(row,7).value=new Date('2026-02-04T00:00:00Z');sheet.getCell(row,8).value='MANDAT-'+row;}
  const completed=await read(await upload(`/versions/${versionId}/returns`,{signedPdf:pdf,excel:new Blob([await workbook.xlsx.writeBuffer()])}),201);assert.equal(completed.inspection.complete,true,JSON.stringify(completed.inspection));assert.equal(completed.inspection.payments.length,2);
  await read(await send('POST',`/versions/${versionId}/returns/${completed.id}/validate`,{signatureReviewed:true}),422);
  const accepted=await read(await send('POST',`/versions/${versionId}/returns/${completed.id}/validate`,{signatureReviewed:true,concordanceReviewed:true}));assert.equal(accepted.status,'validated');assert.equal(accepted.inspection.payments[0].amountCents,280000);
  const frozenBefore=JSON.stringify((await read(await call(`/versions/${versionId}`))).snapshot);workbook.worksheets.find(s=>s.name.startsWith('RH ')).getCell('A4').value='Version altérée';
  const modified=await read(await upload(`/versions/${versionId}/returns`,{signedPdf:pdf,excel:new Blob([await workbook.xlsx.writeBuffer()])}),201);assert.equal(modified.inspection.complete,false);await read(await send('POST',`/versions/${versionId}/returns/${modified.id}/validate`,{signatureReviewed:true,concordanceReviewed:true}),422);assert.equal(JSON.stringify((await read(await call(`/versions/${versionId}`))).snapshot),frozenBefore);
 });
 await check('Domain rejects invented partial months, duplicate agent/project months and overallocations',async()=>{
  const base={name:'Test',clientId,periods:[{id:periodId,projectId,startDate:'2026-01-01',endDate:'2026-01-31',agents:[{agentId,rateBasisPoints:5000}]}]};assert.throws(()=>normalizeRhDraft({...base,periods:[{...base.periods[0],startDate:'2026-01-02'}]}));assert.throws(()=>normalizeRhDraft({...base,periods:[...base.periods,{...base.periods[0],id:randomUUID()}]}));
  const files=[{id:sourceId,agentId,month:'2026-01',confirmed:true,employerCostCents:432167,netBeforeTaxCents:null}];assert.equal(rhLines(base,files)[0].allocatedCents,216084);assert.ok(rhIssues(base,files,[{id:agentId,name:'Alex Test',allocations:[{projectId:'elsewhere',percent:'60',startDate:'2026-01-01',endDate:'2026-01-31'}]}]).some(s=>s.includes('100')));
 });
 console.log(JSON.stringify({checks,engineCalls,status:'passed',environment:'isolated D1/R2 with synthetic payroll engine'}));
}finally{await ctx.worker.dispose();}
