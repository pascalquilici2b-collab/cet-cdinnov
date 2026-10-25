import assert from 'node:assert/strict';
import {stampEnvironment,fixtures} from './stamping-test-helper.mjs';
const ctx=await stampEnvironment(),f=await fixtures();
const read=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
try{
 const {id}=await read(await ctx.send('/batches',{name:'Qwen fallback and review QA'}),201),path='/batches/'+id;
 await read(await ctx.upload(path+'/table',Buffer.from(f.table,'base64'),'payment.csv',1));let b=await read(await ctx.call(path)),s=b.data.table.sheets[0];
 await read(await ctx.send(path+'/mapping',{mapping:{sheet:s.name,header:s.header,mapping:s.mapping},confirmed:true},b.version));b=await read(await ctx.call(path));
 const g=b.data.import.groups.find(g=>g.document_type==='PAYSLIP');g.employee_ref='OTHER';await ctx.db.prepare('UPDATE stamp_batches SET data=? WHERE id=?').bind(JSON.stringify(b.data),id).run();
 const dId=(await read(await ctx.upload(path+'/documents',Buffer.from(f.pdf,'base64'),'ambiguous.pdf'),201)).id;
 const wait=async()=>{const end=Date.now()+60000;while(Date.now()<end){const lot=await read(await ctx.call(path)),d=lot.documents[0];if(!['QUEUED','PROCESSING'].includes(d.status))return d;await new Promise(r=>setTimeout(r,200));}throw Error('Timeout');};
 await read(await ctx.send(path+'/documents/'+dId+'/analyze',{},1),202);let d=await wait();assert.equal(d.status,'REVIEW_REQUIRED');assert.equal(ctx.aiCalls(),1);assert.equal(d.data.error.code,'REVIEW_REQUIRED');assert.ok(d.data.reading);assert.ok(!d.data.total_cents);
 await read(await ctx.send(path+'/documents/'+dId+'/analyze',{choice:{groupId:g.id,identityConfirmed:true,baseConfirmed:true,baseAmount:'7177.10',reason:'Identité relue sur le document fictif'}},d.version),202);d=await wait();assert.equal(d.status,'NEEDS_APPROVAL');assert.equal(d.data.total_cents,645940);assert.equal(ctx.aiCalls(),1);assert.equal(d.data.ai.status,'not_needed');assert.equal(d.data.progress.stage,'complete');assert.ok(d.data.progress.elapsedMs>0);
 assert.equal(ctx.serviceActions.filter(a=>a==='analyze').length,2);assert.equal(ctx.serviceActions.filter(a=>['extract','process','preview'].includes(a)).length,0);
 await read(await ctx.call(path,{method:'DELETE'}));console.log('Fast path and Qwen fallback verified: ambiguous identity reviewed; explicit correction retains amounts; no duplicate extraction/network preview.');
}finally{await ctx.worker.dispose();}
