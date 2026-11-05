import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateStamping} from './stamping-schema.mjs';
import {migrateRh} from './rh-schema.mjs';
const bundle=await build({entryPoints:['platform/rh-stamping.ts'],bundle:true,platform:'node',format:'esm',write:false});await mkdir('.private/rh-tests',{recursive:true});await writeFile('.private/rh-tests/capacity.mjs',bundle.outputFiles[0].text);
const {createRhStampingBatch,buildRhStampImport}=await import('../.private/rh-tests/capacity.mjs'),ctx=await testEnvironment();
const objects=new Map(),sent=[],sha=b=>createHash('sha256').update(b).digest('hex'),now=new Date().toISOString();
const storage={get:async key=>objects.has(key)?{arrayBuffer:async()=>objects.get(key)}:null,put:async(key,value)=>objects.set(key,Buffer.from(value)),delete:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);}};
const environment={BUDGETS_DB:{withSession:()=>ctx.db},CET_FILES:storage,BILLING_PDF_SERVICE_URL:'https://unused.local',STAMPING_QUEUE:{sendBatch:async messages=>{assert.ok(messages.length<=100);sent.push(messages);}}};
const session={email:users[0],name:'Test',admin:true,expiresAt:Date.now()+60000,access:{facturier:true,tamponnage:true}};
function fixture(count){
 const agents=[],payroll=[],lines=[];
 for(let i=0;i<count;i++){const agentId='agent-'+Math.floor(i/6),month='2026-0'+(i%6+1),id='payroll-'+i,bytes=Buffer.from('%PDF-1.7\nSynthetic capacity fixture '+i+'\n%%EOF'),objectKey='rh/source-'+i+'.pdf';objects.set(objectKey,bytes);if(!agents.some(a=>a.id===agentId))agents.push({id:agentId,name:'Agent fictif '+Math.floor(i/6),role:'Test',supervisor:'',allocations:[]});payroll.push({id,agentId,month,filename:id+'.pdf',sha256:sha(bytes),objectKey,employerCostCents:500000,netBeforeTaxCents:null,reading:{},confirmed:true,createdAt:now});lines.push({id:'line-'+i,periodId:'p',agentId,projectId:'project',month,employerCostCents:500000,netBeforeTaxCents:null,rateBasisPoints:2000,allocatedCents:100000,payrollId:id});}
 return {id:randomUUID(),documentId:randomUUID(),revision:1,name:'Capacité fictive '+count,client:{id:'client',name:'Client fictif'},projects:[{id:'project',name:'Projet fictif',code:'IF TEST',programme:'Programme',clientIds:['client'],marketId:'market'}],periods:[],agents,payroll,lines,createdAt:now,createdBy:users[0]};
}
try{
 await migrateStamping(ctx.db);await migrateRh(ctx.db);await migrateStamping(ctx.db);
 const small=await createRhStampingBatch(environment,session,fixture(102));assert.equal(small.documents,102);assert.equal(small.queued,102);assert.deepEqual(sent.map(p=>p.length),[100,2]);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM stamp_documents WHERE batch_id=?').bind(small.batchId).first()).n,102);
 sent.length=0;const large=await createRhStampingBatch(environment,session,fixture(300));assert.equal(large.documents,300);assert.equal(large.queued,300);assert.deepEqual(sent.map(p=>p.length),[100,100,100]);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM stamp_documents WHERE batch_id=?').bind(large.batchId).first()).n,300);assert.throws(()=>buildRhStampImport(fixture(301)),/300/);
 const extra=batchId=>ctx.db.prepare("INSERT INTO stamp_documents(id,batch_id,name,sha256,size) VALUES(?,?,?,'extra',1)").bind(randomUUID(),batchId,'extra.pdf').run();await assert.rejects(extra(large.batchId),/stamp_document_quota/);
 const native=randomUUID();await ctx.db.prepare("INSERT INTO stamp_batches VALUES(?,?,?,1,'{}',?,?)").bind(native,users[0],'Natif fictif',Date.now(),Date.now()+60000).run();await ctx.db.batch(Array.from({length:100},(_,i)=>ctx.db.prepare('INSERT INTO stamp_documents(id,batch_id,name,sha256,size) VALUES(?,?,?,?,1)').bind(randomUUID(),native,i+'.pdf','hash-'+i)));await assert.rejects(extra(native),/stamp_document_quota/);
 const weighted=randomUUID();await ctx.db.prepare('INSERT INTO stamp_batches VALUES(?,?,?,1,?,?,?)').bind(weighted,users[0],'Poids fictif',JSON.stringify({rhVersionId:randomUUID()}),Date.now(),Date.now()+60000).run();await ctx.db.prepare("INSERT INTO stamp_documents(id,batch_id,name,sha256,size) VALUES(?,?,'limit.pdf','weight',209715200)").bind(randomUUID(),weighted).run();await assert.rejects(extra(weighted),/stamp_document_quota/);
 console.log('RH capacity passed: 17 agents × 6 months (102), 300 accepted, 301 rejected, queue batches ≤100, native quota remains 100, 200 MiB remains enforced. Real isolated D1; synthetic R2/queue adapters; no PDF-engine claim for capacity fixtures.');
}finally{await ctx.worker.dispose();}
