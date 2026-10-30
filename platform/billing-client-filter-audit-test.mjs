import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {testEnvironment,users} from '../marches/test.mjs';
import {emptyMarket} from '../marches/domain.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {seedBusinessDocument} from './business-migration.mjs';
import {blankClient} from './billing-directory-domain.ts';
import {quoteFixtureTools,quoteFixture,samplePDF} from './billing-quote-fixture.mjs';

const ok=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
async function setup(run){
 const ctx=await testEnvironment();try{
  await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).token,q=await quoteFixtureTools(ctx,token),f=await quoteFixtureTools(ctx,token,{kind:'invoice',prefix:'CLIENT-AUDIT-'});
  const client=async(name,siret,siren=siret.slice(0,9))=>ok(await q.call('/clients','POST',{id:randomUUID(),data:{...blankClient(),party:{...quoteFixture().buyer,name,siret,siren}}}),201);
  const invoice=(record,patch={},ready=false)=>{
   const data={...quoteFixture(),kind:'invoice',validUntil:'',clientId:record?.id||'',buyer:structuredClone(record?.data.party||quoteFixture().buyer),...patch};
   return f.create(data,ready);
  };
  const list=async(params={})=>ok(await q.call('/documents?'+new URLSearchParams({state:'all',limit:'100',offset:'0',...params})));
  const snapshot=async(tables)=>{
   const result={};for(const table of tables)result[table]=(await ctx.db.prepare('SELECT * FROM '+table).all()).results.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return result;
  };
  await run({ctx,token,q,f,client,invoice,list,snapshot});
 }finally{await ctx.worker.dispose();}
}

test('client rename unifies historical IDs, exact SIRETs and proven old names without rewriting documents or market links',async()=>setup(async({ctx,token,q,f,client,invoice,list,snapshot})=>{
 const oldName='Chambre historique de la région Test',newName='Établissement public renommé de la région Test',siret='39217556800022';
 let customer=await client(oldName,siret);const marketId=randomUUID(),market={...emptyMarket(),reference:'M-HISTORIQUE',title:'Accord-cadre de test',clientId:customer.id,clientName:oldName};
 await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(marketId,JSON.stringify(market),new Date().toISOString(),users[0]).run();
 const original=await invoice(customer,{},true);
 const previousId=await invoice(customer,{clientId:randomUUID()},true);
 const oldNameOnly=await invoice(null,{buyer:{...customer.data.party,siren:'',siret:''}});
 const formattedSiret=await invoice(null,{buyer:{...customer.data.party,name:'Abréviation de l’ancien client',siret:'392 175 568 00022',siren:''}});
 const quoteData={...quoteFixture(),clientId:'',buyer:structuredClone(customer.data.party)};quoteData.references={...quoteData.references,marketId,marketReference:market.reference};
 let quote=await q.create(quoteData);quote=await ok(await q.send(quote),201);
 await ok(await ctx.worker.dispatchFetch('https://local/api/v1/billing/documents/'+quote.id+'/engagement?'+new URLSearchParams({kind:'signed_quote',reference:'Accord signé test',marketId}),{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+token,'If-Match':String(quote.version),'X-Filename':'Accord.pdf','Content-Type':'application/pdf'},body:samplePDF()}),201);
 let linked=await ok(await q.call('/documents/'+quote.id+'/convert','POST',{id:randomUUID()},{'If-Match':String(quote.version)}),201);linked=await f.finalize(linked);
 const tables=['billing_documents','billing_document_versions','billing_issuances','billing_quote_engagements','markets'],before=await snapshot(tables);
 customer=await ok(await q.call('/clients/'+customer.id,'PUT',{data:{...customer.data,party:{...customer.data.party,name:newName}}},{'If-Match':String(customer.version)}));
 const key='id:'+customer.id,all=await list();
 assert.deepEqual(all.filters.clients.map(({value,label})=>({value,label})),[{value:key,label:newName}],'The current directory name is the sole filter, including historical documents');
 const ids=[original.id,previousId.id,oldNameOnly.id,formattedSiret.id,quote.id,linked.id].sort(),pages=[];
 assert.deepEqual((await list({q:newName})).documents.map(d=>d.id).sort(),ids,'Searching the current denomination finds historical document snapshots');
 for(let offset=0;offset<ids.length;offset+=2){const page=await list({client:key,limit:'2',offset:String(offset)});assert.equal(page.total,ids.length);pages.push(...page.documents.map(d=>d.id));}
 assert.deepEqual(pages.sort(),ids,'Filter pagination neither loses nor duplicates historical documents');
 assert.deepEqual((await list({kind:'quote',client:key})).documents.map(d=>d.id),[quote.id]);
 assert.equal((await list({kind:'invoice',client:key})).total,5);
 const actual=await ok(await q.call('/documents/'+linked.id));assert.equal(actual.sourceDocumentId,quote.id);assert.equal(actual.data.references.marketId,marketId);
 assert.equal((await ok(await q.call('/context'))).markets.find(m=>m.id===marketId).id,marketId);
 assert.deepEqual(await snapshot(tables),before,'Renaming/filtering does not rewrite snapshots, document IDs, source links or markets');
}));

