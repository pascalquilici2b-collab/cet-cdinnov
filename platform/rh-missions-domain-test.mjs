import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const output=new URL('../.private/rh-missions-domain/module.mjs',import.meta.url);
await mkdir(new URL('./',output),{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('./rh-missions-domain.ts',import.meta.url))],outfile:fileURLToPath(output),bundle:true,platform:'node',format:'esm'});
const {missionSegments,missionAllocationCore,missionPriorAllocation,applyManualMission}=await import(output.href);
const agentId=randomUUID(),otherAgent=randomUUID(),projectId='project-fictitious',otherProject='other-project-fictitious';
const period=(startDate,endDate,rateBasisPoints,extra={})=>({id:randomUUID(),projectId,startDate,endDate,agents:[{agentId,rateBasisPoints}],...extra});
const draft=periods=>({name:'Document fictif',clientId:'client-fictitious',periods});
const allocation=(extra={})=>({id:randomUUID(),projectId,project:'Projet fictif',projectCode:'IF TEST',programme:'Programme fictif',percent:'25',startDate:'2026-01-01',endDate:'2026-03-31',tasks:'Missions à conserver.',projectRole:'coordination',...extra});
const employee=allocations=>({id:agentId,name:'Alex Exemple',role:'Poste dans l’organisme',supervisor:'',allocations});

test('Payment periods retain decimal rates, partial dates, gaps and separate projects',()=>{
 const input=draft([period('2026-01-15','2026-02-28',1234),period('2026-03-01','2026-03-31',1234),period('2026-05-01','2026-05-17',2500),period('2026-01-01','2026-01-31',1000,{projectId:otherProject})]),before=JSON.stringify(input);
 const result=missionSegments(input);assert.deepEqual(result.issues,[]);assert.equal(result.segments.length,3);
 assert.deepEqual(result.segments.filter(s=>s.projectId===projectId),[{employeeId:agentId,projectId,startDate:'2026-01-15',endDate:'2026-03-31',rateBasisPoints:1234},{employeeId:agentId,projectId,startDate:'2026-05-01',endDate:'2026-05-17',rateBasisPoints:2500}]);
 assert.equal(JSON.stringify(input),before);
});

test('Frozen monthly lines split changing rates without averaging and keep exact period edges',()=>{
 const p=period('2026-01-20','2026-04-10',1000),input=draft([p]);
 const lines=['2026-01','2026-02','2026-03','2026-04'].map((month,i)=>({id:'line-'+i,periodId:p.id,projectId,agentId,month,rateBasisPoints:[1000,2000,2000,3333][i]}));
 assert.deepEqual(missionSegments(input,lines).segments.map(s=>[s.startDate,s.endDate,s.rateBasisPoints]),[['2026-01-20','2026-01-31',1000],['2026-02-01','2026-03-31',2000],['2026-04-01','2026-04-10',3333]]);
});

test('Missing rates omit only affected intervals and zero never becomes a positive assignment',()=>{
 const input=draft([period('2026-01-01','2026-01-31',null),period('2026-02-01','2026-02-28',0),period('2026-03-01','2026-03-31',5000),period('2026-01-01','2026-03-31',2500,{agents:[{agentId:otherAgent,rateBasisPoints:2500}]})]);
 const {segments,issues}=missionSegments(input);assert.equal(issues.length,1);assert.ok(issues[0].includes(agentId));assert.equal(segments.filter(s=>s.employeeId===agentId).length,1);assert.equal(segments.find(s=>s.employeeId===agentId).startDate,'2026-03-01');assert.equal(segments.find(s=>s.employeeId===otherAgent).startDate,'2026-01-01');
});

test('Conflicting or malformed source intervals cannot silently generate extra letters',()=>{
 const p=period('2026-01-01','2026-01-31',2500),input=draft([p]);
 assert.throws(()=>missionSegments(draft([p,{...p,id:randomUUID()}])),/deux fois/);
 const line={periodId:p.id,projectId,agentId,month:'2026-01',rateBasisPoints:2500};
 assert.throws(()=>missionSegments(input,[line,line]),/incohérentes/);
 assert.throws(()=>missionSegments(input,[{...line,projectId:otherProject}]),/affectations/);
 assert.throws(()=>missionSegments(input,[{...line,month:'2026-02'}]),/incohérentes/);
 assert.throws(()=>missionSegments(draft([period('2026-02-30','2026-03-31',2500)])),/dates/);
 assert.throws(()=>missionSegments(draft([period('2026-01-01','2026-01-31',10001)])),/taux/);
});

test('Mission suggestions never select arbitrary past functions or tasks',()=>{
 const a=allocation(),b=allocation({startDate:'2025-01-01',endDate:'2025-03-31',projectRole:'communication',tasks:'Autres missions.'}),person=employee([a,b]);
 assert.equal(missionPriorAllocation(person,projectId,'2026-02-01','2026-02-28').allocation.id,a.id);
 assert.deepEqual(missionPriorAllocation(person,projectId,'2027-01-01','2027-01-31'),{allocation:undefined,ambiguous:true});
 assert.equal(missionPriorAllocation(employee([a,{...b,projectRole:a.projectRole,tasks:a.tasks}]),projectId,'2027-01-01','2027-01-31').allocation.id,a.id);
 assert.deepEqual(missionPriorAllocation(person,otherProject,'2026-01-01','2026-01-31'),{allocation:undefined,ambiguous:false});
});

test('Manual letters reuse common allocation identity and update current labels without changing historical rates',()=>{
 const a=allocation(),person=employee([a]),before=JSON.stringify(person),submitted={...a,id:randomUUID(),project:'Projet renommé',percent:'25.00',tasks:'Missions précisées.',projectRole:'communication'};
 const saved=applyManualMission([person],agentId,submitted);assert.equal(saved.allocation.id,a.id);assert.equal(saved.agents[0].allocations.length,1);assert.equal(saved.allocation.project,'Projet renommé');assert.equal(saved.changed,true);assert.equal(JSON.stringify(person),before);
 const same=applyManualMission(saved.agents,agentId,saved.allocation);assert.equal(same.changed,false);assert.equal(missionAllocationCore({...saved.allocation,percent:'25,00'}),missionAllocationCore(saved.allocation));
});

test('Manual letters cannot replace a historical interval or create an overlapping assignment',()=>{
 const a=allocation(),person=employee([a]);
 assert.throws(()=>applyManualMission([person],agentId,{...a,percent:'50'}),error=>error.status===409);
 assert.throws(()=>applyManualMission([person],agentId,{...a,id:randomUUID(),startDate:'2026-02-01'}),/couvre déjà/);
 const next=applyManualMission([person],agentId,{...a,id:randomUUID(),startDate:'2026-04-01',endDate:'2026-05-31'});assert.equal(next.agents[0].allocations.length,2);assert.deepEqual(next.agents[0].allocations[0],a);
});

test('Manual enrichment preserves other agents and enforces the shared total of 100 percent',()=>{
 const a=allocation({percent:'80'}),person=employee([a]),second={...employee([]),id:otherAgent,name:'Sam Exemple'},input=[person,second],before=JSON.stringify(input);
 assert.throws(()=>applyManualMission(input,agentId,allocation({projectId:otherProject,percent:'20.01'})),/100 %/);
 const saved=applyManualMission(input,agentId,allocation({projectId:otherProject,percent:'20'}));assert.deepEqual(saved.agents[1],second);assert.equal(saved.agents[0].allocations.length,2);assert.equal(JSON.stringify(input),before);
});
