import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import ExcelJS from 'exceljs';
import {zipSync} from 'fflate';

const output=new URL('../.build/rh-document-files-test-module.mjs',import.meta.url);
await mkdir(new URL('../.build/',import.meta.url),{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('./rh-document-files.ts',import.meta.url))],outfile:fileURLToPath(output),bundle:true,platform:'node',format:'esm',packages:'external'});
const {exportRhWorkbook,inspectRhReturnWorkbook}=await import(output.href);

const agent=(id,name)=>({id,name,role:'',supervisor:'',allocations:[]});
const project=(id,name,programme)=>({id,name,code:'IF TEST'+id,programme,marketId:'market-test',clientIds:['client-test']});
const projects=[project('p1','Projet Alpha','Interreg Maritime'),project('p2','Projet Beta','Interreg Maritime'),project('p3','Projet Gamma','Interreg Maritime'),project('p4','Projet Delta','ALCOTRA')];
const period=(id,projectId,startDate,endDate,agentId,rateBasisPoints)=>({id,projectId,startDate,endDate,agents:[{agentId,rateBasisPoints}]});
const periods=[period('period1','p1','2026-01-01','2026-02-28','agent-a',3333),period('period2','p2','2026-01-01','2026-03-31','agent-a',1000),period('period3','p3','2026-02-01','2026-02-28','agent-a',1500),period('period4','p4','2026-01-01','2026-01-31','agent-b',3000)];
const line=(p,month)=>({id:p.id+':'+p.agents[0].agentId+':'+month,periodId:p.id,agentId:p.agents[0].agentId,projectId:p.projectId,month,employerCostCents:333333,netBeforeTaxCents:210000,rateBasisPoints:p.agents[0].rateBasisPoints,allocatedCents:Math.round(333333*p.agents[0].rateBasisPoints/10000),payrollId:p.agents[0].agentId+':'+month});
const snapshot={id:'version-test',documentId:'document-test',revision:2,name:'Contrôle fictif',client:{id:'client-test',name:'Collectivité de démonstration'},projects,periods,agents:[agent('agent-a','Alice Exemple'),agent('agent-b','Benoît Test')],lines:[line(periods[0],'2026-01'),line(periods[0],'2026-02'),line(periods[1],'2026-01'),line(periods[1],'2026-02'),line(periods[1],'2026-03'),line(periods[2],'2026-02'),line(periods[3],'2026-01')],payroll:[],createdAt:'2026-11-05T10:00:00.000Z',createdBy:'test@example.invalid'};
const exported=await exportRhWorkbook(snapshot);
const open=async(bytes=exported)=>{const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);return wb;};
const bytes=async wb=>new Uint8Array(await wb.xlsx.writeBuffer());
const paid=async()=>{const wb=await open(),sheet=wb.getWorksheet('Paiements');for(let row=10;row<=17;row++){const charge=sheet.getCell(row,4).value==='Charges';sheet.getCell(row,5).value=charge?'Organisme Test':'';sheet.getCell(row,6).value=charge?250.25:2100;sheet.getCell(row,7).value=new Date('2026-04-15T00:00:00Z');sheet.getCell(row,8).value='REF-'+row;}return wb;};
const legacyPaid=async()=>{const wb=await paid();for(const sheet of wb.worksheets.filter(s=>s.name.startsWith('RH '))){sheet.getCell('A4').value='Attestation de paiement des ressources humaines';sheet.getCell('A8').value='Document préparatoire · Paiements à compléter et signer par le service financier.';}return wb;};

