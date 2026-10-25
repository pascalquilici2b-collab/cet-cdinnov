import assert from 'node:assert/strict';
import {stampEnvironment} from './stamping-test-helper.mjs';
const ctx=await stampEnvironment();
const read=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
try{
 const rh=(await read(await ctx.send('/batches',{name:'RH',category:'RH'}),201)).id;
 const services=(await read(await ctx.send('/batches',{name:'Équipements',category:'SERVICES'}),201)).id;
 const legacy=(await read(await ctx.send('/batches',{name:'Ancien lot'}),201)).id;
 const mixed=(await read(await ctx.send('/batches',{name:'Ancien lot mixte'}),201)).id;
 await ctx.db.prepare("UPDATE stamp_batches SET data=json_set(data,'$.import',json(?)) WHERE id=?").bind(JSON.stringify({groups:[{document_type:'INVOICE'}]}),legacy).run();
 await ctx.db.prepare("UPDATE stamp_batches SET data=json_set(data,'$.import',json(?)) WHERE id=?").bind(JSON.stringify({groups:[{document_type:'PAYSLIP'},{document_type:'INVOICE'}]}),mixed).run();
 const list=(await read(await ctx.call('/batches'))).batches;
 assert.equal(list.find(b=>b.id===rh).category,'RH');assert.equal(list.find(b=>b.id===services).category,'SERVICES');assert.equal(list.find(b=>b.id===legacy).category,'SERVICES');assert.equal(list.find(b=>b.id===mixed).category,'MIXED');
 assert.equal((await read(await ctx.call('/batches/'+legacy))).data.category,undefined,'Classification must not rewrite legacy lots');
 assert.equal((await ctx.send('/batches',{name:'Invalid',category:'unknown'})).status,400);
 console.log('Categories verified: persistent new lots, inferred legacy types, mixed lots preserved, invalid input rejected.');
}finally{await ctx.worker.dispose();}
