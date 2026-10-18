"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/budget-model";
import { currency } from "@/lib/budget-model";
export default function ProjectFunding({project,onChange}:{project:Project;onChange:(patch:Partial<Project>)=>void}){
 const [error,setError]=useState("");
 return <section className="project-date-settings"><h3>Financement FEDER</h3><form className="mt-4 flex flex-wrap items-end gap-5" onSubmit={e=>{e.preventDefault();const rate=Number(new FormData(e.currentTarget).get("federRate"));if(!Number.isFinite(rate)||rate<0||rate>100){setError("Le taux doit être compris entre 0 et 100 %.");return}onChange({federRate:rate});setError("")}}>
  <label className="grid gap-2 text-sm">Taux FEDER du projet (%)<input key={project.id+":"+project.federRate} className="timeline-field max-w-48" type="number" step="0.01" min="0" max="100" name="federRate" defaultValue={project.federRate} required/></label>
  <div className="grid gap-2 text-sm text-muted-foreground"><span>Dotation FEDER</span><strong className="text-lg text-foreground">{currency(project.eligibleBudget*project.federRate/100)}</strong></div>
  <Button type="submit" variant="outline">Enregistrer le taux FEDER</Button>
 </form>{error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}</section>;
}
