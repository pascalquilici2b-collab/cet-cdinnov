import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {stampEnvironment,fixtures,users} from './stamping-test-helper.mjs';
const ctx=await stampEnvironment(),f=await fixtures();let checks=0;
const read=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
const check=async(label,fn)=>{await fn();checks++;console.log('OK '+label);};
try{
 const id=(await read(await ctx.send('/batches',{name:'Payment preview and removal QA'}),201)).id,path='/batches/'+id;
 const refresh=()=>ctx.call(path).then(read),del=(tail,version,headers={})=>ctx.call(path+tail,{method:'DELETE',headers:{'If-Match':String(version),...headers}});
 let b=await refresh();await read(await ctx.upload(path+'/table',Buffer.from(f.table,'base64'),'payment.csv',b.version));b=await refresh();
 const bucket=await ctx.worker.getR2Bucket('CET_FILES');
 const prefix='stamping/'+createHash('sha256').update(users[0]).digest('hex').slice(0,24)+'/'+id+'/';
 let other;
 await check('Payment source: exact original, MIME, owner isolation, hash verification',async()=>{
  const response=await ctx.call(path+'/table/source');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/csv/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(f.table,'base64'));
  await ctx.setPortal(JSON.stringify({auth:{accounts:{...ctx.accounts,[users[1]]:{...ctx.accounts[users[1]],role:'admin'}},allowed:users}}));other=await ctx.login(users[1]);
  assert.equal((await ctx.call(path+'/table/source',{headers:{Authorization:'Bearer '+other.token}})).status,404);
  assert.equal((await ctx.call(path+'/table/source',{headers:{Authorization:''}})).status,401);
  await bucket.put(b.data.table.key,'tampered');assert.equal((await ctx.call(path+'/table/source')).status,503);await bucket.put(b.data.table.key,Buffer.from(f.table,'base64'));
 });
 const first=(await read(await ctx.upload(path+'/documents',Buffer.from(f.pdf,'base64'),'payroll.pdf'),201)).id;
 const second=(await read(await ctx.upload(path+'/documents',Buffer.from(f.invoice,'base64'),'invoice.pdf'),201)).id;
 await check('Individual deletion: stale request and running job blocked, other owner rejected',async()=>{
  assert.equal((await del('/documents/'+first,0)).status,409);assert.equal((await del('/documents/'+first,1,{Authorization:'Bearer '+other.token})).status,404);
  await ctx.db.prepare("UPDATE stamp_documents SET status='PROCESSING',lease_until=? WHERE id=?").bind(Date.now()+60000,first).run();
  assert.equal((await del('/documents/'+first,1)).status,409);assert.ok(await bucket.get(prefix+first+'/source.pdf'));
 });
 await check('Payment removal cannot race a running job; compare-and-swap stays atomic',async()=>{
  assert.equal((await del('/table',b.version)).status,409);assert.equal((await refresh()).version,b.version);
  assert.equal((await del('/table',b.version,{Authorization:'Bearer '+other.token})).status,404);
  assert.equal((await del('/table',0)).status,409);
 });
 await check('Delete one piece removes its files, releases its allocation and preserves neighbours',async()=>{
  await bucket.put(prefix+first+'/candidate-1.pdf','candidate');await ctx.db.prepare("UPDATE stamp_documents SET status='VERIFIED',match_group='group1',lease_until=0 WHERE id=?").bind(first).run();
  await read(await del('/documents/'+first,1));assert.equal(await bucket.get(prefix+first+'/source.pdf'),null);assert.equal(await bucket.get(prefix+first+'/candidate-1.pdf'),null);
  assert.ok(await bucket.get(prefix+second+'/source.pdf'));assert.ok(await bucket.get(b.data.table.key));assert.equal((await refresh()).documents.length,1);
  assert.equal((await ctx.call(path+'/documents/'+first+'/source')).status,404);
 });
 await check('Delete payment resets sealed allocations and derived files, preserving source PDFs',async()=>{
  const candidate=prefix+second+'/candidate-7.pdf';await bucket.put(candidate,'old-result');
  await ctx.db.prepare("UPDATE stamp_documents SET status='QUEUED',version=7,match_group='group2',data=? WHERE id=?").bind(JSON.stringify({candidateKey:candidate,total_cents:123}),second).run();
  await ctx.db.prepare('UPDATE stamp_batches SET data=? WHERE id=?').bind(JSON.stringify({...b.data,sealed:true,importConfirmed:true}),id).run();
  await read(await del('/table',b.version));const after=await refresh();assert.equal(after.version,b.version+1);assert.equal(after.data.table,null);assert.equal(after.data.import,null);assert.equal(after.data.sealed,false);assert.equal(after.data.importConfirmed,false);
  const d=after.documents[0];assert.equal(d.status,'UPLOADED');assert.equal(d.version,8);assert.deepEqual(d.data,{});assert.equal(d.match_group,null);
  assert.equal(await bucket.get(b.data.table.key),null);assert.equal(await bucket.get(candidate),null);assert.deepEqual(Buffer.from(await (await bucket.get(prefix+second+'/source.pdf')).arrayBuffer()),Buffer.from(f.invoice,'base64'));
  assert.equal((await ctx.call(path+'/table/source')).status,404);assert.equal((await ctx.send(path+'/documents/'+second+'/approve',{reviewed:true},7)).status,409);
  // Dispatch the already queued version: it must never claim a reset document.
  await (await ctx.worker.getQueueProducer('STAMPING_QUEUE')).send({batchId:id,documentId:second,version:7,owner:users[0]});await new Promise(r=>setTimeout(r,1000));
  assert.equal((await refresh()).documents[0].status,'UPLOADED');assert.equal(ctx.aiCalls(),0);b=after;
 });
 await check('Replacement import and interrupted piece deletion remain possible; audit retained',async()=>{
  await read(await ctx.upload(path+'/table',Buffer.from(f.table,'base64'),'replacement.csv',b.version));b=await refresh();assert.ok(b.data.table);
  const old=b.data.table.key;await read(await ctx.upload(path+'/table',Buffer.from(f.table,'base64'),'replacement-again.csv',b.version));b=await refresh();assert.equal(await bucket.get(old),null);assert.ok(await bucket.get(b.data.table.key));
  await ctx.db.prepare("UPDATE stamp_documents SET status='DELETING',version=9 WHERE id=?").bind(second).run();
  assert.equal((await ctx.call(path+'/documents/'+second+'/source')).status,409);await read(await del('/documents/'+second,9));assert.equal((await refresh()).documents.length,0);
  const audit=(await ctx.db.prepare('SELECT action FROM stamp_audit WHERE batch_id=?').bind(id).all()).results;assert.equal(audit.filter(r=>r.action==='DOCUMENT_REMOVED').length,2);assert.equal(audit.filter(r=>r.action==='PAYMENT_DOCUMENT_REMOVED').length,1);
 });
 await read(await ctx.call(path,{method:'DELETE'}));assert.equal((await bucket.list()).objects.length,0);
 console.log(`${checks} payment preview/deletion scenarios passed on isolated D1/R2/Queue.`);
}finally{await ctx.worker.dispose();}