test('homonymous clients at the same address remain separate when their legal identities differ',async()=>setup(async({client,invoice,list})=>{
 const name='Service territorial partagé',a=await client(name,'39217556800022'),b=await client(name,'55210055400013');
 const docsA=[await invoice(a),await invoice(null,{buyer:structuredClone(a.data.party)})],docsB=[await invoice(b),await invoice(null,{buyer:structuredClone(b.data.party)})];
 const unresolved=await invoice(null,{buyer:{...a.data.party,siret:'',siren:''}}),all=await list({kind:'invoice'});
 const optionA=all.filters.clients.find(c=>c.value==='id:'+a.id),optionB=all.filters.clients.find(c=>c.value==='id:'+b.id);
 assert.ok(optionA);assert.ok(optionB);assert.notEqual(optionA.label,optionB.label,'Homonymous options have readable identity disambiguation');
 for(const [customer,docs] of [[a,docsA],[b,docsB]]){
  const page=await list({kind:'invoice',client:'id:'+customer.id});assert.deepEqual(page.documents.map(d=>d.id).sort(),docs.map(d=>d.id).sort());
  assert.ok(!page.documents.some(d=>d.id===unresolved.id),'A name/address match without identity must not pick an arbitrary homonym');
 }
 assert.equal(all.total,5,'Ambiguous documents remain visible in the unfiltered list');
}));

test('establishments sharing a parent SIREN are not merged and a SIREN-only document stays ambiguous',async()=>setup(async({client,invoice,list})=>{
 const name='Établissement régional test',a=await client(name,'39217556800022'),b=await client(name,'39217556800030');
 const docA=await invoice(a),docB=await invoice(b),anonymousA=await invoice(null,{buyer:{...a.data.party,siren:''}});
 const parentOnly=await invoice(null,{buyer:{...a.data.party,siret:''}}),all=await list({kind:'invoice'});
 const aPage=await list({kind:'invoice',client:'id:'+a.id}),bPage=await list({kind:'invoice',client:'id:'+b.id});
 assert.deepEqual(aPage.documents.map(d=>d.id).sort(),[docA.id,anonymousA.id].sort());assert.deepEqual(bPage.documents.map(d=>d.id),[docB.id]);
 assert.ok(![...aPage.documents,...bPage.documents].some(d=>d.id===parentOnly.id));
 assert.equal(all.total,4);assert.notEqual(all.filters.clients.find(c=>c.value==='id:'+a.id)?.label,all.filters.clients.find(c=>c.value==='id:'+b.id)?.label);
}));

test('brand-like historical names do not override a conflicting SIRET or an existing foreign client ID',async()=>setup(async({client,invoice,list})=>{
 const genuine=await client('Agence de développement économique de la Corse','39217556800022');
 const different=await client('ADEC','55210055400013');
 const one=await invoice(genuine),two=await invoice(different),three=await invoice(null,{buyer:{...different.data.party,name:'Agence de développement économique de la Corse'}});
 const incorrectSnapshot=await invoice(different,{buyer:structuredClone(genuine.data.party)});
 assert.deepEqual((await list({kind:'invoice',client:'id:'+genuine.id})).documents.map(d=>d.id),[one.id],'Known conflicting client identity is not silently replaced by a brand or snapshot match');
 assert.deepEqual((await list({kind:'invoice',client:'id:'+different.id})).documents.map(d=>d.id).sort(),[two.id,three.id,incorrectSnapshot.id].sort());
}));

