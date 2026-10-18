"use client";
import { useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { currency, dayIndex, newId, parseAmount } from "@/lib/budget-model";
import type { Project, TimelineBlock } from "@/lib/budget-model";
import { blockLanes, isoDay, moveBlock, TIMELINE_COLORS } from "@/lib/timeline";
import { fullDate } from "@/lib/project-dates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props={compact?:boolean;label:string;blocks:TimelineBlock[];project:Project;color:string;remaining:number;onChange:(blocks:TimelineBlock[])=>void};
type Gesture={block:TimelineBlock;mode:"move"|"start"|"end";x:number;width:number;moved:boolean;preview:TimelineBlock};
export default function TimelineTrack({compact=false,label,blocks,project,color,remaining,onChange}:Props){
 const track=useRef<HTMLDivElement>(null),gesture=useRef<Gesture|null>(null),skipClick=useRef(false);
 const [preview,setPreview]=useState<TimelineBlock|null>(null),[editing,setEditing]=useState<TimelineBlock|null>(null),[error,setError]=useState("");
 const days=dayIndex(project.end)-dayIndex(project.start)+1;
 const displayed=blocks.map(b=>preview?.id===b.id?preview:b),lanes=blockLanes(displayed),step=compact?34:48,height=Math.max(compact?48:74,(Math.max(0,...lanes.map(b=>b.lane))+1)*step+(compact?12:26));
 function open(block?:TimelineBlock,start=project.start,end=project.periods[0]?.end||project.end){
   setError("");setEditing(block||{id:newId(),start,end,amount:Math.max(0,remaining),color});
 }
 function down(e:ReactPointerEvent<HTMLDivElement>,block:TimelineBlock){
   if(e.button!==0)return;e.preventDefault();
   const bounds=e.currentTarget.getBoundingClientRect();
   const handle=(e.target as HTMLElement).closest<HTMLElement>("[data-resize]")?.dataset.resize as "start"|"end"|undefined;
   const mode=handle||(e.clientX-bounds.left<24?"start":bounds.right-e.clientX<24?"end":"move");
   gesture.current={block,mode:mode||"move",x:e.clientX,width:track.current!.getBoundingClientRect().width,moved:false,preview:block};
   skipClick.current=false;e.currentTarget.setPointerCapture(e.pointerId);e.stopPropagation();
 }
 function move(e:ReactPointerEvent<HTMLDivElement>){
   const g=gesture.current;if(!g)return;
   const delta=e.clientX-g.x;if(Math.abs(delta)<3&&!g.moved)return;
   g.moved=true;g.preview=moveBlock(g.block,delta/g.width*days,g.mode,project.start,project.end);setPreview(g.preview);
 }
 function finish(e:ReactPointerEvent<HTMLDivElement>,cancel=false){
   const g=gesture.current;if(!g)return;
   if(g.moved&&!cancel){try{onChange(blocks.map(b=>b.id===g.block.id?g.preview:b));setError("")}catch(err){setError((err as Error).message)}}
   skipClick.current=g.moved;gesture.current=null;setPreview(null);
   if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 }
 function keyboard(e:KeyboardEvent,block:TimelineBlock,mode:"move"|"start"|"end"){
   if(!["ArrowLeft","ArrowRight"].includes(e.key))return;e.preventDefault();
   const next=moveBlock(block,(e.key==="ArrowLeft"?-1:1)*(e.shiftKey?7:1),mode,project.start,project.end);
   try{onChange(blocks.map(b=>b.id===block.id?next:b));setError("")}catch(err){setError((err as Error).message)}
 }
 const pixel=(date:string)=>Math.max(0,Math.min(100,(dayIndex(date)-dayIndex(project.start))/days*100));
 return <><div ref={track} className={"timeline-track"+(compact?" compact-track":"")} style={{height}} aria-label={"Planning de "+label}>
   {project.periods.map(p=><div key={p.id} className="timeline-grid-line" style={{left:pixel(p.start)+"%"}}/>)}
   {lanes.map(b=>{
     const left=pixel(b.start),right=Math.max(left,Math.min(100,(dayIndex(b.end)+1-dayIndex(project.start))/days*100));
     const outside=b.start<project.start||b.end>project.end;
     return <div key={b.id} className={"timeline-block "+(preview?.id===b.id?"dragging":"")+(outside?" outside":"")} style={{left:left+"%",width:Math.max(.4,right-left)+"%",top:(compact?6:12)+b.lane*step,background:b.color||color}} onPointerDown={e=>down(e,b)} onPointerMove={move} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onClick={()=>{if(skipClick.current){skipClick.current=false;return}open(b)}}>
       <button type="button" className="timeline-handle start" data-resize="start" aria-label={"Redimensionner le début de "+label} onKeyDown={e=>keyboard(e,b,"start")} title="Déplacer le début"/>
       <button type="button" className="timeline-block-body" aria-label={label+" · "+currency(b.amount)+" · "+fullDate(b.start)+" au "+fullDate(b.end)} title={label+" · "+currency(b.amount)+"\n"+fullDate(b.start)+" — "+fullDate(b.end)} onKeyDown={e=>keyboard(e,b,"move")}><span>{label}</span><strong>{currency(b.amount)}</strong>{outside&&<span>Hors calendrier</span>}</button>
       <button type="button" className="timeline-handle end" data-resize="end" aria-label={"Redimensionner la fin de "+label} onKeyDown={e=>keyboard(e,b,"end")} title="Déplacer la fin"/>
     </div>
   })}
   {remaining>0&&<button type="button" className={"timeline-add "+(blocks.length?"compact":"")} aria-label={"Planifier "+label} onClick={()=>open()}><Plus size={15}/>{!blocks.length&&"Planifier"}</button>}
   {preview&&<div className="timeline-drag-dates" role="status">{fullDate(preview.start)} — {fullDate(preview.end)}</div>}
 </div>{error&&<span role="alert" className="text-xs text-destructive">{error}</span>}
 <Dialog open={!!editing} onOpenChange={v=>!v&&setEditing(null)}><DialogContent className="sm:max-w-lg">
   {editing&&<form key={editing.id} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{
     const next={...editing,start:String(f.get("start")),end:String(f.get("end")),amount:parseAmount(f.get("amount")),color:String(f.get("color"))};
     if(next.end<next.start||next.start<project.start||next.end>project.end)throw new Error("Choisissez des dates comprises dans le projet.");
     onChange(blocks.some(b=>b.id===next.id)?blocks.map(b=>b.id===next.id?next:b):[...blocks,next]);setEditing(null);setError("");
   }catch(err){setError((err as Error).message)}}}>
     <DialogHeader><DialogTitle>Positionnement</DialogTitle><DialogDescription>{label}</DialogDescription></DialogHeader>
     <div className="grid gap-4 py-5 sm:grid-cols-2"><label className="grid gap-1 text-sm">Début<input className="timeline-field" name="start" aria-label="Début du rectangle" type="date" min={project.start} max={project.end} defaultValue={editing.start} required/></label><label className="grid gap-1 text-sm">Fin<input className="timeline-field" name="end" aria-label="Fin du rectangle" type="date" min={project.start} max={project.end} defaultValue={editing.end} required/></label><label className="grid gap-1 text-sm">Montant (€)<input className="timeline-field" name="amount" aria-label="Montant du rectangle" type="number" min="0.01" step="0.01" defaultValue={editing.amount} required/></label><label className="grid gap-1 text-sm">Couleur<select className="timeline-field" name="color" aria-label="Couleur du rectangle" defaultValue={editing.color||color}>{!TIMELINE_COLORS.some(c=>c.value===(editing.color||color))&&<option value={editing.color||color}>Couleur de catégorie</option>}{TIMELINE_COLORS.map(c=><option key={c.value} value={c.value}>{c.name}</option>)}</select></label></div>
     {error&&<p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
     <DialogFooter>{blocks.some(b=>b.id===editing.id)&&<Button type="button" variant="outline" className="text-destructive" onClick={()=>{onChange(blocks.filter(b=>b.id!==editing.id));setEditing(null)}}>Retirer du planning</Button>}<Button type="button" variant="outline" onClick={()=>setEditing(null)}>Annuler</Button><Button type="submit">Enregistrer</Button></DialogFooter>
   </form>}
 </DialogContent></Dialog></>;
}
