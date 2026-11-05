import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import ExcelJS from 'exceljs';
import {zipSync,unzipSync} from 'fflate';

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

const paymentEntry=(id,month,kind,agentId='',extra={})=>({id,agentId,month,kind,organism:'',amountCents:null,date:'',reference:'',...extra});
const combinedSnapshot={...snapshot,payments:['2026-01','2026-02','2026-03'].flatMap(month=>[paymentEntry(`payment-${month}-salary`,month,'salary'),...Array.from({length:4},(_,i)=>paymentEntry(`payment-${month}-contribution-${i+1}`,month,'contribution'))])};
const exportV2=source=>exportRhWorkbook(source,{presentation:'v2'});
const combinedBytes=await exportV2(combinedSnapshot);
const fillCombined=(wb,firstOnly=false)=>{const seen=new Set();for(const sheet of wb.worksheets.filter(s=>s.name.startsWith('RH ')))sheet.eachRow((row,n)=>{for(const [idCol,start]of [[14,7],[15,10]]){const id=row.getCell(idCol).value;if(typeof id!=='string'||!id.startsWith('payment-')||idCol===15&&!id.endsWith('-1')||firstOnly&&seen.has(id))continue;seen.add(id);if(idCol===14){row.getCell(start).value='MANDAT-'+id;row.getCell(start+1).value=new Date('2026-04-15T00:00:00Z');row.getCell(start+2).value=2100;}else{row.getCell(start).value='Organisme Test';row.getCell(start+1).value=250.25;row.getCell(start+2).value='15/04/2026';}}});return wb;};

