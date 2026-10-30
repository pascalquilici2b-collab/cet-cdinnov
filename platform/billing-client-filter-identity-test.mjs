import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createClientFilterResolver,clientFilterNameKey} from './billing-client-filter-identity.ts';

const a={id:'client-a',name:'Entité actuelle',siret:'12345678900011',aliases:['Ancienne entité'],historicalIds:['old-a']};
const b={id:'client-b',name:'Autre entité',siret:'98765432100022'};

test('priorité aux identités explicites, puis aux identifiants juridiques exacts',()=>{
 const resolve=createClientFilterResolver([a,b]);
 assert.equal(resolve({clientId:a.id,name:b.name,siret:b.siret}).value,'id:'+a.id);
 assert.equal(resolve({clientId:'old-a',name:'Ancien nom'}).value,'id:'+a.id);
 assert.equal(resolve({clientId:'obsolete-id',name:'Nom historique',siret:'123 456 789 00011'}).value,'id:'+a.id);
 assert.equal(resolve({name:a.name,siret:b.siret}).value,'id:'+b.id);
 assert.equal(resolve({name:'Nom historique',siren:'123456789'}).value,'id:'+a.id);
});

test('noms et alias exacts uniquement, sans conflit juridique ni identité opaque inconnue',()=>{
 const resolve=createClientFilterResolver([a,b]);
 assert.equal(resolve({name:'ancienne ENTITÉ'}).value,'id:'+a.id);
 assert.equal(resolve({name:'Ancienne entité filiale nouvelle'}).value,'name:ancienne entite filiale nouvelle');
 assert.equal(resolve({name:a.name,siret:'12345678900999'}).value,'siret:12345678900999');
 assert.equal(resolve({name:a.name,siren:'111111111'}).value,'siren:111111111');
 assert.equal(resolve({clientId:'unknown-id',name:a.name}).value,'id:unknown-id');
 assert.equal(clientFilterNameKey("L’ENTITÉ / Exemple"),"l entite exemple");
});

test('les établissements distincts ne fusionnent pas et un SIREN partagé reste ambigu',()=>{
 const other={...a,id:'client-c',siret:'12345678900029',aliases:[],historicalIds:[]};
 const resolve=createClientFilterResolver([a,other]);
 assert.equal(resolve({name:a.name,siret:other.siret}).value,'id:client-c');
 assert.equal(resolve({name:a.name,siren:'123456789'}).value,'siren:123456789');
 assert.equal(resolve({name:a.name}).value,'name:entite actuelle');
 assert.match(resolve({clientId:a.id,name:a.name}).label,/SIRET 12345678900011$/);
 assert.match(resolve({clientId:other.id,name:a.name}).label,/SIRET 12345678900029$/);
 const distinctNames=createClientFilterResolver([a,{...other,name:'Établissement sud'}]);
 assert.equal(distinctNames({name:a.name,siren:'123456789'}).value,'siren:123456789','Un nom courant ne départage pas un SIREN couvrant plusieurs établissements');
});

test('seules les observations fortement identifiées enseignent les anciens noms',()=>{
 const observations=[{clientId:a.id,name:'Dénomination antérieure prouvée'},{name:'Ancienne forme légale prouvée',siret:a.siret},{name:'Nom libre sans preuve'},{clientId:a.id,name:'Alias contradictoire',siret:b.siret}];
 const resolve=createClientFilterResolver([a,b],observations);
 for(const name of ['Dénomination antérieure prouvée','Ancienne forme légale prouvée'])assert.equal(resolve({name}).value,'id:'+a.id);
 assert.equal(resolve({name:'Nom libre sans preuve'}).value,'name:nom libre sans preuve');
 assert.equal(resolve({name:'Alias contradictoire'}).value,'name:alias contradictoire');
 assert.equal(resolve({clientId:a.id,name:'Dénomination antérieure prouvée'}).label,a.name);
});

