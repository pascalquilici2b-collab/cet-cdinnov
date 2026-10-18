export interface AgendaPerson {id:string;name:string;photo?:string;}
export interface AgendaEntry {id:string;kind:'trip'|'leave';owner:string;participants:string[];start:string;end:string;startTime?:string;title:string;calendarText:string;type:string;types:string[];location:string;client?:string;days:number;pending?:boolean;}
export interface Balance {id:string;name:string;acquired:number;accruing:number;taken:number;months:number[];}
export interface PendingLeave {matricule:string;name:string;from:string;to:string;type:string;jours:number;}
export interface AgendaSnapshot {entries:AgendaEntry[];people:AgendaPerson[];viewer:string;month:string;day:string;today:string;person:string;kind:string;type:string;types:string[];mode:'month'|'list';panel:'calendar'|'balances';loaded:boolean;loading:boolean;error:string;notice:string;updated:string;admin:boolean;year:number;years:number[];balances:Balance[];pending:PendingLeave[];}
export const addDays=(day:string,n:number)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export const dateLabel=(day:string,options:Intl.DateTimeFormatOptions={day:'numeric',month:'short'})=>new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',...options}).format(new Date(day+'T12:00:00Z'));
export const range=(start:string,end:string)=>start===end?dateLabel(start):dateLabel(start)+' → '+dateLabel(end);
export const participants=(entry:AgendaEntry)=>[...new Set([entry.owner,...entry.participants].filter(Boolean))];
export function filterEntries(entries:AgendaEntry[],filter:Pick<AgendaSnapshot,'person'|'kind'|'type'>){return entries.filter(e=>(!filter.person||participants(e).includes(filter.person))&&(!filter.kind||e.kind===filter.kind)&&(!filter.type||e.types.includes(filter.type))).sort((a,b)=>a.start.localeCompare(b.start)||(a.startTime||'').localeCompare(b.startTime||'')||a.owner.localeCompare(b.owner));}
export function calendarWeeks(month:string,entries:AgendaEntry[]){
 const first=month+'-01',offset=(new Date(first+'T12:00:00Z').getUTCDay()+6)%7,last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
 return Array.from({length:Math.ceil((offset+last)/7)},(_,week)=>{
  const start=addDays(first,week*7-offset),end=addDays(start,6),lanes:number[]=[];
  const bars=entries.filter(e=>e.start<=end&&e.end>=start).sort((a,b)=>a.start.localeCompare(b.start)||b.end.localeCompare(a.end)).map(entry=>{
   const from=Math.max(0,Math.round((Date.parse(entry.start)-Date.parse(start))/86400000)),to=Math.min(6,Math.round((Date.parse(entry.end)-Date.parse(start))/86400000));
   let lane=lanes.findIndex(last=>last<from);if(lane<0)lane=lanes.length;lanes[lane]=to;
   return {entry,from,to,lane,continued:entry.start<start,continues:entry.end>end};
  });
  return {start,days:Array.from({length:7},(_,i)=>addDays(start,i)),bars,lanes:Math.max(2,lanes.length)};
 });
}
