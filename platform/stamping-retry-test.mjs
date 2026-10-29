import assert from 'node:assert/strict';
import {stampEnvironment,fixtures} from './stamping-test-helper.mjs';
let attempts=0;
const ctx=await stampEnvironment({service:payload=>payload.action==='analyze'&&++attempts===1?new Response('Busy',{status:503}):undefined}),f=await fixtures();
const read=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
try{
 const {id}=await read(await ctx.send('/batches',{name:'Synthetic retry regression'}),201),path='/batches/'+id;
 await read(await ctx.upload(path+'/table',Buffer.from(f.table,'base64'),'payment.csv',1));let b=await read(await ctx.call(path)),s=b.data.table.sheets[0];
 await read(await ctx.send(path+'/mapping',{mapping:{sheet:s.name,header:s.header,mapping:s.mapping},confirmed:true},b.version));
 const dId=(await read(await ctx.upload(path+'/documents',Buffer.from(f.pdf,'base64'),'synthetic.pdf'),201)).id;
 await read(await ctx.send(path+'/documents/'+dId+'/analyze',{},1),202);
 let doc;const deadline=Date.now()+95000;
 do{b=await read(await ctx.call(path));doc=b.documents[0];if(!['QUEUED','PROCESSING'].includes(doc.status))break;await new Promise(r=>setTimeout(r,500));}while(Date.now()<deadline);
 assert.equal(attempts,2);assert.equal(doc.status,'NEEDS_APPROVAL');assert.equal(doc.data.error,undefined);
 assert.equal(doc.data.base_cents,717710);assert.ok(Object.values(doc.data.checks).every(Boolean));
 assert.equal((await ctx.call(path+'/export')).status,422);
 console.log('Transient service failure retried; verified preview has no stale error and still requires user approval.');
}finally{await ctx.worker.dispose();}
