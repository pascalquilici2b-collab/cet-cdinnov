import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const output=new URL('../.private/rh-lifecycle-tests/module.mjs',import.meta.url);
await mkdir(new URL('./',output),{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('./rh-lifecycle.ts',import.meta.url))],outfile:fileURLToPath(output),bundle:true,platform:'node',format:'esm'});
const {rhDocumentStatus,rhPublicDraft}=await import(output.href);
const draft={name:'Document fictif janvier',clientId:'client-test',periods:[{id:'period-test',projectId:'project-test',startDate:'2026-01-01',endDate:'2026-01-31',agents:[{agentId:'agent-test',rateBasisPoints:2500}]}]};
const payroll=[{id:'payroll-test',agentId:'agent-test',month:'2026-01',sha256:'a'.repeat(64),employerCostCents:400000,netBeforeTaxCents:250000,confirmed:true}];
const snapshot={id:'version-test',name:draft.name,client:{id:draft.clientId},periods:structuredClone(draft.periods),payroll:structuredClone(payroll)};

await test('A historical frozen document stays finalized without a workflow migration or financial slots',()=>{
 const before=JSON.stringify({draft,payroll,snapshot});assert.equal(rhDocumentStatus(draft,payroll,snapshot),'finalized');assert.equal(JSON.stringify({draft,payroll,snapshot}),before);
 const copied=structuredClone(draft);copied.payments=Array.from({length:5},(_,i)=>({id:i?'payment-2026-01-contribution-'+i:'payment-2026-01-salary',agentId:'',month:'2026-01',kind:i?'contribution':'salary',organism:'',amountCents:null,date:'',reference:''}));assert.equal(rhDocumentStatus(copied,payroll,snapshot),'finalized');
});
await test('Unsnapshotted work and a changed rate, period, payment or payroll remain in progress',()=>{
 assert.equal(rhDocumentStatus({...draft,periods:[]},[]),'draft');assert.equal(rhDocumentStatus({...draft,periods:[]},payroll),'in_progress');assert.equal(rhDocumentStatus(draft,payroll),'in_progress');
 for(const change of ['name','rate','period','payment']){const edited=structuredClone(draft);if(change==='name')edited.name='Correction';if(change==='rate')edited.periods[0].agents[0].rateBasisPoints=3000;if(change==='period')edited.periods[0].endDate='2026-02-28';if(change==='payment')edited.payments=[{id:'manual-payment',agentId:'',month:'2026-01',kind:'salary',organism:'',amountCents:0,date:'',reference:''}];assert.equal(rhDocumentStatus(edited,payroll,snapshot),'in_progress',change);}
 for(const changes of [{sha256:'b'.repeat(64)},{employerCostCents:420000},{netBeforeTaxCents:240000},{confirmed:false},{month:'2026-02'},{agentId:'other-agent'}])assert.equal(rhDocumentStatus(draft,[{...payroll[0],...changes}],snapshot),'in_progress',JSON.stringify(changes));
 assert.equal(rhDocumentStatus(draft,[],snapshot),'in_progress');
});
await test('Explicit workflow survives trash metadata and public drafts expose neither state nor deletion internals',()=>{
 for(const status of ['draft','in_progress','finalized']){const stored={...draft,_workflow:status,_deletedAt:'2026-11-06T10:00:00Z',_deletedBy:'test@example.invalid'};assert.equal(rhDocumentStatus(stored,payroll,snapshot),status);assert.deepEqual(rhPublicDraft(stored),draft);assert.equal(stored._workflow,status);}
 assert.equal(rhDocumentStatus({...draft,_workflow:'unknown'},payroll,snapshot),'finalized');
});
