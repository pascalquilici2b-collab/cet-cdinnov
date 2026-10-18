import type {PartnerReport,Project,Workspace} from "./budget-model.ts";

const normalized=(s:string)=>s.replace(/\s/g,"").toLowerCase();
const partner=(s:string)=>s.match(/(?:PP|LP)\s*(\d+)/i)?.[1]||s;
export const sameReport=(a:Pick<PartnerReport,"projectId"|"externalProjectId"|"partnerId"|"number">,b:Pick<PartnerReport,"projectId"|"externalProjectId"|"partnerId"|"number">)=>a.projectId===b.projectId&&normalized(a.externalProjectId)===normalized(b.externalProjectId)&&partner(a.partnerId)===partner(b.partnerId)&&a.number===b.number;

export function reportPeriodIds(report:PartnerReport,project:Project):string[]{
  const end=project.periods.findIndex(p=>p.id===report.periodId);
  if(end<0)return [report.periodId];
  const explicit=report.coveredPeriodIds?.filter(id=>project.periods.slice(0,end+1).some(p=>p.id===id));
  if(explicit?.length&&explicit.at(-1)===report.periodId)return explicit;
  const first=project.periods.findIndex(p=>p.start===report.start);
  return first>=0&&first<=end&&project.periods[end].end===report.end?project.periods.slice(first,end+1).map(p=>p.id):[report.periodId];
}
// A period's own reports take precedence over reports covering it retrospectively.
export function reportsForPeriod(reports:PartnerReport[],project:Project,periodId:string):PartnerReport[]{
  const submitted=reports.filter(r=>r.periodId===periodId);
  return submitted.length?submitted:reports.filter(r=>reportPeriodIds(r,project).includes(periodId));
}
export function withReportPeriods(ws:Workspace,project:Project,reports:PartnerReport[]):PartnerReport[]{
  return reports.map(report=>{
    const choice=ws.reportPeriodCoverages?.find(c=>sameReport(c,report));
    const first=choice?project.periods.findIndex(p=>p.id===choice.firstPeriodId):-1,end=project.periods.findIndex(p=>p.id===report.periodId);
    return {...report,coveredPeriodIds:first>=0&&end>=first?project.periods.slice(first,end+1).map(p=>p.id):reportPeriodIds({...report,coveredPeriodIds:undefined},project)};
  });
}
export function setReportPeriods(ws:Workspace,report:PartnerReport,firstPeriodId:string):Workspace{
  const project=ws.projects.find(p=>p.id===report.projectId);
  if(!project)throw new Error("Projet introuvable.");
  if(firstPeriodId){const first=project.periods.findIndex(p=>p.id===firstPeriodId),last=project.periods.findIndex(p=>p.id===report.periodId);if(first<0||first>last)throw new Error("Choisissez une période antérieure ou égale à celle du rapport.")}
  const rest=(ws.reportPeriodCoverages||[]).filter(c=>!sameReport(c,report));
  return {...ws,reportPeriodCoverages:firstPeriodId?[...rest,{projectId:report.projectId,externalProjectId:report.externalProjectId,partnerId:report.partnerId,number:report.number,firstPeriodId}]:rest};
}
export const hasReportCertificate=(ws:Workspace,report:PartnerReport)=>report.status==="certified"&&(report.sourceKind!=="global"||(ws.partnerReports||[]).some(p=>sameReport(p,report)&&p.status==="certified"));
