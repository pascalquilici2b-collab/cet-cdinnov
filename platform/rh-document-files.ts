import ExcelJS from 'exceljs/dist/exceljs.min.js';
import type * as ExcelTypes from 'exceljs';
import {Unzip,UnzipInflate} from 'fflate';
import type {RhSnapshot,RhLine,RhImportedPayment,RhReturnInspection} from './rh-domain';
import {rhDate,rhMonth} from './rh-domain';
import {maritimeLogoData,epcicLogoData} from './rh-workbook-branding';

const FORMAT='CDINNOV_RH_1';
const META='_CDI_RH';
const PAYMENT_SHEET='Paiements';
const HEADER_ROW=9;
const EURO='#,##0.00" €"';
const COLORS={ink:'FF263B50',muted:'FF65768A',line:'FFDCE4EC',soft:'FFF0F4F8',input:'FFEAF3FC',white:'FFFFFFFF'};
const logoCache=new WeakMap<ExcelTypes.Workbook,Map<string,number>>();
function fail(message:string):never{throw new Error(message);}
type ExpectedValue=string|number|null|{formula:string;result:number};
type Grid={name:string;cells:Map<string,ExpectedValue>;headerRow:number;lastRow:number;lines:RhLine[]};
const address=(row:number,column:number)=>String.fromCharCode(64+column)+row;
const titleDate=(value:string)=>value.split('-').reverse().join('/');
const stringValue=(value:unknown)=>typeof value==='string'?value.trim():value===null||value===undefined?'':String(value);
const euros=(cents:number|null)=>cents===null?null:cents/100;

function assertSnapshot(snapshot:RhSnapshot){
 if(!snapshot||!snapshot.id||!snapshot.documentId||!snapshot.client?.id||!snapshot.client.name||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<1||!snapshot.lines?.length||snapshot.lines.length>12000)fail('Version RH absente ou trop volumineuse pour cet export.');
 const ids=new Set<string>();
 for(const line of snapshot.lines){
  if(ids.has(line.id)||!snapshot.agents.some(a=>a.id===line.agentId)||!snapshot.projects.some(p=>p.id===line.projectId)||!snapshot.periods.some(p=>p.id===line.periodId&&p.projectId===line.projectId)||!rhMonth(line.month))fail('Une ligne RH ne correspond pas à la version archivée.');ids.add(line.id);
  for(const n of [line.employerCostCents,line.allocatedCents,line.rateBasisPoints])if(!Number.isSafeInteger(n)||n<0)fail('Montant ou taux RH invalide.');
  if(line.netBeforeTaxCents!==null&&(!Number.isSafeInteger(line.netBeforeTaxCents)||line.netBeforeTaxCents<0)||line.rateBasisPoints>10000||Math.round(line.employerCostCents*line.rateBasisPoints/10000)!==line.allocatedCents)fail('Calcul RH incohérent.');
 }
}

