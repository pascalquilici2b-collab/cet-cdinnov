"use client";
import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Workspace, Project } from "@/lib/budget-model";
import { currency } from "@/lib/budget-model";
import { annualWindow, clientForecast, forecastYears } from "@/lib/client-forecast";
import { prepareAccountingDownload } from "@/lib/accounting-export";
import { downloadBudget } from "@/lib/budget-export";
export default function BudgetExport({workspace,project,initialYear}:{workspace:Workspace;project:Project;initialYear?:number}){
 const [open,setOpen]=useState(false),[year,setYear]=useState(initialYear??new Date().getFullYear()+1),[error,setError]=useState("");
 const years=[...new Set([...forecastYears(workspace,project),new Date().getFullYear()+1,year])].sort((a,b)=>a-b);
 const prepared=useMemo(()=>{if(!open)return null;try{return {forecast:clientForecast(workspace,project,annualWindow(year))}}catch(err){return {error:(err as Error).message}}},[open,workspace,project,year]);
 const forecast=prepared?.forecast;
 const [file,setFile]=useState<{href:string;filename:string}|null>(null);
 useEffect(()=>{let cancelled=false;setFile(null);if(open){setError("");prepareAccountingDownload(workspace,project,annualWindow(year)).then(result=>{if(!cancelled)setFile(result)}).catch(err=>{if(!cancelled)setError(err.message)})}return()=>{cancelled=true}},[open,workspace,project,year]);
 return <><Button className="export-budget-button" onClick={()=>{setYear(initialYear??new Date().getFullYear()+1);setError("");setOpen(true)}}><span className="xls-icon" aria-hidden="true"><FileSpreadsheet/><span>XLS</span></span>Exporter le budget prévisionnel</Button>
 <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Budget prévisionnel pour la comptabilité</DialogTitle><DialogDescription>{project.acronym} · {project.jems?.projectId}</DialogDescription></DialogHeader>
 <label className="grid gap-2 text-sm font-medium">Année à présenter<select className="timeline-field" aria-label="Année de l’export client" value={year} onChange={e=>setYear(+e.target.value)}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
 {forecast&&<><div className="forecast-summary"><div><span>Prestations et coûts prévus</span><strong>{currency(forecast.totals.amount)}</strong></div><div><span>FEDER lié aux coûts · {project.federRate} %</span><strong>{currency(forecast.totals.feder)}</strong></div><div><span>Recettes FEDER {year}</span><strong>{forecast.undatedReceiptCount&&!forecast.receiptTotal?"À dater":currency(forecast.receiptTotal)}</strong></div></div>
 <div className="forecast-checks">{forecast.unsettled>0&&<p>{forecast.unsettled} code(s) proposé(s) à confirmer, identifiés dans l’export.</p>}{forecast.undatedReceiptCount>0&&<p>{forecast.undatedReceiptCount} versement(s) sans date : à renseigner dans « DR & recettes ».</p>}{forecast.unplanned.length>0&&<p>{forecast.unplanned.length} ligne(s) sans calendrier complet, listées dans « À compléter ».</p>}{forecast.warnings.map(w=><p key={w} role="alert">{w}</p>)}{!forecast.entries.length&&<p>Aucune prestation positionnée dans cette année.</p>}</div></>}
 {(error||prepared?.error)&&<p role="alert" className="text-sm text-destructive">{error||prepared?.error}</p>}
 <div className="export-structure"><strong>BP par comptes</strong><span>Rattachements des prestations</span><span>Financement FEDER</span><span>À compléter</span></div><DialogFooter><Button variant="ghost" onClick={()=>{try{downloadBudget(workspace,project)}catch(err){setError((err as Error).message)}}}>Budget complet</Button><Button variant="outline" onClick={()=>setOpen(false)}>Fermer</Button>{file?<Button asChild className="export-budget-button"><a href={file.href} download={file.filename}><FileSpreadsheet/>Télécharger le BP {year}</a></Button>:<Button disabled>Télécharger la prévision {year}</Button>}</DialogFooter>
 </DialogContent></Dialog></>;
}
