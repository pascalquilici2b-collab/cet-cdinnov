"use client";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Check, ImagePlus, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PartnerReport, Project, Workspace } from "@/lib/budget-model";
import type { CaptureReading, CaptureRow } from "@/lib/report-capture-parser";
import { importReportCapture } from "@/lib/partner-reports";

type ReviewRow=CaptureRow&{selected:boolean};
export default function ReportCapture({workspace,project,report,setWorkspace,disabled}:{workspace:Workspace;project:Project;report:PartnerReport;setWorkspace:Dispatch<SetStateAction<Workspace>>;disabled:boolean}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[progress,setProgress]=useState(""),[error,setError]=useState("");
  const [reading,setReading]=useState<CaptureReading>(),[rows,setRows]=useState<ReviewRow[]>([]),[reviewed,setReviewed]=useState(false);
  const [preview,setPreview]=useState(""),[message,setMessage]=useState("");
  const input=useRef<HTMLInputElement>(null),abort=useRef<AbortController|undefined>(undefined);
  useEffect(()=>()=>abort.current?.abort(),[]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
  const manual=(id:string)=>report.expenses.find(e=>e.id===id)?.descriptionSource==="Saisie manuelle";
  const selected=rows.filter(r=>r.selected&&!manual(r.expenseId));
  let validation="";
  if(reading&&selected.length)try{importReportCapture(workspace,project.id,report.id,reading,selected)}catch(e){validation=e instanceof Error?e.message:"Vérifiez les dépenses sélectionnées."}
  const update=(index:number,patch:Partial<ReviewRow>)=>{setRows(old=>old.map((r,i)=>i===index?{...r,...patch}:r));setReviewed(false)};
  async function read(file:File){
    abort.current?.abort();const controller=new AbortController();abort.current=controller;
    setBusy(true);setProgress("Préparation de la lecture…");setError("");setReading(undefined);setRows([]);setReviewed(false);setPreview(URL.createObjectURL(file));
    try{
      const {readReportCapture}=await import("@/lib/report-capture-ocr");
      const result=await readReportCapture(file,setProgress,controller.signal);
      if(controller.signal.aborted)return;
      setReading(result);setRows(result.rows.map(r=>({...r,selected:!!r.description&&report.expenses.some(e=>e.id===r.expenseId)&&!manual(r.expenseId)})));
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Lecture impossible.")}
    finally{setBusy(false);if(input.current)input.current.value=""}
  }
  function close(){abort.current?.abort();setOpen(false)}
  function commit(){
    if(!reading||!reviewed||!selected.length||busy||disabled)return;
    try{setWorkspace(importReportCapture(workspace,project.id,report.id,reading,selected));setMessage(`${selected.length} libellés français enregistrés pour R.${report.number}.`);setOpen(false)}catch(e){setError(e instanceof Error?e.message:"Import impossible.")}
  }
  return <div className="report-capture">
    <Button variant="outline" disabled={disabled} onClick={()=>{setOpen(true);setMessage("");setError("");setReading(undefined);setRows([]);setReviewed(false);setPreview("")}}><ImagePlus/>Importer une capture française</Button>
    {message&&<p className="report-success" role="status"><Check/>{message}</p>}
    <Dialog open={open} onOpenChange={value=>{if(!value)close()}}><DialogContent className="capture-dialog"><DialogHeader><DialogTitle>Descriptions françaises · R.{report.number}</DialogTitle><DialogDescription>{project.acronym} · {report.partnerId} · {report.periodId}. Capturez la liste JEMS avec les colonnes ID, Description et Commentaire. Vous pourrez corriger les textes avant de les enregistrer.</DialogDescription></DialogHeader>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Capture de la liste des dépenses" onChange={e=>{const file=e.target.files?.[0];if(file)void read(file)}}/>
      <Button variant="outline" disabled={busy||disabled} onClick={()=>input.current?.click()}><ImagePlus/>{reading?"Choisir une autre capture":"Choisir une capture"}</Button>
      <p className="report-note">La lecture de l’image se fait dans votre navigateur. Seuls les libellés vérifiés sont enregistrés. Vous pouvez importer plusieurs captures successivement.</p>
      {preview&&<details className="capture-original"><summary>Voir la capture originale</summary><div><img src={preview} alt="Capture de la liste des dépenses à vérifier"/></div></details>}
      {busy&&<p className="report-loading" role="status"><LoaderCircle className="animate-spin"/>{progress}</p>}
      {error&&<p className="report-warning" role="alert">{error}</p>}
      {reading&&<>
        {reading.warnings.map(w=><p key={w} className="report-warning">{w}</p>)}
        <div className="capture-table-wrap"><table className="capture-table"><thead><tr><th>Importer</th><th>Dépense JEMS</th><th>Libellé français à vérifier</th></tr></thead><tbody>{rows.map((r,index)=><tr key={index}>
          <td><input type="checkbox" aria-label={`Importer le libellé ${index+1}`} checked={r.selected&&!manual(r.expenseId)} disabled={manual(r.expenseId)} onChange={e=>update(index,{selected:e.target.checked})}/></td>
          <td><select aria-label={`Identifiant de la ligne ${index+1}`} value={r.expenseId} onChange={e=>update(index,{expenseId:e.target.value,selected:!!e.target.value&&!manual(e.target.value)})}><option value="">Choisir la dépense</option>{!report.expenses.some(e=>e.id===r.expenseId)&&r.expenseId&&<option value={r.expenseId}>{r.expenseId} · absent du rapport</option>}{report.expenses.map(e=><option key={e.id} value={e.id}>{e.id}</option>)}</select><small>Lu : {r.rawId}</small>{(r.inferredId||r.confidence<85)&&<small className="capture-check">Lecture incertaine · à vérifier</small>}</td>
          <td><textarea aria-label={`Libellé français de la ligne ${index+1}`} maxLength={2000} rows={2} value={r.description} onChange={e=>update(index,{description:e.target.value})}/>{manual(r.expenseId)&&<small>Libellé manuel conservé : {report.expenses.find(e=>e.id===r.expenseId)?.description}</small>}</td>
        </tr>)}</tbody></table></div>
        {validation&&<p role="alert" className="report-warning">{validation}</p>}
        <label className="capture-confirm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>Cette capture concerne {project.acronym}, {report.partnerId}, R.{report.number} et j’ai vérifié les identifiants et les libellés sélectionnés.</label>
      </>}
      <DialogFooter><Button variant="outline" onClick={close}>{busy?"Annuler la lecture":"Fermer"}</Button><Button disabled={busy||disabled||!reading||!selected.length||!reviewed||!!validation} onClick={commit}>Enregistrer {selected.length} libellés</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
