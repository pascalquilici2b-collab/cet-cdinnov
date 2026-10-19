import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load,workspace} from './load-ts.mjs';
import {applyRecordChanges} from '../../../platform/record-changes.ts';
const {WorkspaceStore}=await load('workspace-store.ts');
const ok=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
test('Writes queue in order, using the latest revision and preserving every field',async()=>{
 const original=workspace(),writes=[];let revision=4,release,server=structuredClone(original);
 const store=new WorkspaceStore(async options=>{
  if(!options)return ok({state:original,revision});
  const value=JSON.parse(options.body);writes.push(value);assert.equal(options.method,'PATCH');assert.equal(value.state,undefined);
  if(writes.length===1)await new Promise(resolve=>release=resolve);
  server=applyRecordChanges(server,value.changes);return ok({revision:++revision});
 },60000);
 await store.reload();store.update(s=>({...s,first:true}));const saving=store.flush();
 store.update(s=>({...s,second:true}));release();await saving;
 assert.equal(writes.length,2);assert.deepEqual(writes[1].changes,[{path:['second'],value:true}]);assert.equal(server.first,true);assert.equal(server.second,true);assert.deepEqual(server.future,original.future);assert.deepEqual(server.sheets,original.sheets);assert.equal(store.getSnapshot().status,'saved');store.dispose();
});
test('Conflicts retain the local copy and never overwrite a newer server revision',async()=>{
 let writes=0;const store=new WorkspaceStore(async options=>{if(!options)return ok({state:workspace(),revision:2});writes++;return new Response('{"error":"conflict"}',{status:409});},60000);
 await store.reload();store.update(s=>({...s,localChange:'retain me'}));await assert.rejects(store.flush(),/autre fenêtre/);
 assert.equal(store.getSnapshot().status,'conflict');assert.equal(store.current.current.localChange,'retain me');store.update(s=>({...s,anotherChange:true}));await assert.rejects(store.flush());assert.equal(writes,1);store.dispose();
});
test('Network failure retains queued changes and a manual retry saves them',async()=>{
 let failed=true;const writes=[];const store=new WorkspaceStore(async options=>{if(!options)return ok({state:workspace(),revision:1});writes.push(JSON.parse(options.body));if(failed)throw new Error('Hors ligne');return ok({revision:2});},60000);
 await store.reload();store.update(s=>({...s,retained:true}));await assert.rejects(store.flush(),/Hors ligne/);failed=false;await store.flush();assert.deepEqual(writes[0],writes[1]);assert.equal(store.getSnapshot().status,'saved');store.dispose();
});
test('Invalid server data cannot replace a loaded workspace',async()=>{
 let invalid=false;const store=new WorkspaceStore(async()=>ok({state:invalid?{}:workspace(),revision:1}));await store.reload();const before=store.current.current;invalid=true;await store.reload();assert.equal(store.current.current,before);assert.equal(store.getSnapshot().status,'error');store.dispose();
});
test('Disposed workspaces ignore late loads',async()=>{
 let release;const store=new WorkspaceStore(()=>new Promise(resolve=>release=resolve));const loading=store.reload();store.dispose();release(ok({state:workspace(),revision:1}));await loading;assert.equal(store.current.current,null);
});
