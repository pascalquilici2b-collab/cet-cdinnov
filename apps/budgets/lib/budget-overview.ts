import type { BudgetLine, Project } from "./budget-model.ts";
import { sum, round } from "./budget-model.ts";
import { COST_CATEGORIES, costCategory } from "./cost-categories.ts";
import { annualWindow, windowAmount } from "./client-forecast.ts";
export function budgetOverview(lines:BudgetLine[],project:Project){
 const years=Array.from({length:Math.max(1,+project.end.slice(0,4)- +project.start.slice(0,4)+1)},(_,i)=>+project.start.slice(0,4)+i);
 const groups=COST_CATEGORIES.map(category=>{
  const children=lines.filter(b=>costCategory(b.category).id===category.id),amount=sum(children.map(b=>b.amount));
  const annual=years.map(y=>sum(children.map(b=>windowAmount(b,project,annualWindow(y)))));
  return {...category,count:children.length,amount,annual,unplanned:round(amount-sum(annual))};
 }).filter(g=>g.count);
 return {years,groups,amount:sum(groups.map(g=>g.amount)),annual:years.map((_,i)=>sum(groups.map(g=>g.annual[i]))),unplanned:sum(groups.map(g=>g.unplanned))};
}
