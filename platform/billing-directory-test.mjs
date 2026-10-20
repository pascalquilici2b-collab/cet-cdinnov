import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {seedBusinessDocument} from './business-migration.mjs';
import {blankDraft} from './billing-domain.ts';
import {blankClient,blankService,normalizeDirectory,lineFromService} from './billing-directory-domain.ts';

test('catalogue : calculs exacts et copies indépendantes',()=>{
 const data={...blankService(),label:'Assistance',unitPrice:'123,456789',vatRate:'5.5'};
 const normalized=normalizeDirectory('services',data),line=lineFromService(normalized);assert.equal(line.unitPrice,'123,456789');assert.equal(line.vatRate,'5.5');normalized.unitPrice='900';assert.equal(line.unitPrice,'123,456789');
 assert.equal(normalizeDirectory('services',{...data,reference:' étude-01 '}).reference,'ÉTUDE-01');
 const unpriced=normalizeDirectory('services',{...data,unitPrice:''});assert.equal(unpriced.unitPrice,'');assert.equal(lineFromService(unpriced).unitPrice,'');
 for(const patch of [{unitPrice:'-1'},{unitPrice:'12,'},{vatCategory:'E',vatRate:'20'},{vatCategory:'O',vatRate:'0',exemptionReason:''},{vatCategory:'S',vatRate:'0'},{label:''},{unitCode:'invalid'},{unitPrice:10},{secret:'x'}])assert.throws(()=>normalizeDirectory('services',{...data,...patch}));
 const customer=blankClient();customer.party.name='Client';assert.equal(normalizeDirectory('clients',customer).party.name,'Client');
 assert.throws(()=>normalizeDirectory('clients',{...customer,party:{...customer.party,email:'invalid'}}));
});

