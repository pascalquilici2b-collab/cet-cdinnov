import {allocatedAmount} from '../client-employee-money';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import type {ClientEmployee,ClientAllocation,ClientPaymentMonth} from '../client-employees-domain';
const escaped=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fr=(s:string)=>s.split('-').reverse().join('/');
export const employeeFileName=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,130);
export async function missionDocument(client:string,employee:ClientEmployee,a:ClientAllocation,version:number){
 if(!employee.role.trim()||!employee.supervisor.trim()||!a.tasks.trim())throw Error('Complétez la fonction, le responsable et les missions avant de générer la lettre.');
 const response=await fetch('/templates/client-mission-v1.docx',{cache:'no-cache'});if(!response.ok)throw Error('Modèle de lettre indisponible.');
 const parts=unzipSync(new Uint8Array(await response.arrayBuffer())),values:Record<string,string>={project:[a.project,a.projectCode].filter(Boolean).join(' / '),client,employee:employee.name,role:employee.role,start:fr(a.startDate),end:fr(a.endDate),version:String(version),percent:a.percent,signatures:employee.supervisor+'                         '+employee.name,tasks:a.tasks.trim()};
 let xml=strFromU8(parts['word/document.xml']);
 xml=xml.replace(/\{\{(\w+)\}\}/g,(_,key)=>escaped(values[key]||'').replace(/\r?\n/g,'</w:t><w:br/><w:t xml:space="preserve">'));
 parts['word/document.xml']=strToU8(xml);
 // The original model carries two organisations' logos. Never brand another client or programme with them.
 for(const name of Object.keys(parts).filter(n=>/^word\/header\d+\.xml$/.test(n))){
  const doc=new DOMParser().parseFromString(strFromU8(parts[name]),'application/xml');
  for(const node of Array.from(doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','drawing'))){
   const blip=node.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main','blip')[0],id=blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','embed');
   const keep=id==='rId1'?/marit/i.test(a.programme):/commerce.*industrie.*corse/i.test(client);
   if(!keep)node.remove();
  }
  parts[name]=strToU8(new XMLSerializer().serializeToString(doc));
 }
 return new Blob([zipSync(parts) as Uint8Array<ArrayBuffer>],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
export function paymentAllocations(agent:ClientEmployee,month:string){
 const start=month+'-01',end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10),active=agent.allocations.filter(a=>a.startDate<=end&&a.endDate>=start);
 if(active.some(a=>a.startDate>start||a.endDate<end))throw Error('Les affectations de '+agent.name+' changent en cours de mois ('+month+'). Définissez le pourcentage mensuel applicable avant de générer ce document.');
 return active;
}
export async function paymentDocument(client:string,agents:ClientEmployee[],payments:ClientPaymentMonth[]){
 const selected=payments.filter(p=>p.employerCost.trim());if(!selected.length)throw Error('Saisissez au moins un salaire brut chargé.');
 const module=await import('exceljs'),ExcelJS=module.default||module,workbook=new ExcelJS.Workbook();workbook.creator='CDInnov';workbook.created=new Date();
 const sheet=workbook.addWorksheet('Document de paiement',{pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:5',margins:{left:.25,right:.25,top:.35,bottom:.35,header:.15,footer:.15}}});
 sheet.columns=[{width:22},{width:20},{width:20},{width:25},{width:13},{width:20},{width:19},{width:17},{width:19},{width:19},{width:20},{width:17}];
 sheet.mergeCells('A1:L1');sheet.getCell('A1').value='Attestation de paiement des ressources humaines';sheet.getRow(1).height=34;sheet.getCell('A1').font={name:'Calibri',size:16,bold:true,color:{argb:'FF163D67'}};
 sheet.mergeCells('A2:L2');sheet.getCell('A2').value=client;sheet.getRow(2).height=25;
 const programmes=[...new Set(agents.flatMap(a=>a.allocations.map(p=>p.programme)).filter(Boolean))];sheet.mergeCells('A3:L3');sheet.getCell('A3').value=programmes.join(' · ');sheet.getRow(3).height=25;
 sheet.mergeCells('G4:I4');sheet.getCell('G4').value='Salaires';sheet.mergeCells('J4:L4');sheet.getCell('J4').value='Charges sociales';
 sheet.addRow(['Agent','Bulletins de salaire','Montant mensuel versé par l’employeur','Projet','% de temps de travail sur le projet','Montant total rendu-compte sur le projet','N° de mandat de paiement','Date de paiement effectif','Montant du mandat de paiement','Organisme','Montant total versé aux organismes','Date de paiement effectif']);sheet.getRow(5).height=62;
 for(const row of [4,5])sheet.getRow(row).eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE7EDF4'}};c.font={name:'Calibri',size:10,bold:true};c.alignment={vertical:'middle',horizontal:'center',wrapText:true};});
 const euro='#,##0.00" €"',asNumber=(s:string)=>s?Number(s.replace(',','.')):null,date=(s:string)=>s?new Date(s+'T12:00:00Z'):null;
 for(const p of selected.sort((a,b)=>agents.findIndex(x=>x.id===a.employeeId)-agents.findIndex(x=>x.id===b.employeeId)||a.month.localeCompare(b.month))){
  const agent=agents.find(a=>a.id===p.employeeId);if(!agent)throw Error('Salarié introuvable.');const allocations=paymentAllocations(agent,p.month);if(!allocations.length)throw Error('Aucune affectation pour '+agent.name+' en '+p.month+'.');
  const first=sheet.rowCount+1,base=asNumber(p.employerCost)!;
  for(const a of allocations){const row=sheet.addRow([agent.name,new Date(p.month+'-01T12:00:00Z').toLocaleDateString('fr-FR',{month:'long',year:'numeric'}),base,a.project,Number(a.percent.replace(',','.'))/100,null,p.mandate,date(p.paymentDate),asNumber(p.paidAmount),p.organism,asNumber(p.contributions),date(p.contributionDate)]);row.height=36;row.getCell(6).value={formula:`ROUND(C${first}*E${row.number},2)`,result:allocatedAmount(p.employerCost,a.percent)};row.eachCell({includeEmpty:true},c=>{c.font={name:'Calibri',size:10};c.alignment={vertical:'middle',wrapText:true};c.border={bottom:{style:'hair',color:{argb:'FFD4DCE5'}}};});for(const n of [3,6,9,11])row.getCell(n).numFmt=euro;row.getCell(5).numFmt='0.00%';for(const n of [8,12])row.getCell(n).numFmt='dd/mm/yyyy';}
  const last=sheet.rowCount;if(last>first)for(const c of [1,2,3,7,8,9,10,11,12])sheet.mergeCells(first,c,last,c);
 }
 const last=sheet.rowCount,tot=sheet.addRow(['Total','','','','',{formula:`SUM(F6:F${last})`,result:selected.reduce((sum,p)=>sum+paymentAllocations(agents.find(a=>a.id===p.employeeId)!,p.month).reduce((s,a)=>s+allocatedAmount(p.employerCost,a.percent),0),0)}]);tot.font={bold:true};tot.getCell(6).numFmt=euro;sheet.addRow([]);const sig=sheet.addRow(['Date et signature de la personne habilitée :']);sheet.mergeCells(sig.number,1,sig.number,12);sig.height=45;
 sheet.autoFilter={from:'A5',to:'L'+last};sheet.views=[{state:'frozen',ySplit:5}];
 return new Blob([await workbook.xlsx.writeBuffer() as ArrayBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