function rhGrids(snapshot:RhSnapshot):Grid[]{
 const grouped=new Map<string,typeof snapshot.periods>();
 for(const period of snapshot.periods){const project=snapshot.projects.find(p=>p.id===period.projectId);if(!project)fail('Projet absent de la version RH.');const groupKey=project.programme.trim()+'|'+period.startDate;grouped.set(groupKey,[...(grouped.get(groupKey)||[]),period]);}
 return [...grouped.entries()].sort(([a],[b])=>a.localeCompare(b,'fr')).map(([groupKey,periods],index)=>{
  const name=`RH ${String(index+1).padStart(2,'0')} - ${periods[0].startDate}`,cells=new Map<string,ExpectedValue>(),put=(r:number,c:number,v:ExpectedValue)=>cells.set(address(r,c),v);
  const programme=snapshot.projects.find(p=>p.id===periods[0].projectId)!.programme;
  put(4,1,'Attestation de paiement des ressources humaines');put(5,1,snapshot.client.name);put(6,1,programme);
  put(7,1,`${snapshot.name} · Version RH ${snapshot.revision}`);put(8,1,'Document préparatoire · Paiements à compléter et signer par le service financier.');
  let row=10;
  for(const period of periods){const p=snapshot.projects.find(p=>p.id===period.projectId)!;put(row,1,[p.name,p.code].filter(Boolean).join(' · '));put(row,5,`${titleDate(period.startDate)} — ${titleDate(period.endDate)}`);row++;}
  row++;const headerRow=row;
  ['Agent','Mois','Projet','ID du projet','Coût employeur','Net avant impôt','Affectation','Montant imputé','ID ligne RH'].forEach((v,c)=>put(row,c+1,v));
  const lines=snapshot.lines.filter(l=>periods.some(p=>p.id===l.periodId)).sort((a,b)=>snapshot.agents.find(x=>x.id===a.agentId)!.name.localeCompare(snapshot.agents.find(x=>x.id===b.agentId)!.name,'fr')||a.month.localeCompare(b.month)||snapshot.projects.find(x=>x.id===a.projectId)!.name.localeCompare(snapshot.projects.find(x=>x.id===b.projectId)!.name,'fr')||a.id.localeCompare(b.id));
  for(const line of lines){row++;const project=snapshot.projects.find(p=>p.id===line.projectId)!;[snapshot.agents.find(a=>a.id===line.agentId)!.name,line.month,project.name,project.code,euros(line.employerCostCents),euros(line.netBeforeTaxCents),line.rateBasisPoints/10000,{formula:`ROUND(E${row}*G${row},2)`,result:euros(line.allocatedCents)!},line.id].forEach((v,c)=>put(row,c+1,v as ExpectedValue));}
  const lastDataRow=row;row++;put(row,1,'Total imputé');put(row,8,{formula:`SUM(H${headerRow+1}:H${lastDataRow})`,result:euros(lines.reduce((s,l)=>s+l.allocatedCents,0))!});
  row+=2;put(row,1,'Les paiements des salaires et des charges sont renseignés une seule fois dans l’onglet Paiements.');
  return {name,cells,headerRow,lastRow:row,lines};
 });
}

function expectedPayments(snapshot:RhSnapshot){
 const pairs=new Map<string,{agentId:string;name:string;month:string}>();
 for(const line of snapshot.lines){const key=line.agentId+'|'+line.month;pairs.set(key,{agentId:line.agentId,name:snapshot.agents.find(a=>a.id===line.agentId)!.name,month:line.month});}
 return [...pairs.values()].sort((a,b)=>a.name.localeCompare(b.name,'fr')||a.month.localeCompare(b.month));
}
function paymentHeader(snapshot:RhSnapshot){
 return new Map<string,ExpectedValue>([
  ['B1','Paiement des salaires et des charges'],['B2',snapshot.client.name],['B3',`${snapshot.name} · Version RH ${snapshot.revision}`],
  ['B4','À compléter par le service financier du client, puis à signer.'],
  ['B5','Un versement par ligne. Pour ajouter un versement ou un organisme, copiez une ligne du même agent et du même mois.'],
  ['B6','Renseignez 0 si aucun montant n’a été versé ; une cellule vide reste à compléter.'],
  ['B7','La signature porte sur ce classeur et ses feuilles RH. Retour attendu : Excel complété et PDF signé.'],
  ...['ID agent','Agent','Mois','Nature','Organisme','Montant versé','Date du paiement','Référence / mandat'].map((v,i)=>[address(HEADER_ROW,i+1),v] as [string,ExpectedValue])
 ]);
}
function styleSheet(sheet:ExcelTypes.Worksheet){
 sheet.properties.defaultRowHeight=25;sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.25,right:.25,top:.4,bottom:.4,header:.15,footer:.15}};
 sheet.headerFooter.oddFooter='CDInnov · &A · Page &P / &N';
 sheet.eachRow(row=>row.eachCell({includeEmpty:true},cell=>{cell.font={name:'Calibri',size:10,color:{argb:COLORS.ink}};cell.alignment={vertical:'middle',wrapText:true};cell.protection={locked:true};}));
}
function styleHeader(sheet:ExcelTypes.Worksheet,rowNumber:number,columns=8){
 const row=sheet.getRow(rowNumber);row.height=36;
 for(let column=1;column<=columns;column++){const cell=row.getCell(column);cell.font={name:'Calibri',size:10,bold:true,color:{argb:COLORS.ink}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.soft}};cell.alignment={vertical:'middle',wrapText:true};cell.border={bottom:{style:'thin',color:{argb:COLORS.line}}};}
}
function imageSize(data:string){
 const payload=data.slice(data.indexOf(',')+1),bytes=Uint8Array.from(atob(payload),c=>c.charCodeAt(0));
 if(data.startsWith('data:image/png')&&bytes.length>24){const view=new DataView(bytes.buffer);return {width:view.getUint32(16),height:view.getUint32(20)};}
 // JPEG dimension markers; no image decoding or network requests are needed in the Worker.
 if(data.startsWith('data:image/jpeg'))for(let i=2;i+9<bytes.length;){if(bytes[i]!==255){i++;continue;}const marker=bytes[i+1],len=(bytes[i+2]<<8)+bytes[i+3];if([192,193,194].includes(marker))return {height:(bytes[i+5]<<8)+bytes[i+6],width:(bytes[i+7]<<8)+bytes[i+8]};if(len<2)break;i+=len+2;}
 return {width:3,height:1};
}
function addLogo(workbook:ExcelTypes.Workbook,sheet:ExcelTypes.Worksheet,data:string|undefined,side:'left'|'right'){
 if(!data||data.length>500000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(data))return;
 const size=imageSize(data);if(!size.width||!size.height)return;
 const scale=Math.min(220/size.width,60/size.height),width=size.width*scale,height=size.height*scale;
 const cached=logoCache.get(workbook)||new Map<string,number>();logoCache.set(workbook,cached);
 let id=cached.get(data);if(id===undefined){id=workbook.addImage({base64:data,extension:data.startsWith('data:image/png')?'png':'jpeg'});cached.set(data,id);}
 sheet.addImage(id,{tl:{col:side==='left'?0:5.5,row:.1},ext:{width,height},editAs:'oneCell'});
}

