import {rhCompletePaymentSlots,rhExpected,type RhDraft,type RhPayrollSource,type RhSnapshot} from './rh-domain';

export type RhDocumentStatus='draft'|'in_progress'|'finalized';
export const rhStatusLabels:Record<RhDocumentStatus,string>={draft:'Brouillon',in_progress:'En cours',finalized:'Finalisé'};
export function rhPublicDraft(stored:RhDraft&Record<string,unknown>):RhDraft{
 const {_workflow,_deletedAt,_deletedBy,...draft}=stored;
 return draft as RhDraft;
}
/** Older documents predate explicit workflow metadata; infer their status from the saved snapshot. */
export function rhDocumentStatus(stored:RhDraft&{_workflow?:RhDocumentStatus},files:RhPayrollSource[],snapshot?:RhSnapshot):RhDocumentStatus{
 if(['draft','in_progress','finalized'].includes(stored._workflow||''))return stored._workflow!;
 if(snapshot){
  const shape=(d:RhDraft)=>JSON.stringify({name:d.name,clientId:d.clientId,periods:d.periods,payments:rhCompletePaymentSlots(d)});
  const sources=(rows:RhPayrollSource[])=>JSON.stringify(rows.map(p=>({id:p.id,sha256:p.sha256,agentId:p.agentId,month:p.month,employerCostCents:p.employerCostCents,netBeforeTaxCents:p.netBeforeTaxCents,confirmed:p.confirmed})).sort((a,b)=>a.id.localeCompare(b.id)));
  const expected=rhExpected(stored),selected=files.filter(p=>p.confirmed&&expected.some(e=>e.agentId===p.agentId&&e.month===p.month));
  if(shape(stored)===shape({name:snapshot.name,clientId:snapshot.client.id,periods:snapshot.periods,payments:snapshot.payments})&&sources(selected)===sources(snapshot.payroll))return 'finalized';
 }
 return stored.periods.length||files.length?'in_progress':'draft';
}
