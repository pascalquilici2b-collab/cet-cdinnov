"use client";
import { useMemo, useState, type Dispatch, type SetStateAction, type FormEvent } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BudgetLine, Expense, Project, Workspace } from "@/lib/budget-model";
import { allocated, currency, newId, parseAmount, round, setAllocation, sum } from "@/lib/budget-model";
import AccountSuggestions from "./account-suggestions";
import ChronogramCanvas from "./chronogram-canvas";
import { accountTargets, accountProposal, type AccountTarget } from "@/lib/account-suggestions";
import { categoryOptions } from "@/lib/cost-categories";
import { setPlanning } from "@/lib/timeline";
import { removeBudgetItem, type Removal } from "@/lib/budget-actions";

type Edit = { kind:"line"|"sub"|"expense"; lineId?:string; subId?:string; expenseId?:string };
type Props={workspace:Workspace;setWorkspace:Dispatch<SetStateAction<Workspace>>;project:Project;disabled?:boolean;initialMode?:"global"|"lines"|"detail"};
const monthDate=(s:string)=>new Intl.DateTimeFormat("fr-FR",{month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(s+"T00:00:00Z"));
const control="h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25";
function Input({label,name,value="",type="text",required=false}:{label:string;name:string;value?:string|number;type?:string;required?:boolean}){
  return <label className="grid gap-1.5 text-sm font-medium">{label}<input className={control} name={name} defaultValue={value} type={type} required={required} {...(type==="number"?{min:0,step:"0.01"}:{})}/></label>;
}
function Choice({label,name,value,options}:{label:string;name:string;value:string;options:{id:string;label:string}[]}){
  return <label className="grid gap-1.5 text-sm font-medium"><span>{label}</span><Select name={name} defaultValue={value}><SelectTrigger aria-label={label} className="h-10 w-full bg-white"><SelectValue/></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent></Select></label>;
}
export default function BudgetChronogram({workspace:ws,setWorkspace:setWs,project,disabled,initialMode}:Props){
  const [edit,setEdit]=useState<Edit|null>(null);
  const [error,setError]=useState("");
  const [accountTarget,setAccountTarget]=useState<AccountTarget|null>(null);
  const [removal,setRemoval]=useState<Removal|null>(null);
  const lines=ws.budgetLines.filter(b=>b.projectId===project.id);
  const expenses=ws.expenses.filter(e=>e.projectId===project.id);
  const accountCodes=useMemo(()=>Object.fromEntries(accountTargets(ws,project.id).map(t=>[t.kind+":"+t.id,accountProposal(ws,project.clientId,t)])),[ws,project.id,project.clientId]);
  const latest=ws.imports.filter(i=>i.projectId===project.id).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const line=lines.find(b=>b.id===edit?.lineId);
  const sub=line?.subExpenses.find(s=>s.id===edit?.subId);
  const expense=expenses.find(e=>e.id===edit?.expenseId);
  const total=sum(lines.map(b=>b.amount));
  const scheduled=sum(lines.map(b=>allocated(b.allocations)));
  const unplanned=round(total-scheduled);
  const open=(e:Edit)=>{setError("");setEdit(e)};
  function changeAllocation(b:BudgetLine,subId:string|undefined,periodId:string,n:number){
    setWs(w=>({...w,budgetLines:w.budgetLines.map(x=>x.id===b.id?setAllocation(x,subId,periodId,n):x)}));
  }
  function saveEdit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!edit)return; const f=new FormData(event.currentTarget);
    try{
      const label=String(f.get("label")||"").trim();if(!label)throw new Error("Le libellé est obligatoire.");
      const amount=parseAmount(f.get("amount")); const actualAccount=expense?.account||(edit.kind==="sub"?sub?.account:line?.account)||"";
      const period=String(f.get("period")||"none");const allocations=period==="none"?{}:{[period]:amount};
      if(edit.kind==="line"){
        const category=String(f.get("category")||"Autres coûts").trim();
        setWs(w=>({...w,budgetLines:line?w.budgetLines.map(b=>b.id===line.id?{...b,description:label,category,amount,account:actualAccount}:b):[...w.budgetLines,{id:newId(),projectId:project.id,description:label,category,amount,account:actualAccount,externalKey:"",sourceVersion:0,allocations,subExpenses:[]}]}));
      }else if(edit.kind==="sub"&&line){
        setWs(w=>({...w,budgetLines:w.budgetLines.map(b=>b.id===line.id?{...b,subExpenses:sub?b.subExpenses.map(s=>s.id===sub.id?{...s,label,amount,account:actualAccount}:s):[...b.subExpenses,{id:newId(),label,amount,account:actualAccount,allocations}]}:b)}));

      }else if(edit.kind==="expense"){
        const target=String(f.get("lineId")||"");const committed=parseAmount(f.get("committed"));
        const payments=[...(expense?.payments||[])].map(p=>({...p,amount:parseAmount(f.get("pay-"+p.id)),plannedDate:String(f.get("date-"+p.id)||""),paidDate:String(f.get("actual-"+p.id)||"")||undefined}));
        const newPayment=parseAmount(f.get("newPayment"));
        if(newPayment){const date=String(f.get("newDate")||"");if(!date)throw new Error("Indiquez la date de la nouvelle échéance.");payments.push({id:newId(),amount:newPayment,plannedDate:date,paidDate:undefined})}
        const data={label,planned:amount,account:actualAccount,committed,vendor:String(f.get("vendor")||""),budgetLineId:target==="none"?"":target,payments};
        setWs(w=>({...w,expenses:expense?w.expenses.map(e=>e.id===expense.id?{...e,...data}:e):[...w.expenses,{id:newId(),projectId:project.id,...data}]}));

      }
      setEdit(null);
    }catch(e){setError(e instanceof Error?e.message:"Enregistrement impossible.")}
  }
  return <fieldset disabled={disabled} className="min-w-0 space-y-4">
    <div className="chrono-toolbar">
      <div className="budget-summary"><span>Budget total<strong className="num">{currency(total)}</strong></span><span>À planifier<strong className={"num "+(unplanned<0?"text-destructive":"")}>{currency(unplanned)}</strong></span></div>
      <div className="import-actions"><span className="last-import">Dernier import : <strong>{latest?new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium"}).format(new Date(latest.date.length===10?latest.date+"T12:00:00Z":latest.date)):"aucun"}</strong></span></div>
    </div>
    <ChronogramCanvas initialMode={initialMode} project={project} accountCodes={accountCodes} lines={lines} expenses={expenses} onEdit={open} onRemove={setRemoval} onAccount={setAccountTarget} onAllocation={changeAllocation} onPlanning={(lineId,subId,blocks)=>{
      const current=lines.find(b=>b.id===lineId);if(!current)return;
      setPlanning(current,subId,blocks,project.periods);
      setWs(w=>({...w,budgetLines:w.budgetLines.map(b=>b.id===lineId?setPlanning(b,subId,blocks,project.periods):b)}));
    }}/>
    <Dialog open={!!edit} onOpenChange={v=>!v&&setEdit(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      {edit&&<form onSubmit={saveEdit} key={JSON.stringify(edit)}><DialogHeader><DialogTitle>{edit.kind==="expense"?"Dépense et paiements":edit.kind==="sub"?(sub?"Modifier la sous-ligne":"Ajouter une sous-ligne"):(line?"Modifier la ligne budgétaire":"Ajouter une ligne budgétaire")}</DialogTitle><DialogDescription>{edit.kind==="sub"?line?.description:edit.kind==="expense"?"Échéances de paiement":"Budget du projet"}</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><Input label="Libellé" name="label" value={expense?.label||sub?.label||(edit.kind==="line"?line?.description:"")||""} required/></div>
          <Input label="Montant total (€)" name="amount" type="number" value={expense?.planned??sub?.amount??(edit.kind==="line"?line?.amount:0)??0} required/>

          {edit.kind==="line"&&<Choice label="Catégorie de coût" name="category" value={line?.category||"Expertise et services externes"} options={categoryOptions(lines.map(b=>b.category)).map(c=>({id:c,label:c}))}/>}
          {((edit.kind==="line"&&!line)||(edit.kind==="sub"&&!sub))&&<Choice label="Positionner le montant" name="period" value="none" options={[{id:"none",label:"À planifier"},...project.periods.map(p=>({id:p.id,label:p.label+" · "+monthDate(p.start)+" — "+monthDate(p.end)}))]}/>}
          {edit.kind==="expense"&&<><Choice label="Ligne budgétaire" name="lineId" value={expense?.budgetLineId||line?.id||"none"} options={[{id:"none",label:"Ligne libre"},...lines.map(b=>({id:b.id,label:b.description}))]}/><Input label="Montant engagé (€)" name="committed" type="number" value={expense?.committed||0}/><Input label="Prestataire" name="vendor" value={expense?.vendor||""}/>
            <div className="sm:col-span-2"><h3 className="mb-2 font-semibold">Échéances de paiement</h3><div className="space-y-3">{expense?.payments.map(p=><div key={p.id} className="grid gap-2 rounded-lg border bg-muted/40 p-3 sm:grid-cols-3"><Input label="Montant (€)" name={"pay-"+p.id} type="number" value={p.amount}/><Input label="Date prévue" name={"date-"+p.id} type="date" value={p.plannedDate}/><Input label="Date réelle" name={"actual-"+p.id} type="date" value={p.paidDate||""}/></div>)}</div></div>
            <Input label="Nouvelle échéance (€)" name="newPayment" type="number"/><Input label="Date de la nouvelle échéance" name="newDate" type="date"/>
          </>}
        </div>
        {error&&<p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={()=>setEdit(null)}>Annuler</Button><Button type="submit"><Check/>Enregistrer</Button></DialogFooter>
      </form>}
    </DialogContent></Dialog>
    {accountTarget&&<AccountSuggestions workspace={ws} setWorkspace={setWs} project={project} target={accountTarget} onClose={()=>setAccountTarget(null)}/>}
    <Dialog open={!!removal} onOpenChange={v=>!v&&setRemoval(null)}><DialogContent><DialogHeader><DialogTitle>Confirmer la suppression</DialogTitle><DialogDescription>{removal?.kind==="line"?"La ligne et ses "+(lines.find(b=>b.id===removal.lineId)?.subExpenses.length||0)+" sous-ligne(s) seront supprimées. Les dépenses, engagements et paiements liés seront conservés comme dépenses libres.":removal?.kind==="sub"?"Cette sous-ligne sera supprimée. Le montant et la répartition de la ligne mère seront conservés.":"Cette dépense et toutes ses échéances de paiement seront supprimées."}</DialogDescription></DialogHeader><p className="font-medium">{removal?.kind==="line"?lines.find(b=>b.id===removal.lineId)?.description:removal?.kind==="sub"?lines.find(b=>b.id===removal.lineId)?.subExpenses.find(s=>s.id===removal.subId)?.label:expenses.find(e=>e.id===removal?.expenseId)?.label}</p><DialogFooter><Button variant="outline" onClick={()=>setRemoval(null)}>Annuler</Button><Button variant="destructive" onClick={()=>{if(removal)setWs(w=>removeBudgetItem(w,project.id,removal));setRemoval(null)}}>Confirmer la suppression</Button></DialogFooter></DialogContent></Dialog>
  </fieldset>;
}
