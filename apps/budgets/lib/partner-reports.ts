import type { BudgetLine, PartnerReport, Project, ReportExpense, ReportExpenseAllocation, ReportExpenseDescription, Workspace } from "./budget-model.ts";
import {reportPeriodIds,withReportPeriods} from "./report-periods.ts";
import {addCalendarMonths} from "./project-dates.ts";
import { round, sum } from "./budget-model.ts";
import { costCategory } from "./cost-categories.ts";
import { mergeGlobalFiles } from "./global-expenditures.ts";
import {allocationStatus,expenseIdentity,validAllocationAmount} from "./report-allocations.ts";

export const reportStatus = (r:PartnerReport) => r.status === "certified" ? "Certifié" : "Envoyé · en attente de certification";
export const pendingReportExpenses=(report:PartnerReport,lines:BudgetLine[])=>{
  const scoped=lines.filter(l=>l.projectId===report.projectId);
  return report.expenses.filter(e=>!allocationStatus(e,scoped).complete).length;
};
export const reportKey = (r:Pick<PartnerReport,"externalProjectId"|"partnerId"|"number">) => `${r.externalProjectId.replace(/\s/g, "").toLowerCase()}:${partnerNumber(r.partnerId)}:R${r.number}`;
const partnerNumber = (s:string) => s.match(/^(?:LP|PP)\s*(\d+)$/i)?.[1];
const normalized = (s:string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sameDescription=(note:ReportExpenseDescription,projectId:string,externalProjectId:string,partnerId:string,expenseId:string)=>note.projectId===projectId&&normalized(note.externalProjectId)===normalized(externalProjectId)&&partnerNumber(note.partnerId)===partnerNumber(partnerId)&&note.expenseId===expenseId;
function manualDescription(ws:Workspace,projectId:string,externalProjectId:string,partnerId:string,expense:ReportExpense):ReportExpense {
  const note=ws.reportExpenseDescriptions?.find(n=>sameDescription(n,projectId,externalProjectId,partnerId,expense.id));
  if(note)return {...expense,description:note.description,descriptionSource:"Saisie manuelle"};
  const capture=ws.reportCaptureDescriptions?.find(n=>sameDescription(n,projectId,externalProjectId,partnerId,expense.id));
  return capture?{...expense,description:capture.description,descriptionSource:`Capture française · ${capture.file}`}:expense;
}

export function importReportCapture(ws:Workspace,projectId:string,reportId:string,source:{file:string;hash:string;reportNumber?:number;partnerId?:string},rows:{expenseId:string;description:string}[]):Workspace {
  const report=effectivePartnerReports(ws,projectId).find(r=>r.id===reportId);
  if(!report)throw new Error("Sélectionnez le rapport correspondant à la capture.");
  if(source.reportNumber!==undefined&&source.reportNumber!==report.number)throw new Error("La capture concerne un autre rapport.");
  if(source.partnerId&&partnerNumber(source.partnerId)!==partnerNumber(report.partnerId))throw new Error("La capture concerne un autre partenaire.");
  if(!source.file||!source.hash||!rows.length||rows.length>250)throw new Error("Sélectionnez les libellés à importer depuis la capture.");
  if(new Set(rows.map(r=>r.expenseId)).size!==rows.length)throw new Error("Deux libellés ciblent la même dépense. Vérifiez les identifiants.");
  const next=[...(ws.reportCaptureDescriptions||[])];
  for(const row of rows){
    if(!report.expenses.some(e=>e.id===row.expenseId))throw new Error(`${row.expenseId} : dépense absente de ce rapport.`);
    const description=row.description.trim();if(!description||description.length>2000)throw new Error(`${row.expenseId} : renseignez un libellé de 1 à 2 000 caractères.`);
    const note={projectId,externalProjectId:report.externalProjectId,partnerId:report.partnerId,expenseId:row.expenseId,description,file:source.file,hash:source.hash,importedAt:new Date().toISOString()};
    const index=next.findIndex(n=>sameDescription(n,projectId,report.externalProjectId,report.partnerId,row.expenseId));
    if(index<0)next.push(note);else next[index]=note;
  }
  return {...ws,reportCaptureDescriptions:next};
}

export function validateReportProject(report:PartnerReport, project:Project):string {
  if (!project.jems) throw new Error("Importez d’abord le budget JEMS de ce partenaire dans le projet.");
  if (normalized(project.jems.projectId) !== normalized(report.externalProjectId) || !partnerNumber(report.partnerId) || partnerNumber(project.jems.partnerId) !== partnerNumber(report.partnerId)) throw new Error("Ce rapport appartient à un autre projet ou partenaire JEMS.");
  // Some Maritime PDFs print LP4 on the identification page for partner PP4.
  if (normalized(project.jems.partnerName) !== normalized(report.partnerName)) throw new Error("Le nom du partenaire du rapport diffère de celui du budget JEMS.");
  const period = project.periods.find(p => p.id === `P${report.periodNumber}`);
  if (!period || !project.periods.some(p=>p.start===report.start&&p.start<=period.start) || period.end !== report.end) throw new Error(`Les dates de P${report.periodNumber} (${report.start} au ${report.end}) ne correspondent pas au calendrier du projet. Vérifiez ses paramètres avant l’import.`);
  return period.id;
}

export function matchingLines(expense:ReportExpense, lines:BudgetLine[]):BudgetLine[] {
  return lines.filter(l => costCategory(l.category).id === costCategory(expense.category).id && l.costMode !== "forfait" && !l.flatRate);
}
function automaticLine(expense:ReportExpense, lines:BudgetLine[]):string|undefined {
  // Staff costs are allocated together, against the remaining category budget.
  if(costCategory(expense.category).id==="hr")return undefined;
  const candidates = matchingLines(expense, lines);
  // An ambiguous category is never assigned merely because amounts happen to match.
  if (candidates.length === 1) return candidates[0].id;
  const texts=[expense.description,expense.procurement,...Object.values(expense.translations||{}).flatMap(t=>[t?.description,t?.comment,t?.procurement])].filter((t):t is string=>!!t).map(normalized);
  const exact = candidates.filter(l => [l.description,l.comments,l.procurement].some(text => text && texts.includes(normalized(text))));
  return exact.length === 1 ? exact[0].id : undefined;
}

// Global LoE is the complete expense snapshot. PDFs remain independent evidence
// for financial overviews; they never add the same expense a second time.
export function effectivePartnerReports(ws:Workspace,projectId:string):PartnerReport[] {
  const pdfs=(ws.partnerReports||[]).filter(r=>r.projectId===projectId);
  const lines=ws.budgetLines.filter(l=>l.projectId===projectId);
  const project=ws.projects.find(p=>p.id===projectId)!;
  const snapshot=ws.globalExpenditureImports?.find(i=>i.projectId===projectId);
  if(!snapshot)return withReportPeriods(ws,project,assignAvailableStaff(pdfs.map(r=>({...r,expenses:r.expenses.map(e=>manualDescription(ws,projectId,r.externalProjectId,r.partnerId,e))})),lines));
  const files=snapshot.files,base=files[0];
  const allRows=mergeGlobalFiles(files),eligible=allRows.filter(e=>e.reportStatus!=="draft");
  const reports:PartnerReport[]=[];
  for(const number of [...new Set(eligible.map(e=>e.reportNumber))].sort((a,b)=>a-b)){
    const rows=eligible.filter(e=>e.reportNumber===number),first=rows[0],pdf=pdfs.find(p=>p.number===number);
    const period=project.periods.find(p=>p.id===`P${first.periodNumber}`);
    if(!period)continue;
    const expenses=rows.map(row=>{
      const prior=pdf?.expenses.find(e=>e.id===row.id);
      const link=ws.reportExpenseLinks?.find(l=>l.projectId===projectId&&l.partnerDatabaseId===base.partnerDatabaseId&&l.databaseId===row.databaseId);
      const budgetAllocations=link?link.budgetAllocations:prior?.budgetAllocations;
      const saved=link?link.budgetLineId:prior?.budgetLineId;
      const valid=saved&&matchingLines(row,lines).some(l=>l.id===saved);
      const enriched=manualDescription(ws,projectId,base.externalProjectId,base.partnerId,{...row,description:row.description||prior?.description||"",descriptionSource:row.description?(row.translations.fr?.description?"Saisie français":"Saisie italien"):prior?.description?"Rapport PDF":""});
      const budgetLineId=budgetAllocations!==undefined?(budgetAllocations.length===1&&budgetAllocations[0].amount===row.declared?budgetAllocations[0].budgetLineId:undefined):valid?saved:link?undefined:automaticLine(enriched,lines);
      return {...enriched,budgetAllocations,budgetLineId,association:budgetAllocations!==undefined||link?"manual":budgetLineId?(valid?prior?.association:"automatic"):undefined} as ReportExpense;
    });
    const detailTotal=sum(expenses.map(e=>e.declared));
    const matches=!!pdf&&pdf.periodId===period.id&&pdf.status===first.reportStatus&&pdf.expenses.length===expenses.length&&expenses.every(e=>pdf.expenses.some(p=>p.id===e.id&&p.declared===e.declared&&costCategory(p.category).id===costCategory(e.category).id));
    const warnings:string[]=[];
    if(!matches)warnings.push(pdf?"Le PDF et l’export global diffèrent. Les montants ci-dessous sont ceux de la liste globale ; importez un PDF à jour pour rapprocher les forfaits.":"Les exports globaux détaillent les dépenses directes. Importez le PDF de ce rapport pour contrôler les forfaits dans l’aperçu financier.");
    if(allRows.some(e=>e.reportStatus==="draft"))warnings.push("Les rapports en brouillon ou rouverts sont exclus de la consommation.");
    reports.push({id:`global:${projectId}:${first.reportDatabaseId}`,projectId,externalProjectId:base.externalProjectId,partnerId:base.partnerId,partnerName:base.partnerName,number,periodNumber:first.periodNumber,periodId:period.id,start:matches&&pdf!.end===period.end?pdf!.start:addCalendarMonths(project.start,first.firstMonth-1),end:period.end,status:first.reportStatus as "certified"|"submitted",file:files.map(f=>f.file).join(" + "),hash:files.map(f=>f.hash).join(":"),exportedAt:files.map(f=>f.exportedAt).sort().at(-1)!,importedAt:snapshot.importedAt,applicationVersion:first.applicationVersion,declared:matches?pdf!.declared:detailTotal,accepted:matches?pdf!.accepted:first.reportStatus==="certified"?sum(expenses.filter(e=>!e.parked).map(e=>e.certified||0)):undefined,previous:matches?pdf!.previous:0,cumulative:matches?pdf!.cumulative:0,budget:project.eligibleBudget,categories:matches?pdf!.categories:[],expenses,warnings,sourceKind:"global",financialOverview:matches,overviewMatches:matches});
  }
  return withReportPeriods(ws,project,assignAvailableStaff(reports,lines));
}

/** Derived assignments cover existing and future reports without altering JEMS sources.
 * Reserve every saved allocation first. Count carried expenses only once, at their latest amount.
 * Use integer cents and a stable order so viewing another period cannot change its available budget.
 */
function assignAvailableStaff(reports:PartnerReport[],lines:BudgetLine[]):PartnerReport[]{
  const staff=lines.filter(l=>costCategory(l.category).id==="hr"&&l.costMode!=="forfait"&&!l.flatRate)
    .sort((a,b)=>(a.sourceRow??Number.MAX_SAFE_INTEGER)-(b.sourceRow??Number.MAX_SAFE_INTEGER)||a.id.localeCompare(b.id));
  if(!staff.length)return reports;
  const latest=latestReportExpenses(reports).map(item=>({...item,status:allocationStatus(item.expense,lines)}));
  const available=new Map(staff.map(line=>[line.id,Math.round(line.amount*100)]));
  for(const {status} of latest)for(const part of status.allocations)if(available.has(part.budgetLineId))available.set(part.budgetLineId,available.get(part.budgetLineId)!-Math.round(part.amount*100));
  const planned=new Map<string,{declared:number;allocations:ReportExpenseAllocation[]}>();
  const pending=latest.filter(({expense:e,status})=>costCategory(e.category).id==="hr"&&e.declared>0&&!status.complete&&!status.needsReview&&e.association!=="manual"&&(e.budgetAllocations===undefined||e.association==="automatic"))
    .sort((a,b)=>a.report.number-b.report.number||expenseIdentity(a.expense).localeCompare(expenseIdentity(b.expense),undefined,{numeric:true}));
  for(const {expense,status} of pending){
    let remainder=Math.round(status.unassigned*100);
    const allocations=status.allocations.map(a=>({...a}));
    for(const line of staff){
      const amount=Math.min(remainder,Math.max(0,available.get(line.id)!));
      if(!amount)continue;
      const existing=allocations.find(a=>a.budgetLineId===line.id);
      if(existing)existing.amount=round(existing.amount+amount/100);else allocations.push({budgetLineId:line.id,amount:amount/100});
      available.set(line.id,available.get(line.id)!-amount);remainder-=amount;
      if(!remainder)break;
    }
    if(allocations.length)planned.set(expenseIdentity(expense),{declared:expense.declared,allocations});
  }
  if(!planned.size)return reports;
  return reports.map(report=>({...report,expenses:report.expenses.map(expense=>{
    const plan=planned.get(expenseIdentity(expense));
    // A historical occurrence with another amount keeps its own declaration and associations.
    if(!plan||expense.declared!==plan.declared||expense.association==="manual")return expense;
    const allocations=plan.allocations.map(a=>({...a}));
    return {...expense,budgetAllocations:allocations,budgetLineId:allocations.length===1&&allocations[0].amount===expense.declared?allocations[0].budgetLineId:undefined,association:"automatic" as const};
  })}));
}

export function describeReportExpense(ws:Workspace,reportId:string,expenseId:string,description:string):Workspace {
  const report=ws.projects.flatMap(p=>effectivePartnerReports(ws,p.id)).find(r=>r.id===reportId);
  if(!report?.expenses.some(e=>e.id===expenseId))throw new Error("Dépense introuvable.");
  const text=description.trim();
  if(text.length>2000)throw new Error("Le libellé doit contenir au maximum 2 000 caractères.");
  const remaining=(ws.reportExpenseDescriptions||[]).filter(n=>!sameDescription(n,report.projectId,report.externalProjectId,report.partnerId,expenseId));
  return {...ws,reportExpenseDescriptions:text?[...remaining,{projectId:report.projectId,externalProjectId:report.externalProjectId,partnerId:report.partnerId,expenseId,description:text}]:remaining};
}

export function mergePartnerReports(ws:Workspace, projectId:string, incoming:PartnerReport[]) {
  const project = ws.projects.find(p => p.id === projectId);
  if (!project) throw new Error("Projet introuvable.");
  const reports = [...(ws.partnerReports || [])];
  let added=0, updated=0, skipped=0;
  const lines = ws.budgetLines.filter(l => l.projectId === projectId);
  // Oldest export first makes the result independent of file selection order.
  for (const source of [...incoming].sort((a,b) => a.exportedAt.localeCompare(b.exportedAt))) {
    const periodId = validateReportProject(source, project);
    const index = reports.findIndex(r => r.projectId === projectId && reportKey(r) === reportKey(source));
    const old = reports[index];
    if (old?.hash === source.hash) { skipped++; continue; }
    if (old && (source.exportedAt < old.exportedAt || (old.status === "certified" && source.status !== "certified"))) throw new Error(`R.${source.number} : cet export est antérieur ou ferait régresser un rapport certifié. Conservez la version importée et utilisez un export à jour.`);
    if (old && source.exportedAt === old.exportedAt && source.hash !== old.hash) throw new Error(`R.${source.number} : deux fichiers différents portent la même date d’export. Importez uniquement la version à conserver.`);
    const expenses = source.expenses.map(e => {
      const prior = old?.expenses.find(x => x.id === e.id);
      if(prior?.budgetAllocations!==undefined)return {...e,budgetAllocations:prior.budgetAllocations,budgetLineId:prior.budgetAllocations.length===1&&prior.budgetAllocations[0].amount===e.declared?prior.budgetAllocations[0].budgetLineId:undefined,association:"manual" as const};
      const validPrior = prior?.budgetLineId && lines.some(l => l.id === prior.budgetLineId && costCategory(l.category).id === costCategory(e.category).id);
      const budgetLineId = validPrior ? prior!.budgetLineId : automaticLine(e, lines);
      return {...e, budgetLineId, association:budgetLineId ? (validPrior ? prior!.association : "automatic") : undefined} as ReportExpense;
    });
    const report = {...source, id:old?.id || crypto.randomUUID(), projectId, periodId, expenses, importedAt:new Date().toISOString()};
    if (old) { reports[index] = report; updated++; } else { reports.push(report); added++; }
  }
  return {workspace:{...ws, demo:false, partnerReports:reports} as Workspace, added, updated, skipped};
}

export function associateReportExpense(ws:Workspace, reportId:string, expenseId:string, lineId:string):Workspace {
  const report=ws.projects.flatMap(p=>effectivePartnerReports(ws,p.id)).find(r=>r.id===reportId),expense=report?.expenses.find(e=>e.id===expenseId);
  if(!expense)throw new Error("Dépense introuvable.");
  return allocateReportExpense(ws,reportId,expenseId,lineId?[{budgetLineId:lineId,amount:expense.declared}]:[]);
}

export function allocateReportExpense(ws:Workspace,reportId:string,expenseId:string,allocations:ReportExpenseAllocation[]):Workspace {
  const report = ws.projects.flatMap(p=>effectivePartnerReports(ws,p.id)).find(r=>r.id===reportId);
  const expense = report?.expenses.find(e => e.id === expenseId);
  if (!report || !expense) throw new Error("Dépense introuvable.");
  const candidates=matchingLines(expense,ws.budgetLines.filter(l=>l.projectId===report.projectId));
  if(allocations.some(a=>!candidates.some(l=>l.id===a.budgetLineId)))throw new Error("Choisissez une ligne de la même catégorie, dans ce projet.");
  if(new Set(allocations.map(a=>a.budgetLineId)).size!==allocations.length)throw new Error("Une ligne ne doit apparaître qu’une fois dans la répartition.");
  if(allocations.some(a=>!validAllocationAmount(a.amount,expense.declared)))throw new Error("Saisissez des montants au centime, de même signe que la dépense.");
  if(Math.abs(sum(allocations.map(a=>a.amount)))>Math.abs(expense.declared)+.001)throw new Error("La répartition dépasse le montant de la dépense.");
  const budgetAllocations=allocations.filter(a=>a.amount!==0||expense.declared===0).map(a=>({...a,amount:round(a.amount)}));
  const budgetLineId=budgetAllocations.length===1&&budgetAllocations[0].amount===expense.declared?budgetAllocations[0].budgetLineId:"";
  // Keep matching PDF evidence in sync when the global export is removed/reloaded.
  const partnerReports=ws.partnerReports?.map(r=>r.projectId===report.projectId&&normalized(r.externalProjectId)===normalized(report.externalProjectId)&&partnerNumber(r.partnerId)===partnerNumber(report.partnerId)?{...r,expenses:r.expenses.map(e=>e.id===expenseId?{...e,budgetAllocations,budgetLineId:budgetLineId||undefined,association:"manual" as const}:e)}:r);
  let reportExpenseLinks=ws.reportExpenseLinks?.map(l=>l.projectId===report.projectId&&l.expenseId===expenseId?{...l,budgetLineId,budgetAllocations}:l);
  if(report.sourceKind==="global"){
    const source=ws.globalExpenditureImports!.find(i=>i.projectId===report.projectId)!.files[0];
    const link={projectId:report.projectId,partnerDatabaseId:source.partnerDatabaseId,databaseId:expense.databaseId!,expenseId,budgetLineId,budgetAllocations};
    reportExpenseLinks=[...(reportExpenseLinks||[]).filter(l=>!(l.projectId===link.projectId&&l.partnerDatabaseId===link.partnerDatabaseId&&l.databaseId===link.databaseId)),link];
  }
  return {...ws,...(partnerReports?{partnerReports}:{}),...(reportExpenseLinks?{reportExpenseLinks}:{})};
}

export function reportCoverage(project:Project, reports:PartnerReport[]) {
  const maxPeriod = Math.max(0,...reports.map(r=>r.periodNumber));
  const covered=new Set(reports.flatMap(r=>reportPeriodIds(r,project)));
  return {missingReports:[] as number[],missingPeriods:project.periods.filter(p=>Number(p.id.slice(1))<=maxPeriod&&!covered.has(p.id)).map(p=>p.id)};
}

// Keep every declaration for audit. A carried expenditure ID is counted once in
// line consumption, using its latest report. Report totals stay source totals.
export function latestReportExpenses(reports:PartnerReport[]) {
  const result = new Map<string,{report:PartnerReport;expense:ReportExpense}>();
  for (const report of [...reports].sort((a,b)=>a.number-b.number)) for (const expense of report.expenses) result.set(expenseIdentity(expense),{report,expense});
  return [...result.values()];
}

export function reportLineConsumption(ws:Workspace, projectId:string) {
  const reports = effectivePartnerReports(ws,projectId);
  const expenses = latestReportExpenses(reports);
  const project = ws.projects.find(p=>p.id===projectId)!;
  const missing = reportCoverage(project,reports);
  const lines=ws.budgetLines.filter(l=>l.projectId===projectId);
  const attributed=expenses.map(e=>({...e,...allocationStatus(e.expense,lines)}));
  return lines.map(line => {
    const category = costCategory(line.category).id;
    const categoryLines = ws.budgetLines.filter(l=>l.projectId===projectId && costCategory(l.category).id===category);
    const flat = line.costMode === "forfait" || !!line.flatRate;
    const assigned=attributed.flatMap(e=>e.allocations.filter(a=>a.budgetLineId===line.id).map(a=>({...e,amount:a.amount})));
    const amount = flat && categoryLines.length === 1 ? sum(reports.flatMap(r=>r.categories.filter(c=>costCategory(c.category).id===category && c.flatRate).map(c=>c.current))) : sum(assigned.map(e=>e.amount));
    const unassigned = attributed.some(e=>costCategory(e.expense.category).id===category&&!e.complete);
    const checked=assigned.filter(e=>e.report.status==="certified"&&!e.expense.parked);
    // A correction is not arbitrarily spread over several budget lines.
    const certifiedNeedsAllocation=checked.some(e=>e.amount!==e.expense.declared&&e.expense.certified!==e.expense.declared);
    const certified=flat||certifiedNeedsAllocation?undefined:sum(checked.map(e=>e.amount===e.expense.declared?e.expense.certified||0:e.amount));
    const sent=flat?undefined:sum(assigned.filter(e=>e.report.status==="submitted"&&!e.expense.parked).map(e=>e.amount));
    const rawRemaining=round(line.amount-amount);
    return {line,declared:amount,certified,certifiedNeedsAllocation,sent,remaining:Math.max(0,rawRemaining),rawRemaining,overrun:Math.max(0,-rawRemaining),provisional:!reports.length || missing.missingReports.length>0 || missing.missingPeriods.length>0 || unassigned || (flat && (categoryLines.length!==1||reports.some(r=>r.sourceKind==="global"&&!r.financialOverview))) || reports.some(r=>r.accepted !== undefined && r.accepted!==r.declared)};
  });
}

export function reportAllocationOptions(ws:Workspace,reportId:string,expenseId:string){
  const report=ws.projects.flatMap(p=>effectivePartnerReports(ws,p.id)).find(r=>r.id===reportId),expense=report?.expenses.find(e=>e.id===expenseId);
  if(!report||!expense)throw new Error("Dépense introuvable.");
  const lines=ws.budgetLines.filter(l=>l.projectId===report.projectId),reports=effectivePartnerReports(ws,report.projectId);
  const latest=latestReportExpenses(reports).find(e=>expenseIdentity(e.expense)===expenseIdentity(expense));
  const current=latest?allocationStatus(latest.expense,lines).allocations:[];
  return {report,expense,options:reportLineConsumption(ws,report.projectId).filter(c=>matchingLines(expense,lines).some(l=>l.id===c.line.id)).map(c=>{
    const previous=current.find(a=>a.budgetLineId===c.line.id)?.amount||0,otherAssigned=round(c.declared-previous),rawAvailable=round(c.line.amount-otherAssigned);
    return {...c,otherAssigned,rawAvailable,available:Math.max(0,rawAvailable)};
  })};
}

export function proposeReportAllocation(ws:Workspace,reportId:string,expenseId:string,lineId:string,current:ReportExpenseAllocation[]=[]){
  allocateReportExpense(ws,reportId,expenseId,current);
  const {expense,options}=reportAllocationOptions(ws,reportId,expenseId),option=options.find(o=>o.line.id===lineId);
  if(!option)throw new Error("Choisissez une ligne de la même catégorie, dans ce projet.");
  const remainder=round(expense.declared-sum(current.map(a=>a.amount))),existing=current.find(a=>a.budgetLineId===lineId)?.amount||0;
  const amount=remainder<=0?remainder:Math.min(remainder,Math.max(0,round(option.rawAvailable-existing)));
  const next=current.filter(a=>a.budgetLineId!==lineId);
  if(existing+amount!==0||expense.declared===0)next.push({budgetLineId:lineId,amount:round(existing+amount)});
  return next;
}
