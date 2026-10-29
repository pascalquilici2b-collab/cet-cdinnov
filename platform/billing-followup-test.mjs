import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {quoteFixtureTools,quoteFixture} from './billing-quote-fixture.mjs';
import {emptyMarket} from '../marches/domain.mjs';
import {viewportRectangle} from './client/pdf-viewport.ts';

test('PDF overlay coordinates use the viewport affine transform at every zoom/rotation',()=>{
 assert.deepEqual(viewportRectangle([2,0,0,-2,0,1684],[10,20,50,40]),[20,1644,100,1604]);
 assert.deepEqual(viewportRectangle([0,1,1,0,0,0],[10,20,50,40]),[20,10,40,50]);
});
test('quote tracking title preserves issued snapshot; shared engagement checks combined invoice capacity',async()=>{
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).token,f=await quoteFixtureTools(ctx,token);
  const q=await f.create(),original=(await ctx.db.prepare('SELECT data_json FROM billing_documents WHERE id=?').bind(q.id).first()).data_json;
  let response=await f.call('/documents/'+q.id+'/followup','PATCH',{title:'Nouveau libellé de suivi'},{'If-Match':'0'});assert.equal(response.status,200,await response.clone().text());
  let updated=await response.json();assert.equal(updated.followup.title,'Nouveau libellé de suivi');assert.equal(updated.data.title,q.data.title);assert.equal(updated.version,q.version);
  assert.equal((await ctx.db.prepare('SELECT data_json FROM billing_documents WHERE id=?').bind(q.id).first()).data_json,original);
  assert.equal((await f.call('/documents/'+q.id+'/followup','PATCH',{title:'Écrasement'},{'If-Match':'0'})).status,409);
  const mId=randomUUID(),a=randomUUID(),b=randomUUID(),small=randomUUID();
  const m={...emptyMarket(),clientName:'Atelier Horizon',title:'Marché test',orders:[{id:a,reference:'A',amountMinor:100000},{id:b,reference:'B',amountMinor:100000},{id:small,reference:'PETIT',amountMinor:50000}]};
  await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(mId,JSON.stringify(m),new Date().toISOString(),users[0]).run();
  const inv=async()=>{const id=randomUUID(),d={...quoteFixture(),kind:'invoice',validUntil:''};d.lines[0].quantity='1';d.lines[0].unitPrice='300';d.references={...d.references,marketId:mId,orderId:a,orderReference:'A'};
   const r=await f.call('/documents','POST',{id,data:d});assert.equal(r.status,201,await r.clone().text());return await r.json();};
  const accepted=await f.send(q);assert.equal(accepted.status,201);
  const one=await inv(),two=await inv();
  // Fixtures link the two draft invoices at creation as the conversion route does.
  // Recreate via INSERT with a source, never mutate the immutable source identity.
  for(const i of [one,two]){const row=await ctx.db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(i.id).first();const linked=randomUUID();await ctx.db.prepare('INSERT INTO billing_documents(id,kind,status,version,data_json,totals_json,issues_json,create_hash,source_document_id,source_version,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(linked,row.kind,row.status,1,row.data_json,row.totals_json,row.issues_json,row.create_hash,q.id,q.version,row.created_at,row.updated_at,row.created_by,row.updated_by).run();await f.call('/documents/'+i.id,'DELETE',undefined,{'If-Match':'1'});i.id=linked;}
  response=await f.call('/documents/'+one.id+'/followup','PATCH',{marketId:mId,orderId:small},{'If-Match':'1'});assert.equal(response.status,422,await response.clone().text());
  response=await f.call('/documents/'+one.id+'/followup','PATCH',{marketId:mId,orderId:b},{'If-Match':'1'});assert.equal(response.status,200,await response.clone().text());
  for(const id of [q.id,one.id,two.id]){const r=await(await f.call('/documents/'+id)).json();assert.equal(r.followup.link.orderId,b);}
  const amounts=(await ctx.db.prepare('SELECT order_id,sum(amount_minor) amount FROM billing_order_allocations GROUP BY order_id').all()).results;assert.deepEqual(amounts,[{order_id:b,amount:60000}]);
  assert.equal((await f.call('/documents/'+one.id+'/followup','PATCH',{title:'Forbidden'},{'If-Match':'2'})).status,422);
  assert.equal((await ctx.db.prepare('SELECT count(*) n FROM billing_document_followup_history').first()).n,2);
  await assert.rejects(ctx.db.prepare("UPDATE billing_documents SET totals_json=json_set(totals_json,'$.netMinor',80000),version=version+1 WHERE id=?").bind(one.id).run(),/BILLING_ORDER_LIMIT/);
  assert.equal((await ctx.db.prepare('SELECT sum(amount_minor) n FROM billing_order_allocations').first()).n,60000);
  await assert.rejects(ctx.db.prepare('DELETE FROM billing_document_followup_history').run(),/IMMUTABLE/);
 }finally{await ctx.worker.dispose();}
});
