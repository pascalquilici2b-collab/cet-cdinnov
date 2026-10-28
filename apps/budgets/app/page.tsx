"use client";
import {BrandMark,Loading} from '../../../platform/client/loading';
import {csvCell} from '../../../platform/csv-export';

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, CalendarRange, CircleEuro, FileDown, FolderKanban, LayoutDashboard,
  Plus, Upload, ReceiptText, Save, Settings, AlertTriangle, Check, Trash2, FileSpreadsheet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { Project, DR, Workspace } from "@/lib/budget-model";
import BudgetChronogram from "./budget-chronogram";
import BudgetExport from "./budget-export";
import JemsImport from "./jems-import";
import PartnerReports from "./partner-reports";
import DRReceipts from "./dr-receipts";
import PendingExpensesBadge from "./pending-expenses-badge";
import {setAdvanceRecovery} from "@/lib/advance-recovery";
import {forecastYears} from "@/lib/client-forecast";
import {projectReceipts} from "@/lib/project-receipts";
import ProjectDates, { ProjectDatesFields } from "./project-dates";
import { recalendarPlanning } from "@/lib/timeline";
import AccountReference from "./account-reference";
import { fullDate, projectEnd } from "@/lib/project-dates";
import jemsLogo from "./assets/jems-logo.png?url";
import ClientDirectory, { ClientLogo } from "./client-directory";
import ProjectPicker from "./project-picker";
import ProjectBranding, { ProjectLogo } from "./project-branding";
import ProjectFullscreen from "./project-fullscreen";
import ProjectFunding from "./project-funding";
import { projectPeriods as periods } from "@/lib/budget-model";
import { emptyWorkspace, localStorageApi, type WorkspaceStorage } from "@/lib/workspace-storage";
import { restoreJemsLabels } from "@/lib/jems-labels";

const uid = () => Math.random().toString(36).slice(2,10);
const euro = new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0});
const money = (n:number) => euro.format(Number.isFinite(n)?n:0);
const shortDate = (d?:string) => d ? new Intl.DateTimeFormat("fr-FR",{month:"short",year:"numeric"}).format(new Date(d+"T00:00:00")) : "—";
const norm = (v:unknown) => String(v??"").trim();
const num = (v:unknown) => typeof v==="number" ? v : Number(String(v??"0").replace(/\s/g,"").replace(",",".").replace(/[^0-9.-]/g,""))||0;

