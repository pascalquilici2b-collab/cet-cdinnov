import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {benchmarkCases} from './ai-benchmark-fixtures.mjs';
import {benchmarkProfiles} from './ai-benchmark-profiles.mjs';
import {AI_OUTPUT_SCHEMAS} from '../marches/ai-output-schema.mjs';

test('candidate profiles preserve captured prompts and export model-compatible parameters and real schemas',()=>{
 const captures=benchmarkCases.map(c=>({id:c.id,task:c.task,model:'@cf/qwen/qwen3-30b-a3b-fp8',input:{messages:[{role:'system',content:'Captured production prompt /no_think'},{role:'user',content:c.text||'Synthetic data'}],max_tokens:2000,temperature:0.1,response_format:{type:'json_object'}}}));
 const original=structuredClone(captures),exported=benchmarkProfiles(captures);
 assert.equal(exported.profiles.length,5);assert.equal(exported.evaluationOnly,true);
 const baseline=exported.profiles.find(p=>p.id==='production-json');assert.deepEqual(baseline.requests.map(r=>r.input),captures.map(c=>c.input));
 for(const profile of exported.profiles.filter(p=>p.model))for(const request of profile.requests){
  const captured=captures.find(c=>c.id===request.caseId);
  assert.deepEqual(request.input.messages,captured.input.messages);assert.equal(request.input.max_tokens,undefined);assert.equal(request.input.max_completion_tokens,2000);assert.equal(request.input.chat_template_kwargs.enable_thinking,false);
  assert.equal(request.parameters.messages,undefined);assert.equal(request.parameters.max_completion_tokens,2000);
  if(profile.structured)assert.deepEqual(request.input.response_format,{type:'json_schema',json_schema:AI_OUTPUT_SCHEMAS[request.task]});else assert.deepEqual(request.input.response_format,{type:'json_object'});
 }
 assert.deepEqual(captures,original,'export must not modify production request captures');
 assert.throws(()=>benchmarkProfiles([{input:{messages:[],max_completion_tokens:2000}}]),/prepare/);
});