test('alias et identifiants historiques ambigus ne choisissent pas le premier homonyme',()=>{
 const clients=[{...a,aliases:['Nom partagé'],historicalIds:['shared-id']},{...b,aliases:['Nom partagé'],historicalIds:['shared-id']}];
 for(const order of [clients,[...clients].reverse()]){
  const resolve=createClientFilterResolver(order);
  assert.equal(resolve({name:'Nom partagé'}).value,'name:nom partage');
  assert.equal(resolve({clientId:'shared-id',name:'Nom partagé'}).value,'id:shared-id');
 }
});

test('identités inconnues : clés stables et libellés désambiguïsés sans mutation',()=>{
 const input=[{name:'Atelier Exemple',siret:'11111111100011'},{name:'Atelier Exemple',siret:'22222222200022'}];
 const before=structuredClone(input),clients=structuredClone([a,b]),copy=structuredClone(clients),resolve=createClientFilterResolver(clients,input);
 assert.equal(resolve(input[0]).value,'siret:11111111100011');assert.match(resolve(input[0]).label,/11111111100011$/);
 assert.match(resolve(input[1]).label,/22222222200022$/);
 assert.equal(resolve({name:'  Entité   inconnue  '}).value,'name:entite inconnue');
 assert.deepEqual(input,before);assert.deepEqual(clients,copy);
});

test('les valeurs nulles historiques sont tolérées sans inventer une identité',()=>{
 const resolve=createClientFilterResolver([{id:null,name:null},{id:'empty',name:null,aliases:null,historicalIds:null},{...a,siren:null}], [{clientId:null,name:null,siret:null,siren:null}]);
 assert.deepEqual(resolve({clientId:null,name:null,siret:null,siren:null}),{value:'name:',label:'Client'});
 assert.equal(resolve({name:'Ancienne entité',siret:null,siren:null}).value,'id:'+a.id);
});

test('les doublons historiques de même SIRET partagent un filtre sans perdre leurs IDs d’origine',()=>{
 const clients=[{id:'record-b',name:'Office régional',siret:'48227635900023'},{id:'record-a',name:'Office régional',siret:'482 276 359 00023'}];
 const observations=clients.map(c=>({clientId:c.id,name:c.name})),before=structuredClone(clients);
 for(const ordering of [clients,[...clients].reverse()]){
  const resolve=createClientFilterResolver(ordering,observations);
  assert.deepEqual(resolve(observations[0]),{value:'id:record-a',label:'Office régional'});
  assert.deepEqual(resolve(observations[1]),resolve(observations[0]));
  assert.equal(resolve({name:'Office régional',siret:'48227635900023'}).value,'id:record-a');
 }
 assert.deepEqual(clients,before);
});

test('homonymes sans identité juridique : libellés lisibles et stables sans UUID visible',()=>{
 const clients=[{id:'d3f7aebd-1b4c-4923-b2ed-f8ab7268efb0',name:'Office régional'},{id:'7ea6a3c9-941a-49e1-88f9-fb338db05051',name:'Office régional'}];
 const before=structuredClone(clients),resolve=createClientFilterResolver(clients),reversed=createClientFilterResolver([...clients].reverse());
 const options=clients.map(c=>resolve({clientId:c.id,name:c.name}));
 assert.notEqual(options[0].value,options[1].value);assert.notEqual(options[0].label,options[1].label);
 for(const [i,c] of clients.entries()){
  assert.match(options[i].label,/ — fiche [12]$/);assert.ok(!options[i].label.includes(c.id));
  assert.deepEqual(options[i],reversed({clientId:c.id,name:c.name}));
 }
 assert.deepEqual(clients,before);
});

test('homonymes au même SIREN sans SIRET restent distincts avec des libellés différents',()=>{
 const clients=[{id:'north',name:'Organisme',siren:'482276359'},{id:'south',name:'Organisme',siren:'482276359'}];
 const resolve=createClientFilterResolver(clients),a=resolve({clientId:'north',name:'Organisme'}),b=resolve({clientId:'south',name:'Organisme'});
 assert.notEqual(a.value,b.value);assert.notEqual(a.label,b.label);
 assert.match(a.label,/SIREN 482276359 · fiche/);assert.match(b.label,/SIREN 482276359 · fiche/);
});
