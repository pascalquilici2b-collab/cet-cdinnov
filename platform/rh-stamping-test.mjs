import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {unzipSync} from 'fflate';
import {stampEnvironment,py,users} from './stamping-test-helper.mjs';
import {migrateRh} from './rh-schema.mjs';
import {migrateBilling} from './billing-schema.mjs';

const bundle=await build({entryPoints:['platform/rh-stamping.ts'],bundle:true,platform:'node',format:'esm',write:false});
await mkdir('.private/rh-tests',{recursive:true});await writeFile('.private/rh-tests/stamping.mjs',bundle.outputFiles[0].text);
const {buildRhStampImport}=await import('../.private/rh-tests/stamping.mjs');
const sha=value=>createHash('sha256').update(value).digest('hex');
const raw=JSON.parse(await py(['-c',`import io,json,base64
from reportlab.pdfgen import canvas
from cdi_facturx.stamping_pdf import FONT
result=[]
for month in ['2026-01','2026-02']:
 out=io.BytesIO();c=canvas.Canvas(out,pagesize=(595,842));c.setFont(FONT,11)
 for i,line in enumerate(['Bulletin de paie - DOCUMENT FICTIF','Matricule : SAL-TEST','Période : '+month]):c.drawString(32,810-i*20,line)
 c.drawString(32,80,'Total versé par l’employeur : 7 177,10 EUR');c.drawString(32,60,'Document de test sans valeur comptable');c.rect(30,120,535,300);c.save()
 result.append(base64.b64encode(out.getvalue()).decode())
print(json.dumps(result))`]));
const pdfs=raw.map(v=>Buffer.from(v,'base64')),stamp=new Date().toISOString(),agentId=randomUUID(),clientId='rh-stamp-fixture';
const projects=[1,2].map(n=>({id:'project-'+n,name:'Projet fictif '+n,code:'IF TEST00'+n,programme:'Programme fictif',clientIds:[clientId],marketId:'market-test'}));
const periods=projects.map((p,i)=>({id:'period-'+i,projectId:p.id,startDate:i?'2026-02-01':'2026-01-01',endDate:'2026-02-28',agents:[{agentId,rateBasisPoints:i?1500:2000}]}));
const payroll=pdfs.map((pdf,i)=>({id:randomUUID(),agentId,month:'2026-0'+(i+1),filename:'Bulletin-fictif-'+(i+1)+'.pdf',sha256:sha(pdf),objectKey:'rh/fixture/'+randomUUID()+'.pdf',employerCostCents:717710,netBeforeTaxCents:null,reading:{},confirmed:true,createdAt:stamp}));
const lines=periods.flatMap((p,i)=>payroll.filter((_,j)=>j>=i).map(f=>({id:p.id+':'+f.id,periodId:p.id,agentId,projectId:p.projectId,month:f.month,employerCostCents:717710,netBeforeTaxCents:null,rateBasisPoints:i?1500:2000,allocatedCents:Math.round(717710*(i?1500:2000)/10000),payrollId:f.id})));
const snapshot={id:randomUUID(),documentId:randomUUID(),revision:1,name:'RH fictif janvier-février',client:{id:clientId,name:'Client fictif'},projects,periods,agents:[{id:agentId,name:'SAL-TEST',role:'Test',supervisor:'',allocations:[]}],payroll,lines,createdAt:stamp,createdBy:users[0]};
let checks=0;
const check=async(label,fn)=>{await fn();checks++;console.log('OK '+label);};
await check('Frozen lines from different worksheet periods retain exact provenance and rounding',()=>{
 const result=buildRhStampImport(snapshot);assert.equal(result.plans.length,2);assert.deepEqual(result.import.groups.map(g=>g.allocations.length),[1,2]);assert.equal(result.import.groups[1].total_cents,251199);assert.equal(result.import.groups[1].rounding_cents,0);assert.deepEqual(result.import.groups[1].allocations.map(a=>a.source.sheet),['period-0','period-1']);
 const bad=structuredClone(snapshot);bad.lines[0].allocatedCents++;assert.throws(()=>buildRhStampImport(bad),/calcul RH/);
 const duplicate=structuredClone(snapshot);duplicate.payroll[1].sha256=duplicate.payroll[0].sha256;assert.throws(()=>buildRhStampImport(duplicate),/même PDF/);
 const overflow=structuredClone(snapshot);overflow.lines[2].rateBasisPoints=9000;overflow.lines[2].allocatedCents=Math.round(717710*.9);assert.throws(()=>buildRhStampImport(overflow),/100/);
 const zero=structuredClone(snapshot);zero.lines.forEach(l=>{l.allocatedCents=0;l.rateBasisPoints=0;});assert.throws(()=>buildRhStampImport(zero),/aucune imputation/);
});

