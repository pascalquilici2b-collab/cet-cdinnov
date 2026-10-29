import assert from 'node:assert/strict';
import {stampEnvironment,py} from './stamping-test-helper.mjs';
const fixture=JSON.parse(await py(['-c',"import runpy,json,base64;m=runpy.run_path('tests/test_stamping_layout.py');print(json.dumps({'raw':base64.b64encode(m['workbook'](m['ROWS'])).decode(),'plan':m['PLAN']}))"]));
const ctx=await stampEnvironment({ai:async()=>({response:JSON.stringify({plans:[fixture.plan]})})});
const read=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
try{
 const id=(await read(await ctx.send('/batches',{name:'Synthetic semantic import',category:'RH'}),201)).id;
 await read(await ctx.upload(`/batches/${id}/table`,Buffer.from(fixture.raw,'base64'),'unfamiliar-layout.xlsx',1));
 const batch=await read(await ctx.call('/batches/'+id));
 assert.equal(batch.data.importConfirmed,false);assert.equal(batch.data.table.layoutAI.status,'completed');
 assert.equal(batch.data.import.mapping.semantic,true);assert.deepEqual(batch.data.import.errors,[]);
 assert.deepEqual(batch.data.import.groups.map(g=>g.total_cents),[125000,90000]);
 assert.equal(ctx.aiCalls(),1);assert.deepEqual(ctx.serviceActions,['inspect','resolve-layout']);
 assert.ok(!JSON.stringify(ctx.aiRequests).includes('1250'));
 assert.deepEqual(Buffer.from(await(await ctx.call(`/batches/${id}/table/source`)).arrayBuffer()),Buffer.from(fixture.raw,'base64'));
 console.log('OK: unknown layout interpreted by AI plan, original values extracted by Python, no automatic confirmation and no numeric values transmitted to AI.');
}finally{await ctx.worker.dispose();}
