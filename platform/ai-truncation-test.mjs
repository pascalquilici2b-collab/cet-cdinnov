import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

async function sourceModule(path){
 const {outputFiles}=await build({entryPoints:[path],bundle:true,format:'esm',platform:'node',write:false});
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}
const {analyzeEngagement}=await sourceModule('platform/billing-engagement-analysis.ts');
const {stampingSuggestions}=await sourceModule('platform/stamping-ai.ts');
const {paymentLayoutSuggestions}=await sourceModule('platform/stamping-layout-ai.ts');
const evidence=[{line:0,text:'Matricule : SAL-TEST'}];
const candidates=[{sheet:'Projet fictif',rows:2,columns:1,cells:[{cell:'A1',row:0,column:0,text:'Projet ALPHA',kind:'text'}]}];
const scenarios=[
 {name:'engagement references',payload:{facts:[{field:'reference',value:'BC-TEST',quote:'Bon BC-TEST.'}]},call:async(db,env)=>{
  const request=new Request('https://local.test/api/v1/billing/engagement-analysis',{method:'POST',body:JSON.stringify({text:'Bon BC-TEST. Montant à vérifier dans la pièce.'})});
  return analyzeEngagement(request,db,env,(status,body)=>({status,body}));
 },accepted:r=>assert.deepEqual(r,{status:200,body:{fields:{reference:'BC-TEST'}}}),rejected:r=>{assert.equal(r.status,503);assert.equal(r.body.fields,undefined);}},
 {name:'stamping identification',payload:{suggestions:[{field:'employee_ref',value:'SAL-TEST',quote:'Matricule : SAL-TEST'}]},call:(db,env)=>stampingSuggestions(db,env,evidence),accepted:r=>{assert.equal(r.status,'completed');assert.equal(r.suggestions[0].value,'SAL-TEST');},rejected:r=>{assert.equal(r.status,'failed');assert.deepEqual(r.suggestions,[]);}},
 {name:'payment table layout',payload:{plans:[{sheet:'table-1',orientation:'rows',header:0,mapping:{},fixed:{project_name:{cell:'A1',quote:'ALPHA'}}}]},call:(db,env)=>paymentLayoutSuggestions(db,env,candidates,'RH'),accepted:r=>{assert.equal(r.status,'completed');assert.equal(r.plans[0].fixed.project_name.quote,'ALPHA');},rejected:r=>{assert.equal(r.status,'failed');assert.deepEqual(r.plans,[]);}}
];
for(const scenario of scenarios){
 for(const shape of ['chat','binding','binding-top-level'])test(scenario.name+' rejects valid JSON marked as truncated ('+shape+')',async()=>{
  let truncated=false,reservations=0,calls=0;
  const db={prepare(){return {bind(){return {async first(){reservations++;return {reserved:1};}};}};}};
  const env={MARKETS_AI:{async run(){calls++;const content=JSON.stringify(scenario.payload),finish_reason=truncated?'length':'stop';
   if(shape==='chat')return {choices:[{finish_reason,message:{content}}]};
   if(shape==='binding-top-level')return {response:content,finish_reason};
   return {response:content,choices:[{finish_reason}]};
  }}};
  // Identical, sourced JSON succeeds when the provider reports a complete
  // answer; truncation alone must prevent accepting its partial fields/plan.
  scenario.accepted(await scenario.call(db,env));
  truncated=true;
  scenario.rejected(await scenario.call(db,env));
  assert.equal(calls,2);
  assert.equal(reservations,2,'failed inference retains its budget reservation');
 });
}
