import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {load,sheet} from './load-ts.mjs';
mock.timers.enable({apis:['Date'],now:new Date('2026-10-19T12:00:00Z')});
const domain=await load('sheet-domain.tsx'),dash=await load('dashboard-domain.tsx'),work=await load('workspace-domain.tsx');
const manifest=JSON.parse(await readFile(new URL('../recovery-manifest.json',import.meta.url)));
const entries=manifest.declarations.filter(d=>['sheet-domain','dashboard-domain','workspace-domain'].includes(d.module));
const wanted=new Set(entries.map(d=>d.original));
const source=ts.createSourceFile('baseline.js',await readFile(new URL('../../../'+manifest.origin,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const snippets=[];
for(const st of source.statements){if(ts.isFunctionDeclaration(st)&&wanted.has(st.name.text))snippets.push(st.getText(source));if(ts.isVariableStatement(st))for(const d of st.declarationList.declarations)if(wanted.has(d.name.text))snippets.push('const '+d.getText(source)+';');}
const context=vm.createContext({crypto:globalThis.crypto,structuredClone,Date,Intl,FormData,Set,Map});
vm.runInContext(snippets.join('\n')+'\nglobalThis.baseline={'+entries.map(d=>d.name+':'+d.original).join(',')+'}',context);
const baseline=context.baseline,current={...domain,...dash,...work};
let count=0;
const canonical=value=>JSON.stringify(value,(_,v)=>v instanceof Set?[...v]:v instanceof Map?[...v]:v);
function parity(name,args){let index=0;const uuid=mock.method(globalThis.crypto,'randomUUID',()=>`00000000-0000-4000-8000-${String(++index).padStart(12,'0')}`);let old,newValue,oldError,newError;
 const copy=()=>args.map(value=>typeof value==='function'?value:structuredClone(value));
 try{index=0;try{old=baseline[name](...copy());}catch(e){oldError=e.message;}index=0;try{newValue=current[name](...copy());}catch(e){newError=e.message;}assert.equal(newError,oldError,name+' error parity');assert.equal(canonical(newValue),canonical(old),name+' result parity');count++;}finally{uuid.mock.restore();}}
test('Recovered editing, formulas, clipboard, hierarchy and dates match the deployed engine',()=>{
 const s=sheet();
 for(let i=0;i<80;i++){
  parity('updateCell',[s,'r1','budget',i*13.5]);
  parity('coerceCell',[`${i},25`,s.columns[1]]);
  parity('evaluateFormula',[`=(${i}+2)*3-4/2`,()=>0]);
 }
});
test('All retained data operations agree with the original implementation',()=>{
 const s=sheet();
 for(const [name,args]of [
 ['rowDepth',[s.rows[1],s.rows]],['descendantIds',[s.rows,['r1']]],['deleteRows',[s,['r1']]],['appendRow',[s,'r1']],['insertRow',[s,'r3','before']],['indentRow',[s,'r3']],['indentRow',[s,'r2',true]],['visibleRows',[s,{query:'Sous',collapsed:new Set(['r1'])}]],['visibleRows',[s,{sort:{columnId:'budget',direction:'desc'}}]],
 ['selectionBounds',[s.rows,s.columns,{rowId:'r1',columnId:'task'},{rowId:'r3',columnId:'budget'}]],['navigateCell',[s.rows,s.columns,{rowId:'r1',columnId:'check'},'Tab']],['clearCells',[s,['r1'],['task','check']]],['parseClipboard',['"Texte\nmultiligne"\t12\nSuite\t25']],['serializeClipboard',[[['A\tB','C"D'],['E',2]]]],['parseCellInput',['20/10/2026',s.columns[2]]],['pasteCells',[s,['r1','r2','r3'],{rowId:'r3',columnId:'task'},[['A','45'],['B','60']]]],['pasteCells',[s,['r1'],{rowId:'r1',columnId:'check'},[['oui','débordement']]]],
 ['cellValue',[s,'r2','budget']],['cellValue',[{...s,rows:[{id:'r1',cells:{budget:'=[Budget]1'}}]},'r1','budget']],['dateSerial',['2026-02-30']],['serialDate',[20000]],['timelineRange',[s.rows]],['ganttBar',[s.rows[0],20000,20]],['moveDates',[s.rows[0],3,'move']],['moveDates',[s.rows[0],-50,'end']],['dependencyLinks',[s,s.rows,20000,20]],
 ['createSheet',['Nouveau','w1']],['duplicateSheet',[s]],['parseCSV',['Tâche;Budget\r\n"Évaluation; A";120']],['importCSV',['Tâche;Budget;Début\nMission;15,5;20/10/2026','Import','w1']],['importCSV',['Tâche;Budget\nMission;non','Import','w1']],['exportCSV',[s]],['createForm',[s]],['summarizeSheets',[[s],['s1'],new Date('2026-10-24T12:00:00Z')]],['reorderWidgets',[[{id:'a'},{id:'b'},{id:'c'}],'c','a']],
 ])parity(name,args);
 const form=baseline.createForm(s);for(const values of [{},{task:'Mission',budget:'5,6',start:'2026-10-20',status:'En cours',check:true},{task:'X',start:'2026-02-30',status:'Inconnu'},{task:'X',status:1}]){parity('validateForm',[s,form,values]);parity('formValues',[s,form,values]);}
 parity('formFields',[s,form]);console.log(count+' differential cases against the published Smartsheet engine');
});
test('Unknown fields, comments, formulas and row colours survive edits',()=>{
 const s=sheet(),before=structuredClone(s);const changed=domain.updateCell(s,'r1','task','Modifié');
 assert.deepEqual(s,before);assert.deepEqual(changed.unknownFuture,s.unknownFuture);assert.deepEqual(changed.rows[0].format,s.rows[0].format);assert.deepEqual(changed.comments,s.comments);assert.equal(changed.rows[1].cells.budget,'=[Budget]1*2');
});