/** Produce the client's workbook from an immutable server snapshot; no object keys are exported. */
export async function exportRhWorkbook(snapshot:RhSnapshot):Promise<Uint8Array>{
 assertSnapshot(snapshot);const workbook=new ExcelJS.Workbook();workbook.creator='CDInnov';workbook.created=new Date(snapshot.createdAt);workbook.modified=new Date(snapshot.createdAt);workbook.calcProperties.fullCalcOnLoad=true;
 const logo=snapshot.client.logoData||(/999021967/.test(snapshot.client.siret||'')||/etablissement public du commerce et de l.industri|\bepcic\b/i.test(snapshot.client.name)?epcicLogoData:undefined);
 const grids=rhGrids(snapshot);
 for(const grid of grids){
  const sheet=workbook.addWorksheet(grid.name);sheet.columns=[{width:27},{width:13},{width:23},{width:22},{width:18},{width:18},{width:13},{width:19},{width:15,hidden:true}];
  for(const [cell,value] of grid.cells)sheet.getCell(cell).value=value;
  for(const row of [4,5,6,7,8])sheet.mergeCells(row,1,row,8);
  for(let row=10;row<grid.headerRow-1;row++){sheet.mergeCells(row,1,row,4);sheet.mergeCells(row,5,row,8);}
  sheet.mergeCells(grid.lastRow,1,grid.lastRow,8);styleSheet(sheet);sheet.getRow(1).height=24;sheet.getRow(2).height=24;sheet.getRow(3).height=12;sheet.getRow(4).height=30;
  sheet.getCell('A4').font={name:'Calibri',size:16,bold:true,color:{argb:COLORS.ink}};sheet.getCell('A5').font={name:'Calibri',size:12,bold:true,color:{argb:COLORS.ink}};for(const n of [6,7,8])sheet.getCell('A'+n).font={name:'Calibri',size:10,color:{argb:COLORS.muted}};
  styleHeader(sheet,grid.headerRow);
  for(let row=grid.headerRow+1;row<grid.lastRow-2;row++){sheet.getRow(row).height=30;for(let col=1;col<=8;col++){const cell=sheet.getCell(row,col);cell.border={bottom:{style:'hair',color:{argb:COLORS.line}}};if([5,6,8].includes(col))cell.numFmt=EURO;else if(col===7)cell.numFmt='0.00%';if(col>=5)cell.alignment={vertical:'middle',horizontal:'right'};}}
  sheet.getRow(grid.lastRow-2).font={bold:true,color:{argb:COLORS.ink}};sheet.getCell(grid.lastRow-2,8).numFmt=EURO;
  sheet.pageSetup.printArea=`A1:H${grid.lastRow}`;sheet.pageSetup.printTitlesRow=`${grid.headerRow}:${grid.headerRow}`;sheet.views=[{state:'frozen',ySplit:grid.headerRow}];
  const programme=snapshot.projects.find(p=>p.id===snapshot.periods.find(p=>p.id===grid.lines[0]?.periodId)?.projectId)?.programme||'';
  if(/marit/i.test(programme))addLogo(workbook,sheet,maritimeLogoData,'left');addLogo(workbook,sheet,logo,'right');
  await sheet.protect('CDInnov-RH-'+snapshot.id,{selectLockedCells:true,selectUnlockedCells:true,spinCount:1000});
 }
 const payment=workbook.addWorksheet(PAYMENT_SHEET);payment.columns=[{width:20,hidden:true},{width:28},{width:13},{width:15},{width:25},{width:19},{width:19},{width:28}];
 for(const [cell,value] of paymentHeader(snapshot))payment.getCell(cell).value=value;
 for(let row=1;row<=7;row++)payment.mergeCells(row,2,row,8);
 for(const pair of expectedPayments(snapshot))for(const kind of ['Salaire','Charges'])payment.addRow([pair.agentId,pair.name,pair.month,kind,'',null,null,'']);
 // Keep space for supplementary payments; users may also insert/copy rows in Excel.
 const lastData=payment.rowCount;for(let i=0;i<6;i++)payment.addRow([]);
 styleSheet(payment);payment.getCell('B1').font={name:'Calibri',size:16,bold:true,color:{argb:COLORS.ink}};payment.getCell('B2').font={name:'Calibri',size:12,bold:true,color:{argb:COLORS.ink}};payment.getRow(5).height=32;payment.getRow(7).height=32;styleHeader(payment,HEADER_ROW);
 for(let row=HEADER_ROW+1;row<=Math.max(lastData+6,25);row++)for(let col=1;col<=8;col++){const cell=payment.getCell(row,col);cell.protection={locked:false};cell.alignment={vertical:'middle',wrapText:true};cell.border={bottom:{style:'hair',color:{argb:COLORS.line}}};if(col>=5)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.input}};if(col===6){cell.numFmt=EURO;cell.dataValidation={type:'decimal',operator:'greaterThanOrEqual',formulae:[0],allowBlank:true,showErrorMessage:true,error:'Renseignez un montant positif ou nul.'};}if(col===7)cell.numFmt='dd/mm/yyyy';if(col===4)cell.dataValidation={type:'list',formulae:['"Salaire,Charges"'],allowBlank:false,showErrorMessage:true,error:'Choisissez Salaire ou Charges.'};}
 payment.views=[{state:'frozen',ySplit:HEADER_ROW}];payment.pageSetup.printTitlesRow='9:9';payment.pageSetup.printArea=`B1:H${Math.max(lastData+8,25)}`;
 const signRow=Math.max(lastData+9,27);payment.getCell(signRow,2).value='Date, nom, qualité et signature de la personne habilitée :';payment.mergeCells(signRow,2,signRow+2,8);payment.getRow(signRow).height=30;payment.pageSetup.printArea=`B1:H${signRow+2}`;
 // This sheet stays editable so finance can insert additional split payments; import validates identities.
 const metadata=workbook.addWorksheet(META,{state:'veryHidden'});metadata.addRows([[FORMAT],['versionId',snapshot.id],['documentId',snapshot.documentId],['revision',snapshot.revision],['clientId',snapshot.client.id],['rhSheets',JSON.stringify(grids.map(g=>g.name))]]);
 return new Uint8Array(await workbook.xlsx.writeBuffer() as ArrayBuffer);
}