const demo:Workspace = {
  demo:true,
  clients:[
    {id:"cci",name:"CCI – exemple de démonstration",accounts:[{code:"622680",label:"Honoraires et prestations"},{code:"625111",label:"Missions et déplacements"},{code:"641100",label:"Rémunérations"}]},
    {id:"cab",name:"Collectivité – exemple",accounts:[{code:"611",label:"Prestations extérieures"},{code:"6251",label:"Voyages et déplacements"}]}
  ],
  projects:[
    {id:"via",clientId:"cci",acronym:"VIA MARE",name:"Projet de démonstration",start:"2025-02-01",end:"2029-01-31",periods:periods("2025-02-01","2029-01-31"),eligibleBudget:100000,federRate:80,
      advance:{requested:true,received:true,rate:25,receivedDate:"2025-04-15",recoveryPeriod:"P4",firstRecoveryRate:60},
      rules:{realRate:80,hrMode:"forfait",hrRate:20,missionMode:"forfait",missionRate:15,officeMode:"forfait",officeRate:15}},
    {id:"epic",clientId:"cab",acronym:"EPIC",name:"Économie circulaire – démonstration",start:"2025-03-01",end:"2027-08-31",periods:periods("2025-03-01","2027-08-31"),eligibleBudget:180000,federRate:80,
      advance:{requested:false,received:false,rate:25,recoveryPeriod:"P4",firstRecoveryRate:60},
      rules:{realRate:80,hrMode:"réel",hrRate:0,missionMode:"réel",missionRate:0,officeMode:"forfait",officeRate:15}}
  ],
  budgetLines:[
    {id:"b1",projectId:"via",externalKey:"JEMS-demo-12",category:"Expertise externe",description:"Assistance administrative et financière",amount:85000,allocations:{P1:10625,P2:10625,P3:10625,P4:10625,P5:10625,P6:10625,P7:10625,P8:10625},subExpenses:[],sourceVersion:1},
    {id:"b2",projectId:"via",externalKey:"JEMS-demo-24",category:"Expertise externe",description:"Événement final",amount:15000,allocations:{P7:5000,P8:10000},subExpenses:[{id:"s1",label:"Traiteur",amount:6500},{id:"s2",label:"Traduction",amount:3500},{id:"s3",label:"Communication",amount:5000}],sourceVersion:1},
    {id:"b3",projectId:"epic",externalKey:"JEMS-demo-7",category:"Expertise externe",description:"Benchmark et livre blanc",amount:40000,allocations:{P2:15000,P3:25000},subExpenses:[],sourceVersion:1}
  ],
  expenses:[
    {id:"e1",projectId:"via",budgetLineId:"b1",label:"Assistance – année 2026",vendor:"Cabinet Conseil",account:"622680",planned:30000,committed:30000,payments:[{id:"pay1",amount:15000,plannedDate:"2026-06-30",paidDate:"2026-07-08"},{id:"pay2",amount:15000,plannedDate:"2026-12-15"}],declaredPeriod:"P4"},
    {id:"e2",projectId:"via",budgetLineId:"b2",label:"Acompte traiteur",vendor:"Prestataire événementiel",account:"622680",planned:5000,committed:5000,payments:[{id:"pay3",amount:5000,plannedDate:"2026-11-20"}],declaredPeriod:"P4"}
  ],
  drs:[
    {id:"dr3",projectId:"via",periodId:"P3",certificateDate:"2026-11-15",receiptDate:"2027-02-15",recovery:0},
    {id:"dr4",projectId:"via",periodId:"P4",certificateDate:"2027-05-15",receiptDate:"2027-08-15",recovery:12000}
  ],
  imports:[{id:"imp1",projectId:"via",file:"Budget_JEMS_DEMO.xlsx",sheet:"Budget",range:"12:25",version:1,date:"2026-09-15",added:2,updated:0}]
};

function Field({label,name,type="text",defaultValue,required=false,min,step,className=""}:{label:string;name:string;type?:string;defaultValue?:string|number;required?:boolean;min?:number;step?:string;className?:string}){
  return <label className={`budget-field ${className}`}><span>{label}</span><input className="h-10 w-full min-w-0 rounded-lg border bg-white px-3 outline-none focus:ring-2 focus:ring-[#1786c9]/25" name={name} type={type} defaultValue={defaultValue} required={required} min={min} step={step}/></label>
}

