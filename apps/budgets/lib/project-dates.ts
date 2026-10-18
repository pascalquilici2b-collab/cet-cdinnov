import type { Project } from "./budget-model.ts";
export const PROJECT_DURATIONS=[12,18,24,30,36,42,48] as const;
export function addCalendarMonths(date:string,months:number):string{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("Date de démarrage invalide.");
  const d=new Date(date+"T00:00:00Z");
  if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==date)throw new Error("Date de démarrage invalide.");
  const target=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+months,1));
  const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(),last));
  return target.toISOString().slice(0,10);
}
export function projectEnd(start:string,months:number){
  if(!PROJECT_DURATIONS.includes(months as typeof PROJECT_DURATIONS[number]))throw new Error("Choisissez une durée de 12 à 48 mois, par tranche de 6 mois.");
  const next=new Date(addCalendarMonths(start,months)+"T00:00:00Z");
  next.setUTCDate(next.getUTCDate()-1);
  return next.toISOString().slice(0,10);
}
export function projectDuration(p:Pick<Project,"start"|"end"|"durationMonths">){
  if(p.durationMonths)return p.durationMonths;
  return PROJECT_DURATIONS.find(n=>projectEnd(p.start,n)===p.end)||36;
}
export const fullDate=(date:string)=>date?date.split("-").reverse().join("/"):"—";
