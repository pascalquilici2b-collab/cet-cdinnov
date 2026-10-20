"use client";
import {BrandMark} from '../../../platform/client/loading';
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Check, FileSpreadsheet, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { currency, sum, type GlobalExpenditureFile, type GlobalExpenditureImport, type Project, type Workspace } from "@/lib/budget-model";
import { mergeGlobalFiles, removeGlobalExpenditures, replaceGlobalExpenditures, validateGlobalProject } from "@/lib/global-expenditures";
import { fullDate } from "@/lib/project-dates";


const language=(lang:string)=>lang==="fr"?"Français":"Italien";
export default function GlobalExpenditures({workspace,project,setWorkspace,disabled}:{workspace:Workspace;project:Project;setWorkspace:Dispatch<SetStateAction<Workspace>>;disabled:boolean}){
  const [open,setOpen]=useState(false),[remove,setRemove]=useState(false),[busy,setBusy]=useState(false),[pending,setPending]=useState<GlobalExpenditureFile[]>([]),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [removed,setRemoved]=useState<GlobalExpenditureImport>();
  const input=useRef<HTMLInputElement>(null);
  const current=workspace.globalExpenditureImports?.find(i=>i.projectId===project.id),rows=mergeGlobalFiles(current?.files||[]);
  let preview:ReturnType<typeof replaceGlobalExpenditures>|undefined,previewError="";
  if(pending.length)try{preview=replaceGlobalExpenditures(workspace,project.id,pending)}catch(e){previewError=e instanceof Error?e.message:"Import impossible."}
  async function choose(files:File[]){
    setBusy(true);setError("");setPending([]);
    try{
      if(!files.length||files.length>2)throw new Error("Sélectionnez un export global. Un second fichier dans une autre langue est facultatif.");
      const {readGlobalExpenditureFile}=await import("@/lib/global-expenditures-xlsx");
      const next:GlobalExpenditureFile[]=[];
      for(const file of files){const parsed=await readGlobalExpenditureFile(file);validateGlobalProject(parsed,project);next.push(parsed)}
      setPending(next);
    }catch(e){setError(e instanceof Error?e.message:"Lecture impossible.")}
    finally{setBusy(false);if(input.current)input.current.value=""}
  }
  function commit(){
    try{const result=replaceGlobalExpenditures(workspace,project.id,pending);setWorkspace(result.workspace);setOpen(false);setPending([]);setRemoved(undefined);setMessage(`${result.rows.length} dépenses uniques enregistrées : ${result.added} nouvelles, ${result.retained} conservées ou mises à jour, ${result.removed} retirées. Les associations manuelles sont conservées.`)}
    catch(e){setError(e instanceof Error?e.message:"Import impossible.")}
  }
  return <section className="report-panel global-expenditures">
    <h3><FileSpreadsheet aria-hidden="true"/>Liste globale des dépenses</h3>
    <div className="global-compact-files">{current?current.files.map(file=><div key={file.hash}><span title={file.file}>{file.file}</span><small><Check aria-hidden="true"/>Importé le {fullDate(file.exportedAt.slice(0,10))}</small></div>):<small>Aucun export importé</small>}</div>
    <div className="global-actions"><Button variant="outline" disabled={disabled} onClick={()=>{setPending([]);setError("");setOpen(true)}}><Upload/>{current?"Mettre à jour l’export":"Importer l’export Excel"}</Button>{current&&<Button variant="ghost" disabled={disabled} title="Supprimer les exports" aria-label="Supprimer les exports" onClick={()=>setRemove(true)}><Trash2/></Button>}</div>
    {rows.some(e=>e.reportStatus==="draft")&&<p className="report-warning">{rows.filter(e=>e.reportStatus==="draft").length} dépense(s) en brouillon exclue(s).</p>}
    {message&&<p role="status" className="report-success">{message}</p>}
    {removed&&<Button variant="outline" disabled={disabled} onClick={()=>{setWorkspace(w=>({...w,globalExpenditureImports:[...(w.globalExpenditureImports||[]).filter(i=>i.projectId!==project.id),removed]}));setRemoved(undefined);setMessage("Exports restaurés.")}}>Annuler la suppression</Button>}
    <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v)}}><DialogContent className="report-import-dialog"><DialogHeader><DialogTitle>{current?"Mettre à jour":"Importer"} les listes globales JEMS</DialogTitle><DialogDescription>Choisissez le fichier XLSX disponible pour ce projet et partenaire. Un seul export suffit. Si vous disposez aussi d’un export dans une autre langue de saisie, vous pouvez l’ajouter à la sélection.</DialogDescription></DialogHeader>
      <input className="sr-only" type="file" accept=".xlsx" multiple ref={input} aria-label="Fichiers Global LoE JEMS" onChange={e=>{if(e.target.files)void choose(Array.from(e.target.files))}}/>
      <Button variant="outline" disabled={busy} onClick={()=>input.current?.click()}><Upload/>Choisir les exports Excel</Button>
      {busy&&<p role="status" className="report-loading"><BrandMark/>Lecture et rapprochement des dépenses…</p>}
      {(error||previewError)&&<p role="alert" className="report-warning">{error||previewError}</p>}
      <div className="report-import-list">{pending.map((file,index)=><div key={file.hash} className="report-import-item"><div><strong>Saisie : {language(file.dataLanguage)} · En-têtes : {language(file.exportLanguage)}</strong><p>{file.file}</p><small>{file.rows.length} dépenses · Export du {fullDate(file.exportedAt.slice(0,10))} à {file.exportedAt.slice(11)}</small></div><Button variant="ghost" disabled={busy} aria-label={`Retirer ${file.file} de la sélection`} onClick={()=>setPending(old=>old.filter((_,i)=>i!==index))}><X/></Button></div>)}</div>
      {preview&&<div className="global-preview"><strong>{preview.rows.length} dépenses uniques · {currency(sum(preview.rows.filter(e=>e.reportStatus!=="draft").map(e=>e.declared)))} déclarés hors forfaits</strong><p>{preview.added} nouvelles · {preview.retained} conservées ou mises à jour · {preview.removed} retirées du nouvel état.</p>{preview.duplicateLanguage&&<p className="report-warning">Ces deux fichiers ont la même langue de saisie. Seul le plus récent sera conservé ; les dépenses ne seront pas doublées.</p>}<p>Les exports remplacent l’état précédent de ce projet. Les associations et les libellés saisis manuellement restent mémorisés, y compris après suppression et rechargement des fichiers.</p></div>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Fermer</Button><Button disabled={disabled||busy||!preview} onClick={commit}>Enregistrer les dépenses</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={remove} onOpenChange={setRemove}><DialogContent><DialogHeader><DialogTitle>Supprimer les exports de ce projet ?</DialogTitle><DialogDescription>Leurs dépenses seront retirées du suivi jusqu’au prochain import. Les associations, les libellés manuels, le budget et les rapports PDF seront conservés. Vos fichiers Excel d’origine restent sur votre ordinateur.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={()=>setRemove(false)}>Annuler</Button><Button disabled={disabled} onClick={()=>{setRemoved(current);setWorkspace(removeGlobalExpenditures(workspace,project.id));setRemove(false);setMessage("Exports supprimés. Rechargez les nouveaux fichiers pour actualiser les périodes.")}}>Confirmer la suppression</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