function guardZip(bytes:Uint8Array){
 if(bytes.byteLength<22||bytes.byteLength>12*1024*1024)fail('Le classeur doit faire moins de 12 Mo.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)fail('Le fichier n’est pas un classeur XLSX valide.');
 const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);if(!count||count>2000||offset>=bytes.length||view.getUint16(end+4,true)||view.getUint16(end+6,true))fail('Structure de classeur non prise en charge.');
 let cursor=offset,total=0;const paths=new Set<string>(),sizes=new Map<string,number>();
 for(let i=0;i<count;i++){
  if(cursor+46>bytes.length||view.getUint32(cursor,true)!==0x02014b50)fail('Structure de classeur invalide.');
  const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),size=view.getUint32(cursor+24,true),nameLen=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true);
  if(cursor+46+nameLen+extra+comment>bytes.length||flags&1||![0,8].includes(method)||size>12*1024*1024)fail('Classeur chiffré ou trop volumineux.');
  const name=new TextDecoder().decode(bytes.slice(cursor+46,cursor+46+nameLen));if(paths.has(name)||name.includes('..')||name.startsWith('/')||name.includes('\\')||/vbaProject|externalLinks|connections\.xml/i.test(name))fail('Ce classeur contient une structure ou des liaisons non prises en charge.');paths.add(name);sizes.set(name,size);total+=size;if(total>32*1024*1024)fail('Le contenu décompressé du classeur dépasse 32 Mo.');cursor+=46+nameLen+extra+comment;
 }
 if(!paths.has('xl/workbook.xml'))fail('Le fichier doit être au format XLSX.');
 // A forged ZIP header may understate the inflated size. Count actual streamed output
 // before handing the package to ExcelJS; discard these chunks instead of retaining them.
 let actualTotal=0;const opened=new Set<string>(),finished=new Set<string>();
 const stream=new Unzip(file=>{if(!paths.has(file.name)||opened.has(file.name))fail('Structure ZIP incohérente.');opened.add(file.name);let size=0;
  file.ondata=(error,data,final)=>{if(error)fail('Le contenu du classeur ne peut pas être décompressé.');size+=data.length;actualTotal+=data.length;if(size>12*1024*1024||actualTotal>32*1024*1024)fail('Le contenu décompressé du classeur est trop volumineux.');if(final){if(size!==sizes.get(file.name))fail('Taille ZIP incohérente.');finished.add(file.name);}};file.start();
 });stream.register(UnzipInflate);
 for(let position=0;position<bytes.length;position+=1024)stream.push(bytes.subarray(position,Math.min(position+1024,bytes.length)),position+1024>=bytes.length);
 if(finished.size!==paths.size)fail('Le classeur ZIP est incomplet.');
}
function normalizedCell(cell:ExcelTypes.Cell):unknown{
 const value=cell.value;if(value===null||value===undefined||value==='')return null;
 if(typeof value==='object'&&'richText' in value)return value.richText.map(x=>x.text).join('');
 return value;
}
function equalCell(actual:unknown,expected:ExpectedValue):boolean{
 if(expected===null)return actual===null;
 if(typeof expected==='number')return typeof actual==='number'&&Number.isFinite(actual)&&Math.abs(actual-expected)<1e-8;
 if(typeof expected==='string')return actual===expected;
 return typeof actual==='object'&&actual!==null&&'formula' in actual&&'result' in actual&&actual.formula===expected.formula&&typeof actual.result==='number'&&Math.abs(actual.result-expected.result)<1e-8;
}
function paymentText(cell:ExcelTypes.Cell,max=200):string{
 const value=normalizedCell(cell);if(value===null)return '';if(typeof value!=='string'||value.length>max)fail('Une cellule de texte financier est invalide.');return value.trim();
}
function paymentCents(cell:ExcelTypes.Cell):number|null{
 const value=normalizedCell(cell);if(value===null)return null;
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>999999999||Math.abs(value*100-Math.round(value*100))>1e-5)fail('Le montant doit être une valeur positive ou nulle, avec deux décimales au maximum.');return Math.round(value*100);
}
function paymentDate(cell:ExcelTypes.Cell):string{
 const value=normalizedCell(cell);if(value===null)return '';
 if(value instanceof Date){if(!Number.isFinite(value.getTime()))fail('Date de paiement invalide.');return value.toISOString().slice(0,10);}
 if(typeof value==='string'){const text=value.trim();if(rhDate(text))return text;const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);if(match&&rhDate(`${match[3]}-${match[2]}-${match[1]}`))return `${match[3]}-${match[2]}-${match[1]}`;}
 fail('Renseignez une date Excel ou une date au format JJ/MM/AAAA.');
}