test('portal invoice filters resolve market links and historical aliases while contradictory legal evidence wins',async()=>setup(async({ctx,client,invoice,list,snapshot})=>{
 const a=await client('Organisme actuel A','39217556800022'),b=await client('Organisme actuel B','55210055400013'),marketId=randomUUID();
 const market={...emptyMarket(),reference:'M-IMPORT-TEST',title:'Marché des anciennes factures',clientId:a.id,clientName:'Ancien nom de l’organisme A'};
 await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(marketId,JSON.stringify(market),new Date().toISOString(),users[0]).run();
 const noLegalIdentity=await client('Organisme sans identifiant juridique','',''),unidentifiedMarketId=randomUUID();
 await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(unidentifiedMarketId,JSON.stringify({...market,clientId:noLegalIdentity.id,clientName:noLegalIdentity.data.party.name}),new Date().toISOString(),users[0]).run();
 const budgetAlias='Ancien libellé normalisé uniquement dans Budgets',budget=await ctx.db.prepare("SELECT payload,version FROM business_budgets_workspace WHERE id='shared'").first();
 await seedBusinessDocument(ctx.db,'budgets',{...(budget?JSON.parse(budget.payload):{}),clients:[{id:a.id,name:a.data.party.name,aliases:[budgetAlias]}]},(budget?.version||0)+1);
 assert.equal((await ctx.db.prepare('SELECT count(*) AS total FROM budget_client_aliases').first()).total,1,'The alias fixture uses the normalized child table');
 const native=await invoice(a,{},true);
 const rows=[
  {id:'import-market',client:'Libellé historique du marché',marketId},
  {id:'import-identified',client:'Sigle ancien isolé A',siret:a.data.party.siret},
  {id:'import-alias-only',client:'Sigle ancien isolé A'},
  {id:'import-contradiction',client:'Libellé historique B',marketId,siret:b.data.party.siret},
  {id:'import-nested-identity',client:'Autre sigle ancien B',marketId,buyer:{siret:b.data.party.siret}},
  {id:'import-second-alias',client:'Autre sigle ancien B'},
  {id:'import-explicit-client',client:'Client explicitement lié',marketId,clientId:b.id},
  {id:'import-unidentified-market',client:'Ancien libellé B sur marché incomplet',marketId:unidentifiedMarketId,siret:b.data.party.siret},
  {id:'import-budget-alias',client:budgetAlias}
 ].map((row,index)=>({...row,number:'HIST-'+index,dateFacture:'2026-09-01',ht:100,ttc:120,paymentConfirmed:true,sentConfirmed:true}));
 const portal=await ctx.db.prepare("SELECT payload FROM app_portal_workspace WHERE id='shared'").first();
 await ctx.setPortal(JSON.stringify({...JSON.parse(portal.payload),factures:rows}));
 const tables=['billing_documents','billing_document_versions','billing_issuances','markets','portal_invoices','portal_invoice_parties','budget_clients','budget_client_aliases'],before=await snapshot(tables);
 const aImports=new Set(['import-market','import-identified','import-alias-only','import-budget-alias']);
 const expected=Object.fromEntries(rows.map(row=>[row.id,'id:'+(aImports.has(row.id)?a.id:b.id)]));
 const page=await list({kind:'invoice'});
 assert.deepEqual(page.filters.importedClients,expected,'Explicit identities beat market inference and proven import aliases classify older imports');
 assert.deepEqual(page.filters.clients.map(c=>c.value).sort(),['id:'+a.id,'id:'+b.id].sort());
 assert.equal(page.filters.clients.find(c=>c.value==='id:'+a.id).label,a.data.party.name);
 assert.equal(page.filters.clients.find(c=>c.value==='id:'+b.id).label,b.data.party.name);
 assert.deepEqual((await list({kind:'invoice',client:'id:'+a.id,limit:'1'})).filters.importedClients,expected,'Pagination and filters retain mappings for all imported records');
 // Exercise the real UI merger against the real local endpoint, including native and imported pages.
 const bundled=await build({entryPoints:[fileURLToPath(new URL('./client/billing-imports.tsx',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
 const {listWithImports}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
 const source={invoices:structuredClone(rows),act:()=>{}},sourceBefore=structuredClone(source.invoices),transport={list:query=>list(query)};
 for(const [customer,wanted] of [[a,[native.id,...rows.filter(r=>aImports.has(r.id)).map(r=>'imported:'+r.id)]],[b,rows.filter(r=>!aImports.has(r.id)).map(r=>'imported:'+r.id)]]){
  const seen=[];for(let offset=0;offset<wanted.length;offset+=2){
   const merged=await listWithImports(transport,{kind:'invoice',state:'all',q:'',client:'id:'+customer.id,offset,limit:2},source);
   assert.equal(merged.total,wanted.length);seen.push(...merged.documents.map(d=>d.id));
   assert.equal(merged.filters.clients.length,2,'Historical labels do not reappear as extra filter options');
  }
  assert.deepEqual(seen.sort(),wanted.sort());
 }
 assert.deepEqual(source.invoices,sourceBefore);assert.deepEqual(await snapshot(tables),before,'Filtering and merging never mutate original invoices, PDFs, client references or market payloads');
}));