await test('V2 combiné : 12 colonnes A4 paysage, fusions agent/mois et slots financiers éditables',async()=>{
 const wb=await open(combinedBytes),sheets=wb.worksheets.filter(s=>s.name.startsWith('RH '));assert.equal(sheets.length,3);assert.equal(wb.getWorksheet('Paiements'),undefined);assert.equal(wb.getWorksheet('_CDI_RH').getCell('A1').value,'CDINNOV_RH_2');
 for(const sheet of sheets){assert.equal(sheet.pageSetup.orientation,'landscape');assert.equal(sheet.pageSetup.paperSize,9);assert.equal(sheet.pageSetup.fitToPage,false);assert.equal(sheet.pageSetup.scale,84);assert.match(sheet.pageSetup.printArea,/^A1:L\d+$/);assert.equal(sheet.sheetProtection.formatRows,true);assert.equal(sheet.getColumn(1).hidden,false);for(const col of [13,14,15,16,17])assert.equal(sheet.getColumn(col).hidden,true);
  const [firstHeader,lastHeader]=sheet.pageSetup.printTitlesRow.split(':').map(Number);assert.equal(lastHeader,firstHeader+1);assert.equal(sheet.getCell(firstHeader,1).value,'Agent');assert.equal(sheet.getCell(firstHeader,2).value,'Bulletins de salaire');assert.equal(sheet.getCell(firstHeader,7).value,'SALAIRES');assert.equal(sheet.getCell(firstHeader,10).value,'CHARGES');
  let count=0;sheet.eachRow(row=>{const line=snapshot.lines.find(line=>line.id===row.getCell(13).value);if(line){count++;assert.equal(row.getCell(1).value,snapshot.agents.find(a=>a.id===line.agentId).name);assert.equal(row.getCell(3).value,line.employerCostCents/100);assert.equal(row.getCell(6).value.result,line.allocatedCents/100);assert.notEqual(row.getCell(3).protection?.locked,false);}if(row.getCell(14).value?.startsWith('payment-'))assert.equal(row.getCell(7).protection.locked,false);if(row.getCell(15).value?.startsWith('payment-'))assert.equal(row.getCell(10).protection.locked,false);});assert.ok(count>0);assert.ok(sheet.model.merges.some(range=>/^B\d+:B\d+$/.test(range)));assert.ok(sheet.model.merges.some(range=>/^C\d+:C\d+$/.test(range)));
  const signature=sheet.findRow(Number(sheet.pageSetup.printArea.match(/L(\d+)/)[1])-2);assert.match(signature.getCell(1).value,/signature de la personne habilitée/);
 }
});
await test('V2 vierge : montants manquants restent vides et retour incomplet',async()=>{
 const result=await inspectRhReturnWorkbook(combinedBytes,combinedSnapshot);assert.equal(result.complete,false);assert.equal(result.payments.length,0);assert.ok(result.issues.every(issue=>issue.includes('manquant')),result.issues.join('\n'));
});
await test('V2 : paiements communs répétés par agents et feuilles importés une seule fois',async()=>{
 const repeated=await inspectRhReturnWorkbook(await bytes(fillCombined(await open(combinedBytes))),combinedSnapshot),single=await inspectRhReturnWorkbook(await bytes(fillCombined(await open(combinedBytes),true)),combinedSnapshot);
 assert.equal(repeated.complete,true,repeated.issues.join('\n'));assert.equal(single.complete,true,single.issues.join('\n'));assert.equal(repeated.payments.length,6);assert.ok(repeated.payments.every(p=>p.agentId===''));assert.deepEqual(single.payments,repeated.payments);assert.equal(repeated.payments.reduce((sum,p)=>sum+p.amountCents,0),3*(210000+25025));
});
await test('V2 : copies contradictoires, cellules RH, IDs ou fusions modifiés sont refusés',async()=>{
 for(const change of ['conflict','cost','rate','row-id','payment-id','formula','merge','new-payment-row']){const wb=fillCombined(await open(combinedBytes)),sheets=wb.worksheets.filter(s=>s.name.startsWith('RH ')),sheet=sheets.find(s=>s.getCell('A6').value==='Interreg Maritime'&&s.name.endsWith('2026-01-01'));let dataRow;sheet.eachRow(row=>{if(!dataRow&&row.getCell(13).value?.includes('period1:'))dataRow=row.number;});assert.ok(dataRow);
  if(change==='conflict')sheet.getCell(dataRow,9).value=1;else if(change==='cost')sheet.getCell(dataRow,3).value=1;else if(change==='rate')sheet.getCell(dataRow,5).value=.99;else if(change==='row-id')sheet.getCell(dataRow,13).value='unknown';else if(change==='payment-id')sheet.getCell(dataRow,14).value='unknown';else if(change==='formula')sheet.getCell(dataRow,9).value={formula:'2100',result:2100};else if(change==='merge')sheet.mergeCells(`G${dataRow}:I${dataRow}`);else sheet.getCell('I100').value=999;
  const result=await inspectRhReturnWorkbook(await bytes(wb),combinedSnapshot);assert.equal(result.complete,false,change);assert.ok(result.issues.length>0,change);
 }
});
await test('V2 : paiements spécifiques remplacent les communs et plusieurs versements restent distincts',async()=>{
 const specific={...combinedSnapshot,payments:[...combinedSnapshot.payments,paymentEntry('alice-salary-a','2026-01','salary','agent-a',{amountCents:100000,date:'2026-02-01',reference:'ACOMPTE'}),paymentEntry('alice-salary-b','2026-01','salary','agent-a',{amountCents:110000,date:'2026-02-02',reference:'SOLDE'})]};
 const wb=fillCombined(await open(await exportV2(specific))),result=await inspectRhReturnWorkbook(await bytes(wb),specific);assert.equal(result.complete,true,result.issues.join('\n'));assert.equal(result.payments.length,8);assert.equal(result.payments.filter(p=>p.agentId==='agent-a').reduce((sum,p)=>sum+p.amountCents,0),210000);assert.equal(result.payments.filter(p=>p.id==='payment-2026-01-salary').length,1);
 const replay={...specific,payments:specific.payments.map(p=>({...p,...(result.payments.find(entry=>entry.id===p.id)||{})}))},reimport=await inspectRhReturnWorkbook(await exportV2(replay),specific);assert.equal(reimport.complete,true,reimport.issues.join('\n'));assert.deepEqual(reimport.payments,result.payments);
});
await test('V2 : longs blocs segmentés avec vrais sauts de page et signature imprimable',async()=>{
 const one={...combinedSnapshot,projects:[projects[0]],periods:[{...periods[0],endDate:'2026-01-31'}],agents:[snapshot.agents[0]],lines:[snapshot.lines[0]],payments:[paymentEntry('salary-long','2026-01','salary','',{amountCents:0}),...Array.from({length:19},(_,i)=>paymentEntry('charge-long-'+i,'2026-01','contribution','',{amountCents:0}))]};
 const exported=await exportV2(one),wb=await open(exported),sheet=wb.worksheets.find(s=>s.name.startsWith('RH ')),sheetXml=new TextDecoder().decode(unzipSync(exported)['xl/worksheets/sheet1.xml']);assert.ok((sheetXml.match(/<brk /g)||[]).length>=1);assert.ok(sheet.model.merges.filter(range=>/^B\d+:B\d+$/.test(range)).length>=3);const result=await inspectRhReturnWorkbook(await bytes(wb),one);assert.equal(result.complete,true,result.issues.join('\n'));assert.equal(result.payments.length,20);assert.ok(result.payments.every(p=>p.amountCents===0&&p.date===''));
});
await test('V1 historique réexporté avec retour validé : plusieurs versements conservés et réimportables',async()=>{
 const returned=(await inspectRhReturnWorkbook(await bytes(await paid()),snapshot)).payments,withReturns={...snapshot,payments:[...returned,{...returned[0],id:'extra-payment',reference:'ACOMPTE-2',amountCents:1234}]};
 const wb=await open(await exportRhWorkbook(withReturns,{legacy:true}));assert.equal(wb.getWorksheet('_CDI_RH').getCell('A1').value,'CDINNOV_RH_1');const result=await inspectRhReturnWorkbook(await bytes(wb),snapshot);assert.equal(result.complete,true,result.issues.join('\n'));assert.equal(result.payments.length,9);assert.ok(result.payments.some(p=>p.reference==='ACOMPTE-2'&&p.amountCents===1234));
});
await test('V2 : textes financiers longs lisibles, pagination mesurée et topologie de réimport stable',async()=>{
 const reference='MANDAT DE PAIEMENT '.repeat(17).slice(0,300),organism='Organisme de cotisations '.repeat(9).slice(0,200),long={...combinedSnapshot,payments:combinedSnapshot.payments.map(p=>p.kind==='salary'?{...p,reference,amountCents:210000,date:'2026-04-15'}:p.id.endsWith('-1')?{...p,organism,amountCents:25025,date:'2026-04-15'}:p)};
 const output=await exportV2(long),wb=await open(output);let checked=0;
 for(const sheet of wb.worksheets.filter(s=>s.name.startsWith('RH ')))sheet.eachRow(row=>{if(row.getCell(14).value?.startsWith('payment-')){assert.equal(row.getCell(7).value,reference);assert.ok(row.height>100);assert.ok(row.height<=409.5);checked++;}});assert.ok(checked>0);
 assert.equal((await inspectRhReturnWorkbook(output,combinedSnapshot)).complete,true);
 const shorter={...long,payments:long.payments.map(p=>({...p,reference:p.reference?'MANDAT COURT':'',organism:p.organism?'Organisme Test':''}))},shortWb=await open(await exportV2(shorter));
 for(const sheet of wb.worksheets.filter(s=>s.name.startsWith('RH '))){const next=shortWb.getWorksheet(sheet.name);assert.deepEqual(next.model.merges,sheet.model.merges);sheet.eachRow(row=>{for(const col of [13,14,15,16,17])assert.equal(next.getCell(row.number,col).value,row.getCell(col).value);});}
 const imported=await inspectRhReturnWorkbook(await bytes(shortWb),long);assert.equal(imported.complete,true,imported.issues.join('\n'));assert.equal(imported.payments.length,6);
});

