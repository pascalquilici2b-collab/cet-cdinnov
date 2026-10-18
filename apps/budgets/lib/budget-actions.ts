import type { Workspace } from "./budget-model.ts";
export type Removal={kind:"line"|"sub"|"expense";lineId?:string;subId?:string;expenseId?:string};
export function removeBudgetItem(ws:Workspace,projectId:string,item:Removal):Workspace{
  if(item.kind==="expense")return {...ws,expenses:ws.expenses.filter(e=>!(e.projectId===projectId&&e.id===item.expenseId))};
  if(item.kind==="sub")return {...ws,budgetLines:ws.budgetLines.map(b=>b.projectId===projectId&&b.id===item.lineId?{...b,subExpenses:b.subExpenses.filter(s=>s.id!==item.subId)}:b)};
  return {...ws,budgetLines:ws.budgetLines.filter(b=>!(b.projectId===projectId&&b.id===item.lineId)),expenses:ws.expenses.map(e=>e.projectId===projectId&&e.budgetLineId===item.lineId?{...e,budgetLineId:""}:e)};
}
