import { round, sum, type Project, type Workspace } from "./budget-model.ts";
import { effectivePartnerReports, pendingReportExpenses } from "./partner-reports.ts";
import { allocationStatus } from "./report-allocations.ts";
import { reportPeriodIds } from "./report-periods.ts";
import { receiptDate } from "./receipt-date.ts";
import { costCategory } from "./cost-categories.ts";
import {advanceRecoveryChoices} from "./advance-recovery.ts";

export type ProjectReceipt={period:string;date:string;certificateDate:string;basis:number;gross:number;recovery:number;net:number;status:string;source:"jems"|"budget"|"payments"|"manual"|"advance"|"covered";settlementPeriod?:string;declared?:number;accepted?:number;reportNumbers:number[];pending:number;assigned:number;unassigned:number;financialComplete:boolean;certified:boolean;capped:boolean};

export function projectReceipts(ws:Workspace,p:Project){
  const lines=ws.budgetLines.filter(b=>b.projectId===p.id),reports=effectivePartnerReports(ws,p.id);
  const regular=[...new Set([...p.periods.map(x=>x.id),...lines.flatMap(b=>Object.keys(b.allocations)),...reports.map(r=>r.periodId)])].filter(id=>/^P\d+$/.test(id)).sort((a,b)=>+a.slice(1)-+b.slice(1));
  const ids=[...(lines.some(b=>b.allocations.PREP)?["PREP"]:[]),...regular,...(lines.some(b=>b.allocations.CLOSE)?["CLOSE"]:[])];
  const rate=p.federRate/100,grant=round(p.eligibleBudget*rate);
  const bases=ids.map(id=>{
    const dr=ws.drs.find(d=>d.projectId===p.id&&d.periodId===id),periodReports=reports.filter(r=>r.periodId===id);
    const base:ProjectReceipt={period:id,date:receiptDate(dr),certificateDate:dr?.certificateDate||"",basis:sum(lines.map(b=>b.allocations[id]||0)),gross:0,recovery:0,net:0,status:"Prévision sur budget",source:"budget",reportNumbers:[],pending:0,assigned:0,unassigned:0,financialComplete:true,certified:false,capped:false};
    if(periodReports.length){
      const certified=periodReports.every(r=>r.status==="certified"&&r.accepted!==undefined);
      const financialComplete=periodReports.every(r=>r.sourceKind!=="global"||r.financialOverview===true);
      const statuses=periodReports.flatMap(r=>r.expenses.map(e=>allocationStatus(e,lines)));
      return {...base,source:"jems" as const,reportNumbers:periodReports.map(r=>r.number),certified,financialComplete,
        declared:sum(periodReports.map(r=>r.declared)),accepted:periodReports.some(r=>r.accepted!==undefined)?sum(periodReports.map(r=>r.accepted??0)):undefined,
        // Source current totals already include flat rates. Never add previous/cumulative columns or local payments.
        basis:sum(periodReports.map(r=>r.status==="certified"&&r.accepted!==undefined?r.accepted:r.declared)),
        pending:sum(periodReports.map(r=>pendingReportExpenses(r,lines))),assigned:sum(statuses.map(s=>s.assigned)),unassigned:sum(statuses.map(s=>s.unassigned)),
        status:(certified?"Certifié JEMS":periodReports.some(r=>r.status==="certified")?"Certifié et envoyé JEMS":"Envoyé JEMS · estimation")+(financialComplete?"":" · hors forfaits, PDF à compléter")};
    }
    const covering=reports.filter(r=>r.periodId!==id&&reportPeriodIds(r,p).includes(id));
    if(covering.length)return {...base,source:"covered" as const,basis:0,status:"Regroupé dans "+[...new Set(covering.map(r=>r.periodId))].join(", "),reportNumbers:covering.map(r=>r.number),settlementPeriod:covering[0].periodId};
    if(dr?.overrideDeclared!==undefined)return {...base,source:"manual" as const,status:"Prévision saisie",basis:dr.overrideDeclared};
    const period=p.periods.find(t=>t.id===id);
    const paid=period?ws.expenses.filter(e=>e.projectId===p.id).map(e=>({category:costCategory(lines.find(l=>l.id===e.budgetLineId)?.category||"").id,amount:sum(e.payments.filter(x=>{const date=x.paidDate||x.plannedDate;return date>=period.start&&date<=period.end}).map(x=>x.amount))})):[];
    if(paid.some(x=>x.amount)||[dr?.realHr,dr?.realMission,dr?.realOffice].some(n=>n!==undefined&&n!==0)){
      const other=sum(paid.filter(x=>!["hr","travel","office"].includes(x.category)).map(x=>x.amount));
      const hr=dr?.realHr??(p.rules.hrMode==="forfait"?round(other*p.rules.hrRate/100):sum(paid.filter(x=>x.category==="hr").map(x=>x.amount)));
      const travel=dr?.realMission??(p.rules.missionMode==="forfait"?round(hr*p.rules.missionRate/100):sum(paid.filter(x=>x.category==="travel").map(x=>x.amount)));
      const office=dr?.realOffice??(p.rules.officeMode==="forfait"?round(hr*p.rules.officeRate/100):sum(paid.filter(x=>x.category==="office").map(x=>x.amount)));
      return {...base,source:"payments" as const,status:"Prévision sur paiements saisis",basis:sum([other,hr,travel,office])};
    }
    return base;
  });
  // Reserve funding for imported reports before allocating the remaining grant to forecasts.
  let grantRemaining=grant;
  for(const row of [...bases.filter(r=>r.source==="jems"),...bases.filter(r=>r.source!=="jems")]){
    const expected=Math.max(0,round(row.basis*rate));row.gross=Math.min(Math.max(0,grantRemaining),expected);row.capped=row.gross<expected;grantRemaining=round(grantRemaining-row.gross);
    if(row.capped)row.status+=" · dotation plafonnée";
  }
  const advance=p.advance,advanceAmount=advance.requested||advance.received?round(grant*advance.rate/100):0;
  const explicitPlan=ws.drs.some(d=>d.projectId===p.id&&d.recoveryChoice),choices=advanceRecoveryChoices(ws,p);
  let outstanding=advanceAmount,firstDue=round(advanceAmount*advance.firstRecoveryRate/100),grossSoFar=0;
  const receipts:ProjectReceipt[]=[];
  if(advanceAmount)receipts.push({period:"Avance FEDER",date:advance.receivedDate||"",certificateDate:"",basis:0,gross:advanceAmount,recovery:0,net:advanceAmount,status:advance.received?"Avance reçue":"Avance demandée",source:"advance",reportNumbers:[],pending:0,assigned:0,unassigned:0,financialComplete:true,certified:false,capped:false});
  for(const [index,row] of bases.entries()){
    const dr=ws.drs.find(d=>d.projectId===p.id&&d.periodId===row.period);
    grossSoFar=round(grossSoFar+row.gross);
    const firstIndex=ids.indexOf(advance.recoveryPeriod),settlement=index===bases.length-1||grossSoFar>=grant;
    const due=settlement?outstanding:firstIndex>=0&&index>=firstIndex?firstDue:0;
    const manual=dr?.recoveryOverride||!!dr?.recovery;
    const choice=choices[row.period],firstPart=round(advanceAmount*.6);
    const requested=explicitPlan?(choice==="first"?firstPart:choice==="balance"?round(advanceAmount-firstPart):choice==="full"?advanceAmount:choice==="legacy"?dr?.recovery||0:0):(manual?dr!.recovery:due);
    row.recovery=Math.min(row.gross,explicitPlan?outstanding:advanceAmount?outstanding:manual?row.gross:0,Math.max(0,requested));
    outstanding=Math.max(0,round(outstanding-row.recovery));firstDue=Math.max(0,round(firstDue-row.recovery));
    row.net=round(row.gross-row.recovery);receipts.push(row);
  }
  return {receipts,outstanding,grant};
}
