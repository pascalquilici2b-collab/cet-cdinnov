import assert from 'node:assert/strict';
import {stampEnvironment,py} from './stamping-test-helper.mjs';
const ctx=await stampEnvironment();
const read=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
try{
 const pdf=await py(['-c',"import runpy,sys;sys.stdout.buffer.write(runpy.run_path('tests/test_stamping_allocations.py')['allocation_pdf']())"]);
 const {id}=await read(await ctx.send('/batches',{name:'Test allocation PDF',useAI:false}),201);
 let b=await read(await ctx.call('/batches/'+id));assert.equal(b.data.useAI,true);
 await read(await ctx.upload(`/batches/${id}/table`,pdf,'allocation.pdf',b.version));
 b=await read(await ctx.call('/batches/'+id));assert.equal(b.data.importConfirmed,false);
 assert.equal(b.data.import.groups.length,1);assert.deepEqual(b.data.import.groups[0].allocations.map(a=>a.amount_cents),[103943,173238,103943,173238]);
 const g=b.data.import.groups[0],a=g.allocations[0];
 assert.equal((await ctx.send(`/batches/${id}/review`,{changes:[],confirmed:true},b.version-1)).status,409);
 assert.equal((await ctx.send(`/batches/${id}/review`,{changes:[{groupId:g.id,allocationId:'unknown',amount:'1'}],confirmed:true},b.version)).status,422);
 await read(await ctx.send(`/batches/${id}/review`,{changes:[{groupId:g.id,allocationId:a.id,amount:'9000'}],confirmed:true},b.version));
 b=await read(await ctx.call('/batches/'+id));assert.equal(b.data.importConfirmed,false);
 await read(await ctx.send(`/batches/${id}/review`,{changes:[{groupId:g.id,allocationId:a.id,amount:'1039,43'}],confirmed:true},b.version));
 b=await read(await ctx.call('/batches/'+id));assert.equal(b.data.importConfirmed,true);assert.equal(b.data.import.groups[0].total_cents,554362);
 assert.deepEqual(b.data.import.groups[0].allocations[0].source,a.source);
 console.log('PDF page-by-page, mandatory Qwen, edit validation, concurrency fence and provenance passed.');
}finally{await ctx.worker.dispose();}
