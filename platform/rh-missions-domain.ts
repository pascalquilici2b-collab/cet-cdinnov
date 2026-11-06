import {normalizeClientEmployees,type ClientAllocation,type ClientEmployee,type ClientEmployeeSpace} from './client-employees-domain';
import {rhDate,rhFail,rhMonth,rhMonthEnd,rhMonths,type RhDraft,type RhLine,type RhProject} from './rh-domain';
import type {BillingClientData} from './billing-contracts';
export interface MissionSource {kind:'draft'|'version';documentId:string;documentVersion:number;versionId?:string;}
export interface MissionLetter {id:string;employeeId:string;allocation:ClientAllocation;}
export interface MissionContext {clientId:string;client:BillingClientData;version:number;agents:ClientEmployee[];projects:RhProject[];documents:ClientEmployeeSpace['documents'];generationTokens:Record<string,string>;}
export interface MissionPreparation extends MissionContext {source:MissionSource;letters:MissionLetter[];issues:string[];}
export interface MissionArchiveInput {id:string;clientId:string;employeeId:string;allocation:ClientAllocation;generationToken:string;supervisor?:string;source?:MissionSource;letterId?:string;}
export interface MissionSegment {employeeId:string;projectId:string;startDate:string;endDate:string;rateBasisPoints:number;}
const nextDay=(value:string)=>{const date=new Date(value+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);};
/** Preserve dates and monthly rates exactly; only contiguous equal-rate intervals coalesce. */
export function missionSegments(draft:RhDraft,lines?:RhLine[]){
 const rows:MissionSegment[]=[],issues:string[]=[],seen=new Set<string>();
 const add=(employeeId:string,projectId:string,startDate:string,endDate:string,rateBasisPoints:number|null)=>{
  if(rateBasisPoints===null){issues.push('Renseignez le taux de l’agent '+employeeId+' sur le projet '+projectId+'.');return;}
  if(!Number.isInteger(rateBasisPoints)||rateBasisPoints<0||rateBasisPoints>10000)rhFail('Le document contient un taux d’affectation invalide.');
  if(rateBasisPoints===0)return;rows.push({employeeId,projectId,startDate,endDate,rateBasisPoints});
 };
 if(lines!==undefined){
  for(const line of lines){const period=draft.periods.find(p=>p.id===line.periodId);if(!period||period.projectId!==line.projectId||!period.agents.some(a=>a.agentId===line.agentId)||!rhMonth(line.month))rhFail('Une ligne du document ne correspond pas à ses affectations.');
   const startDate=period.startDate>line.month+'-01'?period.startDate:line.month+'-01',endDate=period.endDate<rhMonthEnd(line.month)?period.endDate:rhMonthEnd(line.month),key=[line.agentId,line.projectId,line.month].join('|');
   if(!rhDate(startDate)||!rhDate(endDate)||endDate<startDate||seen.has(key))rhFail('Les périodes du document de paiement sont incohérentes.');seen.add(key);add(line.agentId,line.projectId,startDate,endDate,line.rateBasisPoints);
  }
 }else for(const period of draft.periods){if(!rhDate(period.startDate)||!rhDate(period.endDate)||period.endDate<period.startDate)rhFail('Complétez les dates du document de paiement.');for(const member of period.agents)for(const month of rhMonths(period)){const key=[member.agentId,period.projectId,month].join('|');if(seen.has(key))rhFail('Une affectation apparaît deux fois sur le même projet et le même mois.');seen.add(key);add(member.agentId,period.projectId,period.startDate>month+'-01'?period.startDate:month+'-01',period.endDate<rhMonthEnd(month)?period.endDate:rhMonthEnd(month),member.rateBasisPoints);}}
 rows.sort((a,b)=>a.employeeId.localeCompare(b.employeeId)||a.projectId.localeCompare(b.projectId)||a.startDate.localeCompare(b.startDate));const segments:MissionSegment[]=[];
 for(const row of rows){const previous=segments.at(-1);if(previous&&previous.employeeId===row.employeeId&&previous.projectId===row.projectId){if(row.startDate<=previous.endDate)rhFail('Les périodes d’une même affectation se chevauchent.');if(previous.rateBasisPoints===row.rateBasisPoints&&nextDay(previous.endDate)===row.startDate){previous.endDate=row.endDate;continue;}}segments.push({...row});}
 if(!segments.length&&!issues.length)issues.push('Aucune affectation avec un taux supérieur à zéro n’est renseignée.');return {segments,issues:[...new Set(issues)]};
}
export const missionAllocationCore=(a:ClientAllocation)=>JSON.stringify([a.projectId,a.project,a.projectCode,a.programme,a.startDate,a.endDate,Math.round(Number(a.percent.replace(',','.'))*100)]);
/** A past assignment is a suggestion only when its function and missions are unambiguous. */
export function missionPriorAllocation(agent:ClientEmployee,projectId:string,startDate:string,endDate:string){
 const project=agent.allocations.filter(a=>a.projectId===projectId),covering=project.filter(a=>a.startDate<=startDate&&a.endDate>=endDate),candidates=covering.length?covering:project;
 const sameContent=new Set(candidates.map(a=>JSON.stringify([a.projectRole||'',a.tasks])));
 return {allocation:sameContent.size===1?candidates[0]:undefined,ambiguous:sameContent.size>1};
}
const manualCore=(a:ClientAllocation)=>JSON.stringify([a.projectId,a.startDate,a.endDate,Math.round(Number(a.percent.replace(',','.'))*100)]);
/** Manual letters enrich the common allocation without replacing its historical dates/rate. */
export function applyManualMission(agents:ClientEmployee[],employeeId:string,allocation:ClientAllocation){
 const employee=agents.find(a=>a.id===employeeId);if(!employee)rhFail('Cet agent n’appartient pas au client.');
 const sameId=employee.allocations.find(a=>a.id===allocation.id),sameCore=employee.allocations.find(a=>manualCore(a)===manualCore(allocation));
 if(sameId&&manualCore(sameId)!==manualCore(allocation))rhFail('Cette affectation possède déjà d’autres dates ou un autre taux. Conservez-la et créez une nouvelle période.',409);
 const existing=sameId||sameCore;
 if(!existing&&employee.allocations.some(a=>a.projectId===allocation.projectId&&a.startDate<=allocation.endDate&&allocation.startDate<=a.endDate))rhFail('Une autre affectation sur ce projet couvre déjà cette période. Corrigez-la dans la fiche agent avant de continuer.');
 const saved={...allocation,id:existing?.id||allocation.id},next=normalizeClientEmployees(agents.map(a=>a.id===employeeId?{...a,allocations:existing?a.allocations.map(p=>p.id===existing.id?saved:p):[...a.allocations,saved]}:a));
 return {agents:next,allocation:saved,changed:JSON.stringify(next)!==JSON.stringify(agents)};
}