export default function Home({storage=localStorageApi, embedded=false,openClientsInitially=false}:{storage?:WorkspaceStorage;embedded?:boolean;openClientsInitially?:boolean}={}){
  const [ws,setWs]=useState<Workspace>(storage.empty?emptyWorkspace:demo); const [loaded,setLoaded]=useState(false); const [saveState,setSaveState]=useState<"chargement"|"enregistré"|"enregistrement"|"erreur">("chargement");
  const [saveError,setSaveError]=useState("");
  const [reportPeriod,setReportPeriod]=useState("all");
  const [view,setView]=useState("projects"); const [projectId,setProjectId]=useState(""); const [year,setYear]=useState(2026);
  const [projectOpen,setProjectOpen]=useState(false); const [clientOpen,setClientOpen]=useState(openClientsInitially);
  const [importOpen,setImportOpen]=useState(false);
  const [importNew,setImportNew]=useState(false);
  const savedPayload=useRef("");const requestedPayload=useRef("");const saveQueue=useRef(Promise.resolve());const revision=useRef(0);
  const project=ws.projects.find(p=>p.id===projectId); const client=ws.clients.find(c=>c.id===project?.clientId);

  useEffect(()=>{
    let cancelled=false;
    storage.load().then(workspace=>{
      if(cancelled)return;const data=workspace||(storage.empty?emptyWorkspace:demo);savedPayload.current=JSON.stringify(data);requestedPayload.current=savedPayload.current;setWs(restoreJemsLabels(data));setLoaded(true);setSaveState("enregistré");
    }).catch(error=>{if(!cancelled){setSaveState("erreur");setSaveError(error.message)}});
    return()=>{cancelled=true};
  },[storage]);
  useEffect(()=>{
    if(!loaded)return;
    const payload=JSON.stringify(ws);if(payload===requestedPayload.current)return;
    requestedPayload.current=payload;
    const current=++revision.current;setSaveState("enregistrement");storage.dirty?.(true);
    const timer=setTimeout(()=>{
      saveQueue.current=saveQueue.current.catch(()=>{}).then(async()=>{
        await storage.save(JSON.parse(payload));
        savedPayload.current=payload;if(current===revision.current){setSaveState("enregistré");setSaveError("");storage.dirty?.(false)}
      }).catch(error=>{if(current===revision.current){requestedPayload.current="";setSaveState("erreur");setSaveError(error.message)}});
    },450);
    return()=>clearTimeout(timer);
  },[ws,loaded,storage]);
  useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(loaded&&JSON.stringify(ws)!==savedPayload.current){e.preventDefault();e.returnValue=""}};window.addEventListener("beforeunload",before);return()=>window.removeEventListener("beforeunload",before)},[ws,loaded]);

  const projectLines=ws.budgetLines.filter(x=>x.projectId===project?.id); const projectExpenses=ws.expenses.filter(x=>x.projectId===project?.id);
  const totalBudget=projectLines.reduce((s,x)=>s+x.amount,0); const committed=projectExpenses.reduce((s,x)=>s+x.committed,0);
  const paid=projectExpenses.flatMap(x=>x.payments).filter(x=>(x.paidDate||x.plannedDate).startsWith(String(year))).reduce((s,x)=>s+x.amount,0);
  const funding=useMemo(()=>project?projectReceipts(ws,project):undefined,[ws,project]);
  const receiptFor=(id:string)=>funding?.receipts.find(r=>r.period===id);
  const annualReceipts=funding?.receipts.filter(r=>r.date.startsWith(String(year))).reduce((s,r)=>s+r.net,0)||0;
  const pendingCount=funding?.receipts.reduce((n,r)=>n+r.pending,0)||0;
  const years=project?forecastYears(ws,project):[year];
  useEffect(()=>{
    const context=(document as unknown as {modelContext?:{registerTool:(tool:unknown,options?:unknown)=>void}}).modelContext;
    if(!context?.registerTool)return; const lifecycle=new AbortController();
    context.registerTool({name:"read_budget_summary",title:"Lire la synthèse budgétaire",description:"Retourne la synthèse du projet actuellement sélectionné.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({project:project?.acronym??null,budget:totalBudget,committed,year,paid,expectedReceipts:annualReceipts})},{signal:lifecycle.signal});
    context.registerTool({name:"open_budget_view",title:"Ouvrir une vue budgétaire",description:"Ouvre une vue de l’outil sans modifier les données.",inputSchema:{type:"object",properties:{view:{type:"string",enum:["dashboard","projects","budget","reports","dr","import","settings"]}},required:["view"],additionalProperties:false},annotations:{readOnlyHint:true},execute:(input:unknown)=>{const next=(input as {view?:string}).view;if(!next)throw new Error("Vue requise");setView(next==="import"?"budget":next);return {opened:next==="import"?"budget":next}}},{signal:lifecycle.signal});
    return()=>lifecycle.abort();
  },[project,year,totalBudget,committed,paid,annualReceipts]);

  function mutateProject(patch:Partial<Project>){if(!project)return;setWs(w=>{const current=w.projects.find(p=>p.id===project.id)!;const next={...current,...patch};return {...w,projects:w.projects.map(p=>p.id===project.id?next:p),budgetLines:patch.periods?w.budgetLines.map(b=>b.projectId===project.id?recalendarPlanning(b,current,next):b):w.budgetLines}})}
  function addProject(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const start=norm(f.get("start")),durationMonths=num(f.get("durationMonths")),end=projectEnd(start,durationMonths);if(end<start){const input=e.currentTarget.elements.namedItem("end") as HTMLInputElement;input.setCustomValidity("La fin doit être postérieure au début.");input.reportValidity();input.oninput=()=>input.setCustomValidity("");return;}const p:Project={id:uid(),clientId:norm(f.get("clientId")),acronym:norm(f.get("acronym")),name:norm(f.get("name")),start,end,durationMonths,periods:periods(start,end),eligibleBudget:num(f.get("budget")),federRate:num(f.get("federRate")),advance:{requested:false,received:false,rate:25,recoveryPeriod:"P4",firstRecoveryRate:60},rules:{realRate:80,hrMode:"réel",hrRate:20,missionMode:"réel",missionRate:15,officeMode:"réel",officeRate:15}};setWs(w=>({...w,demo:false,projects:[...w.projects,p]}));setProjectId(p.id);setView("budget");setProjectOpen(false)}
  function updateDR(periodId:string,patch:Partial<DR>){if(!project)return;setWs(w=>{const current=w.drs.find(d=>d.projectId===project.id&&d.periodId===periodId);return {...w,demo:false,drs:current?w.drs.map(d=>d.id===current.id?{...d,...patch}:d):[...w.drs,{id:uid(),projectId:project.id,periodId,recovery:0,...patch}]}})}
  function addAccount(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);setWs(w=>({...w,demo:false,clients:w.clients.map(c=>c.id===client?.id?{...c,accounts:[...c.accounts,{code:norm(f.get("code")),label:norm(f.get("label"))}]}:c)}));e.currentTarget.reset()}
  function exportCsv(){if(!project)return;const rows=[["Projet","Compte","Dépense","Prestataire","Prévu","Engagé","Payé","Année"],...projectExpenses.map(e=>[project.acronym,e.account,e.label,e.vendor,e.planned,e.committed,e.payments.filter(p=>(p.paidDate||p.plannedDate).startsWith(String(year))).reduce((s,p)=>s+p.amount,0),year])];const csv="\uFEFF"+rows.map(r=>r.map(csvCell).join(";")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=`budget-${project.acronym}-${year}.csv`;a.click();URL.revokeObjectURL(a.href)}

  const nav=[["budget","Budget & dépenses",FolderKanban],["reports","Rapports JEMS",FileSpreadsheet],["dashboard","Vue annuelle",LayoutDashboard],["dr","DR & recettes",ReceiptText]] as const;
  const goToProjects=()=>{setProjectId("");setView("projects")};
  if(!loaded&&saveState==="chargement")return <Loading label="Chargement des budgets…"/>;
  return <Tabs value={project?view:"projects"} onValueChange={setView} className={"app-shell"+(embedded?" embedded-budget":"")}>
    <header className="app-header no-print">
      <button className="brand" onClick={goToProjects} aria-label="CDInnov — tous les projets"><span className="brand-cd">CD</span>Innov<span className="brand-dot">.</span><span className="brand-product">Budget</span></button>
      <div className="header-status"><span role="status" className={"save-status "+(saveState==="erreur"?"save-error":"")}>{saveState==="enregistré"?<Check/>:saveState==="erreur"?<AlertTriangle/>:<BrandMark/>}{saveState==="enregistré"?"Enregistré":saveState==="enregistrement"?"Enregistrement…":saveState==="erreur"?"Non enregistré":"Chargement…"}</span></div>
    </header>
    <main className="app-main">
      {project&&<div className="project-context no-print">
        <div className="project-breadcrumb"><Button variant="ghost" onClick={goToProjects}><ArrowLeft/>Tous les projets</Button><span className="breadcrumb-separator">/</span><button className="client-identity" onClick={()=>setClientOpen(true)}><ClientLogo client={client}/><span>{client?.name}</span></button></div>
        <div className="project-title-row"><div className="project-identity"><ProjectLogo project={project}/><div><h1>{project.acronym}</h1>{project.jems?.projectId&&<div className="project-jems-id">{project.jems.projectId}</div>}<p>{project.name}</p></div></div><Button variant="outline" className="jems-import-button" disabled={!loaded} onClick={()=>{setImportNew(false);setImportOpen(true)}}><span className="jems-logo-box"><img src={jemsLogo} alt=""/></span><Upload aria-hidden="true"/>Importer le nouveau budget JEMS</Button></div>
        <div className="project-date-summary"><span><CalendarRange/>Date de démarrage : <strong>{fullDate(project.start)}</strong></span><span>Date de fin de projet : <strong>{fullDate(project.end)}</strong></span></div>
        <div className="project-navigation"><div className="project-main-actions"><TabsList variant="line" className="project-tabs">{nav.map(([id,label,Icon])=><TabsTrigger key={id} value={id}><Icon/>{label}{id==="reports"&&<PendingExpensesBadge count={pendingCount}/>}</TabsTrigger>)}</TabsList><BudgetExport workspace={ws} project={project} initialYear={view==="dashboard"?year:undefined}/></div><div className="project-utility-actions"><TabsList variant="line" className="project-settings-tabs"><TabsTrigger value="settings"><Settings/>Paramètres</TabsTrigger></TabsList><ProjectFullscreen/></div></div>
        {view==="dashboard"&&<div className="annual-year-choice"><Select value={String(year)} onValueChange={v=>setYear(Number(v))}><SelectTrigger aria-label="Année du budget" className="w-[110px] bg-white"><SelectValue/></SelectTrigger><SelectContent>{years.map(y=><SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div>}
      </div>}
      <div className="workspace-content">
        {saveState==="erreur"&&<div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm"><span>{saveError||"Impossible de charger vos données. Les modifications sont désactivées."}</span><div className="flex flex-wrap gap-2">{loaded&&<Button variant="outline" onClick={()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(ws,null,2)],{type:"application/json"}));a.download="budgets-projets-sauvegarde.json";a.click();URL.revokeObjectURL(a.href)}}>Télécharger ma copie</Button>}<Button variant="outline" onClick={()=>loaded?setWs(w=>({...w})):window.location.reload()}>Réessayer</Button>{loaded&&<Button variant="outline" onClick={()=>{if(window.confirm("Recharger la version partagée ? Téléchargez d’abord votre copie pour conserver vos modifications non enregistrées."))window.location.reload()}}>Recharger</Button>}</div></div>}

        {project&&<TabsContent value="dashboard" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[["Enveloppes JEMS",money(totalBudget),`${projectLines.length} lignes`],["Engagé",money(committed),`${totalBudget?Math.round(committed/totalBudget*100):0} % des enveloppes`],["Paiements "+year,money(paid),`${projectExpenses.length} dépenses suivies`],["Recettes attendues "+year,money(annualReceipts),"selon dates d’encaissement"]].map((x,i)=><section key={String(x[0])} className="rounded-2xl border bg-white p-5 shadow-[0_8px_30px_#173f4205]"><div className="text-sm text-[#687386]">{x[0]}</div><div className="num mt-3 text-3xl font-semibold tracking-tight">{x[1]}</div><div className="mt-2 text-xs text-[#687386]">{x[2]}</div>{i===1&&committed>totalBudget&&<div className="mt-3 flex items-center gap-1 text-xs font-semibold text-[#bd4a3e]"><AlertTriangle className="size-3"/>Dépassement autorisé à contrôler</div>}</section>)}
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
            <section className="rounded-2xl border bg-white p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Chronologie du projet</h2></div><span className="rounded-full bg-[#e9f4fc] px-3 py-1 text-xs">{shortDate(project.start)} → {shortDate(project.end)}</span></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{project.periods.map(p=>{const c=receiptFor(p.id)!;return <div key={p.id} className="rounded-xl border bg-[#f8fafc] p-3"><div className="flex items-center justify-between"><strong>{p.label}</strong>{c.gross>0&&<span className="size-2 rounded-full bg-[#c26a1a]"/>}</div><div className="mt-1 text-xs text-[#687386]">{shortDate(p.start)} – {shortDate(p.end)}</div><div className="num mt-3 text-sm font-semibold">{money(c.gross)}</div><div className="text-xs text-[#687386]">{c.certified?"FEDER certifié":"FEDER estimé"}</div></div>})}</div>
            </section>
            <section className="rounded-2xl bg-[#1d3f70] p-5 text-white"><div className="flex items-center gap-2 text-[#7cd4ef]"><CircleEuro className="size-5"/><strong>Recettes par période</strong></div><div className="mt-5 space-y-4">{project.periods.filter(p=>(receiptFor(p.id)?.gross||0)>0).slice(0,3).map(p=>{const c=receiptFor(p.id)!;return <div key={p.id} className="border-b border-white/10 pb-4"><div className="flex justify-between"><span>DR {p.id}</span><strong className="num">{money(c.net)}</strong></div><div className="mt-1 flex justify-between text-xs text-white/55"><span>Brut {money(c.gross)}</span><span>Reprise {money(c.recovery)}</span></div></div>})}</div></section>
          </div>
        </TabsContent>}

        <TabsContent value="projects"><ProjectPicker workspace={ws} onSelect={id=>{setProjectId(id);setView("budget")}} onNewProject={()=>setProjectOpen(true)} onNewClient={()=>setClientOpen(true)} onImportJems={()=>{setImportNew(true);setImportOpen(true)}} disabled={!loaded}/></TabsContent>

        {project&&<TabsContent value="budget"><BudgetChronogram key={project.id} workspace={ws} setWorkspace={setWs} project={project} disabled={!loaded}/></TabsContent>}
        {project&&<TabsContent value="reports"><PartnerReports key={project.id} initialPeriod={reportPeriod} workspace={ws} setWorkspace={setWs} project={project} disabled={!loaded}/></TabsContent>}

        {project&&<TabsContent value="dr"><DRReceipts workspace={ws} project={project} funding={funding} disabled={!loaded} onUpdate={updateDR} onRecoveryChange={(period,choice)=>setWs(w=>setAdvanceRecovery(w,w.projects.find(p=>p.id===project.id)!,period,choice))} onReports={period=>{setReportPeriod(period);setView("reports")}}/></TabsContent>}

        {project&&<TabsContent key={"settings-"+project.id+"-"+JSON.stringify(project.rules)+"-"+project.clientId} value="settings" className="space-y-6"><div><h2 className="text-2xl font-semibold">Paramètres du projet</h2></div><ProjectBranding key={project.id} project={project} onChange={mutateProject}/><ProjectDates project={project} onChange={mutateProject}/><ProjectFunding project={project} onChange={mutateProject}/>
          <div className="grid gap-5 xl:grid-cols-2"><section className="rounded-2xl border bg-white p-5"><h3 className="font-semibold">Modes de calcul du projet</h3><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Part éligible des catégories au réel (%)" name="realRate" type="number" defaultValue={project.rules.realRate}/><label className="grid gap-1.5 text-sm font-medium">Mode RH<select name="hrMode" defaultValue={project.rules.hrMode} className="h-10 rounded-lg border bg-white px-3"><option value="réel">Réel</option><option value="forfait">Forfait</option></select></label><Field label="Forfait RH (%)" name="hrRate" type="number" defaultValue={project.rules.hrRate}/><label className="grid gap-1.5 text-sm font-medium">Mode missions<select name="missionMode" defaultValue={project.rules.missionMode} className="h-10 rounded-lg border bg-white px-3"><option value="réel">Réel</option><option value="forfait">Forfait</option></select></label><Field label="Missions / RH (%)" name="missionRate" type="number" defaultValue={project.rules.missionRate}/><label className="grid gap-1.5 text-sm font-medium">Mode frais de bureau<select name="officeMode" defaultValue={project.rules.officeMode} className="h-10 rounded-lg border bg-white px-3"><option value="réel">Réel</option><option value="forfait">Forfait</option></select></label><Field label="Frais de bureau / RH (%)" name="officeRate" type="number" defaultValue={project.rules.officeRate}/></div><Button className="mt-5" onClick={e=>{const box=e.currentTarget.parentElement!;const inputs=box.querySelectorAll<HTMLInputElement>("input");const selects=Array.from(box.querySelectorAll("select")) as HTMLSelectElement[];mutateProject({rules:{...project.rules,realRate:num(inputs[0].value),hrMode:selects[0].value as "réel"|"forfait",hrRate:num(inputs[1].value),missionMode:selects[1].value as "réel"|"forfait",missionRate:num(inputs[2].value),officeMode:selects[2].value as "réel"|"forfait",officeRate:num(inputs[3].value)}})}}><Save/>Enregistrer les modes et taux</Button></section>
            <section className="rounded-2xl border bg-white p-5"><h3 className="font-semibold">Avance FEDER</h3><div className="mt-4 flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input name="requested" type="checkbox" defaultChecked={project.advance.requested}/> Avance demandée</label><label className="flex items-center gap-2"><input name="received" type="checkbox" defaultChecked={project.advance.received}/> Avance effectivement encaissée</label></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Avance / FEDER (%)" name="advanceRate" type="number" defaultValue={project.advance.rate}/><Field label="Date d’encaissement de l’avance" name="receivedDate" type="date" defaultValue={project.advance.receivedDate}/></div><Button className="mt-5" onClick={e=>{const box=e.currentTarget.parentElement!;const inputs=box.querySelectorAll<HTMLInputElement>("input");mutateProject({advance:{...project.advance,requested:inputs[0].checked,received:inputs[1].checked,rate:num(inputs[2].value),receivedDate:inputs[3].value||undefined}})}}><Save/>Enregistrer l’hypothèse</Button></section></div>
          <AccountReference/>
        </TabsContent>}
      </div>
    </main>
    {loaded&&<JemsImport key={"import-"+(importNew?'new':project?.id)} open={importOpen} onOpenChange={setImportOpen} project={importNew?undefined:project} workspace={ws} setWorkspace={setWs} onImported={id=>{setProjectId(id);setView('budget')}}/>}
    {loaded&&<ClientDirectory workspace={ws} onChange={clients=>setWs(w=>({...w,demo:false,clients}))} open={clientOpen} onOpenChange={setClientOpen} shared={embedded}/>}
    <Dialog open={projectOpen} onOpenChange={setProjectOpen}><DialogContent className="sm:max-w-2xl"><form onSubmit={addProject} className="min-w-0">
      <DialogHeader><DialogTitle>Créer un projet manuellement</DialogTitle><DialogDescription>Les informations de ce projet sont propres à l’outil budgets.</DialogDescription></DialogHeader>
      <Button className="mt-4" type="button" variant="outline" onClick={()=>{setProjectOpen(false);setImportNew(true);setImportOpen(true)}}>Importer un budget JEMS à la place</Button>
      <div className="project-form-grid py-5">
        <label className="budget-field"><span>Client</span><select name="clientId" required className="h-10 w-full min-w-0 rounded-lg border bg-white px-3">{ws.clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <Field label="Acronyme" name="acronym" required/>
        <Field label="Nom du projet" name="name" required className="sm:col-span-2"/>
        <div className="grid min-w-0 gap-4 sm:col-span-2 sm:grid-cols-3"><ProjectDatesFields/></div>
        <Field label="Budget éligible partenaire" name="budget" type="number" min={0} step="0.01"/>
        <Field label="Taux FEDER (%)" name="federRate" type="number" defaultValue={80} min={0} step="0.01"/>
      </div><DialogFooter><Button type="submit">Créer le projet</Button></DialogFooter>
    </form></DialogContent></Dialog>
  </Tabs>
}