const ctx=await stampEnvironment();
const read=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
const rh=async(path,method='GET',body,headers={})=>ctx.worker.dispatchFetch('https://preview.example/api/v1/rh'+path,{method,headers:{Origin:'http://127.0.0.1:5196',Authorization:'Bearer '+ctx.admin.token,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
try{
 await migrateBilling(ctx.db);await migrateRh(ctx.db);
 await ctx.db.prepare("INSERT INTO billing_directory VALUES('clients',?,1,?,?,?,'fixture',?,'fixture')").bind(clientId,JSON.stringify({archived:false,party:{name:'Client fictif'}}),'hash-test',stamp,stamp).run();
 const bucket=await ctx.worker.getR2Bucket('CET_FILES');for(let i=0;i<payroll.length;i++)await bucket.put(payroll[i].objectKey,pdfs[i]);
 const save=async s=>ctx.db.prepare('INSERT INTO rh_versions VALUES(?,?,?,?,?,?,?)').bind(s.id,s.documentId,clientId,s.revision,JSON.stringify(s),stamp,users[0]).run();await save(snapshot);
 let batchId,batch;
 await check('Version selector and authorization use the existing shared identity',async()=>{
  const other=await ctx.login(users[1]);await read(await rh('/versions/'+snapshot.id+'/stamping','POST',{}, {Authorization:'Bearer '+other.token}),403);await read(await rh('/versions/'+snapshot.id+'/stamping','POST',{}, {Authorization:''}),401);assert.equal((await read(await rh('/versions'))).versions[0].id,snapshot.id);
 });
 await check('Concurrent preparation creates one native batch and uses immutable server amounts',async()=>{
  const responses=await Promise.all([rh('/versions/'+snapshot.id+'/stamping','POST',{groups:[],reviewed:true}),rh('/versions/'+snapshot.id+'/stamping','POST',{})]);const values=await Promise.all(responses.map(r=>read(r,201)));assert.equal(values[0].batchId,values[1].batchId);assert.ok(values.every(v=>v.needsPreviewApproval));batchId=values[0].batchId;assert.equal((await ctx.db.prepare('SELECT count(*) n FROM stamp_batches').first()).n,1);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM rh_stamp_links').first()).n,1);batch=await read(await ctx.call('/batches/'+batchId));assert.equal(batch.data.rhVersionId,snapshot.id);assert.equal(batch.data.import.groups[1].total_cents,251199);assert.equal(batch.documents.length,2);assert.ok(batch.documents.every(d=>d.data.rhGroupId&&d.data.rhPayrollId));
 });
 await check('Real payroll PDFs flow through the existing queue and stop for preview approval',async()=>{
  const until=Date.now()+60000;do{batch=await read(await ctx.call('/batches/'+batchId));if(batch.documents.every(d=>!['QUEUED','PROCESSING'].includes(d.status)))break;await new Promise(r=>setTimeout(r,150));}while(Date.now()<until);
  assert.deepEqual(batch.documents.map(d=>d.status),['NEEDS_APPROVAL','NEEDS_APPROVAL'],JSON.stringify(batch.documents.map(d=>({status:d.status,error:d.data.error}))));assert.ok(batch.documents.every(d=>Object.values(d.data.checks).every(Boolean)));assert.deepEqual(ctx.serviceActions,['analyze','analyze']);assert.equal(ctx.aiCalls(),0);await read(await ctx.call('/batches/'+batchId+'/export'),422);
 });
 await check('RH references, payroll association and monetary allocations cannot be replaced in stamping',async()=>{
  const doc=batch.documents[0],path='/batches/'+batchId;
  await read(await ctx.send(path+'/mapping',{},batch.version),409);await read(await ctx.call(path+'/table',{method:'DELETE',headers:{'If-Match':String(batch.version)}}),409);await read(await ctx.call(path+'/documents/'+doc.id,{method:'DELETE'}),409);
  await read(await ctx.send(path+'/documents/'+doc.id+'/analyze',{choice:{groupId:'other'}},doc.version),409);await read(await ctx.send(path+'/documents/'+doc.id+'/revise',{overrides:[{allocationId:lines[0].id,amount:'1'}]},doc.version),409);assert.equal((await ctx.call(path+'/documents/'+doc.id+'/output')).status,409);
 });
 await check('Manual payroll reconciliation also requires the newly generated preview to be approved',async()=>{
  let doc=batch.documents[0];await read(await ctx.send(`/batches/${batchId}/documents/${doc.id}/cancel`,{},doc.version));batch=await read(await ctx.call('/batches/'+batchId));doc=batch.documents[0];assert.equal(doc.status,'UPLOADED');assert.ok(doc.data.rhGroupId);
  await read(await ctx.send(`/batches/${batchId}/documents/${doc.id}/confirm`,{choice:{groupId:doc.data.rhGroupId,baseAmount:'7177.10',identityConfirmed:true,baseConfirmed:true,reason:'Rapprochement fictif vérifié'},overrides:[]},doc.version));batch=await read(await ctx.call('/batches/'+batchId));assert.equal(batch.documents[0].status,'NEEDS_APPROVAL');await read(await ctx.send(`/batches/${batchId}/documents/${doc.id}/stamp`,{},batch.documents[0].version),409);
 });
 await check('Explicit preview approval produces verified ZIP and preserves every original',async()=>{
  for(const doc of batch.documents){await read(await ctx.send(`/batches/${batchId}/documents/${doc.id}/approve`,{reviewed:true,outputSha256:doc.data.output_sha256},doc.version));await read(await ctx.send(`/batches/${batchId}/documents/${doc.id}/stamp`,{},doc.version));}
  const zipped=await ctx.call('/batches/'+batchId+'/export');assert.equal(zipped.status,200);const files=unzipSync(new Uint8Array(await zipped.arrayBuffer()));assert.equal(Object.keys(files).length,2);assert.ok(Object.keys(files).every(p=>p.endsWith('.pdf')));for(let i=0;i<payroll.length;i++)assert.equal(sha(new Uint8Array(await (await bucket.get(payroll[i].objectKey)).arrayBuffer())),payroll[i].sha256);
 });
 await check('Missing or changed archived PDF fails before any batch or copied source is created',async()=>{
  const broken=structuredClone(snapshot);broken.id=randomUUID();broken.documentId=randomUUID();broken.payroll[0].objectKey='rh/missing.pdf';await save(broken);await read(await rh('/versions/'+broken.id+'/stamping','POST',{}),404);
  const tampered=structuredClone(snapshot);tampered.id=randomUUID();tampered.documentId=randomUUID();tampered.payroll[0].sha256='f'.repeat(64);await save(tampered);await read(await rh('/versions/'+tampered.id+'/stamping','POST',{}),409);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM stamp_batches').first()).n,1);
 });
 await check('Deleting a native lot keeps RH payroll archives and lets the same version be prepared again',async()=>{
  await read(await ctx.call('/batches/'+batchId,{method:'DELETE'}));assert.equal((await bucket.list()).objects.length,2);const fresh=await read(await rh('/versions/'+snapshot.id+'/stamping','POST',{}),201);assert.notEqual(fresh.batchId,batchId);assert.equal(fresh.documents,2);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM rh_stamp_links').first()).n,1);
 });
 console.log(`${checks} RH stamping scenarios passed (fictitious data, real local PDF engine, isolated D1/R2/Queue).`);
}finally{await ctx.worker.dispose();}
