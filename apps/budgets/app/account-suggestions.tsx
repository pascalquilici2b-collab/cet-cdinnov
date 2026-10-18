"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import { Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { accountCandidates, accountingPlan, applyAccountChoices, accountProposal, type AccountTarget } from "@/lib/account-suggestions";
import type { Project, Workspace } from "@/lib/budget-model";
export default function AccountSuggestions({workspace:ws,setWorkspace:setWs,project,target,onClose}:{workspace:Workspace;setWorkspace:Dispatch<SetStateAction<Workspace>>;project:Project;target:AccountTarget;onClose:()=>void}){
 const [detail,setDetail]=useState(""),[choice,setChoice]=useState<string|null>(null);
 const enriched={...target,label:target.label+(detail?" — "+detail:"")},proposal=accountProposal(ws,project.clientId,enriched),candidates=accountCandidates(ws,project.clientId,enriched);
 const selected=choice??proposal.code,plan=accountingPlan(),selectedLabel=plan.find(a=>a.code===selected)?.label||proposal.label;
 return <Dialog open onOpenChange={v=>!v&&onClose()}><DialogContent className="account-dialog sm:max-w-xl">
  <DialogHeader><DialogTitle><span className="flex items-center gap-2"><Sparkles size={20}/>Code comptable proposé</span></DialogTitle><DialogDescription>{target.label}</DialogDescription></DialogHeader>
  <div className="account-recommendation"><span>{target.account?"Code affecté":proposal.certain?"Proposition automatique":"Proposition à confirmer"}</span><strong>{selected||"À préciser"}</strong><p>{selectedLabel}</p></div>
  {!target.account&&selected&&<p className="text-xs text-muted-foreground">{proposal.reason}</p>}
  {candidates.some(c=>c.code!==selected)&&<details className="account-alternatives"><summary>Autres propositions</summary><div className="account-proposals mt-3">{candidates.filter(c=>c.code!==selected).map(c=><button type="button" key={c.code} className="account-proposal" onClick={()=>setChoice(c.code)}><strong>{c.code}</strong><span>{c.label}</span></button>)}</div></details>}
  {!target.account&&<details open={!proposal.code} className="account-alternatives"><summary>Préciser la prestation</summary><textarea className="timeline-field mt-3 min-h-20 py-2" aria-label="Précision sur la prestation" placeholder="Ex. location de salle, traduction, développement du site…" value={detail} onInput={e=>{setDetail(e.currentTarget.value);setChoice(null)}} onChange={e=>{setDetail(e.target.value);setChoice(null)}}/></details>}
  <details className="account-alternatives"><summary>Correction manuelle</summary><select aria-label="Correction du code comptable" className="timeline-field mt-3" value={selected} onChange={e=>setChoice(e.target.value)}><option value="">À affecter</option>{selected&&!plan.some(a=>a.code===selected)&&<option value={selected}>{selected}</option>}{plan.map(a=><option key={a.code} value={a.code}>{a.code} — {a.label}</option>)}</select></details>
  <span className="reference-label">Nomenclature EPCIC · BP 2026</span>
  <DialogFooter><Button variant="outline" onClick={onClose}>Fermer</Button><Button disabled={!selected} onClick={()=>{setWs(w=>applyAccountChoices(w,project.id,{[target.kind+":"+target.id]:selected}));onClose()}}><Check/>Valider ce code</Button></DialogFooter>
 </DialogContent></Dialog>;
}
