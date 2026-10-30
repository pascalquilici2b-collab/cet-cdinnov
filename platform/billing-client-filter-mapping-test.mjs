import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {build} from 'esbuild';
const output=await build({entryPoints:[fileURLToPath(new URL('./client/billing-imports.tsx',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {listWithImports}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const query={kind:'invoice',q:'',state:'all',offset:0,limit:10};
const transportFor=clients=>({list:async q=>({documents:[],total:0,offset:q.offset,limit:q.limit,filters:{clients,projects:[]}})});

test('Import : clientId prime sur une ancienne dénomination',async()=>{
 const clients=[{value:'id:identified-client',label:'Dénomination actuelle'}];
 const source={invoices:[{id:'old-invoice',clientId:'identified-client',client:'Ancienne dénomination',number:'HIST-001',dateFacture:'2026-09-01',paymentConfirmed:true}],act:()=>{}};
 const page=await listWithImports(transportFor(clients),{...query,client:'id:identified-client'},source);
 assert.equal(page.total,1,'Un import explicitement lié ne doit pas disparaître sous le filtre de son client');
 assert.deepEqual(page.filters.clients,clients,'Le libellé historique ne crée pas de deuxième option');
 assert.equal(source.invoices[0].client,'Ancienne dénomination');
});

test('Import : deux clients homonymes ne sont jamais rapprochés arbitrairement',async()=>{
 const clients=[{value:'id:client-north',label:'Atelier Démonstration'},{value:'id:client-south',label:'Atelier Démonstration'}];
 const source={invoices:[{id:'ambiguous-invoice',client:'Atelier Démonstration',number:'HIST-002',dateFacture:'2026-09-01'}],act:()=>{}};
 const page=await listWithImports(transportFor(clients),{...query,client:'id:client-north'},source);
 assert.equal(page.total,0,'Un nom ambigu doit rester autonome, pas être attribué au premier client rencontré');
});

test('Import : le rapprochement serveur des anciennes dénominations survit aux pages et filtres',async()=>{
 const clients=[{value:'id:current-client',label:'Dénomination actuelle'},{value:'id:other-client',label:'Autre client'}];
 const importedClients={'invoice-1':'id:current-client','invoice-2':'id:current-client','invoice-3':'id:current-client','invoice-4':'id:other-client'};
 const source={invoices:[
  {id:'invoice-1',client:'Ancienne dénomination',dateFacture:'2026-09-01'},
  {id:'invoice-2',client:'Sigle historique',dateFacture:'2026-09-02'},
  {id:'invoice-3',client:'Ancienne autre orthographe',dateFacture:'2026-09-03'},
  {id:'invoice-4',client:'Autre client',dateFacture:'2026-09-04'}
 ],act:()=>{}},before=structuredClone(source.invoices);
 const transport={list:async q=>({documents:[],total:0,offset:q.offset,limit:q.limit,filters:{clients,projects:[],importedClients}})};
 const page1=await listWithImports(transport,{...query,client:'id:current-client',offset:0,limit:2},source);
 const page2=await listWithImports(transport,{...query,client:'id:current-client',offset:2,limit:2},source);
 assert.equal(page1.total,3);assert.equal(page2.total,3);
 assert.equal((await listWithImports(transport,{...query,q:'Dénomination actuelle'},source)).total,3,'La recherche courante retrouve aussi les anciens noms importés');
 assert.equal(new Set([...page1.documents,...page2.documents].map(d=>d.id)).size,3);
 assert.deepEqual(page1.filters.clients.map(c=>c.value).sort(),['id:current-client','id:other-client']);
 assert.deepEqual(source.invoices,before,'Le regroupement conserve toutes les références et dénominations archivées');
});
