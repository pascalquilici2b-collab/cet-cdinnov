import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['platform/stamping-ai.ts'],bundle:true,format:'esm',platform:'node',write:false});
const {stampingSuggestions}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const syntheticBank='FR7600000000000000000000000',syntheticNir='1-00-01-2A-000-000-00';
let prompts=[],reservations=0;
const db={prepare(){return {bind(){return {async first(){reservations++;return {reserved:1};}};}};}};
const env={MARKETS_AI:{async run(model,input){prompts.push(input);return {response:JSON.stringify({suggestions:[
 {field:'employee_ref',value:'SAL-TEST',quote:'Matricule : SAL-TEST'},
 {field:'supplier_ref',value:syntheticBank,quote:'Fournisseur : '+syntheticBank},
 {field:'allocation_amount',value:'999',quote:'Matricule : SAL-TEST'},
]})};}}};
const result=await stampingSuggestions(db,env,[
 {line:0,text:'Fournisseur : '+syntheticBank},
 {line:1,text:'Matricule : SAL-TEST '+syntheticNir},
 {line:2,text:'IBAN : '+syntheticBank},
]);
assert.equal(result.status,'completed');
assert.deepEqual(result.suggestions,[{field:'employee_ref',value:'SAL-TEST',quote:'Matricule : SAL-TEST'}]);
const sent=JSON.stringify(prompts);
assert.ok(!sent.includes(syntheticBank)&&!sent.includes(syntheticNir));
assert.ok(sent.includes('SAL-TEST')&&sent.includes('[identifiant retiré]'));
const empty=await stampingSuggestions(db,env,[{line:0,text:'Fournisseur : '+syntheticBank}]);
assert.equal(empty.status,'unavailable');assert.equal(prompts.length,1);assert.equal(reservations,1);
console.log('AI egress: cached bank/social identifiers removed, useful evidence preserved, unsupported/ungrounded output rejected, no call for fully filtered input: PASS');
