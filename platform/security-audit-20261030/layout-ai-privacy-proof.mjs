import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
const baseline=process.argv.includes('--baseline');
const source=baseline?execFileSync('git',['show','493f91b:platform/stamping-layout-ai.ts'],{encoding:'utf8'}):await fs.readFile('platform/stamping-layout-ai.ts','utf8');
const bundle=await build({stdin:{contents:source,loader:'ts',resolveDir:process.cwd()+'/platform'},bundle:true,format:'esm',platform:'node',write:false});
const {paymentLayoutSuggestions,safeLayoutSamples}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
// Synthetic values only, not a customer's account or social identifier.
const bank='FR7600000000000000000000000',nir='1-00-01-2A-000-000-00';
const candidates=[{sheet:bank,rows:3,columns:6,cells:[
 {cell:'A1',row:0,column:0,text:'Projet ALPHA',kind:'text'},
 {cell:'B1',row:0,column:1,text:'Agent '+nir,kind:'text'},
 {cell:'C1',row:0,column:2,text:bank,kind:'text'},
 {cell:'A2',row:1,column:0,text:'2 345,67 EUR',kind:'text'},
 {cell:'B2',row:1,column:1,text:'6789.12',kind:'number'},
]}];
let captured;
const db={prepare(){return {bind(){return {async first(){return {reserved:1};}};}};}};
const env={MARKETS_AI:{async run(_model,input){captured=input;const sample=JSON.parse(input.messages[1].content).tables[0];return {response:JSON.stringify({plans:[{sheet:sample.sheet,orientation:'rows',header:0,mapping:{},fixed:{project_name:{cell:'A1',quote:'ALPHA'}}}]})};}}};
const result=await paymentLayoutSuggestions(db,env,candidates,'RH');
assert.equal(result.status,'completed');
assert.equal(result.plans[0].sheet,bank,'The server must restore the original source identity after AI validation.');
const transmitted=JSON.stringify(captured),samples=safeLayoutSamples(candidates);
const proof={revision:baseline?'493f91b':'working-tree',synthetic:true,externalRequests:0,bankTransmitted:transmitted.includes(bank),nirTransmitted:transmitted.includes(nir),currencyCellTransmitted:transmitted.includes('2 345,67 EUR'),numericCellTransmitted:transmitted.includes('6789.12'),originalSheetRestored:result.plans[0].sheet===bank,groundedReferencePreserved:result.plans[0].fixed.project_name.quote==='ALPHA',sampleCount:samples.length};
if(baseline){assert.equal(proof.bankTransmitted,true);assert.equal(proof.currencyCellTransmitted,true);assert.equal(proof.numericCellTransmitted,true);}
else{assert.equal(proof.bankTransmitted,false);assert.equal(proof.nirTransmitted,false);assert.equal(proof.currencyCellTransmitted,false);assert.equal(proof.numericCellTransmitted,false);}
if(!baseline){
 // Removing a fully filtered first table must not shift a later source mapping.
 const shifted=[{...candidates[0],cells:[{cell:'A1',row:0,column:0,text:'IBAN '+bank,kind:'text'}]},{...candidates[0],sheet:nir}];
 const later=await paymentLayoutSuggestions(db,env,shifted,'RH');
 assert.equal(later.status,'completed');assert.equal(later.plans[0].sheet,nir);
 assert.equal(JSON.parse(captured.messages[1].content).tables[0].sheet,'table-2');
 assert.ok(!JSON.stringify(captured).includes(bank)&&!JSON.stringify(captured).includes(nir));
 const forged={MARKETS_AI:{async run(){return {response:JSON.stringify({plans:[{sheet:bank,orientation:'rows',mapping:{},fixed:{}}]})};}}};
 assert.equal((await paymentLayoutSuggestions(db,forged,candidates,'RH')).status,'failed');
 assert.equal((await paymentLayoutSuggestions(db,forged,[shifted[0]],'RH')).status,'unavailable');
 proof.skippedSourceMappingPreserved=true;proof.originalNameResponseRejected=true;proof.fullyFilteredInputDoesNotCallModel=true;
}
await fs.mkdir('platform/.private/security-audit-20261030',{recursive:true});
await fs.writeFile('platform/.private/security-audit-20261030/layout-ai-'+(baseline?'baseline':'fixed')+'.json',JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify(proof));
