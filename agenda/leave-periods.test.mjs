import test from 'node:test';
import assert from 'node:assert/strict';
import {leavePeriods} from './leave-periods.mjs';
const day = (date, extra={}, halves=['AM','PM']) => halves.map(half=>({matricule:'A',date,half,type:'Congés payés',statut:'Validé',...extra}));
const span = periods => periods.map(({start,end,days})=>({start,end,days}));

test('a full week forms one period, with the existing counted Saturday',()=>{
 const rows=['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09'].flatMap(d=>day(d));
 const before=structuredClone(rows), result=leavePeriods(rows);
 assert.deepEqual(span(result),[{start:'2026-10-05',end:'2026-10-10',days:6}]);
 assert.equal(result[0].entries.at(-1).countedSaturday,true);
 assert.deepEqual(rows,before);
});
test('weekends connect a period without counting Sunday',()=>{
 assert.deepEqual(span(leavePeriods([...day('2026-10-09'),...day('2026-10-12')])),[{start:'2026-10-09',end:'2026-10-12',days:3}]);
});
test('non-paid leave crosses weekends without adding Saturday',()=>{
 assert.deepEqual(span(leavePeriods([...day('2026-10-09',{type:'Maladie'}),...day('2026-10-12',{type:'Maladie'})])),[{start:'2026-10-09',end:'2026-10-12',days:2}]);
});
test('half-day boundaries join only when no working half-day is missing',()=>{
 assert.equal(leavePeriods([...day('2026-10-05',{},['AM']),...day('2026-10-06')]).length,2);
 assert.equal(leavePeriods([...day('2026-10-05'),...day('2026-10-06',{},['PM'])]).length,2);
 const rows=[...day('2026-10-05',{},['PM']),...day('2026-10-06'),...day('2026-10-07',{},['AM'])];
 assert.deepEqual(span(leavePeriods(rows)),[{start:'2026-10-05',end:'2026-10-07',days:2}]);
});
test('weekday gaps remain separate',()=>{
 assert.equal(leavePeriods([...day('2026-10-05'),...day('2026-10-07')]).length,2);
});
test('people, types and approval states remain distinct',()=>{
 const rows=[...day('2026-10-05'),...day('2026-10-06',{matricule:'B'}),...day('2026-10-06',{type:'Maladie'}),...day('2026-10-06',{statut:'Demandé'})];
 assert.equal(leavePeriods(rows).length,4);
});
test('rejected or cancelled Fridays never create phantom Saturdays',()=>{
 assert.deepEqual(leavePeriods([...day('2026-10-09',{statut:'Annulé'}),...day('2026-10-16',{statut:'Refusé'})]),[]);
 assert.deepEqual(span(leavePeriods([...day('2026-10-09',{},['AM']),...day('2026-10-09',{statut:'Refusé'},['PM'])])),[{start:'2026-10-09',end:'2026-10-09',days:0.5}]);
});
test('duplicate half-days and explicit Saturdays are counted once',()=>{
 assert.deepEqual(span(leavePeriods([...day('2026-10-09'),...day('2026-10-09'),...day('2026-10-10')])),[{start:'2026-10-09',end:'2026-10-10',days:2}]);
});
test('mixed Friday approvals preserve separate states and only one Saturday',()=>{
 const result=leavePeriods([...day('2026-10-09',{},['AM']),...day('2026-10-09',{statut:'Demandé'},['PM'])]);
 assert.equal(result.length,2);assert.equal(result.reduce((s,p)=>s+p.days,0),2);
 assert.equal(result.filter(p=>p.statut==='Demandé')[0].end,'2026-10-10');
});
test('an explicit different absence in the weekend is not concealed by merging',()=>{
 const rows=[...day('2026-10-09',{type:'Maladie'}),...day('2026-10-10'),...day('2026-10-12',{type:'Maladie'})];
 assert.equal(leavePeriods(rows).length,3);
});
test('month and year boundaries are continuous',()=>{
 assert.equal(leavePeriods([...day('2026-10-30'),...day('2026-11-02')]).length,1);
 assert.equal(leavePeriods([...day('2026-12-31'),...day('2027-01-01')]).length,1);
});
test('legacy periods and malformed dates are handled without mutation',()=>{
 const rows=[{matricule:'A',type:'Maladie',statut:'Validé',dateDebut:'2026-10-08',dateFin:'2026-10-13'},...day('2026-02-31'),...day('bad')];
 assert.deepEqual(span(leavePeriods(rows)),[{start:'2026-10-08',end:'2026-10-13',days:4}]);
});
