import {round,sum,type BudgetLine,type ReportExpense,type ReportExpenseAllocation} from "./budget-model.ts";
import {costCategory} from "./cost-categories.ts";

export const expenseIdentity=(expense:ReportExpense)=>expense.databaseId||expense.id;
export const rawExpenseAllocations=(expense:ReportExpense):ReportExpenseAllocation[]=>expense.budgetAllocations??(expense.budgetLineId?[{budgetLineId:expense.budgetLineId,amount:expense.declared}]:[]);
export function validAllocationAmount(amount:number,total:number){
  return Number.isFinite(amount)&&Number.isSafeInteger(Math.round(amount*100))&&Math.abs(amount-round(amount))<1e-8&&(total===0?amount===0:amount===0||Math.sign(amount)===Math.sign(total));
}
export function allocationStatus(expense:ReportExpense,lines:BudgetLine[]){
  const raw=rawExpenseAllocations(expense);
  const malformed=raw.some(a=>!validAllocationAmount(a.amount,expense.declared))||new Set(raw.map(a=>a.budgetLineId)).size!==raw.length||Math.abs(sum(raw.map(a=>a.amount)))>Math.abs(expense.declared)+.001;
  const allocations=malformed?[]:raw.filter(a=>lines.some(l=>l.id===a.budgetLineId&&costCategory(l.category).id===costCategory(expense.category).id&&l.costMode!=="forfait"&&!l.flatRate));
  const assigned=sum(allocations.map(a=>a.amount)),unassigned=round(expense.declared-assigned),needsReview=malformed||allocations.length!==raw.length;
  return {allocations,assigned,unassigned,needsReview,complete:allocations.length>0&&unassigned===0&&!needsReview};
}
