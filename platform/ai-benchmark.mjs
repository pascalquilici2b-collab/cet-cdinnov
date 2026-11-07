/** Local reproducible benchmark; no command here performs external inference.
 * 1. node platform/ai-benchmark.mjs prepare
 *    Captures actual production prompts/parameters with a recording AI binding.
 * 2. node platform/ai-benchmark.mjs profiles
 *    Exports production-json plus Qwen3.8/Gemma4 json/schema candidates. Candidate
 *    parameters use max_completion_tokens and enable_thinking:false; prompts
 *    stay byte-identical. JSON Schemas come from marches/ai-output-schema.mjs.
 * 3. Run a chosen exported profile through an authorized inference client and
 *    save {schemaVersion:1,runs:[{caseId,model,output,parameters,latencyMs,usage,
 *    error}]} as ai-benchmark-results.json. Use distinct model labels for schema
 *    variants/other settings so their aggregate scores remain distinguishable.
 * 4. node platform/ai-benchmark.mjs score
 * Files live in .private, or AI_BENCHMARK_DIR when set. Raw output/usage must be
 * preserved; synthetic text-level results do not establish real-PDF quality.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {build} from 'esbuild';
import {benchmarkCases} from './ai-benchmark-fixtures.mjs';
import {benchmarkProfiles} from './ai-benchmark-profiles.mjs';
import {MODEL,decode} from '../marches/ai-domain.mjs';
import {emptyMarket} from '../marches/domain.mjs';
import {testEnvironment,users} from '../marches/test.mjs';

const directory=resolve(process.env.AI_BENCHMARK_DIR||'.private');
const requestsPath=resolve(directory,'ai-benchmark-requests.json');
const resultsPath=resolve(directory,'ai-benchmark-results.json');
const summaryPath=resolve(directory,'ai-benchmark-summary.json');
const profilesPath=resolve(directory,'ai-benchmark-profiles.json');
async function moduleAt(path){const {outputFiles}=await build({entryPoints:[path],bundle:true,format:'esm',platform:'node',write:false});return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));}
const {analyzeEngagement}=await moduleAt('platform/billing-engagement-analysis.ts');
const {stampingSuggestions}=await moduleAt('platform/stamping-ai.ts');
const {paymentLayoutSuggestions}=await moduleAt('platform/stamping-layout-ai.ts');
const db={prepare(){return {bind(){return {async first(){return {reserved:1};}};}};}};
async function invoke(fixture,run){
 const env={MARKETS_AI:{run}};
 if(fixture.task==='engagements'){
  const request=new Request('https://benchmark.test/api/v1/billing/engagement-analysis',{method:'POST',body:JSON.stringify({text:fixture.text})});
  return analyzeEngagement(request,db,env,(status,body)=>({status,...body}));
 }
 if(fixture.task==='identification')return stampingSuggestions(db,env,fixture.evidence);
 if(fixture.task==='layout')return paymentLayoutSuggestions(db,env,fixture.candidates,fixture.category);
 throw Error('Unknown task '+fixture.task);
}
async function prepare(){
 const captures=[];let current;
 // Capture the actual production request construction through the authenticated
 // Worker and local D1. This never calls Cloudflare or production data services.
 const ctx=await testEnvironment({ai:async input=>{captures.push({id:current.id,task:current.task,model:MODEL,input,source:'local Worker /markets analysis'});return {response:{}};}});
 try{
  const login=await ctx.login(users[0]),headers={Cookie:login.cookie};
  for(const fixture of benchmarkCases.filter(c=>c.task==='markets')){
   current=fixture;
   let r=await ctx.call('markets',{method:'POST',headers,body:JSON.stringify({id:fixture.id,market:{...emptyMarket(),title:'Benchmark fictif',clientName:'Client fictif'}})});
   if(r.status!==201)throw Error(await r.text());
   const form=new FormData();form.append('file',new Blob([fixture.text],{type:'text/plain'}),fixture.name);
   r=await ctx.call('markets/'+fixture.id+'/documents',{method:'POST',headers,body:form});const document=(await r.json()).document;
   r=await ctx.call('markets/'+fixture.id+'/reading/'+document.id,{method:'PUT',headers,body:JSON.stringify({text:fixture.text,method:'text',complete:true,pages:2,warnings:[]})});
   if(r.status!==200)throw Error(await r.text());
   r=await ctx.call('markets/'+fixture.id+'/analysis',{method:'POST',headers:{...headers,'If-Match':'1'},body:JSON.stringify({documentIds:[document.id]})});const {run}=await r.json();
   r=await ctx.call('markets/'+fixture.id+'/analysis/'+run.id,{method:'POST',headers,body:'{}'});if(r.status!==200)throw Error(await r.text());
  }
 }finally{await ctx.worker.dispose();}
 for(const fixture of benchmarkCases.filter(c=>c.task!=='markets'))await invoke(fixture,async(model,input)=>{captures.push({id:fixture.id,task:fixture.task,model,input,source:'production function with recording AI binding'});return {response:fixture.task==='engagements'?{facts:[]}:fixture.task==='identification'?{suggestions:[]}:{plans:[]}};});
 if(captures.length!==benchmarkCases.length)throw Error('Not every production request was captured');
 const output={schemaVersion:1,synthetic:true,createdAt:new Date().toISOString(),cases:captures};
 await mkdir(directory,{recursive:true});await writeFile(requestsPath,JSON.stringify(output,null,2)+'\n');console.log(requestsPath);
}
const normalized=value=>String(value).normalize('NFKC').trim().toLocaleLowerCase('fr').replace(/\s+/g,' ');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
function features(fixture,result){
 let values=[];
 if(fixture.task==='markets'){
  values.push(...result.facts.map(f=>['fact.'+f.field,normalized(f.value)]));
  values.push(...result.prices.map(p=>['price',p.amountMinor+'|'+p.unit]));
  values.push(...result.ceilings.map(p=>['ceiling',p.amountMinor+'|'+p.basis+'|'+p.scope]));
 }else if(fixture.task==='engagements')values=Object.entries(result.fields||{}).map(([k,v])=>[k,normalized(v)]);
 else if(fixture.task==='identification')values=(result.suggestions||[]).map(r=>[r.field,normalized(r.value)]);
 else for(const p of result.plans||[]){
  values.push(['header',String(p.header)],['headerRows',String(p.headerRows??1)],['orientation',p.orientation]);
  values.push(...Object.entries(p.mapping||{}).map(([k,v])=>['mapping',k+'|'+v]));
 }
 return [...new Set(values.filter(([key])=>fixture.scopes.includes(key)).map(([k,v])=>k+'='+v))].sort();
}
function contentOf(output){return output?.choices?.[0]?.message?.content??output?.response??output;}
async function score(){
 const input=JSON.parse(await readFile(resultsPath,'utf8'));if(!Array.isArray(input.runs))throw Error('Expected {schemaVersion:1,runs:[{caseId,model,output,latencyMs,usage,error}]}');
 const scored=[];
 for(const run of input.runs){
  const fixture=benchmarkCases.find(c=>c.id===run.caseId);if(!fixture)throw Error('Unknown benchmark case '+run.caseId);
  let result=null,error=run.error||null,jsonValid=false;
  try{
   const raw=contentOf(run.output);if(typeof raw==='object'&&raw!==null)jsonValid=true;else{JSON.parse(String(raw));jsonValid=true;}
  }catch{}
  if(!error)try{
   if(fixture.task==='markets'){
    if(run.output?.choices?.[0]?.finish_reason==='length'||run.output?.finish_reason==='length')throw Error('truncated');
    result=decode(run.output,{document_id:fixture.id,name:fixture.name,text:fixture.text});
   }else{
    result=await invoke(fixture,async()=>run.output);
    if(fixture.task==='engagements'?result.status!==200:result.status!=='completed')throw Error('production validator rejected response');
   }
  }catch(e){error=String(e.message||e);}
  const observed=result&&!error?features(fixture,result):[],expected=fixture.expected;
  const correct=expected.filter(x=>observed.includes(x)),missing=expected.filter(x=>!observed.includes(x)),incorrect=observed.filter(x=>!expected.includes(x));
  scored.push({caseId:run.caseId,task:fixture.task,model:run.model,parameters:run.parameters??null,jsonValid,accepted:!error,casePassed:!error&&!missing.length&&!incorrect.length,error,expected,observed,correct,missing,incorrectExtraValues:incorrect,precision:observed.length?correct.length/observed.length:error?0:expected.length?null:1,recall:expected.length?correct.length/expected.length:error?0:1,latencyMs:run.latencyMs??null,usage:run.usage??run.output?.usage??null});
 }
 const models=[...new Set(scored.map(r=>r.model))].map(model=>{
  const rows=scored.filter(r=>r.model===model),correct=rows.reduce((n,r)=>n+r.correct.length,0),missing=rows.reduce((n,r)=>n+r.missing.length,0),incorrect=rows.reduce((n,r)=>n+r.incorrectExtraValues.length,0),times=rows.map(r=>r.latencyMs).filter(Number.isFinite).sort((a,b)=>a-b);
  const usageTotals={};for(const row of rows)for(const [key,value]of Object.entries(row.usage||{}))if(Number.isFinite(value))usageTotals[key]=(usageTotals[key]||0)+value;
  const configurations=[];for(const row of rows){const signature=JSON.stringify(canonical(row.parameters)),existing=configurations.find(c=>c.task===row.task&&c.signature===signature);if(existing)existing.runs++;else configurations.push({task:row.task,parameters:row.parameters,signature,runs:1});}
  const mixedConfigurations=[...new Set(rows.map(r=>r.task))].some(task=>configurations.filter(c=>c.task===task).length>1),coverage=[...new Set(rows.map(r=>r.caseId))],coverageComplete=benchmarkCases.every(c=>coverage.includes(c.id));
  return {model,cases:rows.length,coverage,coverageComplete,configurations:configurations.map(({signature,...c})=>c),mixedConfigurations,passed:rows.filter(r=>r.casePassed).length,failed:rows.filter(r=>!r.casePassed).length,accepted:rows.filter(r=>r.accepted).length,jsonValid:rows.filter(r=>r.jsonValid).length,correct,missing,incorrectExtraValues:incorrect,precision:correct+incorrect?correct/(correct+incorrect):null,recall:correct+missing?correct/(correct+missing):null,medianLatencyMs:times.length?(times[Math.floor((times.length-1)/2)]+times[Math.floor(times.length/2)])/2:null,totalLatencyMs:times.reduce((a,b)=>a+b,0),usageTotals};
 });
 const output={schemaVersion:1,synthetic:true,createdAt:new Date().toISOString(),limitations:['Small synthetic text-level comparison; not a real-PDF OCR benchmark or proof of general superiority.','Incorrect extra values are false positives in explicitly evaluated fields, not necessarily invented literal values.','Layout scoring reuses Worker validation; it does not execute the full Python table resolver.','Prompts are captured unchanged; model-specific parameter adaptations must be recorded in each run.parameters.'],models,runs:scored};
 await mkdir(dirname(summaryPath),{recursive:true});await writeFile(summaryPath,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({path:summaryPath,models},null,2));
}
const mode=process.argv[2];
if(mode==='prepare')await prepare();
else if(mode==='profiles'){
 const captured=JSON.parse(await readFile(requestsPath,'utf8'));
 await writeFile(profilesPath,JSON.stringify(benchmarkProfiles(captured.cases),null,2)+'\n');console.log(profilesPath);
}else if(mode==='score')await score();
else throw Error('Usage: node platform/ai-benchmark.mjs prepare|profiles|score');
