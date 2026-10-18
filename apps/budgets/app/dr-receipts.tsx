"use client";
import {currency,sum,round,type DR,type Project,type Workspace,type RecoveryChoice} from "@/lib/budget-model";
import {projectReceipts} from "@/lib/project-receipts";
import {fullDate} from "@/lib/project-dates";
import ReceiptDates from "./receipt-dates";
import {advanceRecoveryChoices} from "@/lib/advance-recovery";
import PendingExpensesBadge from "./pending-expenses-badge";

function ManualCosts({period,project,dr,disabled,onUpdate}:{period:string;project:Project;dr?:DR;disabled:boolean;onUpdate:(period:string,patch:Partial<DR>)=>void}){
  const fields=([['realHr','RH au réel',project.rules.hrMode],['realMission','Missions au réel',project.rules.missionMode],['realOffice','Bureau au réel',project.rules.officeMode]] as const).filter(f=>f[2]==="réel");
  if(!fields.length)return null;
  return <details className="dr-manual"><summary>Coûts au réel</summary>{fields.map(([field,label])=><label key={field}>{label}<input type="number" min="0" step="0.01" defaultValue={dr?.[field]??""} placeholder="Calcul automatique" aria-label={`${label} ${period}`} disabled={disabled} onBlur={e=>{const value=e.target.value===""?undefined:Number(e.target.value);if(value===undefined||Number.isFinite(value)&&value>=0)onUpdate(period,{[field]:value})}}/></label>)}</details>;
}

export default function DRReceipts({workspace,project,funding=projectReceipts(workspace,project),disabled,onUpdate,onReports,onRecoveryChange}:{workspace:Workspace;project:Project;funding?:ReturnType<typeof projectReceipts>;disabled:boolean;onUpdate:(period:string,patch:Partial<DR>)=>void;onReports:(period:string)=>void;onRecoveryChange:(period:string,choice:RecoveryChoice)=>void}){
  const choices=advanceRecoveryChoices(workspace,project),last=project.periods.at(-1)?.id;
  const reports=funding.receipts.filter(r=>r.source==="jems"),certified=reports.filter(r=>r.certified),partial=certified.some(r=>!r.financialComplete);
  return <section className="dr-receipts">
    <div className="report-heading"><h2>DR & recettes</h2><span>FEDER · {project.federRate} %</span></div>
    <div className="dr-summary">
      <div><span>Déclaré dans JEMS{reports.some(r=>!r.financialComplete)?" · hors forfaits manquants":""}</span><strong>{currency(sum(reports.map(r=>r.declared||0)))}</strong></div>
      <div><span>Admis après contrôle{partial?" · hors forfaits manquants":""}</span><strong>{currency(sum(reports.map(r=>r.accepted||0)))}</strong></div>
      <div><span>FEDER certifié{partial?" · partiel":""}</span><strong>{currency(sum(certified.map(r=>r.gross)))}</strong></div>
      <div><span>Solde d’avance après reprises prévues</span><strong>{currency(funding.outstanding)}</strong></div>
    </div>
    <div className="dr-table-wrap"><table className="dr-table"><thead><tr><th>Période / source</th><th>Dépenses & affectation</th><th>FEDER brut</th><th>Reprise d’avance</th><th>Net attendu</th><th>Dates</th></tr></thead><tbody>{funding.receipts.map(row=>{
      const dr=workspace.drs.find(d=>d.projectId===project.id&&d.periodId===row.period),period=project.periods.find(p=>p.id===row.period),choice=choices[row.period],final=row.period===last;
      return <tr key={row.period} className={row.source==="jems"?"dr-jems-row":""}>
        <td><strong>{row.period}</strong><span className="dr-source">{row.status}</span>{period&&<small>{fullDate(period.start)} – {fullDate(period.end)}</small>}{(row.source==="jems"||row.source==="covered")&&<button className="dr-report-link" onClick={()=>onReports(row.settlementPeriod||row.period)}>{row.reportNumbers.map(n=>`R.${n}`).join(" · ")} <PendingExpensesBadge count={row.pending}/><span className="sr-only"> · Voir les rapports {row.period}</span></button>}</td>
        <td>{(row.source==="advance"||row.source==="covered")?"—":<><span>Base : <strong>{currency(row.basis)}</strong></span>{row.source==="jems"?<><small>Déclaré : {currency(row.declared||0)}</small>{row.accepted!==undefined&&<small>Admis : {currency(row.accepted)}</small>}<div className="dr-association"><span>Affecté : {currency(row.assigned)}</span>{row.pending>0?<span>À affecter : {currency(row.unassigned)}</span>:<span>Toutes les dépenses sont affectées</span>}</div></>:<ManualCosts key={row.period} period={row.period} project={project} dr={dr} disabled={disabled} onUpdate={onUpdate}/>}</>}</td>
        <td className="dr-money"><strong>{currency(row.gross)}</strong>{row.capped&&<small title="Le total des versements est limité à la dotation FEDER du projet.">Dotation plafonnée</small>}</td>
        <td className="dr-money">{(row.source==="advance"||row.source==="covered")?"—":<div className="dr-recovery-choice"><select aria-label={`Reprise d’avance ${row.period}`} disabled={disabled||!period} value={choice||"none"} onChange={e=>onRecoveryChange(row.period,e.target.value as RecoveryChoice)}>{(choice==="legacy"||final&&choice==="none")&&<option value={choice} disabled>Montant existant</option>}{final?<><option value="balance">{round(project.advance.rate*.4)} points (40%)</option><option value="full">Totalité de l’avance (100%)</option></>:<><option value="none">Non</option><option value="first">{round(project.advance.rate*.6)} points (60%)</option></>}</select><strong>{currency(row.recovery)}</strong></div>}</td>
        <td className="dr-money dr-net"><strong>{currency(row.net)}</strong></td>
        <td>{row.source==="covered"?<small>{row.status}</small>:row.source==="advance"?<small>{row.date?fullDate(row.date):"À préciser dans les paramètres"}</small>:<ReceiptDates period={row.period} dr={dr} disabled={disabled} onUpdate={onUpdate}/>}</td>
      </tr>;
    })}</tbody></table></div>
  </section>;
}
