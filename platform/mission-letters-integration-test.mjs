import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {testEnvironment,users} from '../marches/test.mjs';
import {emptyMarket} from '../marches/domain.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {migrateRh} from './rh-schema.mjs';
import {blankClient} from './billing-directory-domain.ts';

// Independent integration coverage: real cookie authorization, Worker, D1 and R2.
// Payroll recognition alone is a deterministic local fixture; no production services.
const out='.private/mission-letters-integration';await mkdir(out,{recursive:true});
// This wrapper is compiled only into the isolated fixture Worker. It injects a
// concurrent revision after the real R2 write, before the real D1 transaction.
const built=(await build({entryPoints:['platform/worker.ts'],bundle:true,platform:'node',format:'esm',write:false})).outputFiles[0].text,workerExport=built.match(/(\w+) as default/);assert.ok(workerExport);
const isolatedWorker=built.replace(workerExport[0],'mission_race_test as default').replace('export {',`const mission_race_test={...${workerExport[1]},fetch(request,env,ctx){
 const mode=request.headers.get('X-Mission-Test-Race');
 if(mode&&new URL(request.url).pathname==='/api/v1/rh/missions/archive'){
  const original=env.CET_FILES;
  env={...env,CET_FILES:new Proxy(original,{get(target,key){if(key==='put')return async(...args)=>{const result=await target.put(...args);const id=request.headers.get('X-Mission-Test-Id');await env.BUDGETS_DB.prepare(mode==='source'?'UPDATE rh_documents SET version=version+1 WHERE id=?':mode==='client'?'UPDATE billing_directory SET version=version+1 WHERE id=?': 'UPDATE client_employee_spaces SET version=version+1 WHERE client_id=?').bind(id).run();return result;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}})};
 }
 return ${workerExport[1]}.fetch(request,env,ctx);
}};\nexport {`);
const isolatedPath=fileURLToPath(new URL('../'+out+'/worker.mjs',import.meta.url));await writeFile(isolatedPath,isolatedWorker);const previousWorker=process.env.MARCHES_TEST_WORKER;process.env.MARCHES_TEST_WORKER=isolatedPath;
const ctx=await testEnvironment({bindings:{BILLING_PDF_SERVICE_URL:'https://mission-engine.test',BILLING_PDF_SERVICE_KEY:'x'.repeat(40)},outboundService:async request=>{
 assert.equal(new URL(request.url).origin,'https://mission-engine.test');const form=await request.formData(),bytes=Buffer.from(await form.get('file').arrayBuffer()),fixture=JSON.parse(bytes.toString().split('\n')[1]);
 return Response.json({ok:true,result:{fields:{employee_name:fixture.name,period:fixture.month,document_type:'PAYSLIP'},bases:{EMPLOYER_COST:{amount_cents:400000,method:'monthly_total',evidence:'Total employeur 4 000,00'}},source_sha256:createHash('sha256').update(bytes).digest('hex'),algorithm:'mission-fixture-1',pages:[{width:600,height:800,method:'text'}],warnings:[],evidence:[]}});
}});
if(previousWorker===undefined)delete process.env.MARCHES_TEST_WORKER;else process.env.MARCHES_TEST_WORKER=previousWorker;
let checks=0;const results=[];const check=async(name,fn)=>{await fn();results.push(name);checks++;console.log('OK '+name);};
try{
 await migrateBilling(ctx.db);await migrateRh(ctx.db);const admin=await ctx.login(users[0]),denied=await ctx.login(users[1]);
 const api=async(path,method='GET',body,version,extra={})=>{
  const headers={Cookie:admin.cookie,Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1',...(version===undefined?{}:{'If-Match':String(version)}),...extra};let payload;
  if(body instanceof FormData){const encoded=new Request('http://local',{method:'POST',body});headers['Content-Type']=encoded.headers.get('content-type');payload=Buffer.from(await encoded.arrayBuffer());}
  else if(body!==undefined){headers['Content-Type']='application/json';payload=JSON.stringify(body);}
  return ctx.worker.dispatchFetch('https://preview.example'+path,{method,headers,...(payload===undefined?{}:{body:payload})});
 };
 const read=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
 const rejected=async(response,pattern)=>{assert.ok([400,404,409,422].includes(response.status),await response.clone().text());const data=await response.json();if(pattern)assert.match(data.error,pattern);return data;};
 const clientId=randomUUID(),otherClient=randomUUID(),projectId=randomUUID(),secondProject=randomUUID(),foreignProject=randomUUID(),agentId=randomUUID(),samId=randomUUID(),now=new Date().toISOString();
 const client=blankClient();client.party.name='Entité fictive source missions';const other=blankClient();other.party.name='Autre entité fictive';
 await read(await api('/api/v1/billing/clients','POST',{id:clientId,data:client}),201);await read(await api('/api/v1/billing/clients','POST',{id:otherClient,data:other}),201);
 for(const [owner,ids] of [[clientId,[projectId,secondProject]],[otherClient,[foreignProject]]])await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(randomUUID(),JSON.stringify({...emptyMarket(),title:'Marché source fictif',clientId:owner,clientName:owner===clientId?client.party.name:other.party.name,projects:ids.map((id,i)=>({id,name:'Projet source '+i,code:'IF TEST '+i,programme:'Interreg test',clientIds:[owner],notes:'',archived:false,orders:[]}))}),now,'fixture').run();
 const people=[{id:agentId,name:'Alex Source',role:'Poste organisme fictif',supervisor:'',allocations:[]},{id:samId,name:'Sam Source',role:'Autre poste',supervisor:'',allocations:[]}];
 let common=await read(await api('/api/v1/billing/client-employees/'+clientId,'PUT',{agents:people,payments:[]},0));
 const period=(project,startDate,endDate,members)=>({id:randomUUID(),projectId:project,startDate,endDate,agents:members.map(([agentId,rateBasisPoints])=>({agentId,rateBasisPoints}))});
 let doc=await read(await api('/api/v1/rh/documents','POST',{name:'Source RH à taux variables',clientId,periods:[period(projectId,'2026-01-01','2026-01-31',[[agentId,2500],[samId,1000]]),period(projectId,'2026-02-01','2026-03-31',[[agentId,5000]]),period(projectId,'2026-05-01','2026-05-31',[[agentId,2500]]),period(secondProject,'2026-01-01','2026-01-31',[[samId,2000]])]}),201);
 const sharedState=async()=>JSON.stringify({space:await ctx.db.prepare('SELECT * FROM client_employee_spaces WHERE client_id=?').bind(clientId).first(),history:(await ctx.db.prepare('SELECT * FROM client_employee_versions WHERE client_id=? ORDER BY version').bind(clientId).all()).results,links:(await ctx.db.prepare('SELECT * FROM rh_agent_projects WHERE client_id=? ORDER BY agent_id,project_id').bind(clientId).all()).results});
 const prepare=(documentId=doc.id,versionId)=>api('/api/v1/rh/missions/prepare','POST',{documentId,...(versionId?{versionId}:{})});
 const template=unzipSync(await readFile('templates/client-mission-v2.docx'));
 const fixtureFile=(label='Lettre fictive')=>{const parts={...template};parts['word/document.xml']=strToU8(strFromU8(parts['word/document.xml']).replace(/\{\{\w+\}\}/g,label));return new Blob([zipSync(parts)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});};
 const archive=(data,version,file=fixtureFile(),headers={})=>{const form=new FormData();form.append('file',file,'lettre-fictive.docx');form.append('data',JSON.stringify(data));return api('/api/v1/rh/missions/archive','POST',form,version,headers);};
 const archiveData=(prepared,letter=prepared.letters[0])=>({id:randomUUID(),clientId,employeeId:letter.employeeId,generationToken:prepared.generationTokens[letter.employeeId],allocation:{...letter.allocation,projectRole:'coordination',tasks:'Missions fictives à conserver.'},supervisor:'',source:prepared.source,letterId:letter.id});
 const expand=letters=>letters.flatMap(l=>{const a=l.allocation,rows=[];let cursor=a.startDate.slice(0,7);while(cursor<=a.endDate.slice(0,7)){rows.push([l.employeeId,a.projectId,cursor,Math.round(Number(a.percent.replace(',','.'))*100)].join('|'));const next=new Date(cursor+'-01T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);cursor=next.toISOString().slice(0,7);}return rows;}).sort();
 const expected=[...['2026-01','2026-02','2026-03','2026-05'].map((m,i)=>[agentId,projectId,m,[2500,5000,5000,2500][i]].join('|')),[samId,projectId,'2026-01',1000].join('|'),[samId,secondProject,'2026-01',2000].join('|')].sort();
 let draft,sourceArchive,sourceArchiveBytes,sourceArchiveInput,sourceArchiveFile,frozen;
 await check('Mission routes require the real cookie, allowed role, origin and request marker',async()=>{
  await read(await api('/api/v1/rh/missions/clients/'+clientId,'GET',undefined,undefined,{Cookie:''}),401);
  await read(await api('/api/v1/rh/missions/clients/'+clientId,'GET',undefined,undefined,{Cookie:denied.cookie}),403);
  await read(await api('/api/v1/rh/missions/clients/'+clientId,'GET',undefined,undefined,{Origin:'https://hostile.example'}),403);
  await read(await api('/api/v1/rh/missions/prepare','POST',{documentId:doc.id},undefined,{'X-CDInnov-Request':''}),403);
 });
 await check('Preparing a draft preserves exact varying rates and gaps without changing shared allocations or links',async()=>{
  const before=await sharedState();draft=await read(await prepare());assert.equal(draft.source.kind,'draft');assert.equal(draft.source.documentId,doc.id);assert.equal(draft.source.documentVersion,doc.version);assert.deepEqual(expand(draft.letters),expected);
  for(const letter of draft.letters){assert.equal(letter.allocation.startDate.slice(-2),'01');assert.ok(!letter.allocation.startDate.startsWith('2026-04'));assert.ok(!letter.allocation.endDate.startsWith('2026-04'));}
  assert.equal(await sharedState(),before);assert.equal(draft.agents.find(a=>a.id===agentId).allocations.length,0);assert.equal(draft.client.party.name,client.party.name);
  const context=await read(await api('/api/v1/rh/missions/clients/'+clientId));assert.equal(context.version,common.version);assert.deepEqual(context.agents.map(a=>a.id).sort(),people.map(a=>a.id).sort());
 });
 await check('Missing and zero rates remain explicit and never create an invented positive mission',async()=>{
  const partial=await read(await api('/api/v1/rh/documents','POST',{name:'Source partielle fictive',clientId,periods:[period(projectId,'2026-06-01','2026-06-30',[[agentId,null],[samId,0]])]}),201),prepared=await read(await prepare(partial.id));
  assert.ok(prepared.issues.length>0);assert.ok(prepared.letters.every(l=>l.employeeId!==agentId&&Number(l.allocation.percent.replace(',','.'))===0));
 });
 await check('Source-owned identity and rates reject tampering; invalid letter validity is refused',async()=>{
  const before=await sharedState(),count=(await ctx.db.prepare('SELECT COUNT(*) n FROM client_employee_documents').first()).n,basis=archiveData(draft);
  for(const patch of [{generationToken:undefined},{generationToken:'0'.repeat(64)},{allocation:{...basis.allocation,percent:'99'}},{allocation:{...basis.allocation,startDate:'2026-02-30'}},{allocation:{...basis.allocation,startDate:'2026-12-31',endDate:'2026-01-01'}},{employeeId:randomUUID()},{clientId:otherClient},{allocation:{...basis.allocation,projectId:foreignProject}}])await rejected(await archive({...basis,id:randomUUID(),...patch},common.version));
  assert.equal((await ctx.db.prepare('SELECT COUNT(*) n FROM client_employee_documents').first()).n,count);assert.equal(await sharedState(),before);
 });
 await check('Edited letter validity archives independently without changing its source or shared allocations',async()=>{
  const before=await sharedState(),sourceBefore=await ctx.db.prepare('SELECT * FROM rh_documents WHERE id=?').bind(doc.id).first(),data=archiveData(draft),file=fixtureFile();data.allocation.startDate='2025-09-15';data.allocation.endDate='2027-08-31';sourceArchiveInput=data;sourceArchiveFile=file;sourceArchiveBytes=Buffer.from(await file.arrayBuffer());sourceArchive=await read(await archive(data,common.version,file),201);
  const again=await archive(data,common.version,file);assert.ok([200,201].includes(again.status),await again.clone().text());assert.equal((await again.json()).document.id,sourceArchive.document.id);
  await rejected(await archive({...data,allocation:{...data.allocation,tasks:'Autre contenu'}},common.version,file),/conflit|existe|différent|déjà/i);
  await rejected(await archive(data,common.version,fixtureFile('Autres octets')),/conflit|existe|différent|déjà/i);
  assert.equal(await sharedState(),before);const space=await read(await api('/api/v1/billing/client-employees/'+clientId));assert.equal(space.documents.filter(d=>d.id===data.id).length,1);
  const download=await api(`/api/v1/billing/client-employees/${clientId}/documents/${data.id}`);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),sourceArchiveBytes);
  const row=await ctx.db.prepare('SELECT sha256,snapshot_json FROM client_employee_documents WHERE id=?').bind(data.id).first();assert.equal(row.sha256,createHash('sha256').update(sourceArchiveBytes).digest('hex'));assert.ok(row.snapshot_json.includes(doc.id));assert.ok(row.snapshot_json.includes('Missions fictives à conserver.'));const saved=JSON.parse(row.snapshot_json);assert.equal(saved.mission.allocation.startDate,'2025-09-15');assert.equal(saved.mission.allocation.endDate,'2027-08-31');assert.deepEqual(saved.mission.sourcePeriod,{startDate:draft.letters[0].allocation.startDate,endDate:draft.letters[0].allocation.endDate});assert.deepEqual(await ctx.db.prepare('SELECT * FROM rh_documents WHERE id=?').bind(doc.id).first(),sourceBefore);
 });
 await check('An outdated source revision blocks archiving without overwriting the draft or retaining an orphan file',async()=>{
  const stale=archiveData(draft),filesBefore=(await(await ctx.worker.getR2Bucket('CET_FILES')).list()).objects.length;
  doc=await read(await api('/api/v1/rh/documents/'+doc.id,'PUT',{...doc.draft,name:'Source révisée'},doc.version));await read(await archive(stale,common.version),409);
  assert.equal((await(await ctx.worker.getR2Bucket('CET_FILES')).list()).objects.length,filesBefore);assert.equal(await ctx.db.prepare('SELECT id FROM client_employee_documents WHERE id=?').bind(stale.id).first(),null);
 });
 await check('Finalized source and explicit older versions retain the frozen employee, project, dates and rates',async()=>{
  for(const [name,months] of [['Alex Source',['2026-01','2026-02','2026-03','2026-05']],['Sam Source',['2026-01']]])for(const month of months){const beforeIds=new Set(doc.payroll.map(p=>p.id));const form=new FormData();form.append('file',new Blob(['%PDF-1.7\n'+JSON.stringify({name,month})+'\n%%EOF'],{type:'application/pdf'}),'bulletin.pdf');doc=await read(await api(`/api/v1/rh/documents/${doc.id}/payroll`,'POST',form,doc.version),201);const source=doc.payroll.find(p=>!beforeIds.has(p.id));assert.ok(source,'The uploaded payroll must be returned');doc=await read(await api(`/api/v1/rh/documents/${doc.id}/payroll/${source.id}`,'PATCH',{agentId:name==='Alex Source'?agentId:samId,month,confirmed:true},doc.version));}
  const result=await read(await api(`/api/v1/rh/documents/${doc.id}/freeze`,'POST',{},doc.version),201);frozen=result.version;doc=result.document;const finalized=await read(await prepare());assert.equal(finalized.source.kind,'version');assert.equal(finalized.source.versionId,frozen.id);assert.deepEqual(expand(finalized.letters),expected);
  common=await read(await api('/api/v1/billing/client-employees/'+clientId,'PUT',{agents:common.agents.map(a=>({...a,name:a.id===agentId?'Nom partagé modifié':a.name})),payments:[]},common.version));
  await read(await api('/api/v1/billing/clients/'+clientId,'PUT',{data:{...client,party:{...client.party,name:'Entité actuelle renommée'}}},1));
  const market=(await ctx.db.prepare('SELECT id,payload FROM markets').all()).results.find(value=>JSON.parse(value.payload).projects.some(project=>project.id===projectId)),payload=JSON.parse(market.payload);payload.projects=payload.projects.map(project=>project.id===projectId?{...project,name:'Projet actuel renommé',code:'IF ACTUEL',programme:'Programme actuel'}:project);await ctx.db.prepare('UPDATE markets SET payload=?,version=version+1 WHERE id=?').bind(JSON.stringify(payload),market.id).run();
  const frozenAgain=await read(await prepare());assert.equal(frozenAgain.agents.find(a=>a.id===agentId).name,'Alex Source');assert.equal(frozenAgain.client.party.name,client.party.name);assert.equal(frozenAgain.letters.find(value=>value.allocation.projectId===projectId).allocation.project,'Projet source 0');assert.equal(frozenAgain.letters.find(value=>value.allocation.projectId===projectId).allocation.programme,'Interreg test');assert.equal(frozenAgain.version,common.version);
  const retried=await read(await archive(sourceArchiveInput,1,sourceArchiveFile));assert.equal(retried.document.id,sourceArchive.document.id);
  doc=await read(await api('/api/v1/rh/documents/'+doc.id,'PUT',{...doc.draft,name:'Nouveau brouillon',periods:doc.draft.periods.map((p,i)=>i===0?{...p,agents:p.agents.map(a=>a.agentId===agentId?{...a,rateBasisPoints:1250}:a)}:p)},doc.version));
  const current=await read(await prepare()),old=await read(await prepare(doc.id,frozen.id));assert.equal(current.source.kind,'draft');assert.ok(expand(current.letters).includes([agentId,projectId,'2026-01',1250].join('|')));assert.equal(current.client.party.name,'Entité actuelle renommée');assert.equal(current.letters.find(value=>value.allocation.projectId===projectId).allocation.project,'Projet actuel renommé');assert.equal(old.source.versionId,frozen.id);assert.deepEqual(expand(old.letters),expected);assert.equal(old.agents.find(a=>a.id===agentId).name,'Alex Source');assert.equal(old.client.party.name,client.party.name);assert.equal(old.letters.find(value=>value.allocation.projectId===projectId).allocation.project,'Projet source 0');
  const otherDoc=await read(await api('/api/v1/rh/documents','POST',{name:'Autre document',clientId,periods:[]}),201);await rejected(await prepare(otherDoc.id,frozen.id));
 });
 await check('Manual mission adds one shared assignment, retries are idempotent and contradictory overlaps are rejected',async()=>{
  common=await read(await api('/api/v1/billing/client-employees/'+clientId));const context=await read(await api('/api/v1/rh/missions/clients/'+clientId)),a={id:randomUUID(),projectId,project:'Projet actuel renommé',projectCode:'IF ACTUEL',programme:'Programme actuel',percent:'12.34',startDate:'2026-07-15',endDate:'2026-08-14',tasks:'Mission manuelle précise.',projectRole:'communication'},data={id:randomUUID(),clientId,employeeId:agentId,generationToken:context.generationTokens[agentId],allocation:a,supervisor:''},file=fixtureFile('Mission manuelle');
  const saved=await read(await archive(data,common.version,file),201);assert.equal(saved.version,common.version+1);common=await read(await api('/api/v1/billing/client-employees/'+clientId));assert.equal(common.agents.find(x=>x.id===agentId).allocations.length,1);assert.deepEqual(common.agents.find(x=>x.id===agentId).allocations[0],a);
  const repeated=await archive(data,saved.version,file);assert.ok([200,201].includes(repeated.status));assert.equal((await repeated.json()).document.id,data.id);assert.equal((await read(await api('/api/v1/billing/client-employees/'+clientId))).version,saved.version);
  await rejected(await archive({...data,id:randomUUID(),allocation:{...a,id:randomUUID(),percent:'90'}},saved.version));
  await rejected(await archive({...data,id:randomUUID(),allocation:{...a,startDate:'2026-07-16'}},saved.version));
  const stale={...data,id:randomUUID(),allocation:{...a,id:randomUUID(),startDate:'2026-09-01',endDate:'2026-09-30'}};await read(await archive(stale,saved.version-1),409);
  const rh=await read(await api(`/api/v1/rh/clients/${clientId}/agents`));assert.equal(rh.agents.find(x=>x.id===agentId).allocations[0].percent,'12.34');assert.ok(rh.links.some(x=>x.agentId===agentId&&x.projectId===projectId));
 });
 await check('Mission generation leaves frozen RH versions, employee IDs and prior archive bytes intact',async()=>{
  const current=await read(await api('/api/v1/billing/client-employees/'+clientId));assert.deepEqual(current.agents.map(a=>a.id).sort(),people.map(a=>a.id).sort());assert.equal((await ctx.db.prepare('SELECT COUNT(*) n FROM rh_versions').first()).n,1);assert.deepEqual(JSON.parse((await ctx.db.prepare('SELECT data_json FROM rh_versions WHERE id=?').bind(frozen.id).first()).data_json),frozen);
  const original=await api(`/api/v1/billing/client-employees/${clientId}/documents/${sourceArchive.document.id}`);assert.deepEqual(Buffer.from(await original.arrayBuffer()),sourceArchiveBytes);assert.equal((await ctx.db.prepare('SELECT COUNT(*) n FROM rh_write_guards').first()).n,0);
 });
 await check('A client rename between preparation and archive rejects stale rendered identity while old archive retries remain safe',async()=>{
  const prepared=await read(await prepare()),data=archiveData(prepared),customer=await read(await api('/api/v1/billing/clients/'+clientId)),bucket=await ctx.worker.getR2Bucket('CET_FILES'),filesBefore=(await bucket.list()).objects.map(value=>value.key).sort();
  await read(await api('/api/v1/billing/clients/'+clientId,'PUT',{data:{...customer.data,party:{...customer.data.party,name:'Entité renommée pendant la préparation'}}},customer.version));
  await read(await archive(data,prepared.version),409);assert.equal(await ctx.db.prepare('SELECT id FROM client_employee_documents WHERE id=?').bind(data.id).first(),null);assert.deepEqual((await bucket.list()).objects.map(value=>value.key).sort(),filesBefore);
  const again=await read(await archive(sourceArchiveInput,1,sourceArchiveFile));assert.equal(again.document.id,sourceArchive.document.id);
 });
 await check('A concurrent RH revision after the R2 write returns a conflict and rolls back every archive mutation',async()=>{
  const prepared=await read(await prepare()),data=archiveData(prepared),bucket=await ctx.worker.getR2Bucket('CET_FILES'),filesBefore=(await bucket.list()).objects.map(value=>value.key).sort(),before=await sharedState(),auditBefore=(await ctx.db.prepare('SELECT COUNT(*) n FROM rh_audit').first()).n;
  await read(await archive(data,prepared.version,fixtureFile(),{'X-Mission-Test-Race':'source','X-Mission-Test-Id':doc.id}),409);
  assert.equal(await ctx.db.prepare('SELECT id FROM client_employee_documents WHERE id=?').bind(data.id).first(),null);assert.deepEqual((await bucket.list()).objects.map(value=>value.key).sort(),filesBefore);assert.equal(await sharedState(),before);assert.equal((await ctx.db.prepare('SELECT COUNT(*) n FROM rh_audit').first()).n,auditBefore);assert.equal((await ctx.db.prepare('SELECT COUNT(*) n FROM rh_write_guards').first()).n,0);
 });
 await check('A concurrent employee revision after the R2 write cannot add a manual assignment or orphan file',async()=>{
  common=await read(await api('/api/v1/billing/client-employees/'+clientId));const context=await read(await api('/api/v1/rh/missions/clients/'+clientId)),existing=common.agents.find(value=>value.id===agentId).allocations[0],data={id:randomUUID(),clientId,employeeId:agentId,generationToken:context.generationTokens[agentId],allocation:{...existing,id:randomUUID(),startDate:'2026-10-01',endDate:'2026-10-31'},supervisor:''},bucket=await ctx.worker.getR2Bucket('CET_FILES'),filesBefore=(await bucket.list()).objects.map(value=>value.key).sort();
  await read(await archive(data,common.version,fixtureFile(),{'X-Mission-Test-Race':'employee','X-Mission-Test-Id':clientId}),409);const after=await read(await api('/api/v1/billing/client-employees/'+clientId));assert.deepEqual(after.agents,common.agents);assert.equal(after.version,common.version+1);assert.equal(await ctx.db.prepare('SELECT id FROM client_employee_documents WHERE id=?').bind(data.id).first(),null);assert.deepEqual((await bucket.list()).objects.map(value=>value.key).sort(),filesBefore);assert.equal((await ctx.db.prepare('SELECT COUNT(*) n FROM rh_write_guards').first()).n,0);
 });
 await check('A concurrent client revision after the R2 write returns conflict without a manual assignment or orphan archive',async()=>{
  const context=await read(await api('/api/v1/rh/missions/clients/'+clientId)),existing=context.agents.find(value=>value.id===agentId).allocations[0],data={id:randomUUID(),clientId,employeeId:agentId,generationToken:context.generationTokens[agentId],allocation:{...existing,id:randomUUID(),startDate:'2026-11-01',endDate:'2026-11-30'},supervisor:''},bucket=await ctx.worker.getR2Bucket('CET_FILES'),filesBefore=(await bucket.list()).objects.map(value=>value.key).sort(),before=await sharedState();
  await read(await archive(data,context.version,fixtureFile(),{'X-Mission-Test-Race':'client','X-Mission-Test-Id':clientId}),409);assert.equal(await ctx.db.prepare('SELECT id FROM client_employee_documents WHERE id=?').bind(data.id).first(),null);assert.deepEqual((await bucket.list()).objects.map(value=>value.key).sort(),filesBefore);assert.equal(await sharedState(),before);assert.equal((await ctx.db.prepare('SELECT COUNT(*) n FROM rh_write_guards').first()).n,0);
 });
 await writeFile(out+'/checks.json',JSON.stringify({checks,status:'passed',results,environment:'isolated cookie-auth Worker/D1/R2 and fictional records'},null,2));console.log(JSON.stringify({checks,status:'passed'}));
}finally{await ctx.worker.dispose();}