await test('export : groupes programme/début, dates de fin distinctes, imputation au centime et paiements uniques',async()=>{
 const wb=await open(),rh=wb.worksheets.filter(s=>s.name.startsWith('RH '));assert.equal(rh.length,3);assert.equal(wb.getWorksheet('_CDI_RH').state,'veryHidden');
 const maritimeJanuary=rh.find(s=>s.getCell('A6').value==='Interreg Maritime'&&s.name.endsWith('2026-01-01'));assert.ok(maritimeJanuary);assert.equal(maritimeJanuary.getCell('E10').value,'01/01/2026 — 28/02/2026');assert.equal(maritimeJanuary.getCell('E11').value,'01/01/2026 — 31/03/2026');assert.equal(maritimeJanuary.getImages().length,1);
 const total=rh.reduce((sum,s)=>{let value=0;s.eachRow(r=>{if(r.getCell(1).value==='Total imputé')value=r.getCell(8).value.result;});return sum+Math.round(value*100);},0);assert.equal(total,snapshot.lines.reduce((s,l)=>s+l.allocatedCents,0));
 const payments=wb.getWorksheet('Paiements');let filled=0;payments.eachRow((r,n)=>{if(n>9&&r.getCell(1).value)filled++;});assert.equal(filled,8);assert.ok(payments.pageSetup.printArea.endsWith('29'));
 for(const s of rh)assert.ok(Number(s.pageSetup.printArea.match(/H(\d+)/)[1])>=s.rowCount);assert.equal(maritimeJanuary.getColumn(9).hidden,true);
});
await test('attestation : titre complet, dates propres à chaque feuille et noms en première colonne visible',async()=>{
 const wb=await open(),rh=wb.worksheets.filter(s=>s.name.startsWith('RH '));
 for(const sheet of rh){
  assert.equal(sheet.getCell('A4').value,'Programme de coopération INTERREG : Attestation de paiement des ressources humaines de Collectivité de démonstration');
  const programme=sheet.getCell('A6').value,start=sheet.name.endsWith('2026-02-01')?'février 2026':'janvier 2026',end=programme==='ALCOTRA'?'janvier 2026':start==='février 2026'?'février 2026':'mars 2026';
  assert.equal(sheet.getCell('A8').value,`Par la présente Collectivité de démonstration déclare que, dans le cadre de la justification de dépenses des projets ci-dessous, les dépenses relatives à la catégorie «Ressources humaines» pour les mois de ${start} à ${end} ont été payées selon les informations détaillées dans les tableaux ci-après.`);
  assert.ok(sheet.getRow(4).height>=40);assert.ok(sheet.getRow(8).height>=50);assert.equal(sheet.getCell('A8').alignment.wrapText,true);
  assert.notEqual(sheet.getColumn(1).hidden,true);assert.equal(sheet.getColumn(9).hidden,true);let agents=0;
  sheet.eachRow(row=>{const line=snapshot.lines.find(line=>line.id===row.getCell(9).value);if(line){assert.equal(row.getCell(1).value,snapshot.agents.find(agent=>agent.id===line.agentId).name);agents++;}});assert.ok(agents>0);
 }
 const payment=wb.getWorksheet('Paiements');assert.equal(payment.getColumn(1).hidden,true);assert.notEqual(payment.getColumn(2).hidden,true);assert.equal(payment.getCell('B9').value,'Agent');assert.equal(payment.getCell('B10').value,'Alice Exemple');
});
await test('retour vierge : RH concordantes, finances clairement incomplètes',async()=>{
 const result=await inspectRhReturnWorkbook(exported,snapshot);assert.equal(result.complete,false);assert.equal(result.payments.length,0);assert.ok(result.issues.some(i=>i.includes('montant')));assert.ok(!result.issues.some(i=>/RH modifiée|Contenu RH ajouté|En-tête/.test(i)),result.issues.join('\n'));
});
await test('retour complété : 8 paiements importés, dont charges, dates Excel et mandats',async()=>{
 const result=await inspectRhReturnWorkbook(await bytes(await paid()),snapshot);assert.equal(result.complete,true,result.issues.join('\n'));assert.equal(result.payments.length,8);assert.equal(result.payments.filter(p=>p.kind==='contribution').length,4);assert.equal(result.payments[0].date,'2026-04-15');assert.equal(result.payments[1].amountCents,25025);
});
await test('ancien export complété : réimport accepté avec les mêmes paiements et contrôles RH',async()=>{
 const wb=await legacyPaid(),old=await inspectRhReturnWorkbook(await bytes(wb),snapshot),current=await inspectRhReturnWorkbook(await bytes(await paid()),snapshot);
 assert.equal(old.complete,true,old.issues.join('\n'));assert.deepEqual(old.payments,current.payments);
 const sheet=wb.worksheets.find(s=>s.name.startsWith('RH '));sheet.eachRow(row=>{if(row.getCell(9).value===snapshot.lines.at(-1).id)row.getCell(5).value=1;});
 const modified=await inspectRhReturnWorkbook(await bytes(wb),snapshot);assert.equal(modified.complete,false);assert.ok(modified.issues.some(i=>i.includes('Donnée RH modifiée')));
});
await test('présentation réimportée : dates modifiées et mélange des formats refusés',async()=>{
 for(const change of ['date','title','mixed-text','mixed-sheets']){
  const wb=await paid(),sheets=wb.worksheets.filter(s=>s.name.startsWith('RH ')),sheet=sheets[0];
  if(change==='date')sheet.getCell('A8').value=sheet.getCell('A8').value.replace('à janvier 2026','à décembre 2026');
  else if(change==='title')sheet.getCell('A4').value='Attestation libre';
  else {sheet.getCell('A4').value='Attestation de paiement des ressources humaines';if(change==='mixed-sheets')sheet.getCell('A8').value='Document préparatoire · Paiements à compléter et signer par le service financier.';}
  const result=await inspectRhReturnWorkbook(await bytes(wb),snapshot);assert.equal(result.complete,false,change);assert.ok(result.issues.some(i=>i.includes('Donnée RH modifiée')),change);
 }
});
await test('plusieurs versements ou organismes sans duplication par projet',async()=>{
 const wb=await paid(),sheet=wb.getWorksheet('Paiements');sheet.getRow(18).values=['agent-a','Alice Exemple','2026-01','Charges','Autre organisme',40.1,'16/04/2026','COMPL-1'];const result=await inspectRhReturnWorkbook(await bytes(wb),snapshot);assert.equal(result.complete,true,result.issues.join('\n'));assert.equal(result.payments.length,9);
});
await test('zéro explicite distinct du vide, sans date fictive de paiement',async()=>{
 const wb=await paid(),sheet=wb.getWorksheet('Paiements');sheet.getCell('F11').value=0;sheet.getCell('G11').value=null;sheet.getCell('H11').value='';const result=await inspectRhReturnWorkbook(await bytes(wb),snapshot);assert.equal(result.complete,true,result.issues.join('\n'));assert.equal(result.payments[1].amountCents,0);assert.equal(result.payments[1].date,'');
});
await test('changement d’un coût, d’un taux, d’une ligne, formule ou version est refusé',async()=>{
 for(const change of ['cost','rate','id','formula','version','missing-sheet','added-row']){
  const wb=await paid(),sheet=wb.worksheets.find(s=>s.name.startsWith('RH '));let row;sheet.eachRow(r=>{if(r.getCell(9).value===snapshot.lines.at(-1).id)row=r.number;});assert.ok(row);
  if(change==='cost')sheet.getCell(row,5).value=1;else if(change==='rate')sheet.getCell(row,7).value=.99;else if(change==='id')sheet.getCell(row,9).value='forged';else if(change==='formula')sheet.getCell(row,8).value={formula:'1+1',result:sheet.getCell(row,8).value.result};else if(change==='version')wb.getWorksheet('_CDI_RH').getCell('B2').value='wrong-version';else if(change==='missing-sheet')wb.removeWorksheet(sheet.id);else sheet.getCell('A100').value='Dépense supplémentaire';
  const result=await inspectRhReturnWorkbook(await bytes(wb),snapshot);assert.equal(result.complete,false,change);assert.ok(result.issues.some(i=>/RH|version/.test(i)),change+': '+result.issues.join('\n'));
 }
});
await test('paiements : duplication, formule et identité incohérente refusées',async()=>{
 for(const change of ['duplicate','formula','agent','date','reference','precision','merged-payment']){
  const wb=await paid(),sheet=wb.getWorksheet('Paiements');if(change==='duplicate')sheet.getRow(18).values=sheet.getRow(10).values;else if(change==='formula')sheet.getCell('F10').value={formula:'2000+100',result:2100};else if(change==='agent')sheet.getCell('A10').value='unknown';else if(change==='date')sheet.getCell('G10').value='31/02/2026';else if(change==='reference')sheet.getCell('H10').value='';else if(change==='precision')sheet.getCell('F10').value=1.234;else sheet.mergeCells('B10:H10');
  const result=await inspectRhReturnWorkbook(await bytes(wb),snapshot);assert.equal(result.complete,false,change);assert.ok(result.issues.length>0);
 }
});
await test('faux XLSX, limite fichier et dimensions ZIP bomb bloqués avant parsing',async()=>{
 assert.equal((await inspectRhReturnWorkbook(new TextEncoder().encode('not an xlsx'),snapshot)).complete,false);
 assert.equal((await inspectRhReturnWorkbook(new Uint8Array(13*1024*1024),snapshot)).complete,false);
 const edited=exported.slice(),view=new DataView(edited.buffer);let changed=false;for(let i=0;i<edited.length-46;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,50*1024*1024,true);changed=true;break;}assert.ok(changed);const result=await inspectRhReturnWorkbook(edited,snapshot);assert.equal(result.complete,false);assert.ok(result.issues.some(i=>i.includes('volumineux')));
 const forged=zipSync({'xl/workbook.xml':new Uint8Array(14*1024*1024)},{level:9}),forgedView=new DataView(forged.buffer);for(let i=0;i<forged.length-46;i++)if(forgedView.getUint32(i,true)===0x02014b50)forgedView.setUint32(i+24,100,true);const forgedResult=await inspectRhReturnWorkbook(forged,snapshot);assert.equal(forgedResult.complete,false);assert.ok(forgedResult.issues.some(i=>/volumineux|décompressé/.test(i)),forgedResult.issues.join('\n'));
});
