import type {ClientEmployee} from './client-employees-domain';

export interface RhClient {id:string;name:string;logoData?:string;siret?:string;}
export interface RhProject {id:string;name:string;code:string;programme:string;clientIds:string[];marketId:string;marketVersion?:number;logoData?:string;}
export interface RhMember {agentId:string;rateBasisPoints:number|null;}
export interface RhPeriod {id:string;projectId:string;startDate:string;endDate:string;agents:RhMember[];}
export interface RhPaymentEntry {id:string;agentId:string;month:string;kind:'salary'|'contribution';organism:string;amountCents:number|null;date:string;reference:string;}
export interface RhDraft {name:string;clientId:string;periods:RhPeriod[];payments?:RhPaymentEntry[];}
export interface RhPayrollSource {id:string;agentId:string;month:string;filename:string;sha256:string;objectKey:string;employerCostCents:number|null;netBeforeTaxCents:number|null;reading:any;confirmed:boolean;identityReason?:string;reviewedBy?:string;reviewedAt?:string;createdAt:string;}
export interface RhLine {id:string;periodId:string;agentId:string;projectId:string;month:string;employerCostCents:number;netBeforeTaxCents:number|null;rateBasisPoints:number;allocatedCents:number;payrollId:string;}
export interface RhSnapshot {id:string;documentId:string;revision:number;name:string;client:RhClient;projects:RhProject[];periods:RhPeriod[];agents:ClientEmployee[];lines:RhLine[];payroll:RhPayrollSource[];payments?:RhPaymentEntry[];createdAt:string;createdBy:string;}
export interface RhImportedPayment {id?:string;agentId:string;month:string;kind:'salary'|'contribution';organism:string;amountCents:number;date:string;reference:string;}
export interface RhReturnInspection {payments:RhImportedPayment[];issues:string[];complete:boolean;}
export interface RhDocument {id:string;version:number;draft:RhDraft;createdAt:string;updatedAt:string;payroll:RhPayrollSource[];versions:{id:string;revision:number;createdAt:string}[];}
export function rhFail(message:string,status=422):never{throw Object.assign(new Error(message),{status});}
export const rhId=(value:unknown):value is string=>typeof value==='string'&&/^[-\w]{1,80}$/.test(value);
export const rhDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export const rhMonth=(v:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const rhMonthEnd=(m:string)=>new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).toISOString().slice(0,10);
export function rhMonths(p:Pick<RhPeriod,'startDate'|'endDate'>){const months:string[]=[];let cursor=p.startDate.slice(0,7);while(cursor<=p.endDate.slice(0,7)&&months.length<=120){months.push(cursor);const d=new Date(cursor+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);cursor=d.toISOString().slice(0,7);}if(months.length>120)rhFail('La période dépasse dix ans.');return months;}
export function normalizeRhDraft(value:any):RhDraft{
 if(!value||typeof value.name!=='string'||!value.name.trim()||value.name.length>180||!rhId(value.clientId)||!Array.isArray(value.periods)||value.periods.length>50)rhFail('Renseignez le client et le nom du document.');
 const ids=new Set(),pairs=new Set();const periods:RhPeriod[]=value.periods.map((p:any)=>{
  if(!p||!rhId(p.id)||ids.has(p.id)||!rhId(p.projectId)||typeof p.startDate!=='string'||typeof p.endDate!=='string'||!rhDate(p.startDate)||!rhDate(p.endDate)||p.endDate<p.startDate||!Array.isArray(p.agents)||p.agents.length>200)rhFail('Vérifiez les projets et leurs périodes.');ids.add(p.id);
  if(p.startDate.slice(-2)!=='01'||p.endDate!==rhMonthEnd(p.endDate.slice(0,7)))rhFail('Choisissez des mois complets. Les mois partiels nécessitent une ventilation distincte.');
  const members=new Set();const agents:RhMember[]=p.agents.map((a:any)=>{if(!a||!rhId(a.agentId)||members.has(a.agentId)||a.rateBasisPoints!==null&&(!Number.isInteger(a.rateBasisPoints)||a.rateBasisPoints<0||a.rateBasisPoints>10000))rhFail('Vérifiez les agents et les taux.');members.add(a.agentId);return {agentId:a.agentId,rateBasisPoints:a.rateBasisPoints};});
  for(const month of rhMonths(p))for(const a of agents){const k=[a.agentId,p.projectId,month].join('|');if(pairs.has(k))rhFail('Un agent apparaît deux fois sur le même projet et le même mois.');pairs.add(k);if(pairs.size>12000)rhFail('Le document dépasse 12 000 lignes RH. Réduisez sa période.');}
  return {id:p.id,projectId:p.projectId,startDate:p.startDate,endDate:p.endDate,agents};
 });const normalized:RhDraft={name:value.name.trim(),clientId:value.clientId,periods};rhExpected(normalized);if(value.payments!==undefined){if(!Array.isArray(value.payments)||value.payments.length>6000)rhFail('La liste des paiements est invalide.');normalized.payments=normalizeRhPayments(rhCompletePaymentSlots({...normalized,payments:value.payments}),periods);}return normalized;
}
/** Partial financial entry is allowed; an empty amount must never become zero. */
export function normalizeRhPayments(value:unknown,periods:RhPeriod[]):RhPaymentEntry[]{
 if(!Array.isArray(value)||value.length>6000)rhFail('La liste des paiements est invalide.');
 const months=new Set(periods.flatMap(p=>rhMonths(p))),agents=new Set(periods.flatMap(p=>p.agents.flatMap(a=>rhMonths(p).map(month=>a.agentId+'|'+month)))),ids=new Set<string>();
 return value.map((p:any)=>{
  if(!p||!rhId(p.id)||ids.has(p.id)||typeof p.agentId!=='string'||p.agentId!==''&&!agents.has(p.agentId+'|'+p.month)||!rhMonth(p.month||'')||!months.has(p.month)||!['salary','contribution'].includes(p.kind))rhFail('Un paiement ne correspond pas aux agents et mois du document.');
  if(p.amountCents!==null&&(!Number.isSafeInteger(p.amountCents)||p.amountCents<0||p.amountCents>99999999999))rhFail('Renseignez un montant de paiement positif ou laissez-le vide.');
  if(typeof p.date!=='string'||p.date!==''&&!rhDate(p.date)||typeof p.organism!=='string'||p.organism.length>200||typeof p.reference!=='string'||p.reference.length>300)rhFail('Vérifiez la date, l’organisme et la référence du paiement.');
  ids.add(p.id);return {id:p.id,agentId:p.agentId,month:p.month,kind:p.kind,organism:p.organism.trim(),amountCents:p.amountCents,date:p.date,reference:p.reference.trim()};
 });
}
export function rhDefaultPayments({periods}:Pick<RhDraft,'periods'>):RhPaymentEntry[]{
 const months=[...new Set(periods.flatMap(p=>{try{return rhDate(p.startDate)&&rhDate(p.endDate)&&p.startDate<=p.endDate?rhMonths(p):[];}catch{return [];}}))].sort();
 if(months.length>1200)rhFail('Le document dépasse 6 000 emplacements de paiement. Réduisez sa période.');
 return months.flatMap(month=>[{id:`payment-${month}-salary`,agentId:'',month,kind:'salary' as const,organism:'',amountCents:null,date:'',reference:''},...Array.from({length:4},(_,i)=>({id:`payment-${month}-contribution-${i+1}`,agentId:'',month,kind:'contribution' as const,organism:'',amountCents:null,date:'',reference:''}))]);
}
export function rhCompletePaymentSlots(draft:Pick<RhDraft,'periods'|'payments'>):RhPaymentEntry[]{
 const defaults=rhDefaultPayments(draft),months=new Set(defaults.map(p=>p.month)),agentMonths=new Set(draft.periods.flatMap(p=>{try{return p.agents.flatMap(a=>rhMonths(p).map(month=>a.agentId+'|'+month));}catch{return [];}}));
 // Only empty placeholders can disappear after a period/assignment change.
 const payments=(draft.payments||[]).filter(p=>!p||p.amountCents!==null||p.organism!==''||p.date!==''||p.reference!==''||months.has(p.month)&&(p.agentId===''||agentMonths.has(p.agentId+'|'+p.month)));
 const ids=new Set(payments.filter(Boolean).map(p=>p.id)),groups=new Map<string,RhPaymentEntry[]>(),counts=new Map<string,number>();
 for(const p of payments)if(p&&p.agentId===''){const key=p.month+'|'+p.kind;counts.set(key,(counts.get(key)||0)+1);}
 for(const p of defaults){const key=p.month+'|'+p.kind;groups.set(key,[...(groups.get(key)||[]),p]);}
 for(const [key,slots] of groups){let count=counts.get(key)||0;while(count<slots.length){const entry=slots.find(p=>!ids.has(p.id))||slots[0];let id=entry.id,suffix=1;while(ids.has(id))id=entry.id+'-shared-'+suffix++;ids.add(id);payments.push({...entry,id});count++;}}
 return payments;
}
/** An individual payment replaces the shared entries of the same kind, never adds to them. */
export function rhPaymentsForAgent(payments:RhPaymentEntry[],agentId:string,month:string):RhPaymentEntry[]{
 return (['salary','contribution'] as const).flatMap(kind=>{const selected=payments.filter(p=>p.month===month&&p.kind===kind),individual=selected.filter(p=>p.agentId===agentId&&agentId!=='');return individual.length?individual:selected.filter(p=>p.agentId==='');});
}
export function rhExpected(draft:RhDraft){const seen=new Map<string,{agentId:string;month:string}>();for(const p of draft.periods)for(const a of p.agents)for(const month of rhMonths(p)){seen.set(a.agentId+'|'+month,{agentId:a.agentId,month});if(seen.size>1200)rhFail('Le document dépasse 1 200 mois de salaire. Réduisez sa période.');}return [...seen.values()];}
export function rhValidateReferences(draft:RhDraft,projects:RhProject[],agents:ClientEmployee[]){for(const p of draft.periods){if(!projects.some(x=>x.id===p.projectId&&x.clientIds.includes(draft.clientId)))rhFail('Un projet ne dépend pas du client sélectionné.');for(const a of p.agents)if(!agents.some(x=>x.id===a.agentId))rhFail('Un agent ne dépend pas du client sélectionné.');}}
export function rhIssues(draft:RhDraft,payroll:RhPayrollSource[],agents:ClientEmployee[]):string[]{
 const issues:string[]=[];if(!draft.periods.length)issues.push('Ajoutez un projet.');for(const p of draft.periods){if(!p.agents.length)issues.push('Affectez un agent à chaque projet.');if(p.agents.some(a=>a.rateBasisPoints===null))issues.push('Renseignez tous les taux.');}
 for(const item of rhExpected(draft)){
  const person=agents.find(a=>a.id===item.agentId),files=payroll.filter(p=>p.confirmed&&p.agentId===item.agentId&&p.month===item.month);
  if(files.length!==1||files[0].employerCostCents===null)issues.push(`${person?.name||'Agent'} · ${item.month} : bulletin à vérifier.`);
  const selected=new Map<string,number>();for(const p of draft.periods)if(rhMonths(p).includes(item.month)){const a=p.agents.find(x=>x.agentId===item.agentId);if(a?.rateBasisPoints!==null&&a?.rateBasisPoints!==undefined)selected.set(p.projectId,a.rateBasisPoints);}
  // Existing dated assignments on other projects count too. The same project is not counted twice.
  const historical=new Map<string,number>();for(const a of person?.allocations||[])if(a.startDate<=rhMonthEnd(item.month)&&a.endDate>=item.month+'-01'&&!selected.has(a.projectId))historical.set(a.projectId,Math.max(historical.get(a.projectId)||0,Math.round(Number(a.percent.replace(',','.'))*100)));
  if([...selected.values(),...historical.values()].reduce((a,b)=>a+b,0)>10000)issues.push(`${person?.name||'Agent'} · ${item.month} : affectations supérieures à 100 %.`);
 }return [...new Set(issues)];
}
export function rhLines(draft:RhDraft,payroll:RhPayrollSource[]):RhLine[]{const lines:RhLine[]=[];for(const p of draft.periods)for(const a of p.agents)for(const month of rhMonths(p)){const file=payroll.find(f=>f.confirmed&&f.agentId===a.agentId&&f.month===month);if(!file||file.employerCostCents===null||a.rateBasisPoints===null)rhFail('Bulletins et taux incomplets.');const cost=file.employerCostCents;lines.push({id:[p.id,a.agentId,month].join(':'),periodId:p.id,agentId:a.agentId,projectId:p.projectId,month,employerCostCents:cost,netBeforeTaxCents:file.netBeforeTaxCents,rateBasisPoints:a.rateBasisPoints,allocatedCents:Math.round(cost*a.rateBasisPoints/10000),payrollId:file.id});}return lines;}
