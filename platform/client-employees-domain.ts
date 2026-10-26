export interface ClientAllocation {id:string;projectId:string;project:string;projectCode:string;programme:string;percent:string;startDate:string;endDate:string;tasks:string;}
export interface ClientEmployee {id:string;name:string;role:string;supervisor:string;allocations:ClientAllocation[];}
export interface ClientPaymentMonth {employeeId:string;month:string;employerCost:string;mandate:string;paymentDate:string;paidAmount:string;organism:string;contributions:string;contributionDate:string;}
export interface ClientEmployeeSpace {version:number;agents:ClientEmployee[];payments:ClientPaymentMonth[];documents:{id:string;employeeId:string;filename:string;kind:'mission'|'payment';createdAt:string;snapshot:unknown}[];}
const fail=(text:string):never=>{throw Object.assign(Error(text),{status:422});};
const id=(v:unknown)=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
const date=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function normalizeClientEmployees(value:unknown):ClientEmployee[]{
 if(!Array.isArray(value)||value.length>200)fail('Liste de salariés invalide (200 maximum).');
 const seen=new Set();return (value as any[]).map(agent=>{
  if(!agent||!id(agent.id)||seen.has(agent.id))fail('Identifiant de salarié invalide.');seen.add(agent.id);
  for(const key of ['name','role','supervisor'])if(typeof agent[key]!=='string'||agent[key].length>200)fail('Vérifiez le nom, la fonction et le responsable.');
  if(!agent.name.trim()||!Array.isArray(agent.allocations)||agent.allocations.length>50)fail('Nom du salarié ou affectations invalides.');
  const ids=new Set();const allocations:ClientAllocation[]=agent.allocations.map((a:any)=>{
   if(!a||!id(a.id)||ids.has(a.id))fail('Affectation invalide.');ids.add(a.id);
   for(const key of ['projectId','project','projectCode','programme','percent','startDate','endDate','tasks'])if(typeof a[key]!=='string'||a[key].length>(key==='tasks'?6000:300))fail('Affectation invalide.');
   if(!a.project.trim()||!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(a.percent)||Number(a.percent.replace(',','.'))<=0||Number(a.percent.replace(',','.'))>100||!date(a.startDate)||!date(a.endDate)||a.endDate<a.startDate)fail('Renseignez le projet, les dates et un pourcentage entre 0 et 100.');
   return Object.fromEntries(['id','projectId','project','projectCode','programme','percent','startDate','endDate','tasks'].map(k=>[k,a[k].trim()])) as unknown as ClientAllocation;
  });
  for(const a of allocations){const total=allocations.filter(b=>b.startDate<=a.startDate&&a.startDate<=b.endDate).reduce((n,b)=>n+Math.round(Number(b.percent.replace(',','.'))*100),0);if(total>10000)fail('Les affectations de '+agent.name+' dépassent 100 % sur une même période.');}
  return {id:agent.id,name:agent.name.trim(),role:agent.role.trim(),supervisor:agent.supervisor.trim(),allocations};
 });
}
export function normalizeClientPayments(input:unknown,agents:ClientEmployee[]):ClientPaymentMonth[]{
 if(!Array.isArray(input)||input.length>2400)fail('Documents de paiement invalides.');
 const seen=new Set<string>();return (input as ClientPaymentMonth[]).map(p=>{
  if(!p||!agents.some(a=>a.id===p.employeeId)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month)||seen.has(p.employeeId+':'+p.month))fail('Salarié ou mois invalide.');seen.add(p.employeeId+':'+p.month);
  for(const key of ['employerCost','mandate','paymentDate','paidAmount','organism','contributions','contributionDate'] as const)if(typeof p[key]!=='string'||p[key].length>200)fail('Données de paiement invalides.');
  for(const key of ['employerCost','paidAmount','contributions'] as const)if(p[key]&&!/^\d{1,9}([.,]\d{1,2})?$/.test(p[key]))fail('Montant de paiement invalide.');
  for(const key of ['paymentDate','contributionDate'] as const)if(p[key]&&!date(p[key]))fail('Date de paiement invalide.');
  return Object.fromEntries(['employeeId','month','employerCost','mandate','paymentDate','paidAmount','organism','contributions','contributionDate'].map(k=>[k,(p as any)[k].trim()])) as unknown as ClientPaymentMonth;
 });
}
