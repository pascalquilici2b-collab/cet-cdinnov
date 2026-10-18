import type { BudgetLine, Planning, Project, Workspace } from "./budget-model.ts";
import { allocated, dayIndex, round, sum } from "./budget-model.ts";
import { projectReceipts, type ProjectReceipt } from "./project-receipts.ts";
import { planningBlocks } from "./timeline.ts";
import { accountProposal, type AccountTarget } from "./account-suggestions.ts";

type Planned=Planning&{amount:number;allocations?:Record<string,number>};
export type ForecastWindow={start:string;end:string;label:string};
export function annualWindow(year:number):ForecastWindow{
 if(!Number.isInteger(year)||year<2000||year>2199)throw new Error("Année invalide.");
 return {start:year+"-01-01",end:year+"-12-31",label:String(year)};
}
export function forecastYears(ws:Workspace,p:Project):number[]{
 const first=+p.start.slice(0,4),last=+p.end.slice(0,4),calendar=Array.from({length:Math.min(100,Math.max(1,last-first+1))},(_,i)=>first+i);
 const receipts=projectReceipts(ws,p).receipts.filter(r=>r.date).map(r=>+r.date.slice(0,4));
 const payments=ws.expenses.filter(e=>e.projectId===p.id).flatMap(e=>e.payments.map(v=>+(v.paidDate||v.plannedDate).slice(0,4)));
 return [...new Set([...calendar,...receipts,...payments])].filter(y=>Number.isInteger(y)&&y>=2000&&y<=2199).sort((a,b)=>a-b);
}
export function windowAmount(item:Planned,project:Project,window:Pick<ForecastWindow,"start"|"end">){
 return sum(planningBlocks(item,project.periods).map(b=>{
  const left=dayIndex(b.start),right=dayIndex(b.end)+1,from=Math.max(left,dayIndex(window.start)),to=Math.min(right,dayIndex(window.end)+1);
  if(!Number.isFinite(left)||!Number.isFinite(right)||right<=left||to<=from)return 0;
  const cents=Math.round(b.amount*100);
  // Cumulative rounded cents keep adjacent years exactly additive.
  return (Math.round(cents*(to-left)/(right-left))-Math.round(cents*(from-left)/(right-left)))/100;
 }));
}
export type ForecastEntry={id:string;parent:string;category:string;description:string;type:string;account:string;accountLabel:string;accountStatus:string;amount:number;feder:number;remainder:number;start:string;end:string;comments:string};
export type ForecastReceipt=ProjectReceipt&{inWindow:boolean};
const codeFor=(ws:Workspace,p:Project,t:AccountTarget)=>accountProposal(ws,p.clientId,t);
export function fundingReceipts(ws:Workspace,p:Project,window:ForecastWindow){
 const funding=projectReceipts(ws,p);
 const receipts:ForecastReceipt[]=funding.receipts.filter(r=>r.gross||r.date||r.source==="jems").map(r=>({...r,inWindow:!!r.date&&r.date>=window.start&&r.date<=window.end}));
 return {...funding,receipts};
}
export function clientForecast(ws:Workspace,p:Project,window:ForecastWindow){
 if(!Number.isFinite(p.federRate)||p.federRate<0||p.federRate>100)throw new Error("Le taux FEDER doit être compris entre 0 et 100 %.");
 const entries:ForecastEntry[]=[],warnings:string[]=[],unplanned:Array<{description:string;amount:number;type:string}>=[];
 const lines=ws.budgetLines.filter(b=>b.projectId===p.id),rate=p.federRate/100;
 function add(item:Planned,target:AccountTarget,parent:BudgetLine,amount:number,type:string){
  if(amount<=0)return;
  const code=codeFor(ws,p,target),blocks=planningBlocks(item,p.periods).filter(b=>b.end>=window.start&&b.start<=window.end);
  const start=blocks.map(b=>b.start<window.start?window.start:b.start).sort()[0]||"",end=blocks.map(b=>b.end>window.end?window.end:b.end).sort().at(-1)||"";
  const feder=round(amount*rate);
  entries.push({id:target.kind+":"+target.id,parent:parent.description,category:parent.category,description:target.label,type,account:code.code,accountLabel:code.label,accountStatus:code.status,amount,feder,remainder:round(amount-feder),start,end,comments:target.comments||""});
 }
 for(const b of lines){
  const parentAmount=windowAmount(b,p,window),children=b.subExpenses.map(s=>({item:s,amount:windowAmount(s,p,window)})),childTotal=sum(children.map(s=>s.amount));
  const unscheduled=Math.max(0,round(b.amount-sum(planningBlocks(b,p.periods).map(x=>x.amount))));
  if(unscheduled)unplanned.push({description:b.description,amount:unscheduled,type:"Enveloppe : dates à préciser"});
  if(childTotal>parentAmount+.01)warnings.push(b.description+" : sous-lignes prévues supérieures au montant de l’enveloppe dans cette année ("+round(childTotal-parentAmount)+" €).");
  for(const {item:s,amount} of children){
   add(s,{kind:"sub",id:s.id,lineId:b.id,label:s.label,category:b.category,account:s.account},b,amount,"Sous-prestation");
   const missing=Math.max(0,round(s.amount-sum(planningBlocks(s,p.periods).map(x=>x.amount))));
   if(missing)unplanned.push({description:b.description+" — "+s.label,amount:missing,type:"Sous-ligne : dates à préciser"});
  }
  add(b,{kind:"line",id:b.id,label:b.description,category:b.category,account:b.account,comments:b.comments},b,Math.max(0,round(parentAmount-childTotal)),children.some(c=>c.amount)?"Solde de l’enveloppe":"Ligne budgétaire");
  if(allocated(b.allocations)>b.amount+.01)warnings.push(b.description+" : ventilation supérieure au budget de la ligne.");
 }
 const amount=sum(entries.map(x=>x.amount)),federCents=Math.round(amount*rate*100);
 const shares=entries.map((e,index)=>({index,base:Math.floor(Math.round(e.amount*100)*rate),fraction:Math.round(e.amount*100)*rate%1}));
 let centsLeft=federCents-shares.reduce((n,s)=>n+s.base,0);
 for(const s of [...shares].sort((a,b)=>b.fraction-a.fraction)){if(centsLeft-->0)s.base++}
 for(const s of shares){entries[s.index].feder=s.base/100;entries[s.index].remainder=round(entries[s.index].amount-s.base/100)}
 const totals={amount,feder:sum(entries.map(x=>x.feder)),remainder:sum(entries.map(x=>x.remainder))};
 const funding=fundingReceipts(ws,p,window),dated=funding.receipts.filter(x=>x.inWindow),undated=funding.receipts.filter(x=>!x.date&&x.net);
 if(totals.feder>funding.grant+.01)warnings.push("Le FEDER indicatif de cette année dépasse la dotation du projet : revoir les lignes et le taux.");
 const unsettled=entries.filter(e=>e.accountStatus!=="Affecté").length;
 return {window,entries,totals,warnings,unplanned,unsettled,receipts:funding.receipts,receiptTotal:sum(dated.map(x=>x.net)),undatedReceiptTotal:sum(undated.map(x=>x.net)),undatedReceiptCount:undated.length,unrecoveredAdvance:funding.outstanding,grant:funding.grant};
}
