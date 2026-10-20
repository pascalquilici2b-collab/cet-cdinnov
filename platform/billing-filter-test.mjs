import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {blankDraft} from './billing-domain.ts';

process.env.MARCHES_TEST_WORKER=fileURLToPath(new URL('../.build/entry.mjs',import.meta.url));
process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
const ctx=await testEnvironment();
try{
 await migrateBilling(ctx.db);
 const auth=await ctx.login(users[0]);
 const headers={Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+auth.token,'Content-Type':'application/json'};
 const call=(path,options={})=>ctx.worker.dispatchFetch('https://preview.test/api/v1/billing'+path,{...options,headers:{...headers,...options.headers}});
 const list=async params=>{const r=await call('/documents?'+new URLSearchParams(params));assert.equal(r.status,200,await r.clone().text());return r.json();};
 const ids=[];
 for(let i=0;i<25;i++){
  const data=blankDraft('invoice','2026-10-20');
  data.title='Mission '+i;data.clientId=i<23?'client-a':'client-b';data.buyer.name=i<23?'CCI de Corse':'CCI du Var';
  data.references.project=i%2?'Projet B':"Projet A %_ '";
  const id=randomUUID(),r=await call('/documents',{method:'POST',body:JSON.stringify({id,data})});
  assert.equal(r.status,201,await r.clone().text());ids.push(id);
 }
 const q=blankDraft('quote','2026-10-20');q.title='Devis test';q.buyer.name='Client du devis';q.references.project='Projet devis';
 assert.equal((await call('/documents',{method:'POST',body:JSON.stringify({id:randomUUID(),data:q})})).status,201);
 const first=await list({kind:'invoice',limit:1});
 assert.equal(first.total,25);assert.equal(first.documents.length,1);
 assert.equal(first.filters.clients.length,2);assert.equal(first.filters.projects.length,2);
 assert.deepEqual(first.filters.clients.map(x=>x.value).sort(),['id:client-a','id:client-b']);
 const page1=await list({kind:'invoice',client:'id:client-a',limit:20,offset:0});
 const page2=await list({kind:'invoice',client:'id:client-a',limit:20,offset:20});
 assert.equal(page1.total,23);assert.equal(page2.total,23);
 assert.equal(new Set([...page1.documents,...page2.documents].map(d=>d.id)).size,23);
 const combined=await list({kind:'invoice',client:'id:client-b',project:"name:Projet A %_ '",state:'draft',q:'Mission'});
 assert.equal(combined.total,1);assert.equal(combined.documents[0].data.title,'Mission 24');
 assert.deepEqual(combined.filters,first.filters,'Facet choices must survive a restrictive search');
 assert.equal((await list({kind:'invoice',project:"name:Projet A %_ '"})).total,13);
 assert.equal((await list({kind:'invoice',client:"' OR 1=1 --"})).total,0);
 assert.equal((await list({kind:'invoice',client:'id:client-b',q:'missing'})).total,0);
 assert.equal((await list({kind:'invoice',client:'id:client-b',state:'issued'})).total,0);
 const quotes=await list({kind:'quote',client:'name:Client du devis',project:'name:Projet devis'});
 assert.equal(quotes.total,1);assert.equal(quotes.filters.clients.length,1);
 // Historical snapshots retain stable linked identities even after their labels change.
 await ctx.db.prepare("UPDATE billing_documents SET version=version+1,data_json=json_set(data_json,'$.buyer.name','Ancien nom','$.references.projectId','project-linked') WHERE id=?").bind(ids[0]).run();
 const linked=await list({kind:'invoice',project:'id:project-linked',client:'id:client-a'});
 assert.equal(linked.total,1);assert.equal(linked.documents[0].id,ids[0]);
 assert.equal((await list({kind:'invoice',client:'id:client-a'})).total,23);
 for(const params of ['client=a&client=b','project=a&project=b','client='+('a'.repeat(601)),'project='+('a'.repeat(601))]){
  assert.equal((await call('/documents?'+params)).status,400);
 }
 assert.equal((await call('/documents?client=id:client-a',{headers:{Authorization:''}})).status,401);
 console.log('PASS exact client/project filters, stable facets, cross-page counts, combined text/status, quote isolation, literal characters and authentication.');
}finally{await ctx.worker.dispose();}
