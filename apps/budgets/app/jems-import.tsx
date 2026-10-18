"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Project, Workspace } from "@/lib/budget-model";
import { currency, sum } from "@/lib/budget-model";
import { applyJemsImport, createJemsProject, jemsChoices, normalize, readJemsWorkbook, type JemsBudget } from "@/lib/jems-import";
import { ProjectDatesFields } from "./project-dates";
import { jemsTextMatches, repairJemsTexts } from "@/lib/jems-text-repair";
type Props={open:boolean;onOpenChange:(value:boolean)=>void;project?:Project;workspace:Workspace;setWorkspace:Dispatch<SetStateAction<Workspace>>;onImported:(projectId:string)=>void};
export default function JemsImport({open,onOpenChange,project,workspace:ws,setWorkspace:setWs,onImported}:Props){
  const [budget,setBudget]=useState<JemsBudget|null>(null),[file,setFile]=useState(""),[partnerId,setPartnerId]=useState("");
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[replaceManual,setReplaceManual]=useState(false);
  const [textsOnly,setTextsOnly]=useState(false);
  const partner=budget?.partners.find(p=>p.id===partnerId);
  const target=project||(budget&&partner?ws.projects.find(p=>p.jems?.projectId===budget.projectId&&p.jems.partnerId===partner.id):undefined);
  const choices=partner?jemsChoices(ws,target?.id||'',partner,replaceManual):[];
  const textMatches=target&&budget&&partner?jemsTextMatches(ws,target.id,budget,partner.id):[];
  const matchedTexts=textMatches.filter(m=>m.line).length;
  const canRepair=!!partner&&matchedTexts===partner.lines.length;
  const missing=target?budget?.periodIds.filter(id=>!target.periods.some(p=>p.id===id))||[]:[];
  const currentLines=ws.budgetLines.filter(b=>b.projectId===target?.id);
  const retained=currentLines.filter(b=>!choices.some(c=>c.target===b.id));
  const retainedManual=choices.filter(c=>c.target!=="new"&&!c.replacePlanning).length;
  const wrongProject=!!(budget&&partner&&target?.jems&&(target.jems.projectId!==budget.projectId||target.jems.partnerId!==partner.id));
  async function read(input:File){
    setBusy(true);setError("");setBudget(null);setPartnerId("");setFile(input.name);setReplaceManual(false);setTextsOnly(false);
    try{
      if(input.size>10*1024*1024)throw new Error("Le fichier dépasse 10 Mo.");
      const result=readJemsWorkbook(XLSX.read(await input.arrayBuffer(),{type:"array"}));
      setBudget(result);
      const client=ws.clients.find(c=>c.id===project?.clientId);
      const match=result.partners.find(p=>project?.jems?.partnerId===p.id||!!client&&(normalize(p.name)===normalize(client.name)||normalize(p.abbreviation)===normalize(client.name)));
      if(match)setPartnerId(match.id);else if(result.partners.length===1)setPartnerId(result.partners[0].id);
    }catch(e){setError(e instanceof Error?e.message:"Fichier Excel illisible.")}finally{setBusy(false)}
  }
  function confirm(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!budget||!partner)return;
    try{
      const values=new FormData(event.currentTarget);
      if(textsOnly&&target){
        setWs(repairJemsTexts(ws,target.id,budget,partner.id,file));onImported(target.id);
        setBudget(null);setFile("");setPartnerId("");onOpenChange(false);return;
      }
      const result=target?{workspace:applyJemsImport(ws,target.id,budget,partner.id,file,replaceManual),projectId:target.id}:createJemsProject(ws,budget,partner.id,file,{acronym:String(values.get('acronym')||''),name:String(values.get('name')||''),start:String(values.get('start')||''),durationMonths:Number(values.get('durationMonths')),federRate:partner.federRate??Number(values.get('federRate'))});
      setWs(result.workspace);onImported(result.projectId);
      setBudget(null);setFile("");setPartnerId("");onOpenChange(false);
    }catch(e){setError(e instanceof Error?e.message:"Import impossible.")}
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl"><form onSubmit={confirm} className="grid min-w-0 gap-4">
    <DialogHeader><DialogTitle>{project?'Importer le nouveau budget JEMS':'Créer un projet depuis JEMS'}</DialogTitle><DialogDescription>Importez l’export Excel JEMS et choisissez votre partenaire. Les informations du projet viennent du fichier.</DialogDescription></DialogHeader>
    <label className="grid gap-3 rounded-xl border-2 border-dashed bg-muted/40 p-5"><span className="flex items-center gap-2 font-medium"><FileSpreadsheet/>{busy?"Lecture du fichier…":file||"Extraction budgétaire JEMS"}</span><input aria-label="Fichier budget JEMS" type="file" accept=".xlsx,.xls" disabled={busy} onChange={e=>e.target.files?.[0]&&read(e.target.files[0])} className="max-w-full text-sm"/></label>
    {budget&&<label className="budget-field font-semibold"><span>Qui est ton client ?</span>
      <select aria-label="Qui est ton client ?" className="h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-sm font-normal" value={partnerId} onChange={e=>{setPartnerId(e.target.value);setError("")}}>
        <option value="">Choisir l’organisme</option>{budget.partners.map(p=><option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}
      </select>
    </label>}
    {budget&&partner&&<div className="space-y-4">
      {target&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={textsOnly} onChange={e=>{setTextsOnly(e.target.checked);setError("")}}/>Corriger uniquement les descriptions et commentaires</label>}
      {textsOnly&&<p role="status" className="text-sm">{matchedTexts} / {partner.lines.length} lignes rapprochées · Montants, planning et affectations conservés.</p>}
      <div className="grid gap-3 rounded-xl bg-muted/50 p-4 sm:grid-cols-3"><div className="min-w-0"><span className="text-sm text-muted-foreground">Projet JEMS</span><strong className="block">{budget.acronym||target?.acronym}</strong><span className="text-xs">{budget.projectId}</span></div><div><span className="text-sm text-muted-foreground">Budget du client</span><strong className="num block">{currency(sum(partner.lines.map(l=>l.amount)))}</strong><span className="text-xs">{partner.lines.length} lignes · {budget.periodIds.length} périodes</span></div><div><span className="text-sm text-muted-foreground">{target?'Mise à jour':'Nouveau projet'}</span><strong className="block">{textsOnly?`${matchedTexts} textes rapprochés`:`${choices.filter(c=>c.target==="new").length} ajouts · ${choices.filter(c=>c.target!=="new").length} mises à jour`}</strong></div></div>
      {partner.federRate!==undefined&&<p className="text-sm">Taux FEDER repris de JEMS : <strong>{partner.federRate} %</strong>{partner.federAmount!==undefined&&<> · Dotation : <strong>{currency(partner.federAmount)}</strong></>}</p>}
      {!project&&target&&<p role="status" className="rounded-lg bg-sky-50 p-3 text-sm">Le budget de ce partenaire existe déjà dans « {target.acronym} ». Il sera mis à jour en conservant les dates et vos répartitions manuelles.</p>}
      {!target&&<section key={file+partner.id} className="rounded-xl border bg-white p-4">
        <h3 className="font-semibold">Informations du projet</h3>
        <div className="project-form-grid mt-4">
          <label className="budget-field"><span>Client</span><input aria-label="Client JEMS" value={partner.name} readOnly className="timeline-field"/></label>
          <label className="budget-field"><span>Acronyme</span><input name="acronym" required defaultValue={budget.acronym} className="timeline-field"/></label>
          <label className="budget-field sm:col-span-2"><span>Nom du projet</span><input name="name" required defaultValue={budget.acronym} className="timeline-field"/></label>
          <p className="text-sm text-muted-foreground sm:col-span-2">Cet export budgétaire ne contient pas les dates ni le nom développé du projet. Complétez le nom si nécessaire et indiquez la date de démarrage. La durée proposée correspond à {budget.periodIds.length} périodes de 6 mois ; elle reste à confirmer.</p>
          <div className="grid min-w-0 gap-4 sm:col-span-2 sm:grid-cols-3"><ProjectDatesFields duration={Math.max(12,Math.min(48,budget.periodIds.length*6))}/></div>
          {partner.federRate===undefined&&<label className="budget-field"><span>Taux FEDER (%) · absent de l’export</span><input className="timeline-field" type="number" name="federRate" required min="0" max="100" step="0.01" defaultValue={80}/></label>}
        </div>
      </section>}
      <div className="flex flex-wrap gap-2">{([["hr","RH"],["office","Frais de bureau"],["mission","Missions"]] as const).map(([key,label])=>{
        const mode=partner.rules[(key+"Mode") as "hrMode"],rate=partner.rules[(key+"Rate") as "hrRate"];
        return <span key={key} className="rounded-full border bg-white px-3 py-1.5 text-sm">{label} : <strong>{mode?(mode==="forfait"?"forfait "+rate+" %":"au réel"):"absent de l’export"}</strong></span>
      })}</div>
      {!!missing.length&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">Périodes hors calendrier : {missing.join(", ")}. Dates à ajuster dans Paramètres.</p>}
      {!textsOnly&&!!retained.length&&<p className="rounded-lg bg-amber-50 p-3 text-sm">{retained.length} ligne(s) existante(s) absente(s) de cette sélection seront conservées ({currency(sum(retained.map(b=>b.amount)))}). </p>}
      {!textsOnly&&choices.some(c=>c.target!=="new")&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={replaceManual} onChange={e=>setReplaceManual(e.target.checked)}/>Remplacer aussi mes répartitions modifiées manuellement par celles de JEMS{retainedManual>0&&" ("+retainedManual+" conservées)"}</label>}
      {partner.warnings.map((w,i)=><p key={i} role="status" className="text-sm text-amber-800">{w}</p>)}
      <details className="rounded-lg border"><summary className="cursor-pointer p-3 text-sm font-medium">Voir les {partner.lines.length} lignes et leurs périodes</summary><div className="max-h-72 overflow-auto"><Table><TableHeader><TableRow><TableHead>Catégorie / description</TableHead><TableHead>Montant total</TableHead><TableHead>Répartition JEMS</TableHead></TableRow></TableHeader><TableBody>{partner.lines.map(l=><TableRow key={l.key}><TableCell className="max-w-96 whitespace-normal"><span className="text-xs text-muted-foreground">{l.category}</span><div>{l.description}</div>{l.comments&&<p className="mt-1 text-xs text-muted-foreground">{l.comments}</p>}</TableCell><TableCell className="num">{currency(l.amount)}</TableCell><TableCell className="whitespace-normal text-xs">{Object.entries(l.allocations).filter(([,v])=>v).map(([id,v])=>(id==="PREP"?"Préparation":id==="CLOSE"?"Clôture":id)+" : "+currency(v)).join(" · ")||"À planifier"}</TableCell></TableRow>)}</TableBody></Table></div></details>
    </div>}
    {wrongProject&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-destructive">Ce projet est lié à un autre projet ou partenaire JEMS. Créez un projet séparé pour importer ce budget.</p>}
    {error&&<p role="alert" className="flex gap-2 text-sm text-destructive"><AlertTriangle className="size-4"/>{error}</p>}
    <DialogFooter><Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>Annuler</Button><Button type="submit" disabled={!partner||busy||wrongProject||(textsOnly&&!canRepair)}><Check/>{textsOnly?'Corriger les textes':target?'Importer le budget du client':'Créer le projet et importer le budget'}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}
