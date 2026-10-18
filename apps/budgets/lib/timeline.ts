import { dayIndex, round } from "./budget-model.ts";
import type { BudgetLine, Period, Planning, Project, TimelineBlock } from "./budget-model.ts";
export const TIMELINE_COLORS=[{name:"Bleu",value:"#1e5aa6"},{name:"Turquoise",value:"#087f8c"},{name:"Vert",value:"#26815e"},{name:"Violet",value:"#7451a0"},{name:"Orange",value:"#b06415"},{name:"Framboise",value:"#ad4265"}];
export const isoDay=(n:number)=>new Date(n*86400000).toISOString().slice(0,10);
export function planningBlocks(item:Planning&{allocations?:Record<string,number>},periods:Period[]):TimelineBlock[]{
  const legacy=periods.filter(p=>(item.allocations?.[p.id]||0)>0&&(!item.schedule||item.scheduledPeriodIds&&!item.scheduledPeriodIds.includes(p.id))).map(p=>({id:"period-"+p.id,start:p.start,end:p.end,amount:item.allocations![p.id],color:item.color}));
  return [...(item.schedule||[]).map(b=>({...b})),...legacy];
}
export function moveBlock(block:TimelineBlock,delta:number,mode:"move"|"start"|"end",start:string,end:string):TimelineBlock{
 const min=dayIndex(start),max=dayIndex(end),left=dayIndex(block.start),right=dayIndex(block.end);
 const shift=Math.round(delta);
 if(mode==="move"){const duration=right-left;if(duration>max-min)return block;const next=Math.max(min,Math.min(max-duration,left+shift));return {...block,start:isoDay(next),end:isoDay(next+duration)}}
 if(mode==="start")return {...block,start:isoDay(Math.max(min,Math.min(right,left+shift)))};
 return {...block,end:isoDay(Math.min(max,Math.max(left,right+shift)))};
}
export function distributeBlocks(blocks:TimelineBlock[],periods:Period[],previous:Record<string,number>={}){
 const result:Record<string,number>=Object.fromEntries(Object.entries(previous).filter(([id])=>!periods.some(p=>p.id===id)));
 periods.forEach(p=>result[p.id]=0);
 for(const b of blocks){
  const start=dayIndex(b.start),end=dayIndex(b.end),days=end-start+1;
  if(!Number.isFinite(start)||!Number.isFinite(end)||days<1||!Number.isFinite(b.amount)||b.amount<0)throw new Error("Période ou montant invalide.");
  const overlaps=periods.map(p=>({id:p.id,days:Math.max(0,Math.min(end,dayIndex(p.end))-Math.max(start,dayIndex(p.start))+1)})).filter(p=>p.days);
  if(overlaps.reduce((s,p)=>s+p.days,0)!==days)throw new Error("Ce rectangle dépasse les dates du projet.");
  // Allocate integer cents by the largest remainder method: never lose money during a drag.
  const cents=Math.round(b.amount*100),shares=overlaps.map(p=>({id:p.id,value:Math.floor(cents*p.days/days),fraction:(cents*p.days)%days}));
  let remainder=cents-shares.reduce((s,p)=>s+p.value,0);
  for(const s of [...shares].sort((a,b)=>b.fraction-a.fraction)){if(remainder-->0)s.value++}
  shares.forEach(p=>result[p.id]=round((result[p.id]||0)+p.value/100));
 }
 return result;
}
export function setPlanning(line:BudgetLine,subId:string|undefined,blocks:TimelineBlock[],periods:Period[]):BudgetLine{
 const previous=(item:Planning&{allocations?:Record<string,number>})=>Object.fromEntries(Object.entries(item.allocations||{}).filter(([id])=>!item.scheduledPeriodIds?.includes(id)));
 if(subId)return {...line,subExpenses:line.subExpenses.map(s=>s.id===subId?{...s,schedule:blocks,scheduledPeriodIds:periods.map(p=>p.id),allocations:distributeBlocks(blocks,periods,previous(s))}:s)};
 return {...line,schedule:blocks,scheduledPeriodIds:periods.map(p=>p.id),allocations:distributeBlocks(blocks,periods,previous(line))};
}
export function blockLanes(blocks:TimelineBlock[]){
 const ends:number[]=[];
 return [...blocks].sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id)).map(b=>{
  let lane=ends.findIndex(end=>end<dayIndex(b.start));if(lane<0)lane=ends.length;ends[lane]=dayIndex(b.end);
  return {...b,lane};
 });
}
/** Keep manual bars at the same offset when project dates change; preserve every cent. */
export function recalendarPlanning(line:BudgetLine,oldProject:Project,nextProject:Project):BudgetLine{
 const shift=dayIndex(nextProject.start)-dayIndex(oldProject.start),span=dayIndex(nextProject.end)-dayIndex(nextProject.start);
 const fit=(blocks:TimelineBlock[])=>blocks.map(b=>{
   const duration=Math.min(span,dayIndex(b.end)-dayIndex(b.start));
   const shifted={...b,start:isoDay(dayIndex(b.start)+shift),end:isoDay(dayIndex(b.start)+shift+duration)};
   return moveBlock(shifted,0,"move",nextProject.start,nextProject.end);
 });
 let result=line;
 if(line.schedule)result=setPlanning(result,undefined,fit(planningBlocks(line,nextProject.periods).map(b=>line.schedule!.some(s=>s.id===b.id)?b:{...b,start:isoDay(dayIndex(b.start)-shift),end:isoDay(dayIndex(b.end)-shift)})),nextProject.periods);
 for(const sub of line.subExpenses)if(sub.schedule)result=setPlanning(result,sub.id,fit(planningBlocks(sub,nextProject.periods).map(b=>sub.schedule!.some(s=>s.id===b.id)?b:{...b,start:isoDay(dayIndex(b.start)-shift),end:isoDay(dayIndex(b.end)-shift)})),nextProject.periods);
 return result;
}
