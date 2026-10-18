"use client";
import { ArrowUpRight, UsersRound, Building2, Plane, BriefcaseBusiness, Monitor, HardHat, Layers3 } from "lucide-react";
import type { BudgetLine, Project } from "@/lib/budget-model";
import { currency } from "@/lib/budget-model";
import { budgetOverview } from "@/lib/budget-overview";
const icons={hr:UsersRound,office:Building2,travel:Plane,external:BriefcaseBusiness,equipment:Monitor,works:HardHat,other:Layers3};
export default function BudgetOverview({lines,project,onCategory}:{lines:BudgetLine[];project:Project;onCategory:(id:string)=>void}){
 const data=budgetOverview(lines,project),format=(n:number)=>n?currency(n):"—";
 return <div className="overview-table-wrap"><table className="overview-table"><thead><tr><th>Catégorie de dépenses</th>{data.years.map(y=><th key={y}>{y}</th>)}<th>Sans calendrier</th><th>Budget total</th></tr></thead><tbody>
 {data.groups.map(g=>{const Icon=icons[g.id];return <tr key={g.id} style={{"--category-color":g.color} as React.CSSProperties}><th><button onClick={()=>onCategory(g.id)} aria-label={"Voir les lignes : "+g.label}><span className="overview-category-icon"><Icon size={20}/></span><span><strong>{g.label}</strong><small>{g.count} ligne{g.count>1?"s":""}</small></span><ArrowUpRight size={16}/></button></th>{g.annual.map((n,i)=><td key={i}>{format(n)}</td>)}<td className={g.unplanned?"unplanned-value":""}>{format(g.unplanned)}</td><td className="overview-total"><strong>{currency(g.amount)}</strong><div className="overview-share"><i style={{width:(data.amount?g.amount/data.amount*100:0)+"%"}}/></div></td></tr>})}
 {!data.groups.length&&<tr><td colSpan={data.years.length+3}>Importez un budget JEMS ou ajoutez une ligne.</td></tr>}
 </tbody><tfoot><tr><th>Total du projet</th>{data.annual.map((n,i)=><td key={i}>{currency(n)}</td>)}<td>{format(data.unplanned)}</td><td>{currency(data.amount)}</td></tr></tfoot></table></div>;
}
