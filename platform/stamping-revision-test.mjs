import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {stampEnvironment,fixtures} from './stamping-test-helper.mjs';
const ctx=await stampEnvironment(),f=await fixtures();
const read=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
try{
 const {id}=await read(await ctx.send('/batches',{name:'Revision isolation QA'}),201),path='/batches/'+id;
 await read(await ctx.upload(path+'/table',Buffer.from(f.table,'base64'),'payment.csv',1));let b=await read(await ctx.call(path)),s=b.data.table.sheets[0];
 await read(await ctx.send(path+'/mapping',{mapping:{sheet:s.name,header:s.header,mapping:s.mapping},confirmed:true},b.version));
 const dId=(await read(await ctx.upload(path+'/documents',Buffer.from(f.pdf,'base64'),'payroll.pdf'),201)).id,dp=path+'/documents/'+dId;
 await read(await ctx.send(dp+'/analyze',{},1),202);
 let d;const end=Date.now()+60000;do{b=await read(await ctx.call(path));d=b.documents[0];if(!['QUEUED','PROCESSING'].includes(d.status))break;await new Promise(r=>setTimeout(r,200));}while(Date.now()<end);
 assert.equal(d.status,'NEEDS_APPROVAL');const calls=ctx.serviceActions.length,ai=ctx.aiCalls();const original=structuredClone(d.data);
 await read(await ctx.send(dp+'/approve',{reviewed:true,outputSha256:d.data.output_sha256},d.version));await read(await ctx.send(dp+'/stamp',{},d.version));
 // Adding after sealing/validation must not change any already stamped piece.
 const added=await read(await ctx.upload(path+'/documents',Buffer.from(f.invoice,'base64'),'added-after-validation.pdf'),201);assert.ok(added.id);
 const duplicate=await read(await ctx.upload(path+'/documents',Buffer.from(f.pdf,'base64'),'duplicate.pdf'));assert.equal(duplicate.duplicate,true);
 assert.equal((await read(await ctx.call(path))).documents[0].status,'VERIFIED');
 const correction={allocationId:d.data.allocations[0].id,amount:'1400.00',reason:'Correction manuelle vérifiée',confirmed:true};
 await read(await ctx.send(dp+'/revise',{overrides:[correction],additions:[{id:'manual-'+randomUUID(),project:'NOUVEAU','amount':'100.00'}]},d.version));
 d=(await read(await ctx.call(path))).documents[0];assert.equal(d.status,'NEEDS_APPROVAL');assert.equal(d.data.total_cents,652398);assert.equal(d.data.allocations.length,7);assert.ok(d.data.blocks[0].image);
 assert.equal((await ctx.call(dp+'/output')).status,409);assert.equal((await ctx.send(dp+'/approve',{reviewed:true,outputSha256:original.output_sha256},d.version)).status,422);
 const stable=structuredClone(d);assert.equal((await ctx.send(dp+'/revise',{previous:original},d.version)).status,400);
 assert.equal((await ctx.send(dp+'/revise',{additions:[{id:'manual-'+randomUUID(),project:'TROP','amount':'9999'}]},d.version)).status,422);
 assert.deepEqual((await read(await ctx.call(path))).documents[0],stable);
 await read(await ctx.send(dp+'/revise',{placements:d.data.blocks.map(block=>({...block,image:undefined,x:100,y:200,scale:.8}))},d.version));
 d=(await read(await ctx.call(path))).documents[0];assert.equal(d.data.total_cents,stable.data.total_cents);assert.equal(d.data.blocks[0].x,100);assert.equal(d.data.blocks[0].scale,.8);
 assert.equal((await ctx.send(dp+'/revise',{},stable.version)).status,409);
 assert.equal(ctx.aiCalls(),ai);assert.ok(ctx.serviceActions.slice(calls).every(a=>a==='revise'));
 await read(await ctx.send(dp+'/approve',{reviewed:true,outputSha256:d.data.output_sha256},d.version));await read(await ctx.send(dp+'/stamp',{},d.version));assert.equal((await ctx.call(dp+'/output')).status,200);
 assert.equal((await ctx.call(dp+'/source')).status,200);
 console.log('Upload after validation, duplicate feedback contract, revisions without analysis/AI, manual project, overrun/stale/forged rejection and approval invalidation passed.');
}finally{await ctx.worker.dispose();}
