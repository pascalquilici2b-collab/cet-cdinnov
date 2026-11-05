import {rhDate,rhMonths,rhCompletePaymentSlots,type RhDraft,type RhDocument,type RhSnapshot,type RhLine,type RhClient,type RhProject} from '../rh-domain';
import type {ClientEmployee} from '../client-employees-domain';

// A provisional view never changes the strict archived/exported RH schema.
export type RhPreviewLine=Omit<RhLine,'employerCostCents'|'rateBasisPoints'|'allocatedCents'|'payrollId'>&{
 employerCostCents:number|null;rateBasisPoints:number|null;allocatedCents:number|null;payrollId:string|null;
 payrollState?:'missing'|'unconfirmed'|'confirmed';
};
export type RhPaper=Omit<RhSnapshot,'lines'>&{lines:RhPreviewLine[];provisional?:boolean};

export function buildRhPreview(draft:RhDraft,doc:RhDocument,client:RhClient,projects:RhProject[],agents:ClientEmployee[]):RhPaper{
 const lines:RhPreviewLine[]=[];
 for(const period of draft.periods){
  if(!rhDate(period.startDate)||!rhDate(period.endDate)||period.endDate<period.startDate)continue;
  let months:string[];try{months=rhMonths(period);}catch{continue;}
  for(const member of period.agents)for(const month of months){
   if(lines.length>=12000)break;
   const candidates=doc.payroll.filter(p=>p.agentId===member.agentId&&p.month===month),confirmed=candidates.filter(p=>p.confirmed);
   const file=confirmed.length===1?confirmed[0]:candidates.length===1?candidates[0]:undefined;
   const cost=file?.employerCostCents??null,rate=member.rateBasisPoints;
   lines.push({id:[period.id,member.agentId,month].join(':'),periodId:period.id,projectId:period.projectId,agentId:member.agentId,month,
    employerCostCents:cost,netBeforeTaxCents:file?.netBeforeTaxCents??null,rateBasisPoints:rate,payrollId:file?.id??null,
    payrollState:!file?'missing':file.confirmed?'confirmed':'unconfirmed',
    allocatedCents:file?.confirmed&&cost!==null&&rate!==null&&Number.isInteger(rate)&&rate>=0&&rate<=10000?Math.round(cost*rate/10000):null});
  }
 }
 return {id:'preview',documentId:doc.id,revision:doc.versions.length+1,name:draft.name,client,projects,periods:draft.periods,agents,lines,payroll:doc.payroll,payments:rhCompletePaymentSlots(draft),createdAt:'',createdBy:'',provisional:true};
}
