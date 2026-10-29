import {saveBusinessDocument} from './business-schema.mjs';
import type {Database} from './contracts';
const monthIndex=(date:string)=>Number(date.slice(0,4))*12+Number(date.slice(5,7))-1;
export function accrueEmployeeLeave(employee:Record<string,any>,today:string){
 const next=employee.cpAccrualNext,rate=employee.cpAccrualRate;
 if(typeof next!=='string'||!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(next)||typeof rate!=='number'||rate<=0||rate>3||employee.statut!=='Actif'||next>today)return employee;
 const count=monthIndex(today)-monthIndex(next)+1;if(count<=0||count>120)return employee;
 const date=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),1)).toISOString().slice(0,10);
 const entries=Array.from({length:count},(_,i)=>({date:new Date(Date.UTC(Number(next.slice(0,4)),Number(next.slice(5,7))-1+i,1)).toISOString().slice(0,10),days:rate}));
 return {...employee,cpEnCours:Math.round((Number(employee.cpEnCours||0)+rate*count)*100)/100,cpAccrualNext:date,cpAccrualHistory:[...(employee.cpAccrualHistory||[]),...entries]};
}
/** Monthly payroll credits: explicit start date, Paris calendar, optimistic atomic write. */
export async function accrueLeave(db:Database,now=new Date()){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 for(let attempt=0;attempt<3;attempt++){
  const due=await db.prepare("SELECT 1 AS n FROM app_portal_workspace,json_each(payload,'$.salaries') s WHERE app_portal_workspace.id='shared' AND json_extract(s.value,'$.cpAccrualNext')<=? AND json_extract(s.value,'$.cpAccrualRate')>0 AND json_extract(s.value,'$.statut')='Actif' LIMIT 1").bind(today).first();if(!due)return;
  const row=await db.prepare("SELECT version,payload FROM app_portal_workspace WHERE id='shared'").first<{version:number;payload:string}>();if(!row)return;
  const before=JSON.parse(row.payload),salaries=before.salaries.map((s:Record<string,any>)=>accrueEmployeeLeave(s,today));if(salaries.every((s:unknown,i:number)=>s===before.salaries[i]))return;
  if(await saveBusinessDocument(db,'portal',before,{...before,salaries},row.version,'system:leave-accrual')!==null)return;
 }
}