await test('répertoire réel D1 : clients partagés, catalogue, versions et conservation des documents',async t=>{
 const ctx=await testEnvironment();let header;
 const call=(path,method='GET',body,headers={})=>ctx.worker.dispatchFetch('https://preview.test/api/v1/billing'+path,{method,headers:{Origin:'https://app.cdinnov.eu','Content-Type':'application/json',...header,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
  await migrateBilling(ctx.db);await seedBusinessDocument(ctx.db,'budgets',{clients:[{id:'existing-client',name:'Client partagé',unknown:{keep:true}}]},1);
  const admin=await ctx.login(users[0]),reader=await ctx.login(users[1]);header={Authorization:'Bearer '+admin.token};
  await t.test('seule la direction accède au répertoire, aucun secret dans les réponses',async()=>{
   for(const [token,status] of [['',401],['Bearer '+reader.token,403]])for(const path of ['/clients','/services','/clients/existing-client'])assert.equal((await call(path,'GET',undefined,{Authorization:token})).status,status);
   const result=await call('/clients');assert.equal(result.status,200,await result.clone().text());assert.doesNotMatch(await result.clone().text(),/hash|salt|unknown/);const list=await result.json();assert.equal(list.total,1);assert.equal(list.records[0].version,0);assert.equal(list.records[0].id,'existing-client');assert.equal(list.records[0].data.party.addressLine1,'');
  });
  let client;
  await t.test('compléter un client Budgets conserve son identité et les données de Budgets',async()=>{
   const legacy=await ctx.db.prepare('SELECT * FROM budget_clients').all();const initial=await (await call('/clients/existing-client')).json();
   const data={...initial.data,party:{...initial.data.party,addressLine1:'1 rue du Test',postalCode:'20000',city:'Ajaccio',email:'client@example.invalid'}};
   assert.equal((await call('/clients/existing-client','PUT',{data})).status,428);
   const both=await Promise.all([call('/clients/existing-client','PUT',{data},{'If-Match':'0'}),call('/clients/existing-client','PUT',{data},{'If-Match':'0'})]);assert.deepEqual(both.map(r=>r.status).sort(),[200,201]);client=await both[0].json();assert.equal(client.version,1);assert.equal(client.id,'existing-client');
   assert.deepEqual((await ctx.db.prepare('SELECT * FROM budget_clients').all()).results,legacy.results);
   assert.equal((await (await call('/clients')).json()).total,1);
   await migrateBilling(ctx.db);assert.deepEqual(await (await call('/clients/existing-client')).json(),client);
  });
  let item,doc;
  await t.test('créations idempotentes et catalogue précis, refus des références en double',async()=>{
   const data={...blankService(),reference:'TECH-01',label:'Assistance technique',description:'Suivi du projet',unitPrice:'123.456789'},id=randomUUID();
   const first=await call('/services','POST',{id,data});assert.equal(first.status,201,await first.clone().text());item=await first.json();assert.equal(item.data.unitPrice,'123.456789');
   assert.equal((await call('/services','POST',{id,data})).status,200);
   assert.equal((await call('/services','POST',{id,data:{...data,label:'autre'}})).status,409);
   const duplicate=await call('/services','POST',{id:randomUUID(),data:{...data,reference:'tech-01'}});assert.equal(duplicate.status,409,await duplicate.clone().text());
   const blank=blankDraft('invoice');const d={...blank,buyer:structuredClone(client.data.party),clientId:client.id,lines:[lineFromService(item.data)]};
   const created=await call('/documents','POST',{id:randomUUID(),data:d});assert.equal(created.status,201);doc=await created.json();
   const c={...blankClient(),party:{...blankClient().party,name:'Nouveau client'}};assert.equal((await call('/clients','POST',{id:randomUUID(),data:c})).status,201);
  });
  await t.test('concurrence, archive et restauration ne changent aucun instantané documentaire',async()=>{
   const a={...client.data,party:{...client.data.party,addressLine1:'Adresse nouvelle'}},b={...client.data,party:{...client.data.party,addressLine1:'Autre adresse'}};
   const races=await Promise.all([call('/clients/'+client.id,'PUT',{data:a},{'If-Match':'1'}),call('/clients/'+client.id,'PUT',{data:b},{'If-Match':'1'})]);assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
   const saved=await call('/services/'+item.id,'PUT',{data:{...item.data,unitPrice:'900',archived:true}},{'If-Match':'1'});assert.equal(saved.status,200);item=await saved.json();
   assert.equal((await (await call('/services')).json()).total,0);assert.equal((await (await call('/services?archived=true')).json()).total,1);
   assert.equal((await call('/services','POST',{id:randomUUID(),data:{...item.data,archived:false}})).status,409);
   assert.deepEqual(await (await call('/documents/'+doc.id)).json(),doc);
   assert.equal((await call('/services/'+item.id,'PUT',{data:{...item.data,archived:false}},{'If-Match':'2'})).status,200);
   assert.equal((await ctx.db.prepare("SELECT count(*) AS n FROM billing_directory_versions WHERE kind='services' AND id=?").bind(item.id).first()).n,3);
   assert.equal((await call('/services/'+item.id,'DELETE')).status,405);
   await assert.rejects(()=>ctx.db.prepare('DELETE FROM billing_directory WHERE id=?').bind(item.id).run(),/BILLING_DIRECTORY_HISTORY/);
   await assert.rejects(()=>ctx.db.prepare('UPDATE billing_directory_versions SET data_json=? WHERE id=?').bind('{}',item.id).run(),/BILLING_DIRECTORY_HISTORY/);
  });
  await t.test('recherche littérale et pagination, pas de mutation depuis une origine non autorisée',async()=>{
   const accent={...blankService(),reference:'ÉTUDE-02',label:'ÉTUDE de faisabilité',unitPrice:'30'};assert.equal((await call('/services','POST',{id:randomUUID(),data:accent})).status,201);
   assert.equal((await (await call('/services?q=etude')).json()).total,1);
   assert.equal((await (await call('/services?q='+encodeURIComponent('étude'))).json()).total,1);
   const found=await (await call('/services?q=tech-01&limit=1&offset=0')).json();assert.equal(found.total,1);assert.equal(found.records[0].id,item.id);
   assert.equal((await (await call('/services?q='+encodeURIComponent("%' OR 1=1--"))).json()).total,0);
   for(const query of ['limit=0','limit=101','offset=-1','archived=1','q=a&q=b','unknown=1'])assert.equal((await call('/clients?'+query)).status,400);
   assert.equal((await call('/clients','POST',{id:randomUUID(),data:blankClient()},{Origin:'https://untrusted.test'})).status,403);
   assert.equal((await call('/clients/missing','PUT',{data:client.data},{'If-Match':'0'})).status,404);
  });
 }finally{await ctx.worker.dispose();}
});