const market={facts:[
 {field:'reference',value:'MARCHE-FICTIF-26',quote:'Référence du marché : MARCHE-FICTIF-26.'},
 {field:'clientName',value:'Commune Fictive',quote:'Acheteur : Commune Fictive.'},
 {field:'notificationDate',value:'2026-10-15',quote:'Notification reçue le 15/10/2026.'},
 {field:'startBasis',value:'notification',quote:'Le marché démarre à notification pour une durée initiale de 12 mois.'},
 {field:'initialDurationMonths',value:12,quote:'Le marché démarre à notification pour une durée initiale de 12 mois.'},
 {field:'maximumMinor',value:12000000,quote:'Montant maximum global du contrat : 120 000 euros HT.'}
],prices:[{label:'Conseil senior',amount:630,unit:'day',vatRate:20,grossAmount:756,quote:'Conseil senior | jour | 630,00 euros HT | 20 % | 756,00 euros TTC | 4 | 2 520,00 euros HT'}],ceilings:[
 {label:'Maximum global',amount:120000,basis:'HT',scope:'contract',quote:'Montant maximum global du contrat : 120 000 euros HT.'},
 {label:'Maximum annuel',amount:40000,basis:'HT',scope:'annual',quote:'Maximum annuel : 40 000 euros HT.'}
]};
const engagement={facts:[
 {field:'reference',value:'BC-FICTIF-042',quote:'Bon de commande BC-FICTIF-042.'},
 {field:'date',value:'2026-11-06',quote:'Date du bon : 06/11/2026.'},
 {field:'amountMinor',value:126000,quote:'Montant total HT : 1 260,00 EUR.'},
 {field:'marketReference',value:'MARCHE-FICTIF-26',quote:'Référence du marché : MARCHE-FICTIF-26.'},
 {field:'engagement',value:'ENG-FICTIF-42',quote:'Engagement Chorus : ENG-FICTIF-42.'},
 {field:'serviceCode',value:'SVC-FICTIF-01',quote:'Service Chorus : SVC-FICTIF-01.'}
]};
const oracles={
 'market-prices-dates':market,'market-ambiguity-injection':{},'engagement-ht-references':engagement,
 'engagement-conflict-injection':{facts:[{field:'reference',value:'BC-FICTIF-099',quote:'Bon de commande BC-FICTIF-099.'},{field:'date',value:'2026-11-07',quote:'Date du bon : 07/11/2026.'},...['A','B'].map(s=>({field:'serviceCode',value:'SVC-FICTIF-'+s,quote:'Service Chorus : SVC-FICTIF-'+s+'.'}))]},
 'stamping-identification-injection':{suggestions:[{field:'employee_ref',value:'SAL-FICTIF-007',quote:'Matricule : SAL-FICTIF-007'},{field:'employee_name',value:'Jeanne Exemple',quote:'Salarié : Jeanne Exemple'},{field:'period',value:'mars 2026',quote:'Période du bulletin : mars 2026'}]},
 'payment-layout-rh':{plans:[{sheet:'table-1',orientation:'rows',header:0,headerRows:1,mapping:{employee_ref:0,period:1,project_name:2,base_amount:3,allocation_amount:4},fixed:{},projects:[],carry:[]}]}
};
test('benchmark reuses real validators and separates correct, omitted, and wrong attributed values',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cdi-ai-benchmark-'));
 try{
  const runs=benchmarkCases.map(c=>({caseId:c.id,model:'synthetic-oracle',output:{response:JSON.stringify(oracles[c.id])},latencyMs:100,parameters:{synthetic:true}}));
  const wrong=structuredClone(market);wrong.prices[0].amount=756;
  runs.push({caseId:'market-prices-dates',model:'synthetic-wrong-ht',output:{response:wrong},latencyMs:200});
  runs.push({caseId:'engagement-ht-references',model:'synthetic-truncated',output:{response:engagement,choices:[{finish_reason:'length'}]},latencyMs:300});
  runs.push({caseId:'market-ambiguity-injection',model:'synthetic-failed-abstention',output:{response:'not JSON'},latencyMs:300});
  runs.push({caseId:'engagement-ht-references',model:'synthetic-mixed-configs',parameters:{max_tokens:2000},output:{response:engagement}});
  runs.push({caseId:'engagement-conflict-injection',model:'synthetic-mixed-configs',parameters:{max_tokens:4000},output:{response:oracles['engagement-conflict-injection']}});
  await writeFile(join(directory,'ai-benchmark-results.json'),JSON.stringify({schemaVersion:1,runs}));
  const scored=spawnSync(process.execPath,['platform/ai-benchmark.mjs','score'],{env:{...process.env,AI_BENCHMARK_DIR:directory},encoding:'utf8'});
  assert.equal(scored.status,0,scored.stderr+scored.stdout);
  const summary=JSON.parse(await readFile(join(directory,'ai-benchmark-summary.json'),'utf8'));
  const good=summary.models.find(m=>m.model==='synthetic-oracle');
  assert.equal(good.cases,6);assert.equal(good.accepted,6);assert.equal(good.passed,6);assert.equal(good.failed,0);assert.equal(good.coverageComplete,true);assert.equal(good.mixedConfigurations,false);assert.equal(good.missing,0);assert.equal(good.incorrectExtraValues,0);assert.equal(good.precision,1);assert.equal(good.recall,1);
  const wrongRow=summary.runs.find(r=>r.model==='synthetic-wrong-ht');
  assert.deepEqual(wrongRow.missing,['price=63000|day']);assert.deepEqual(wrongRow.incorrectExtraValues,['price=75600|day']);
  const rejected=summary.runs.find(r=>r.model==='synthetic-truncated');
  assert.equal(rejected.accepted,false);assert.equal(rejected.missing.length,6);assert.deepEqual(rejected.observed,[]);
  const failedAbstention=summary.runs.find(r=>r.model==='synthetic-failed-abstention');assert.equal(failedAbstention.casePassed,false);assert.equal(failedAbstention.recall,0);assert.equal(failedAbstention.precision,0);
  const mixed=summary.models.find(m=>m.model==='synthetic-mixed-configs');assert.equal(mixed.mixedConfigurations,true);assert.equal(mixed.coverageComplete,false);assert.equal(mixed.configurations.length,2);
  assert.deepEqual(summary.runs[0].parameters,{synthetic:true});
 }finally{await rm(directory,{recursive:true,force:true});}
});
