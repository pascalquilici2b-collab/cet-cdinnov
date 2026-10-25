import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {stampEnvironment,fixtures,users} from './stamping-test-helper.mjs';
const ctx=await stampEnvironment(),f=await fixtures();let checks=0;
const read=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
const check=async(label,fn)=>{await fn();checks++;console.log('OK '+label);};
try{
 let id,payId,invoiceId,b;
 await check('Anonymous, collaborator and hostile origin rejected',async()=>{
  const other=await ctx.login(users[1]);assert.equal((await ctx.call('/batches',{headers:{Authorization:''}})).status,401);
  assert.equal((await ctx.call('/batches',{headers:{Authorization:'Bearer '+other.token}})).status,403);
  assert.equal((await ctx.call('/batches',{headers:{Origin:'https://evil.example'}})).status,403);
 });
 await check('Create private lot; import real CSV with exact provenance',async()=>{
  id=(await read(await ctx.send('/batches',{name:'Lot synthétique',useAI:true}),201)).id;b=await read(await ctx.call('/batches/'+id));
  await read(await ctx.upload(`/batches/${id}/table`,Buffer.from(f.table,'base64'),'allocations.csv',b.version));b=await read(await ctx.call('/batches/'+id));
  const s=b.data.table.sheets[0];await read(await ctx.send(`/batches/${id}/mapping`,{mapping:{sheet:s.name,header:s.header,mapping:s.mapping},confirmed:true},b.version));
  b=await read(await ctx.call('/batches/'+id));assert.equal(b.data.importConfirmed,true);assert.equal(b.data.import.groups.length,2);assert.equal(b.data.import.groups[0].total_cents,645940);
 });
 await check('PDF validation and duplicate prevention; original bytes preserved',async()=>{
  assert.equal((await ctx.upload(`/batches/${id}/documents`,Buffer.from('<html>'),'fake.pdf')).status,415);
  payId=(await read(await ctx.upload(`/batches/${id}/documents`,Buffer.from(f.pdf,'base64'),'bulletin-fictif.pdf'),201)).id;
  assert.equal((await read(await ctx.upload(`/batches/${id}/documents`,Buffer.from(f.pdf,'base64'),'copie.pdf'))).duplicate,true);
  invoiceId=(await read(await ctx.upload(`/batches/${id}/documents`,Buffer.from(f.invoice,'base64'),'facture-fictive.pdf'),201)).id;
  const source=await ctx.call(`/batches/${id}/documents/${payId}/source`);assert.deepEqual(Buffer.from(await source.arrayBuffer()),Buffer.from(f.pdf,'base64'));
 });
 await check('Persistent queue; real PDF engine; Qwen cannot change allocations',async()=>{
  await ctx.db.prepare("UPDATE stamp_documents SET status='PROCESSING',lease_until=? WHERE id=?").bind(Date.now()-1000,payId).run();
  const recovered=await read(await ctx.call('/batches/'+id));assert.equal(recovered.documents[0].status,'REVIEW_REQUIRED');assert.equal(recovered.documents[0].data.error.code,'INTERRUPTED');
  await read(await ctx.send(`/batches/${id}/documents/${payId}/analyze`,{},1),202);
  await read(await ctx.send(`/batches/${id}/documents/${invoiceId}/analyze`,{},1),202);
  const until=Date.now()+60000;
  do{b=await read(await ctx.call('/batches/'+id));if(b.documents.every(d=>!['QUEUED','PROCESSING'].includes(d.status)))break;await new Promise(r=>setTimeout(r,200));}while(Date.now()<until);
  assert.deepEqual(b.documents.map(d=>d.status),['NEEDS_APPROVAL','NEEDS_APPROVAL'],JSON.stringify(b.documents));
  for(const d of b.documents){assert.equal(d.data.total_cents,645940);assert.equal(d.data.remainder_cents,71770);assert.ok(Object.values(d.data.checks).every(Boolean));}
  assert.equal(ctx.aiCalls(),0);assert.equal(ctx.serviceActions.filter(a=>a==='analyze').length,2);assert.equal(ctx.serviceActions.filter(a=>a==='extract'||a==='process').length,0);assert.ok(ctx.aiRequests.every(r=>!JSON.stringify(r).includes('7177.1')));
 });
 await check('Approval required; preview hash bound to exact output; idempotent stamp',async()=>{
  let d=b.documents[0];assert.equal((await ctx.send(`/batches/${id}/documents/${d.id}/stamp`,{},d.version)).status,409);
  assert.equal((await ctx.call(`/batches/${id}/documents/${d.id}/output`)).status,409);
  assert.equal((await ctx.send(`/batches/${id}/documents/${d.id}/approve`,{reviewed:true,outputSha256:'bad'},d.version)).status,422);
  for(const d of b.documents){const approvals=await Promise.all([1,2].map(()=>ctx.send(`/batches/${id}/documents/${d.id}/approve`,{reviewed:true,outputSha256:d.data.output_sha256},d.version)));assert.deepEqual(approvals.map(r=>r.status).sort(),[200,409]);assert.equal((await ctx.send(`/batches/${id}/documents/${d.id}/analyze`,{},d.version)).status,409);await read(await ctx.send(`/batches/${id}/documents/${d.id}/stamp`,{},d.version));await read(await ctx.send(`/batches/${id}/documents/${d.id}/stamp`,{},d.version));}
  const output=await ctx.call(`/batches/${id}/documents/${d.id}/output`);assert.equal(createHash('sha256').update(Buffer.from(await output.arrayBuffer())).digest('hex'),d.data.output_sha256);
  assert.equal((await ctx.send(`/batches/${id}/mapping`,{},b.version)).status,409);
 });
 await check('ZIP successes and complete audit; no source mutation',async()=>{
  const r=await ctx.call(`/batches/${id}/export`);assert.equal(r.status,200);const files=unzipSync(new Uint8Array(await r.arrayBuffer()));assert.equal(Object.keys(files).filter(p=>p.endsWith('.pdf')).length,2);
  assert.match(strFromU8(files['rapport.csv']),/645940/);const trace=JSON.parse(strFromU8(files['tracabilite.json']));assert.ok(trace.audit.some(e=>e.action==='APPROVED'));assert.ok(trace.groups[0].allocations[0].source.cell);
  assert.deepEqual(Buffer.from(await(await ctx.call(`/batches/${id}/documents/${payId}/source`)).arrayBuffer()),Buffer.from(f.pdf,'base64'));
 });
 await check('Owner isolation, guessed IDs, generic R2 route blocked',async()=>{
  await ctx.setPortal(JSON.stringify({auth:{accounts:{...ctx.accounts,[users[1]]:{...ctx.accounts[users[1]],role:'admin'}},allowed:users}}));const other=await ctx.login(users[1]);
  for(const path of [`/batches/${id}`,`/batches/${id}/documents/${payId}/source`,`/batches/${id}/documents/${payId}/output`,`/batches/${id}/export`])assert.equal((await ctx.call(path,{headers:{Authorization:'Bearer '+other.token}})).status,404);
  const r=await ctx.worker.dispatchFetch('https://preview.example/files/stamping/any',{headers:{Origin:'http://127.0.0.1:5196',Authorization:'Bearer '+ctx.admin.token}});assert.equal(r.status,403);
  const empty=(await read(await ctx.send('/batches',{name:'Autre lot'}),201)).id;assert.equal((await ctx.call(`/batches/${empty}/documents/${payId}/source`)).status,404);
 });
 await check('Delete removes private originals, candidates and audit',async()=>{
  await read(await ctx.call('/batches/'+id,{method:'DELETE'}));assert.equal((await ctx.call('/batches/'+id)).status,404);
  assert.equal((await ctx.db.prepare('SELECT COUNT(*) n FROM stamp_documents WHERE batch_id=?').bind(id).first()).n,0);
  const bucket=await ctx.worker.getR2Bucket('CET_FILES');assert.equal((await bucket.list()).objects.length,0);
 });
 console.log(`${checks} integration scenarios passed (real Python PDF engine, isolated D1/R2/Queue, simulated Qwen).`);
}finally{await ctx.worker.dispose();}
