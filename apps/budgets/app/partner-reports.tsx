"use client";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Upload, Check, BadgeCheck, Mail, AlertTriangle, FileText, X, LoaderCircle, ImagePlus, FileCheck2, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PartnerReport, Project, Workspace } from "@/lib/budget-model";
import { currency, sum, round } from "@/lib/budget-model";
import { describeReportExpense, effectivePartnerReports, mergePartnerReports, reportCoverage, reportKey, reportStatus, pendingReportExpenses, validateReportProject } from "@/lib/partner-reports";
import { fullDate } from "@/lib/project-dates";
import GlobalExpenditures from "./global-expenditures";
import ReportCapture from "./report-capture";
import ExpenseGroup from "./expense-group";
import ReportCoverageSettings from "./report-coverage-settings";
import InlineReportAllocation from "./inline-report-allocation";
import {reportsForPeriod,hasReportCertificate} from "@/lib/report-periods";
import PendingExpensesBadge from "./pending-expenses-badge";
import {allocationStatus} from "@/lib/report-allocations";

function ReportStatusBadge({report}:{report:PartnerReport}){return <span className={"report-status "+report.status} title={reportStatus(report)}>{report.status==="certified"?<BadgeCheck aria-hidden="true"/>:<Mail aria-hidden="true"/>}{report.status==="certified"?"Certifié":"Envoyé"}</span>}

function ReportControlDifference({report}:{report:PartnerReport}){
  if(report.accepted===undefined||round(report.declared-report.accepted)===0)return null;
  const message=`Écart après contrôle : ${currency(round(report.declared-report.accepted))}. ${report.sourceKind==="global"?`Les corrections directes sont détaillées ci-dessous (${currency(sum(report.expenses.map(e=>e.deducted||0)))}).${report.financialOverview?" L’écart total peut aussi inclure l’ajustement des forfaits.":""}`:"Le PDF ne détaille pas cet écart par dépense. Les montants ci-dessous restent les montants déclarés."}`;
  return <TooltipProvider delayDuration={120}><Tooltip><TooltipTrigger asChild><button type="button" className="report-control-difference" aria-label={message}><AlertTriangle aria-hidden="true"/></button></TooltipTrigger><TooltipContent className="report-control-tooltip" side="top" sideOffset={8}>{message}</TooltipContent></Tooltip></TooltipProvider>;
}

