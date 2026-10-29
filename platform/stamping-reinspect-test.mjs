import assert from 'node:assert/strict';
import {stampEnvironment,py,users} from './stamping-test-helper.mjs';
const ctx=await stampEnvironment();
const read=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
try{
 const raw=await py(['-c',"import runpy,sys;sys.stdout.buffer.write(runpy.run_path('tests/test_stamping_single_project.py')['payment_book']())"]);
 const id=(await read(await ctx.send('/batches',{name:'Synthetic single-project lot',category:'RH'}),201)).id;
 const base='/batches/'+id;
 await read(await ctx.upload(base+'/table',raw,'payment.xlsx',1));
 let b=await read(await ctx.call(base));
 const source=b.data.table.key,sha=b.data.table.sha256;
 // Reproduce the existing lot that was read by the old parser.
 const old={...b.data,import:null};await ctx.db.prepare('UPDATE stamp_batches SET data=? WHERE id=?').bind(JSON.stringify(old),id).run();
 await read(await ctx.send(base+'/table/reinspect',{},b.version));
 b=await read(await ctx.call(base));
 assert.equal(b.data.import.groups.length,4);assert.equal(b.data.importConfirmed,false);
 assert.equal(b.data.table.key,source);assert.equal(b.data.table.sha256,sha);
 assert.deepEqual(Buffer.from(await(await ctx.call(base+'/table/source')).arrayBuffer()),raw);
 assert.equal((await ctx.send(base+'/table/reinspect',{},b.version-1)).status,409);
 const other=await ctx.login(users[1]);
 assert.equal((await ctx.call(base+'/table/reinspect',{method:'POST',headers:{Authorization:'Bearer '+other.token,'If-Match':String(b.version)}})).status,403);
 await read(await ctx.send(base+'/review',{changes:[],confirmed:true},b.version));
 b=await read(await ctx.call(base));
 assert.equal(b.data.importConfirmed,true);
 assert.equal((await ctx.send(base+'/table/reinspect',{},b.version)).status,409);
 assert.equal((await ctx.db.prepare("SELECT COUNT(*) n FROM stamp_audit WHERE batch_id=? AND action='TABLE_REINSPECTED'").bind(id).first()).n,1);
 console.log('OK: single-project reinspection, original preserved, no automatic approval, stale version and unauthorized/confirmed edits blocked.');
}finally{await ctx.worker.dispose();}
