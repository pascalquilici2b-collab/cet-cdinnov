"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PROJECT_DURATIONS, fullDate, projectDuration, projectEnd } from "@/lib/project-dates";
import { projectPeriods, type Project } from "@/lib/budget-model";
export function ProjectDatesFields({start="",duration=36}:{start?:string;duration?:number}){
 const [date,setDate]=useState(start),[months,setMonths]=useState(duration);
 let end="";try{if(date)end=projectEnd(date,months)}catch{}
 return <><label className="grid gap-1.5 text-sm font-medium">Date de démarrage<input className="timeline-field" aria-label="Date de démarrage" name="start" type="date" required value={date} onInput={e=>setDate(e.currentTarget.value)} onChange={e=>setDate(e.target.value)}/></label><label className="grid gap-1.5 text-sm font-medium">Durée du projet<select className="timeline-field" aria-label="Durée du projet" name="durationMonths" value={months} onChange={e=>setMonths(+e.target.value)}>{PROJECT_DURATIONS.map(n=><option key={n} value={n}>{n} mois</option>)}</select></label><label className="grid gap-1.5 text-sm font-medium">Date de fin de projet<output className="timeline-field computed-end" aria-label="Date de fin de projet">{fullDate(end)}</output><input type="hidden" name="end" value={end}/></label></>;
}
export default function ProjectDates({project,onChange}:{project:Project;onChange:(patch:Partial<Project>)=>void}){
 const [error,setError]=useState("");
 return <section className="project-date-settings"><h3>Dates du projet</h3><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const start=String(f.get("start")),durationMonths=Number(f.get("durationMonths")),end=projectEnd(start,durationMonths);onChange({start,end,durationMonths,periods:projectPeriods(start,end)});setError("")}catch(err){setError((err as Error).message)}}}><div className="grid gap-4 py-5 sm:grid-cols-3"><ProjectDatesFields key={project.start+project.end} start={project.start} duration={projectDuration(project)}/></div>{error&&<p role="alert" className="mb-3 text-destructive">{error}</p>}<Button type="submit">Enregistrer les dates</Button></form></section>;
}