export default function PartnerReports({workspace,project,setWorkspace,disabled,initialPeriod="all"}:{initialPeriod?:string;workspace:Workspace;project:Project;setWorkspace:Dispatch<SetStateAction<Workspace>>;disabled:boolean}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[progress,setProgress]=useState("");
  const [pending,setPending]=useState<PartnerReport[]>([]),[errors,setErrors]=useState<{file:string;message:string}[]>([]);
  const [message,setMessage]=useState(""),[error,setError]=useState("");
  const [selected,setSelected]=useState(""),[period,setPeriod]=useState(initialPeriod);
  useEffect(()=>setPeriod(initialPeriod),[initialPeriod]);
  const [editing,setEditing]=useState<{reportId:string;expenseId:string;manual:boolean}>(),[draft,setDraft]=useState(""),[descriptionError,setDescriptionError]=useState("");
  const input=useRef<HTMLInputElement>(null);
  const reports=effectivePartnerReports(workspace,project.id).sort((a,b)=>a.number-b.number);
  const visible=period==="all"?reports:reportsForPeriod(reports,project,period);
  const active=visible.find(r=>r.id===selected)||visible.at(-1);
  const coverage=reportCoverage(project,reports);
  const lines=workspace.budgetLines.filter(l=>l.projectId===project.id);
  const isAssigned=(e:PartnerReport["expenses"][number])=>allocationStatus(e,lines).complete;
  const flat=active?sum(active.categories.filter(c=>c.flatRate).map(c=>c.current)):0;
  async function readFiles(files:File[]){
    setBusy(true);setError("");setMessage("");
    const read:PartnerReport[]=[],failed:{file:string;message:string}[]=[];
    try{
      if(files.length+pending.length>30)throw new Error("Sélectionnez au maximum 30 rapports par import.");
      const {readPartnerReportPdf}=await import("@/lib/partner-report-pdf");
      for(let i=0;i<files.length;i++){
        const file=files[i];setProgress(`Lecture ${i+1}/${files.length} · ${file.name}`);
        try{
          const report=await readPartnerReportPdf(file);validateReportProject(report,project);
          mergePartnerReports(workspace,project.id,[report]);
          read.push(report);
        }catch(e){failed.push({file:file.name,message:e instanceof Error?e.message:"Lecture impossible."})}
      }
      setPending(old=>[...old,...read]);setErrors(old=>[...old,...failed]);
    }catch(e){setError(e instanceof Error?e.message:"Lecture impossible.")}
    finally{setBusy(false);setProgress("");if(input.current)input.current.value="";}
  }
  function commit(){
    try{
      const result=mergePartnerReports(workspace,project.id,pending);
      setWorkspace(result.workspace);setPending([]);setOpen(false);setPeriod("all");
      setMessage(`${result.added} rapport(s) ajouté(s), ${result.updated} mis à jour, ${result.skipped} déjà présent(s).`);
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"Import impossible.")}
  }
  function savedAssociation(next:Workspace,reportId:string,expenseId:string){
    const expense=effectivePartnerReports(next,project.id).find(r=>r.id===reportId)?.expenses.find(e=>e.id===expenseId);
    if(!expense)return;
    const status=allocationStatus(expense,lines);setWorkspace(next);setError("");
    if(status.complete)setMessage(`${expenseId} déplacée dans « Dépenses associées ».`);else setMessage(`${expenseId} : ${currency(status.unassigned)} restent à affecter.`);
  }
  return <div className="partner-reports">
    <div className="report-heading"><div><h2>Dépenses et rapports JEMS</h2><p>Suivez les déclarations par période et leur rattachement au budget.</p></div><Button variant="outline" disabled={disabled} onClick={()=>{setError("");setOpen(true)}}><Upload/>Importer des rapports PDF</Button></div>
    <div className="report-import-tools"><GlobalExpenditures workspace={workspace} project={project} setWorkspace={setWorkspace} disabled={disabled}/><section className="report-panel report-capture-card"><h3><ImagePlus aria-hidden="true"/>Descriptions françaises</h3>{active?<><label className="capture-report-choice">Rapport à compléter<select aria-label="Rapport de la capture française" value={active.id} onChange={e=>{setSelected(e.target.value);setPeriod("all")}}>{reports.map(r=><option key={r.id} value={r.id}>Rapport {r.number} · période {r.periodId.replace(/^P/,"")}</option>)}</select></label><ReportCapture key={active.id} workspace={workspace} project={project} report={active} setWorkspace={setWorkspace} disabled={disabled}/></>:<Button variant="outline" disabled><ImagePlus/>Importer une capture française</Button>}</section></div>
    {message&&<p role="status" className="report-success"><Check/>{message}</p>}
    {error&&!open&&<p role="alert" className="report-warning">{error}</p>}
    {coverage.missingPeriods.length>0&&<p className="report-warning">Périodes non couvertes : {coverage.missingPeriods.join(", ")}</p>}
    <div className="report-periods report-period-navigation" aria-label="Périodes et certificats">{project.periods.map(p=>{const rs=reportsForPeriod(reports,project,p.id),direct=rs.filter(r=>r.periodId===p.id),certificate=rs.length>0&&rs.every(r=>hasReportCertificate(workspace,r)),count=sum(direct.map(r=>pendingReportExpenses(r,lines)));return <button key={p.id} className={(period===p.id||period==="all"&&active?.periodId===p.id)?"selected":""} onClick={()=>{setPeriod(p.id);setSelected(rs.at(-1)?.id||"")}}><strong>Période {p.id.replace(/^P/,"")}</strong>{certificate?<FileCheck2 className="certificate-present" aria-label="Certificat importé"/>:<CircleX className="certificate-missing" aria-label="Certificat non importé"/>}<span className="period-report-label">{rs.length?<>{rs.map(r=>`Rapport ${r.number}`).join(", ")}{!direct.length&&<small>Avec {rs[0].periodId}</small>}</>:"Non importé"}</span><PendingExpensesBadge count={count}/></button>})}</div>
    {period!=="all"&&visible.length>1&&<label className="report-filter">Rapport<select aria-label="Rapport de la période" value={active?.id||""} onChange={e=>setSelected(e.target.value)}>{visible.map(r=><option key={r.id} value={r.id}>Rapport {r.number}</option>)}</select></label>}
    {!visible.length?<div className="report-empty"><FileText/><h3>{reports.length?"Aucun rapport pour cette période":"Aucun rapport importé"}</h3><p>Vous pouvez commencer par n’importe quelle période et compléter l’historique ensuite.</p></div>:<>
      {active&&<section className="report-panel">
        <div className="report-heading"><div><h3><mark className="report-title">Rapport JEMS n° {active.number}</mark> <ReportStatusBadge report={active}/></h3><p>{active.file} · Export du {fullDate(active.exportedAt.slice(0,10))} · FC {active.applicationVersion}</p></div></div>

        <ReportCoverageSettings key={active.id} workspace={workspace} project={project} report={active} disabled={disabled} onSave={next=>{setWorkspace(next);setError("")}}/>
        {active.warnings.map(w=><p className="report-warning" key={w}>{w}</p>)}
        <div className="report-totals"><div><span>{active.expenses.length} dépenses détaillées</span><strong>{currency(sum(active.expenses.map(e=>e.declared)))}</strong></div><div><span>Forfaits du rapport</span><strong>{active.sourceKind==="global"&&!active.financialOverview?"À compléter":currency(flat)}</strong></div><div><span>Total déclaré {active.sourceKind==="global"&&!active.financialOverview?"hors forfaits":""} · {active.periodId}</span><strong>{currency(active.declared)}</strong></div><div><span>{active.status==="certified"?`Admis après contrôle${active.sourceKind==="global"&&!active.financialOverview?" hors forfaits":""}`:"Certification"}</span><div className="report-admitted-value"><strong>{active.accepted===undefined?"En attente":currency(active.accepted)}</strong><ReportControlDifference report={active}/></div></div></div>
        {(["assigned","pending"] as const).map(kind=>{const group=active.expenses.filter(e=>kind==="assigned"?isAssigned(e):!isAssigned(e));if(kind==="pending"&&!group.length)return null;return <ExpenseGroup key={active.id+kind} kind={kind} count={group.length} total={sum(group.map(e=>e.declared))}>
        {!group.length?<div className="expense-empty">{kind==="assigned"?"Aucune dépense associée.":"Toutes les dépenses sont affectées."}</div>:<div className="report-table-wrap"><table className="report-table"><thead><tr><th>Dépense JEMS</th><th>Paiement</th><th>Déclaré</th>{active.sourceKind==="global"&&<th>Contrôle</th>}<th>Ligne du budget</th></tr></thead><tbody>{group.map(e=>{const valid=isAssigned(e);return <tr key={e.id}><td><strong>{valid&&<Check className="expense-associated-check" aria-label="Dépense associée"/>}{e.id} · {e.category}</strong>{e.description?<p>{e.description}</p>:<p className="expense-missing-reason"><strong>Raison :</strong> <mark>Description absente des sources importées</mark></p>}{e.descriptionSource&&<small>{e.descriptionSource}</small>}<button className="report-description-action" disabled={disabled} onClick={()=>{setEditing({reportId:active.id,expenseId:e.id,manual:e.descriptionSource==="Saisie manuelle"});setDraft(e.description);setDescriptionError("")}} aria-label={`${e.description?"Modifier":"Ajouter"} le libellé de ${e.id}`}>{e.description?"Modifier le libellé":"Ajouter un libellé"}</button>{e.internalReference&&<small>Réf. {e.internalReference}</small>}{e.invoiceNumber&&<small>Facture {e.invoiceNumber}</small>}<small>{e.sourceRow?`Ligne Excel ${e.sourceRow} · ID ${e.databaseId}`:`Page ${e.sourcePage}`} · Déclaration {active.periodId}</small>{e.translations&&<details className="report-translations"><summary>Textes des exports importés</summary>{(["fr","it"] as const).map(lang=>{const text=e.translations?.[lang];if(!text)return null;return <div key={lang}><strong>{lang==="fr"?"Saisie français":"Saisie italien"}</strong>{text?<><p>{text.description||"Description non renseignée"}</p>{text.comment&&<p>Partenaire : {text.comment}</p>}{text.procurement&&<p>Marché : {text.procurement}</p>}{text.controlComment&&<p>Contrôle : {text.controlComment}</p>}{text.verificationComment&&<p>Vérification : {text.verificationComment}</p>}</>:<p>Export manquant</p>}</div>})}</details>}</td><td>{e.paymentDate?fullDate(e.paymentDate):"Non renseigné"}</td><td className="report-amount">{currency(e.declared)}</td>{active.sourceKind==="global"&&<td className="report-amount">{e.parked?<strong>Mise en attente</strong>:e.certified===undefined?"En attente de certification":<><strong>{currency(e.certified)}</strong><small>Certifié</small></>}{!!e.deducted&&<small>Déduit : {currency(e.deducted)}</small>}{e.verified!==undefined&&<small>Après vérification : {currency(e.verified)}</small>}{e.verificationParked&&<small>En attente au niveau SC / AG</small>}</td>}<td><InlineReportAllocation workspace={workspace} reportId={active.id} expenseId={e.id} disabled={disabled} onSave={next=>savedAssociation(next,active.id,e.id)}/></td></tr>})}</tbody></table></div>}</ExpenseGroup>})}
      </section>}
    </>}
    <Dialog open={!!editing} onOpenChange={value=>{if(!value)setEditing(undefined)}}><DialogContent><DialogHeader><DialogTitle>Libellé de {editing?.expenseId}</DialogTitle><DialogDescription>Complétez le libellé à partir de vos pièces. Votre saisie sera conservée lors des prochains imports.</DialogDescription></DialogHeader><label className="report-description-label">Libellé de la dépense<textarea rows={4} maxLength={2000} value={draft} onChange={e=>setDraft(e.target.value)}/></label>{descriptionError&&<p role="alert" className="report-warning">{descriptionError}</p>}<DialogFooter>{editing?.manual&&<Button variant="outline" disabled={disabled} onClick={()=>{try{setWorkspace(describeReportExpense(workspace,editing.reportId,editing.expenseId,""));setEditing(undefined)}catch(e){setDescriptionError(e instanceof Error?e.message:"Modification impossible.")}}}>Utiliser le libellé des sources</Button>}<Button variant="outline" onClick={()=>setEditing(undefined)}>Annuler</Button><Button disabled={disabled||!draft.trim()} onClick={()=>{if(!editing)return;try{const next=describeReportExpense(workspace,editing.reportId,editing.expenseId,draft);setWorkspace(next);setEditing(undefined)}catch(e){setDescriptionError(e instanceof Error?e.message:"Modification impossible.")}}}>Enregistrer le libellé</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value)}}><DialogContent className="report-import-dialog"><DialogHeader><DialogTitle>Importer les rapports partenaires</DialogTitle><DialogDescription>Sélectionnez plusieurs PDF JEMS Maritime en français. Les périodes et les statuts sont lus dans chaque rapport.</DialogDescription></DialogHeader>
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="sr-only" aria-label="Fichiers des rapports partenaires" onChange={e=>{if(e.target.files)void readFiles(Array.from(e.target.files))}}/>
      <Button variant="outline" disabled={busy} onClick={()=>input.current?.click()}><Upload/>Choisir un ou plusieurs PDF</Button>
      {busy&&<p role="status" className="report-loading"><LoaderCircle className="animate-spin"/>{progress||"Préparation de la lecture…"}</p>}
      {error&&<p role="alert" className="report-warning">{error}</p>}
      <div className="report-import-list">{errors.map((e,index)=><div className="report-warning" key={index}><div><strong>{e.file}</strong><p>{e.message}</p></div><Button variant="ghost" aria-label={`Retirer le fichier en erreur ${e.file}`} disabled={busy} onClick={()=>setErrors(old=>old.filter((_,i)=>i!==index))}><X/></Button></div>)}
      {pending.map((r,index)=>{const old=reports.find(x=>reportKey(x)===reportKey(r));return <div className="report-import-item" key={index}><div><strong>R.{r.number} → {r.periodId}</strong><ReportStatusBadge report={r}/><p>{fullDate(r.start)} – {fullDate(r.end)} · {r.expenses.length} dépenses · {currency(r.declared)}</p><small>{r.file}</small><p>{old?(old.hash===r.hash?"Déjà importé · aucune dépense ajoutée":"Mise à jour du rapport existant · associations conservées"):"Nouveau rapport"}</p>{r.warnings.map(w=><p className="report-import-warning" key={w}>{w}</p>)}</div><Button variant="ghost" disabled={busy} aria-label={`Retirer R.${r.number} de la sélection`} onClick={()=>setPending(old=>old.filter((_,i)=>i!==index))}><X/></Button></div>})}</div>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Fermer</Button><Button disabled={disabled||busy||!pending.length||!!errors.length} onClick={commit}>Importer {pending.length} rapport{pending.length>1?"s":""}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
