import * as XLSX from "xlsx";
import type { Project, Workspace } from "./budget-model.ts";
import { sum } from "./budget-model.ts";
import { accountTargets, accountingPlan, accountProposal } from "./account-suggestions.ts";
import { COST_CATEGORIES, costCategory } from "./cost-categories.ts";
import { planningBlocks } from "./timeline.ts";

export function createBudgetWorkbook(ws:Workspace,project:Project){
 const lines=ws.budgetLines.filter(b=>b.projectId===project.id),targets=accountTargets(ws,project.id),plan=accountingPlan();
 const extra=[...new Set(lines.flatMap(b=>[...Object.keys(b.allocations),...b.subExpenses.flatMap(s=>Object.keys(s.allocations||{}))]))].filter(id=>!project.periods.some(p=>p.id===id));
 const periods=[...project.periods.map(p=>p.id),...extra],headers=["Catégorie / ligne","Budget (€)","Début","Fin",...periods.map(id=>id==="PREP"?"Préparation":id==="CLOSE"?"Clôture":id),"Commentaires"];
 const rows:Array<Array<string|number|Date>>=[[project.acronym+" — Budget du projet"],[ws.clients.find(c=>c.id===project.clientId)?.name||""],["Date de démarrage",new Date(project.start+"T12:00:00Z"),"Date de fin de projet",new Date(project.end+"T12:00:00Z")],[],headers];
 const mainRows:number[]=[];
 function codeRow(kind:"line"|"sub",id:string){
   const t=targets.find(t=>t.id===id&&t.kind===kind)!;const predicted=t.account?undefined:accountProposal(ws,project.clientId,t);
   const code=t.account||predicted?.code||"";
   rows.push([t.account?"Compte affecté":"Code proposé",code,plan.find(a=>a.code===code)?.label||(code?"Compte existant":"À préciser")]);
 }
 for(const group of COST_CATEGORIES){
  const groupLines=lines.filter(b=>costCategory(b.category).id===group.id);if(!groupLines.length)continue;
  rows.push([group.label,sum(groupLines.map(b=>b.amount)),"","",...periods.map(id=>sum(groupLines.map(b=>b.allocations[id]||0)))]);
  for(const b of groupLines){
    const blocks=planningBlocks(b,project.periods),start=blocks.map(x=>x.start).sort()[0],end=blocks.map(x=>x.end).sort().at(-1);
    mainRows.push(rows.length);
    rows.push([b.description,b.amount,start?new Date(start+"T12:00:00Z"):"",end?new Date(end+"T12:00:00Z"):"",...periods.map(id=>b.allocations[id]||0),b.comments||""]);codeRow("line",b.id);
    for(const sub of b.subExpenses){
      const sb=planningBlocks(sub,project.periods),ss=sb.map(x=>x.start).sort()[0],se=sb.map(x=>x.end).sort().at(-1);
      rows.push(["    "+sub.label,sub.amount,ss?new Date(ss+"T12:00:00Z"):"",se?new Date(se+"T12:00:00Z"):"",...periods.map(id=>sub.allocations?.[id]||0)]);codeRow("sub",sub.id);
    }
  }
 }
 const totalRow=rows.length;
 rows.push(["TOTAL DU BUDGET",sum(lines.map(b=>b.amount)),"","",...periods.map(id=>sum(lines.map(b=>b.allocations[id]||0)))]);
 const sheet=XLSX.utils.aoa_to_sheet(rows,{cellDates:false,dateNF:"dd/mm/yyyy"});
 for(const col of [1,...periods.map((_,i)=>i+4)]){
   const address=XLSX.utils.encode_cell({r:totalRow,c:col});
   if(mainRows.length)sheet[address]={t:"n",v:rows[totalRow][col] as number,f:"SUM("+mainRows.map(r=>XLSX.utils.encode_cell({r,c:col})).join(",")+")",z:'#,##0.00'};
 }
 sheet["!cols"]=[{wch:65},{wch:20},{wch:48},{wch:16},...periods.map(()=>({wch:18})),{wch:65}];
 for(let r=5;r<rows.length;r++)for(const c of [1,...periods.map((_,i)=>i+4)]){
   const cell=sheet[XLSX.utils.encode_cell({r,c})];if(cell?.t==="n")cell.z='#,##0.00';
 }
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,"Budget");
 workbook.Props={Title:project.acronym+" — Budget du projet",Subject:"Budget et propositions de comptes de la nomenclature EPCIC",Author:"CDInnov"};
 return workbook;
}
export function downloadBudget(ws:Workspace,project:Project){
 XLSX.writeFile(createBudgetWorkbook(ws,project),"Budget-"+project.acronym.replace(/[<>:"/\\|?*]/g,"-")+".xlsx",{bookType:"xlsx",compression:true});
}
