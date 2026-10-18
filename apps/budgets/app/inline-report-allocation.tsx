"use client";
import {useState} from "react";
import {Check,Pencil,X} from "lucide-react";
import {currency,round,sum,type Workspace} from "@/lib/budget-model";
import {applyInlineAllocation} from "@/lib/inline-report-allocation";
import {allocateReportExpense,proposeReportAllocation,reportAllocationOptions} from "@/lib/partner-reports";
import {allocationStatus} from "@/lib/report-allocations";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";

export default function InlineReportAllocation({workspace,reportId,expenseId,disabled,onSave}:{workspace:Workspace;reportId:string;expenseId:string;disabled:boolean;onSave:(ws:Workspace)=>void}){
  const {expense,options}=reportAllocationOptions(workspace,reportId,expenseId);
  const status=allocationStatus(expense,options.map(o=>o.line));
  const [lineId,setLineId]=useState(""),[editing,setEditing]=useState(""),[amount,setAmount]=useState(""),[error,setError]=useState("");
  const base=status.allocations.filter(a=>a.budgetLineId!==editing);
  const room=(id:string)=>Math.max(0,round((options.find(o=>o.line.id===id)?.rawAvailable||0)-sum(base.filter(a=>a.budgetLineId===id).map(a=>a.amount))));
  const choices=options.filter(o=>expense.declared<=0||room(o.line.id)>0||o.line.id===editing);
  const selected=choices.find(o=>o.line.id===lineId);
  function choose(id:string){
    setLineId(id);setError("");
    if(!id){setAmount("");return}
    try{const next=proposeReportAllocation(workspace,reportId,expenseId,id,base);setAmount(String(round((next.find(a=>a.budgetLineId===id)?.amount||0)-(base.find(a=>a.budgetLineId===id)?.amount||0))).replace(".",","))}catch(e){setError(e instanceof Error?e.message:"Affectation impossible.")}
  }
  function save(){
    try{
      if(!selected||!amount.trim())throw new Error("Choisissez une ligne et un montant.");
      onSave(applyInlineAllocation(workspace,reportId,expenseId,lineId,amount,editing));setLineId("");setAmount("");setEditing("");setError("");
    }catch(e){setError(e instanceof Error?e.message:"Vérifiez le montant.")}
  }
  return <div className="inline-allocation">
    {status.allocations.map(a=>{const o=options.find(x=>x.line.id===a.budgetLineId)!;return <div className="inline-allocation-saved" key={a.budgetLineId}><span><strong>{currency(a.amount)}</strong> · {o.line.description}{o.line.sourceRow?` · ligne ${o.line.sourceRow}`:""}</span><div><mark>Disponible : {currency(Math.max(0,round(o.rawAvailable-a.amount)))}</mark><button disabled={disabled} aria-label={`Modifier l’affectation ${expenseId} à ${o.line.description}`} onClick={()=>{setEditing(a.budgetLineId);setLineId(a.budgetLineId);setAmount(String(a.amount).replace(".",","));setError("")}}><Pencil/></button><button disabled={disabled} aria-label={`Retirer l’affectation ${expenseId} à ${o.line.description}`} onClick={()=>{onSave(allocateReportExpense(workspace,reportId,expenseId,status.allocations.filter(x=>x.budgetLineId!==a.budgetLineId)));setEditing("");setLineId("");setAmount("")}}><X/></button></div></div>})}
    {(!status.complete||editing)&&<>
      <Select disabled={disabled||status.needsReview} value={selected?lineId:""} onValueChange={id=>choose(id==="__none__"?"":id)}>
        <SelectTrigger className="budget-line-trigger" aria-label={`Ligne budgétaire ${expenseId}`}><SelectValue placeholder="Choisir une ligne">{selected?.line.description}</SelectValue></SelectTrigger>
        <SelectContent className="budget-line-options" position="popper" align="end" sideOffset={5}>
          <SelectItem value="__none__">Choisir une ligne</SelectItem>
          {choices.map((o,index)=><SelectItem className="budget-line-option" key={o.line.id} value={o.line.id} textValue={o.line.description}>
            <span className="budget-line-option-content"><span className="budget-line-option-label"><span>{o.line.description}</span><small>{o.line.sourceRow?`Ligne Excel ${o.line.sourceRow}`:`Ligne ${index+1}`}</small></span><mark className="budget-line-option-available"><small>Disponible</small><strong>{currency(room(o.line.id))}</strong></mark></span>
          </SelectItem>)}
        </SelectContent>
      </Select>
      {selected&&<mark className="inline-available">Disponible : {currency(room(lineId))}</mark>}
      <div className="inline-allocation-controls"><input aria-label={`Montant à affecter ${expenseId}`} inputMode="decimal" placeholder="0,00" value={amount} onChange={e=>{setAmount(e.target.value);setError("")}} disabled={disabled||!selected||status.needsReview}/><button disabled={disabled||!selected||status.needsReview} onClick={()=>choose(lineId)} aria-label={`Affecter le maximum ${expenseId}`}>Max</button><button className="inline-assign" disabled={disabled||!selected||!amount.trim()||status.needsReview} onClick={save}><Check aria-hidden="true"/>{editing?"Enregistrer":"Affecter"}</button>{editing&&<button aria-label={`Annuler la modification ${expenseId}`} onClick={()=>{setEditing("");setLineId("");setAmount("");setError("")}}><X/></button>}</div>
      {status.allocations.length>0&&!status.complete&&<small>Reste à affecter : {currency(status.unassigned)}</small>}
      {!choices.length&&<small>Aucune ligne disponible dans cette catégorie.</small>}
    </>}
    {status.needsReview&&<div role="alert"><small>Répartition à revoir.</small><button disabled={disabled} onClick={()=>onSave(allocateReportExpense(workspace,reportId,expenseId,[]))}>Réinitialiser la répartition</button></div>}
    {error&&<small className="inline-allocation-error" role="alert">{error}</small>}
  </div>;
}
