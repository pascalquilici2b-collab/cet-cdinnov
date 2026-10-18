import { newId, type BudgetLine, type IncomingLine, type Workspace } from "./budget-model.ts";
import { normalize, type JemsBudget } from "./jems-import.ts";

const allocationKey=(values:Record<string,number>)=>JSON.stringify(Object.entries(values).filter(([,amount])=>amount!==0).sort(([a],[b])=>a.localeCompare(b)));
const sameBudget=(line:BudgetLine,incoming:IncomingLine)=>{
  const reference=line.reference||line;
  return normalize(reference.category)===normalize(incoming.category)&&reference.amount===incoming.amount&&allocationKey(reference.allocations)===allocationKey(incoming.allocations);
};

/** Text repair is confined to the same export version; row numbers alone are not identities. */
export function jemsTextMatches(ws:Workspace,projectId:string,budget:JemsBudget,partnerId:string){
  const project=ws.projects.find(p=>p.id===projectId),partner=budget.partners.find(p=>p.id===partnerId);
  if(!partner||!project?.jems||project.jems.projectId!==budget.projectId||project.jems.partnerId!==partnerId||!budget.version||project.jems.version!==budget.version)return [];
  const existing=ws.budgetLines.filter(b=>b.projectId===projectId),used=new Set<string>();
  return partner.lines.map(incoming=>{
    const candidates=existing.filter(line=>!used.has(line.id)&&sameBudget(line,incoming)&&(
      line.externalKey===incoming.key||
      (line.externalKey?.startsWith("jems:")&&line.sourceRow===incoming.row&&(!line.partnerId||line.partnerId===partnerId)&&!line.comments?.trim()&&normalize(line.reference?.description||line.description)===normalize(line.category))
    ));
    const line=candidates.length===1?candidates[0]:undefined;
    if(line)used.add(line.id);
    return {incoming,line};
  });
}

export function repairJemsTexts(ws:Workspace,projectId:string,budget:JemsBudget,partnerId:string,file:string):Workspace{
  const matches=jemsTextMatches(ws,projectId,budget,partnerId);
  if(!matches.length||matches.some(m=>!m.line))throw new Error("Les textes doivent provenir de la même version JEMS, avec les mêmes lignes et montants. Le rapprochement est incomplet ; aucune modification effectuée.");
  let updated=0;
  const budgetLines=ws.budgetLines.map(line=>{
    const incoming=matches.find(m=>m.line?.id===line.id)?.incoming;
    if(!incoming)return line;
    const customized=line.description!==(line.reference?.description||line.category)&&line.description!==line.category;
    const next={...line,description:customized?line.description:incoming.description,comments:incoming.comments,jemsLabelSource:incoming.jemsLabelSource,externalKey:incoming.key,
      ...(line.reference?{reference:{...line.reference,description:incoming.description}}:{})};
    if(JSON.stringify(next)===JSON.stringify(line))return line;
    updated++;return next;
  });
  if(!updated)return ws;
  const version=Math.max(0,...ws.imports.filter(i=>i.projectId===projectId).map(i=>i.version))+1;
  return {...ws,budgetLines,imports:[...ws.imports,{id:newId(),projectId,file,sheet:budget.sheet,range:"Textes · 4:"+budget.lastRow,version,date:new Date().toISOString(),added:0,updated,
    before:structuredClone(ws.budgetLines.filter(b=>b.projectId===projectId)),after:structuredClone(budgetLines.filter(b=>b.projectId===projectId))}]};
}
