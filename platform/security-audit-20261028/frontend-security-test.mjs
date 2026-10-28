import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {csvCell} from '../csv-export.ts';
import {load,sheet} from '../../apps/sheets/test/load-ts.mjs';
import {signedMail,normalizeSignature,emptySignature,mailAddresses} from '../billing-mail-content.ts';
import {checkedAttachments} from '../billing-mail-attachments.ts';
import {outlookWebLink,graph} from '../billing-microsoft-draft.ts';
import {createBudgetWorkbook} from '../../apps/budgets/lib/budget-export.ts';
import * as XLSX from 'xlsx';
const work=await load('workspace-domain.tsx'),domain=await load('sheet-domain.tsx');
const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
const start=html.indexOf('>',html.lastIndexOf('<script',html.indexOf('function freshState()')))+1;
const ast=ts.createSourceFile('portal.js',html.slice(start,html.lastIndexOf('</script>')),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const needed=new Set(['csvCell','safePrivateFileURL','isRemoteFileURL','dateFR']);
const declarations=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&needed.has(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const context=vm.createContext({URL,CLOUD_ENDPOINT:'https://worker.example.test'});
vm.runInContext(declarations+'\nglobalThis.checked={csvCell,safePrivateFileURL,dateFR};',context);

test('CSV neutralizes formulas including headers and control/space prefixes, keeping numeric values',()=>{
 const dangerous=['=1+1','+1+1','-1+1','@SUM(1,1)','\t=1+1','\r=1+1','\n=1+1','  =1+1','\ufeff=1+1','\u0000=1+1','\tordinary',['=1+1'],['\t=1+1']];
 for(const value of dangerous){assert.ok(csvCell(value).startsWith('"\''),JSON.stringify(value));assert.equal(context.checked.csvCell(value),csvCell(value));}
 for(const value of [null,'ordinary','a;b','a"b','multi\nline',-12.5,123])assert.equal(context.checked.csvCell(value),csvCell(value));
 assert.equal(csvCell(-12.5),'"-12.5"');assert.equal(csvCell('a"b'),'"a""b"');
 const s=sheet();s.columns[0].title='=1+1';s.rows[0].cells.task='\t=1+1';const csv=work.exportCSV(s);
 assert.ok(csv.startsWith('\ufeff"\'=1+1"'));assert.ok(csv.includes('"\'\t=1+1"'));
});
test('CSV imports and the sheet formula interpreter cannot execute JavaScript or external formulas',()=>{
 const imported=work.importCSV('Tâche;Budget\n"<img src=x onerror=alert(1)>";"=1+1"','Synthetic','w1');
 assert.ok(JSON.stringify(imported).includes('<img src=x onerror=alert(1)>'));
 assert.equal(domain.evaluateFormula('=SUM(1,2)*3',()=>0),9);
 for(const value of ['=WEBSERVICE("https://example.test")','=HYPERLINK("https://example.test")','=globalThis.alert(1)','=constructor.constructor("return 1")()'])assert.throws(()=>domain.evaluateFormula(value,()=>0));
});
test('Budget XLSX treats untrusted project/client text as strings, never formulas',()=>{
 const project={id:'p',acronym:'=1+1',clientId:'c',start:'2026-01-01',end:'2026-12-31',periods:[]};
 const book=createBudgetWorkbook({clients:[{id:'c',name:'=SUM(1,2)'}],budgetLines:[],expenses:[]},project);
 const roundtrip=XLSX.read(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),{type:'buffer'}).Sheets.Budget;
 for(const address of ['A1','A2']){assert.equal(roundtrip[address].t,'s');assert.equal(roundtrip[address].f,undefined);assert.ok(roundtrip[address].v.startsWith('='));}
});
test('File URLs reject active schemes, HTML/SVG data, other hosts and credential URLs',()=>{
 for(const value of ['javascript:alert(1)','JaVaScRiPt:alert(1)',' java\nscript:alert(1)','data:text/html;base64,PHNjcmlwdD4=','data:image/svg+xml;base64,PHN2Zz4=','https://evil.example.test/file.pdf','https://worker.example.test.evil.test/files/a','https://x@worker.example.test/files/a','https://worker.example.test/api/v1/portal','//evil.example.test/a','blob:https://worker.example.test/a'])assert.throws(()=>context.checked.safePrivateFileURL(value));
 for(const value of ['https://worker.example.test/files/synthetic.pdf','data:application/pdf;base64,JVBERi0=','data:image/png;base64,iVBORw=='])assert.equal(context.checked.safePrivateFileURL(value),value);
 assert.equal(context.checked.dateFR('2026-10-28'),'28/10/2026');assert.equal(context.checked.dateFR('<img src=x onerror=alert(1)>'),'—');
});
test('Signature text remains escaped; SVG and mislabeled images and MIME header injections fail',async()=>{
 const rendered=signedMail('<img src=x onerror=alert(1)>',{...emptySignature(),text:'<svg onload=alert(1)>'},true);
 assert.ok(rendered.html.includes('&lt;img'));assert.ok(!rendered.html.includes('<svg'));
 for(const imageData of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,PHN2Zz4='])assert.throws(()=>normalizeSignature({text:'',imageData,imageName:'synthetic'}));
 assert.throws(()=>mailAddresses('a@example.test\r\nBcc: b@example.test'));
 await assert.rejects(checkedAttachments({attachments:[{filename:'a.pdf\r\nBcc: x',blob:new Blob(['%PDF-'])}]}));
 await assert.rejects(checkedAttachments({attachments:[{filename:'a.png',isInline:true,contentId:'x>\r\nBcc: x',blob:new Blob(['image'],{type:'image/png'})}]}));
});
test('Outlook links stay on approved HTTPS hosts',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,test','https://outlook.office.com.evil.test/mail','https://x@outlook.office.com/mail','https://outlook.office.com@evil.test/mail'])assert.throws(()=>outlookWebLink(value));
 assert.equal(outlookWebLink('https://outlook.office.com/mail/test'),'https://outlook.office.com/mail/test');
});
test('Graph helper rejects routes that only start like /me or normalize outside it',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json({});};
 for(const path of ['/messages','/members','/me/../users/other/messages','/me/../../users/other/messages','/me/%2e%2e/users/other/messages','/me\\..\\users/other/messages'])await assert.rejects(graph('synthetic-only',path,'GET',undefined,fetcher),/non autorisé/);
 assert.equal(calls,0);await graph('synthetic-only','/me?$select=id','GET',undefined,fetcher);assert.equal(calls,1);
});
