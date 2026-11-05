import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {migrateRh} from './rh-schema.mjs';
import {migrateStamping} from './stamping-schema.mjs';

const output=new URL('../.private/rh-lifecycle-race/module.mjs',import.meta.url);await mkdir(new URL('./',output),{recursive:true});
const bundle=await build({entryPoints:['platform/rh-stamping.ts'],bundle:true,platform:'node',format:'esm',write:false});await writeFile(output,bundle.outputFiles[0].text);
const {createRhStampingBatch}=await import(output.href),worker=new Miniflare({modules:true,script:'export default {fetch(){return new Response("fixture");}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
try{
 const db=await worker.getD1Database('DB');await migrateStamping(db);await migrateRh(db);
 const now=new Date().toISOString(),raw=Buffer.from('%PDF-1.7\nSynthetic deletion race fixture\n%%EOF'),sha256=createHash('sha256').update(raw).digest('hex');
 const file={id:'payroll-race',agentId:'agent-race',month:'2026-01',filename:'fixture.pdf',objectKey:'rh/source.pdf',sha256,employerCostCents:400000,confirmed:true};
 const snapshot={id:'version-race',documentId:'document-race',revision:1,name:'Course fictive',client:{id:'client-race'},agents:[{id:'agent-race',name:'Agent fictif'}],projects:[{id:'project-race',name:'Projet fictif',code:'IF TEST',programme:'Test'}],payroll:[file],lines:[{id:'line-race',agentId:'agent-race',projectId:'project-race',periodId:'period-race',month:'2026-01',payrollId:file.id,employerCostCents:400000,rateBasisPoints:2500,allocatedCents:100000}]};
 await db.prepare('INSERT INTO rh_documents VALUES(?,?,?,1,?,?,?,?)').bind(snapshot.documentId,snapshot.client.id,snapshot.name,JSON.stringify({name:snapshot.name,clientId:snapshot.client.id,periods:[],_workflow:'finalized'}),now,now,'fixture').run();
 const objects=new Map([[file.objectKey,raw]]),queued=[],session={email:'test@example.invalid',admin:true,access:{facturier:true,tamponnage:true}};let deleteDuringCopy=true;
 const storage={get:async key=>objects.has(key)?{arrayBuffer:async()=>objects.get(key)}:null,put:async(key,value)=>{objects.set(key,Buffer.from(value));if(deleteDuringCopy){deleteDuringCopy=false;await db.prepare("UPDATE rh_documents SET version=version+1,data_json=json_set(data_json,'$._deletedAt',?) WHERE id=?").bind(now,snapshot.documentId).run();}},delete:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);}};
 const env={BUDGETS_DB:{withSession:()=>db},CET_FILES:storage,STAMPING_QUEUE:{sendBatch:async messages=>queued.push(...messages)},BILLING_PDF_SERVICE_URL:'https://unused.invalid'};
 await assert.rejects(createRhStampingBatch(env,session,snapshot),/RH_WRITE_CONFLICT/);
 for(const table of ['stamp_batches','stamp_documents','stamp_audit','rh_stamp_links','rh_write_guards'])assert.equal((await db.prepare('SELECT count(*) n FROM '+table).first()).n,0,table);
 assert.deepEqual([...objects.keys()],[file.objectKey]);assert.equal(queued.length,0);
 await db.prepare("UPDATE rh_documents SET version=version+1,data_json=json_remove(data_json,'$._deletedAt') WHERE id=?").bind(snapshot.documentId).run();
 const created=await createRhStampingBatch(env,session,snapshot);assert.equal(created.documents,1);assert.equal(created.queued,1);assert.equal(queued.length,1);assert.equal(objects.size,2);assert.equal((await db.prepare('SELECT count(*) n FROM rh_write_guards').first()).n,0);
 console.log('PASS: deletion during PDF copy rolls back the entire stamping transaction, removes copied objects and queues nothing; restored document succeeds. Real isolated D1, synthetic storage/queue.');
}finally{await worker.dispose();}
