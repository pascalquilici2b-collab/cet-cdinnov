export type Activity={state:'active'|'inactive'|'unknown';startDate:string;endDate:string;reason:string};
export type ProjectDates={startDate?:string;endDate?:string;archived?:boolean};
export const activityToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date());
export function projectActivity(p:ProjectDates,today=activityToday()):Activity{
 const startDate=p.startDate||'',endDate=p.endDate||'';
 if(p.archived)return {state:'inactive',startDate,endDate,reason:'Projet archivé'};
 if(!startDate||!endDate)return {state:'unknown',startDate,endDate,reason:'Renseignez les dates de début et de fin du projet.'};
 return {state:startDate<=today&&today<=endDate?'active':'inactive',startDate,endDate,reason:today<startDate?'Le projet n’a pas encore démarré.':today>endDate?'La date de fin du projet est dépassée.':'Projet en cours'};
}
type MarketDates={orders?:{date:string;reference?:string}[];linkedEngagements?:{kind:string;date:string;reference:string}[];status?:string;startBasis?:string;startDate?:string;notificationDate?:string;initialDurationMonths?:number|null;periods?:{status:string;startDate:string;endDate:string}[];projects?:{orders?:{date:string;reference?:string}[]}[]};
export function marketActivity(m:MarketDates,today=activityToday()):Activity{
 if(m.status==='archived')return {state:'inactive',startDate:'',endDate:'',reason:'Marché archivé'};
 const startDate=m.startBasis==='notification'?m.notificationDate||'':m.startBasis==='first_order'?[...(m.orders||[]),...(m.projects||[]).flatMap(p=>p.orders||[]),...(m.linkedEngagements||[]).filter(e=>e.kind==='order')].filter(o=>o.date&&o.reference).map(o=>o.date).sort()[0]||'':m.startDate||'';
 let endDate='';
 if(startDate&&m.initialDurationMonths){const [y,month,day]=startDate.split('-').map(Number),target=new Date(Date.UTC(y,month-1+m.initialDurationMonths,1)),last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(day,last));target.setUTCDate(target.getUTCDate()-1);endDate=target.toISOString().slice(0,10);}
 const periods=(m.periods||[]).filter(p=>p.status==='validated'&&p.startDate&&p.endDate);
 const ranges=[...(startDate&&endDate?[{startDate,endDate}]:[]),...periods];
 if(!ranges.length)return {state:'unknown',startDate,endDate,reason:'Dates du marché à compléter ou période à valider.'};
 const current=ranges.find(p=>p.startDate<=today&&today<=p.endDate),first=ranges.map(p=>p.startDate).sort()[0],last=ranges.map(p=>p.endDate).sort().at(-1)!;
 return {state:current?'active':'inactive',startDate:current?.startDate||first,endDate:current?.endDate||last,reason:current?'Période d’exécution en cours':today>last?'La date de fin du marché est dépassée.':today<first?'Le marché n’a pas encore démarré.':'Aucune période d’exécution en cours.'};
}
