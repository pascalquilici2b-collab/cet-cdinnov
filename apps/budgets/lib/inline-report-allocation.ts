import {parseAmount,round,sum,type Workspace} from "./budget-model.ts";
import {allocateReportExpense,reportAllocationOptions} from "./partner-reports.ts";
import {allocationStatus} from "./report-allocations.ts";

export function applyInlineAllocation(ws:Workspace,reportId:string,expenseId:string,lineId:string,text:string,editingLineId=""):Workspace{
  const {expense,options}=reportAllocationOptions(ws,reportId,expenseId),option=options.find(o=>o.line.id===lineId);
  const status=allocationStatus(expense,options.map(o=>o.line));
  if(status.needsReview)throw new Error("Réinitialisez la répartition invalide avant de la compléter.");
  if(!option||!text.trim())throw new Error("Choisissez une ligne et un montant.");
  if(editingLineId&&!status.allocations.some(a=>a.budgetLineId===editingLineId))throw new Error("Cette affectation a changé. Rechargez la ligne.");
  const base=status.allocations.filter(a=>a.budgetLineId!==editingLineId),existing=sum(base.filter(a=>a.budgetLineId===lineId).map(a=>a.amount));
  const value=text.trim().startsWith("-")?-parseAmount(text.trim().slice(1)):parseAmount(text);
  if(!value&&expense.declared!==0)throw new Error("Saisissez un montant différent de zéro.");
  const room=Math.max(0,round(option.rawAvailable-existing));
  if(value>room)throw new Error(`Disponible : ${room.toFixed(2)} €.`);
  return allocateReportExpense(ws,reportId,expenseId,base.filter(a=>a.budgetLineId!==lineId).concat({budgetLineId:lineId,amount:round(existing+value)}));
}