/** Validate every frozen RH value; financial values remain pending until a signed return is reviewed. */
export async function inspectRhReturnWorkbook(bytes:Uint8Array,snapshot:RhSnapshot):Promise<RhReturnInspection>{
 const payments:RhImportedPayment[]=[],issues:string[]=[];const issue=(message:string)=>{if(issues.length<60&&!issues.includes(message))issues.push(message);};
 try{
  assertSnapshot(snapshot);guardZip(bytes);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes as unknown as ExcelTypes.Buffer);
  const grids=rhGrids(snapshot),meta=workbook.getWorksheet(META),financial=workbook.getWorksheet(PAYMENT_SHEET);
  if(!meta||!equalCell(normalizedCell(meta.getCell('A1')),FORMAT)||!equalCell(normalizedCell(meta.getCell('B2')),snapshot.id)||!equalCell(normalizedCell(meta.getCell('B3')),snapshot.documentId)||!equalCell(normalizedCell(meta.getCell('B4')),snapshot.revision)||!equalCell(normalizedCell(meta.getCell('B5')),snapshot.client.id)||!equalCell(normalizedCell(meta.getCell('B6')),JSON.stringify(grids.map(g=>g.name))))return {payments,issues:['Ce classeur ne correspond pas à la version RH sélectionnée.'],complete:false};
  if(workbook.worksheets.some(sheet=>![META,PAYMENT_SHEET,...grids.map(g=>g.name)].includes(sheet.name)))issue('Une feuille inattendue a été ajoutée au classeur.');
  for(const grid of grids){const sheet=workbook.getWorksheet(grid.name);if(!sheet){issue(`Feuille RH manquante : ${grid.name}.`);continue;}for(const [position,expected] of grid.cells)if(!equalCell(normalizedCell(sheet.getCell(position)),expected))issue(`Donnée RH modifiée : ${grid.name}, ${position}.`);
   sheet.eachRow(row=>row.eachCell(cell=>{if(cell.isMerged&&cell.master.address!==cell.address)return;if(normalizedCell(cell)!==null&&!grid.cells.has(cell.address))issue(`Contenu RH ajouté : ${grid.name}, ${cell.address}.`);}));
  }
  if(!financial)return {payments,issues:[...issues,'Onglet Paiements manquant.'],complete:false};
  for(const [position,expected] of paymentHeader(snapshot))if(!equalCell(normalizedCell(financial.getCell(position)),expected))issue(`En-tête Paiements modifié : ${position}.`);
  if(financial.rowCount>5000)return {payments,issues:[...issues,'L’onglet Paiements dépasse 5 000 lignes.'],complete:false};
  const expected=expectedPayments(snapshot),allowed=new Map(expected.map(p=>[p.agentId+'|'+p.month,p])),seen=new Set<string>();
  for(let row=HEADER_ROW+1;row<=financial.rowCount;row++){
   const cells=Array.from({length:8},(_,i)=>financial.getCell(row,i+1));
   // The signature area is intentionally free text and cannot supply payment data.
   const signature=cells[1].isMerged&&stringValue(cells[1].master.value).startsWith('Date, nom, qualité')&&normalizedCell(cells[0])===null;
   if(signature||cells.every(c=>normalizedCell(c)===null))continue;
   if(cells.some(c=>c.isMerged)){issue(`Paiements ligne ${row} : conservez un versement par ligne sans fusion de cellules.`);continue;}
   try{
    const agentId=paymentText(cells[0],80),name=paymentText(cells[1]),month=paymentText(cells[2],7),kindLabel=paymentText(cells[3],20).toLocaleLowerCase('fr'),person=allowed.get(agentId+'|'+month);
    if(!person||person.name!==name){issue(`Paiements ligne ${row} : agent ou mois inconnu ou modifié.`);continue;}
    const kind=kindLabel==='salaire'?'salary':kindLabel==='charges'?'contribution':null;if(!kind){issue(`Paiements ligne ${row} : choisissez Salaire ou Charges.`);continue;}
    const amountCents=paymentCents(cells[5]),date=paymentDate(cells[6]),organism=paymentText(cells[4]),reference=paymentText(cells[7]);
    if(amountCents===null){issue(`${name} · ${month} : montant ${kind==='salary'?'du salaire':'des charges'} à compléter (ligne ${row}).`);continue;}
    if(amountCents>0&&(!date||!reference||kind==='contribution'&&!organism)){issue(`${name} · ${month} : date, référence${kind==='contribution'?' et organisme':''} à compléter (ligne ${row}).`);continue;}
    const key=[agentId,month,kind,organism.toLowerCase(),amountCents,date,reference.toLowerCase()].join('|');if(seen.has(key)){issue(`Paiement en double à la ligne ${row}.`);continue;}seen.add(key);
    payments.push({id:`xlsx-row-${row}`,agentId,month,kind,organism,amountCents,date,reference});
   }catch(error){issue(`Paiements ligne ${row} : ${(error as Error).message}`);}
  }
  for(const person of expected)for(const kind of ['salary','contribution'] as const)if(!payments.some(p=>p.agentId===person.agentId&&p.month===person.month&&p.kind===kind))issue(`${person.name} · ${person.month} : ${kind==='salary'?'paiement du salaire':'paiement des charges'} manquant.`);
 }catch(error){issue((error as Error).message||'Le classeur ne peut pas être lu.');}
 return {payments,issues,complete:issues.length===0};
}