const certification='Je soussigné ________________ en qualité de ______________________________, certifie les informations de paiements susmentionnées.';
const v3Bytes=await exportRhWorkbook(combinedSnapshot);
await test('V3 : un en-tête global, tableaux seuls ensuite et une certification finale',async()=>{
 const wb=await open(v3Bytes),sheets=wb.worksheets.filter(s=>s.name.startsWith('RH ')),zip=unzipSync(v3Bytes);assert.equal(wb.getWorksheet('_CDI_RH').getCell('A1').value,'CDINNOV_RH_3');
 const texts=sheets.flatMap(sheet=>{const values=[];sheet.eachRow(row=>row.eachCell(cell=>{if(cell.col<=12&&(!cell.isMerged||cell.master.address===cell.address)&&typeof cell.value==='string')values.push(cell.value);}));return values;});
 assert.equal(texts.filter(text=>text.startsWith('Programme de coopération')).length,1);assert.equal(texts.filter(text=>text.startsWith('Par la présente')).length,1);assert.equal(texts.filter(text=>text===certification).length,1);assert.equal(texts.filter(text=>text==='Fait à ____________    Le ___________').length,1);assert.ok(!texts.some(text=>/Version RH|Document préparatoire|préparez une nouvelle version|signature de la personne habilitée/.test(text)));
 assert.match(sheets[0].getCell('A5').value,/janvier 2026 à mars 2026/);for(const project of projects)assert.ok(texts.some(text=>text.includes(project.code)&&text.includes('2026')));
 let firstPage=1;for(const [index,sheet]of sheets.entries()){assert.equal(sheet.headerFooter.oddFooter,'&RPage &P');assert.equal(sheet.pageSetup.firstPageNumber,firstPage);const xml=new TextDecoder().decode(zip[`xl/worksheets/sheet${index+1}.xml`]);firstPage+=(xml.match(/<brk /g)||[]).length+1;if(index){assert.equal(sheet.getCell('A1').value,'Agent');assert.equal(sheet.pageSetup.printTitlesRow,'1:2');assert.equal(sheet.getImages().length,0);}else assert.ok(Number(sheet.pageSetup.printTitlesRow.split(':')[0])>7);}
 const last=sheets.at(-1);let certRow,dateRow;last.eachRow(row=>{if(row.getCell(1).value===certification)certRow=row.number;if(row.getCell(1).value==='Fait à ____________    Le ___________')dateRow=row.number;});assert.ok(certRow&&dateRow>certRow);assert.equal(last.getCell(certRow,1).protection.locked,false);assert.equal(last.getCell(dateRow,1).protection.locked,false);
});
await test('V3 : retour complété et certification libre, mêmes paiements que V2',async()=>{
 const wb=fillCombined(await open(v3Bytes),true),last=wb.worksheets.filter(s=>s.name.startsWith('RH ')).at(-1);last.eachRow(row=>{if(row.getCell(1).value===certification)row.getCell(1).value='Je soussigné Alex Test, en qualité de responsable financier, certifie les informations de paiements susmentionnées.';if(row.getCell(1).value==='Fait à ____________    Le ___________')row.getCell(1).value='Fait à Ville Test    Le 15/04/2026';});
 const current=await inspectRhReturnWorkbook(await bytes(wb),combinedSnapshot),old=await inspectRhReturnWorkbook(await bytes(fillCombined(await open(combinedBytes),true)),combinedSnapshot);assert.equal(current.complete,true,current.issues.join('\n'));assert.deepEqual(current.payments,old.payments);
 last.eachRow(row=>{if(String(row.getCell(1).value).startsWith('Fait à Ville'))row.getCell(1).value={formula:'1+1',result:2};});assert.equal((await inspectRhReturnWorkbook(await bytes(wb),combinedSnapshot)).complete,false);
 for(const change of ['rh','id','format']){const edited=fillCombined(await open(v3Bytes));if(change==='format')edited.getWorksheet('_CDI_RH').getCell('A1').value='CDINNOV_RH_2';else{const sheet=edited.worksheets.find(s=>s.name.startsWith('RH '));sheet.eachRow(row=>{if(row.getCell(13).value===snapshot.lines.at(-1).id)row.getCell(change==='id'?13:3).value=change==='id'?'forged':1;});}assert.equal((await inspectRhReturnWorkbook(await bytes(edited),combinedSnapshot)).complete,false,change);}
});
await test('V3 : introduction de 18 ou 50 projets tient page 1, IDs et dates intacts',async()=>{
 for(const count of [18,50]){const entries=Array.from({length:count},(_,i)=>project('stress-'+i,count===50?'Projet '+i+' '+('intitulé détaillé '.repeat(12)):'Projet de test '+i,'Interreg Maritime')),periods=entries.map((project,i)=>period('stress-period-'+i,project.id,'2026-01-01','2026-01-31','agent-a',100));
  const source={...combinedSnapshot,projects:entries,periods,agents:[snapshot.agents[0]],lines:periods.map(p=>line(p,'2026-01')),payments:combinedSnapshot.payments.filter(p=>p.month==='2026-01')},output=await exportRhWorkbook(source),wb=await open(output),sheet=wb.worksheets.find(s=>s.name.startsWith('RH ')),header=Number(sheet.pageSetup.printTitlesRow.split(':')[0]);let height=0;for(let row=1;row<=header+1;row++)height+=sheet.getRow(row).height||24;assert.ok(height<=585,`${count} projets : ${height} pt`);
  const intro=[];for(let row=7;row<header;row++)for(const col of [1,7])if(typeof sheet.getCell(row,col).value==='string')intro.push(sheet.getCell(row,col).value);for(const project of entries)assert.ok(intro.some(text=>text.includes(project.code)&&text.includes('01/01/2026 — 31/01/2026')));if(count===18)assert.ok(!intro.some(text=>text.includes('…')));else assert.ok(intro.some(text=>text.includes('…')));
  const result=await inspectRhReturnWorkbook(await bytes(fillCombined(wb)),source);assert.equal(result.complete,true,result.issues.join('\n'));
 }
});
