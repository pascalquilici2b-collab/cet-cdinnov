"use client";
import {useState} from "react";
import {Pencil} from "lucide-react";
import type {PartnerReport,Project,Workspace} from "@/lib/budget-model";
import {reportPeriodIds,sameReport,setReportPeriods} from "@/lib/report-periods";
import {fullDate} from "@/lib/project-dates";

export function periodRangeLabel(ids:string[]){return ids.length===1?`Période ${ids[0].replace(/^P/,"")}`:`Périodes ${ids[0].replace(/^P/,"")} à ${ids.at(-1)!.replace(/^P/,"")}`}

export default function ReportCoverageSettings({workspace,project,report,disabled,onSave}:{workspace:Workspace;project:Project;report:PartnerReport;disabled:boolean;onSave:(ws:Workspace)=>void}){
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(""),[error,setError]=useState("");
  const ids=reportPeriodIds(report,project),automatic=reportPeriodIds({...report,coveredPeriodIds:undefined},project);
  const start=project.periods.find(p=>p.id===ids[0])?.start||report.start,end=project.periods.find(p=>p.id===ids.at(-1))?.end||report.end;
  return <div className="report-coverage-settings">
    <div className="report-coverage-summary"><strong>{periodRangeLabel(ids)}</strong><span>{fullDate(start)} – {fullDate(end)}</span><button type="button" disabled={disabled} aria-label={`Modifier les périodes du rapport ${report.number}`} onClick={()=>{setDraft(workspace.reportPeriodCoverages?.find(c=>sameReport(c,report))?.firstPeriodId||"");setError("");setEditing(!editing)}}><Pencil aria-hidden="true"/>Modifier</button></div>
    {editing&&<div className="report-coverage-editor"><label>Périodes incluses dans ce rapport<select aria-label="Périodes incluses dans ce rapport" disabled={disabled} value={draft} onChange={e=>{setDraft(e.target.value);setError("")}}><option value="">D’après JEMS : {periodRangeLabel(automatic).toLowerCase()}</option>{project.periods.filter(p=>p.start<=report.end).map(p=><option key={p.id} value={p.id}>{periodRangeLabel(p.id===report.periodId?[p.id]:[p.id,report.periodId])}</option>)}</select></label><button type="button" className="coverage-apply" disabled={disabled} onClick={()=>{try{onSave(setReportPeriods(workspace,report,draft));setEditing(false)}catch(e){setError(e instanceof Error?e.message:"Période invalide.")}}}>Appliquer</button><button type="button" onClick={()=>setEditing(false)}>Annuler</button>{error&&<small role="alert">{error}</small>}</div>}
  </div>;
}
