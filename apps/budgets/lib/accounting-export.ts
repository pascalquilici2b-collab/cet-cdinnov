import type ExcelJS from "exceljs";
import type { Workspace, Project } from "./budget-model.ts";
import { round, sum } from "./budget-model.ts";
import { clientForecast, type ForecastWindow, type ForecastEntry } from "./client-forecast.ts";
import { EPCIC_BUDGET_GROUPS } from "./epcic-structure.ts";
import { EPCIC_ACCOUNTS } from "./epcic-accounts.ts";
import { costCategory } from "./cost-categories.ts";
const navy="173E69",blue="E6EEF6",muted="64758A",money='#,##0.00" €";[Red](#,##0.00" €");"—"';
const fill=(color:string):ExcelJS.Fill=>({type:"pattern",pattern:"solid",fgColor:{argb:"FF"+color}});
const date=(value:string)=>value?new Date(value+"T12:00:00Z"):null;
export function bpGroup(code:string){
 return EPCIC_BUDGET_GROUPS.find(g=>g.kind!=="produit"&&g.codes.includes(code))||{code:"",label:"Imputation à préciser",kind:"charge",codes:[],aggregate:false};
}
const aggregate=(e:ForecastEntry)=>{const g=bpGroup(e.account);return g.aggregate&&g.code===e.account};
const validated=(e:ForecastEntry)=>e.accountStatus==="Affecté"&&!aggregate(e)&&!!bpGroup(e.account).code;
const status=(e:ForecastEntry)=>aggregate(e)?"Rubrique BP à ventiler":validated(e)?"Validé":e.account&&!bpGroup(e.account).code?"Imputation à corriger":e.account?"Proposé · à valider":"Compte à préciser";
function totals(entries:ForecastEntry[]){return {amount:sum(entries.map(e=>e.amount)),confirmed:sum(entries.filter(validated).map(e=>e.amount)),proposed:sum(entries.filter(e=>!validated(e)).map(e=>e.amount)),feder:sum(entries.map(e=>e.feder)),remainder:sum(entries.map(e=>e.remainder))}}
export async function createAccountingWorkbook(ws:Workspace,p:Project,window:ForecastWindow){
 const module=await import("exceljs"),Excel=module.default;
 const book=new Excel.Workbook(),f=clientForecast(ws,p,window),client=ws.clients.find(c=>c.id===p.clientId)?.name||"";
 book.creator="CDInnov";book.title=p.acronym+" — Proposition BP "+window.label;book.calcProperties.fullCalcOnLoad=true;
 function page(name:string,widths:number[],title:string,subtitle:string,header:string[],headerRow=6){
  const sheet=book.addWorksheet(name,{properties:{defaultRowHeight:23},views:[{state:"frozen",ySplit:headerRow,xSplit:2,showGridLines:false,zoomScale:90}],pageSetup:{paperSize:9,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:"1:"+headerRow,margins:{left:.3,right:.3,top:.45,bottom:.45,header:.2,footer:.2}}});
  sheet.columns=widths.map(width=>({width}));sheet.mergeCells(1,1,1,widths.length);sheet.getCell("A1").value=title;sheet.getRow(1).height=34;
  sheet.mergeCells(2,1,2,widths.length);sheet.getCell("A2").value=client+" · "+p.acronym+(p.jems?.projectId?" · "+p.jems.projectId:"");sheet.getRow(2).height=26;
  sheet.mergeCells(3,1,3,widths.length);sheet.getCell("A3").value=subtitle;sheet.getRow(3).height=29;
  sheet.getRow(4).height=6;sheet.getRow(5).height=6;
  sheet.getRow(headerRow).values=header;sheet.getRow(headerRow).height=30;
  sheet.headerFooter.oddFooter="&L"+p.acronym+" — "+window.label+"&RPage &P / &N";
  return sheet;
 }
 function decorate(sheet:ExcelJS.Worksheet,header=6){
  sheet.eachRow({includeEmpty:true},row=>row.eachCell({includeEmpty:true},cell=>{
   if(cell.value==="")cell.value=null;
   cell.font={name:"Aptos",size:11,color:{argb:"FF243B53"}};
   cell.alignment={vertical:"middle",wrapText:true};
   if(typeof cell.value==="number"||cell.type===6){cell.numFmt=money;cell.alignment={vertical:"middle",horizontal:"right"}}
   if(cell.value instanceof Date)cell.numFmt="dd/mm/yyyy";
   if(row.number>header)cell.border={bottom:{style:"hair",color:{argb:"FFE4EAF0"}}};
  }));
  [1,header].forEach(r=>sheet.getRow(r).eachCell({includeEmpty:true},cell=>{cell.fill=fill(navy);cell.font={name:"Aptos",size:r===1?17:11,bold:true,color:{argb:"FFFFFFFF"}}}));
  sheet.getCell("A2").font={name:"Aptos",size:11,bold:true,color:{argb:"FF"+navy}};
  sheet.getCell("A3").font={name:"Aptos",size:10,color:{argb:"FF"+muted}};
  sheet.pageSetup.printArea="A1:"+sheet.getColumn(sheet.columnCount).letter+sheet.rowCount;
 }
 const bp=page("BP "+window.label,[17,72,22,22,22,22,22],"PROPOSITION DE BP "+window.label,"Dépenses prévues du "+window.start.split("-").reverse().join("/")+" au "+window.end.split("-").reverse().join("/")+" · Taux FEDER "+p.federRate+" %",["Code BP / compte","Rubrique, compte et prestation","Budget proposé","Dont codes validés","Dont à valider / ventiler","FEDER associé","Part hors FEDER"]);
 const detail=page("Rattachements",[24,46,60,32,28,17,43,27,20,20,20,16,16],"RATTACHEMENTS DES PRESTATIONS — "+window.label,"Une ligne par prestation ou solde d’enveloppe. Les sous-prestations ne s’ajoutent pas une seconde fois au budget parent.",["Référence","Ligne budgétaire JEMS","Prestation prévue","Catégorie JEMS","Rubrique du BP","Compte proposé / retenu","Libellé du compte","Affectation","Montant prévu","FEDER associé","Part hors FEDER","Début","Fin"]);
 const detailRows=new Map<string,number>();
 const sorted=[...f.entries].sort((a,b)=>{
  const ga=EPCIC_BUDGET_GROUPS.indexOf(bpGroup(a.account) as typeof EPCIC_BUDGET_GROUPS[number]),gb=EPCIC_BUDGET_GROUPS.indexOf(bpGroup(b.account) as typeof EPCIC_BUDGET_GROUPS[number]);
  return (ga<0?999:ga)-(gb<0?999:gb)||a.account.localeCompare(b.account)||a.description.localeCompare(b.description,"fr");
 });
 for(const e of sorted){const group=bpGroup(e.account),r=detail.addRow([e.id,e.parent,e.description,e.category,(group.code?group.code+" — ":"")+group.label,e.account||"",e.accountLabel,status(e),e.amount,e.feder,e.remainder,date(e.start),date(e.end)]);r.height=Math.max(34,Math.ceil(Math.max(e.parent.length/45,e.description.length/58))*15+10);detailRows.set(e.id,r.number)}
 const detailTotal=detail.addRow(["","TOTAL","",...Array(5).fill(""),f.totals.amount,f.totals.feder,f.totals.remainder]);
 for(const [c,key] of [[9,"amount"],[10,"feder"],[11,"remainder"]] as const)detailTotal.getCell(c).value={formula:sorted.length?"SUM("+detail.getColumn(c).letter+"7:"+detail.getColumn(c).letter+(detailTotal.number-1)+")":"0",result:f.totals[key]};
 detail.autoFilter={from:{row:6,column:1},to:{row:Math.max(6,detailTotal.number-1),column:13}};
 decorate(detail);detailTotal.eachCell({includeEmpty:true},c=>{c.fill=fill(blue);c.font={...c.font,bold:true}});
 for(const e of sorted){const row=detail.getRow(detailRows.get(e.id)!);row.getCell(4).fill=fill(costCategory(e.category).color.slice(1)+"");row.getCell(4).font={name:"Aptos",size:10,color:{argb:"FFFFFFFF"}};row.getCell(8).font={name:"Aptos",size:10,color:{argb:validated(e)?"FF287252":"FF8A632E"}};row.getCell(6).numFmt="@"}
 const rowStyles:Array<{row:number;kind:"section"|"group"|"account"|"detail"|"total";level?:number}>=[];
 const amountColumns=[["C","amount"],["D","confirmed"],["E","proposed"],["F","feder"],["G","remainder"]] as const;
 function summaryRow(code:string,label:string,entries:ForecastEntry[],kind:"group"|"account"|"total",sources:number[]){
  const t=totals(entries),r=bp.addRow([code,label,t.amount,t.confirmed,t.proposed,t.feder,t.remainder]);
  for(const [col,key] of amountColumns)r.getCell(col).value={formula:sources.length?"SUM("+sources.map(n=>col+n).join(",")+")":"0",result:t[key]};
  rowStyles.push({row:r.number,kind});return r.number;
 }
 const expenseRows:number[]=[];
 const kinds=[["charge","DÉPENSES DE FONCTIONNEMENT"],["investissement","DÉPENSES D’INVESTISSEMENT"]] as const;
 for(const [kind,title] of kinds){
  const entries=sorted.filter(e=>bpGroup(e.account).kind===kind);if(!entries.length)continue;
  const section=bp.addRow(["",title]);rowStyles.push({row:section.number,kind:"section"});
  const familyIds=[...new Set(entries.map(e=>bpGroup(e.account).code))];
  for(const familyId of familyIds){
   const members=entries.filter(e=>bpGroup(e.account).code===familyId),group=bpGroup(members[0].account),groupRow=bp.addRow([group.code,group.label]);rowStyles.push({row:groupRow.number,kind:"group"});
   const accountTotals:number[]=[];
   for(const code of [...new Set(members.map(e=>e.account))]){
    const items=members.filter(e=>e.account===code),single=code===group.code&&!group.aggregate,accountRow=single?groupRow:bp.addRow([code||"À préciser",items[0].accountLabel+(aggregate(items[0])?" — à ventiler":"")]);if(!single)rowStyles.push({row:accountRow.number,kind:"account"});
    const refs:number[]=[];
    for(const e of items){
     const source=detailRows.get(e.id)!,r=bp.addRow(["",e.description,e.amount,validated(e)?e.amount:0,validated(e)?0:e.amount,e.feder,e.remainder]);refs.push(r.number);
     for(const [col,sourceCol,value] of [["C","I",e.amount],["F","J",e.feder],["G","K",e.remainder]] as const)r.getCell(col).value={formula:"'Rattachements'!"+sourceCol+source,result:value};
     r.getCell("D").value={formula:validated(e)?"C"+r.number:"0",result:validated(e)?e.amount:0};r.getCell("E").value={formula:"C"+r.number+"-D"+r.number,result:validated(e)?0:e.amount};
     r.height=Math.max(29,Math.ceil(e.description.length/64)*15+8);rowStyles.push({row:r.number,kind:"detail"});r.outlineLevel=2;
    }
    const t=totals(items);for(const [col,key] of amountColumns)accountRow.getCell(col).value={formula:"SUM("+refs.map(n=>col+n).join(",")+")",result:t[key]};
    accountRow.outlineLevel=single?0:1;accountTotals.push(...(single?refs:[accountRow.number]));
   }
   const t=totals(members);for(const [col,key] of amountColumns)groupRow.getCell(col).value={formula:"SUM("+accountTotals.map(n=>col+n).join(",")+")",result:t[key]};
   expenseRows.push(groupRow.number);
  }
 }
 summaryRow("","TOTAL DES DÉPENSES",sorted,"total",expenseRows);
 bp.addRow([]);
 const revenue=bp.addRow(["","RECETTES PRÉVISIONNELLES — ENCAISSEMENTS "+window.label]);rowStyles.push({row:revenue.number,kind:"section"});
 const grantCode=EPCIC_ACCOUNTS.find(a=>a.code==="745100"&&a.kind==="produit");
 const operations=sorted.filter(e=>bpGroup(e.account).kind!=="investissement"),investments=sorted.filter(e=>bpGroup(e.account).kind==="investissement");
 const hasInvestments=ws.budgetLines.some(e=>e.projectId===p.id&&(bpGroup(e.account||"").kind==="investissement"||["works","equipment"].includes(costCategory(e.category).id)));
 const receiptCode=hasInvestments?"À préciser":grantCode?.code||"À préciser";
 const receiptHeader=bp.addRow(["Compte proposé","Recette / date d’encaissement prévue","Recette nette","FEDER brut","Reprise d’avance","",""]);rowStyles.push({row:receiptHeader.number,kind:"group"});
 const receiptRows:number[]=[];
 for(const [index,r] of f.receipts.entries()){
  if(!r.inWindow)continue;
  const source=index+7,label=(r.source==="advance"?"Avance FEDER":(r.certified?"FEDER — certificat ":"FEDER prévisionnel — ")+r.period)+" · "+r.date.split("-").reverse().join("/");
  const row=bp.addRow([receiptCode,label,r.net,r.gross,r.recovery]);receiptRows.push(row.number);rowStyles.push({row:row.number,kind:"detail"});
  for(const [col,sourceCol,value] of [["C","F",r.net],["D","D",r.gross],["E","E",r.recovery]] as const)row.getCell(col).value={formula:"'Financement'!"+sourceCol+source,result:value};
 }
 const received=f.receipts.filter(r=>r.inWindow),receiptTotal=bp.addRow([receiptCode,"TOTAL DES RECETTES "+window.label,f.receiptTotal,sum(received.map(r=>r.gross)),sum(received.map(r=>r.recovery))]);rowStyles.push({row:receiptTotal.number,kind:"total"});
 for(const [col,value] of [["C",f.receiptTotal],["D",sum(received.map(r=>r.gross))],["E",sum(received.map(r=>r.recovery))]] as const)receiptTotal.getCell(col).value={formula:receiptRows.length?"SUM("+receiptRows.map(n=>col+n).join(",")+")":"0",result:value};
 const grantNote=bp.addRow(["","Recettes nettes classées par date d’encaissement, y compris après la fin du projet. Comptes proposés à valider."]);bp.mergeCells(grantNote.number,2,grantNote.number,7);grantNote.height=30;
 bp.properties.outlineProperties={summaryBelow:false,summaryRight:false};
 decorate(bp);for(const s of rowStyles){const row=bp.getRow(s.row);row.height=Math.max(row.height||23,s.kind==="section"?29:25);row.eachCell({includeEmpty:true},cell=>{
  if(s.kind==="section"||s.kind==="total"){cell.fill=fill(navy);cell.font={name:"Aptos",size:11,bold:true,color:{argb:"FFFFFFFF"}}}
  else if(s.kind==="group"){cell.fill=fill(blue);cell.font={name:"Aptos",size:11,bold:true,color:{argb:"FF"+navy}}}
  else if(s.kind==="account"){cell.fill=fill("F3F6F9");cell.font={name:"Aptos",size:11,bold:true,color:{argb:"FF294E73"}}}
 });if(s.kind==="detail")row.getCell("B").alignment={vertical:"middle",wrapText:true,indent:2};if(row.getCell("A").value)row.getCell("A").numFmt="@"}
 const finance=page("Financement",[27,20,23,23,23,23,27,36],"FINANCEMENT ET ENCAISSEMENTS — "+window.label,"FEDER associé aux coûts : "+f.totals.feder.toFixed(2)+" € · Les encaissements suivent les dates de versement, après reprise d’avance.",["Période / avance","Date prévue","Base de financement","FEDER brut","Reprise d’avance","FEDER net","Périmètre","Nature"]);
 const inPeriod:number[]=[],undated:number[]=[];
 for(const r of f.receipts){const row=finance.addRow([r.period,date(r.date),r.basis,r.gross,r.recovery,r.net,!r.date?"À dater":r.inWindow?"Année "+window.label:"Hors année",r.status]);if(r.inWindow)inPeriod.push(row.number);if(!r.date)undated.push(row.number)}
 for(const [label,indices,value] of [["ENCAISSEMENTS DATÉS "+window.label,inPeriod,f.receiptTotal],["SANS DATE — PROJET",undated,f.undatedReceiptTotal]] as const){const row=finance.addRow([label,"","","","",value]);row.height=34;row.getCell(6).value={formula:indices.length?"SUM("+indices.map(i=>"F"+i).join(",")+")":"0",result:value}}
 decorate(finance);for(const n of [finance.rowCount-1,finance.rowCount])finance.getRow(n).eachCell({includeEmpty:true},c=>{c.fill=fill(blue);c.font={...c.font,bold:true}});
 const points=page("À compléter",[30,80,21,52],"AFFECTATIONS ET DONNÉES À COMPLÉTER","À vérifier avant reprise dans le BP du client.",["Sujet","Prestation / élément","Montant concerné","Action"],6);
 for(const e of sorted.filter(e=>!validated(e)))points.addRow(["Affectation comptable",e.description,e.amount,aggregate(e)?"Ventiler la rubrique "+e.account+" en comptes détaillés":e.account&&!bpGroup(e.account).code?"Corriger le compte "+e.account+" : hors rubriques de dépenses":e.account?"Valider la proposition "+e.account:"Préciser la prestation"]);
 for(const e of f.unplanned)points.addRow(["Calendrier",e.description,e.amount,"Positionner la ligne dans le chronogramme"]);
 for(const w of f.warnings)points.addRow(["Cohérence du budget",w,null,"Vérifier les montants et leur ventilation"]);
 for(const r of f.receipts.filter(r=>!r.date&&r.net))points.addRow(["Date de versement",r.period,r.net,"Renseigner la date dans DR & recettes"]);
 if(f.unrecoveredAdvance)points.addRow(["Avance", "Solde d’avance non récupéré",f.unrecoveredAdvance,"Vérifier les reprises d’avance"]);
 if(operations.length)points.addRow(["Compte de recette","FEDER associé au fonctionnement",sum(operations.map(e=>e.feder)),"Valider le compte proposé "+(grantCode?.code||"à préciser")]);
 if(investments.length)points.addRow(["Compte de recette","FEDER associé aux investissements",sum(investments.map(e=>e.feder)),"Préciser l’imputation de la subvention"]);
 decorate(points);points.eachRow(r=>{if(r.number>6)r.height=42});points.autoFilter={from:{row:6,column:1},to:{row:points.rowCount,column:4}};
 // Put the BP first, keeping detail-sheet references stable.

 return book;
}
export async function prepareAccountingDownload(ws:Workspace,p:Project,window:ForecastWindow){
 const book=await createAccountingWorkbook(ws,p,window),bytes=new Uint8Array(await book.xlsx.writeBuffer());
 let binary="";for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {href:"data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,"+btoa(binary),filename:"BP-"+p.acronym.replace(/[<>:"/\\|?*]/g,"-")+"-"+window.label+".xlsx"};
}
