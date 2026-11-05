import {rhDefaultPayments,rhPaymentsForAgent,type RhClient,type RhProject,type RhPeriod,type RhLine,type RhPaymentEntry} from './rh-domain';
import type {ClientEmployee} from './client-employees-domain';

export type RhPaymentLine=Omit<RhLine,'employerCostCents'|'rateBasisPoints'|'allocatedCents'|'payrollId'>&{
 employerCostCents:number|null;rateBasisPoints:number|null;allocatedCents:number|null;payrollId:string|null;
 payrollState?:'missing'|'unconfirmed'|'confirmed';
};
export type RhPaymentSource={client:RhClient;projects:RhProject[];periods:RhPeriod[];agents:ClientEmployee[];lines:RhPaymentLine[];payments?:RhPaymentEntry[]};
export type RhPaymentBlock={key:string;agentId:string;agentName:string;month:string;employerCostCents:number|null;lines:RhPaymentLine[];salaryPayments:RhPaymentEntry[];contributionPayments:RhPaymentEntry[];rowCount:number};
export type RhPaymentGroup={key:string;name:string;programme:string;periods:RhPeriod[];blocks:RhPaymentBlock[]};

/** Shared by the on-screen document and XLSX; a common payment keeps one stable ID. */
export function rhPaymentGroups(source:RhPaymentSource):RhPaymentGroup[]{
 const groups=new Map<string,RhPeriod[]>();
 for(const period of source.periods){const programme=source.projects.find(p=>p.id===period.projectId)?.programme.trim()||'';const key=programme+'|'+period.startDate;groups.set(key,[...(groups.get(key)||[]),period]);}
 let payments=source.payments;
 if(payments===undefined){try{payments=rhDefaultPayments({periods:source.periods});}catch{payments=[];}}
 return [...groups].sort(([a],[b])=>a.localeCompare(b,'fr')).map(([key,periods],index)=>{
  const blocks:RhPaymentBlock[]=[];
  const members=source.agents.filter(a=>periods.some(p=>p.agents.some(m=>m.agentId===a.id))).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  for(const agent of members){
   const lines=source.lines.filter(l=>l.agentId===agent.id&&periods.some(p=>p.id===l.periodId));
   const months=[...new Set(lines.map(l=>l.month))].sort();if(!months.length)months.push('');
   for(const month of months){
    const monthly=lines.filter(l=>l.month===month).sort((a,b)=>(source.projects.find(p=>p.id===a.projectId)?.name||'').localeCompare(source.projects.find(p=>p.id===b.projectId)?.name||'','fr')||a.id.localeCompare(b.id));
    const selected=rhPaymentsForAgent(payments!,agent.id,month),salaryPayments=selected.filter(p=>p.kind==='salary'),contributionPayments=selected.filter(p=>p.kind==='contribution');
    blocks.push({key:agent.id+'|'+month,agentId:agent.id,agentName:agent.name,month,employerCostCents:monthly[0]?.employerCostCents??null,lines:monthly,salaryPayments,contributionPayments,rowCount:Math.max(1,monthly.length,salaryPayments.length,contributionPayments.length)});
   }
  }
  return {key,name:`RH ${String(index+1).padStart(2,'0')} - ${periods[0].startDate}`,programme:source.projects.find(p=>p.id===periods[0].projectId)?.programme||'',periods,blocks};
 });
}

export type RhPaymentSegment={block:RhPaymentBlock;start:number;end:number;continuation:boolean};
/** Small indivisible segments preserve the employee/month context at every page break. */
export function rhPaymentSegments(group:RhPaymentGroup,maxRows=8):RhPaymentSegment[]{
 return group.blocks.flatMap(block=>Array.from({length:Math.ceil(block.rowCount/maxRows)},(_,i)=>({block,start:i*maxRows,end:Math.min(block.rowCount,(i+1)*maxRows),continuation:i>0})));
}
