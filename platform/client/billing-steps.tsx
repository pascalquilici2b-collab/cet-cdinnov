import {createContext,useContext,useId,useLayoutEffect,useRef,useState} from 'react';
import type {KeyboardEvent,ReactNode} from 'react';
import {FileText,UserRound,Layers3,CreditCard,FolderKanban,Pencil,ChevronDown,ArrowRight} from 'lucide-react';
import {BillingValidationContext,sectionForPath,revealBillingField} from './billing-validation-ui';
import type {BillingSection} from './billing-validation-ui';
import type {BillingIssue} from '../billing-contracts';
const Flow=createContext<{active:string;setActive:(id:string)=>void;advance:(id:string,title:string)=>void}>({active:'document',setActive:()=>{},advance:()=>{}});
const order=['document','buyer','lines','conditions','references'];
const icons={document:FileText,buyer:UserRound,lines:Layers3,conditions:CreditCard,references:FolderKanban,seller:UserRound};
export function BlueCheck({label='Validé'}:{label?:string}){return <span className="bill-blue-check" role="img" aria-label={label}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="11"/><path d="m7 12 3.2 3.2 6.8-7" pathLength="1"/></svg></span>;}
export function StepFlow({children}:{children:ReactNode}){
 const[active,changeActive]=useState('document'),[announcement,setAnnouncement]=useState('');
 const root=useRef<HTMLDivElement>(null),destination=useRef<string|null>(null);
 const setActive=(id:string)=>{destination.current=null;changeActive(id);};
 const advance=(id:string,title:string)=>{
  const visible=order.filter(section=>root.current?.querySelector('[data-step="'+section+'"]'));
  const next=visible[visible.indexOf(id)+1]||'';
  destination.current=next||id;setAnnouncement(title+' validé');changeActive(next);
 };
 function navigate(event:KeyboardEvent<HTMLDivElement>){
  if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  const triggers=Array.from(root.current?.querySelectorAll<HTMLElement>('.bill-step>summary')||[]);
  const index=triggers.indexOf(event.target as HTMLElement);if(index<0)return;
  event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?triggers.length-1:(index+(event.key==='ArrowDown'?1:-1)+triggers.length)%triggers.length;
  triggers[next]?.focus({preventScroll:true});
  triggers[next]?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }
 useLayoutEffect(()=>{
  if(!destination.current)return;
  const summary=root.current?.querySelector<HTMLElement>('[data-step="'+destination.current+'"]>summary');
  destination.current=null;summary?.focus({preventScroll:true});
  // Let the closing panel settle before scrolling; keep keyboard focus on a visible control.
  const timer=setTimeout(()=>{if(document.activeElement===summary)summary?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});},matchMedia('(prefers-reduced-motion: reduce)').matches?0:300);
  return()=>clearTimeout(timer);
 },[active]);
 return <Flow.Provider value={{active,setActive,advance}}><div ref={root} className="bill-step-flow" onKeyDown={navigate}><span className="bill-sr-only" role="status" aria-live="polite">{announcement}</span>{children}</div></Flow.Provider>;
}
export function DocumentStep({section,title,summary,signature,issues,filled=true,children}:{section:BillingSection;title:string;summary:string;signature:unknown;issues:BillingIssue[];filled?:boolean;children:ReactNode}){
 const {active,setActive,advance}=useContext(Flow),[validated,setValidated]=useState<string|null>(null),[attempted,setAttempted]=useState(false),root=useRef<HTMLDetailsElement>(null),bodyId=useId();
 const globalValidation=useContext(BillingValidationContext);
 const key=JSON.stringify(signature),problems=issues.filter(i=>sectionForPath(i.path)===section),complete=validated===key&&filled&&!problems.length,open=active===section,Glyph=icons[section];
 const cancelReveal=useRef<(()=>void)|undefined>(undefined);
 useLayoutEffect(()=>{
  const el=root.current,show=()=>setActive(section);el?.addEventListener('billing:reveal',show);
  return()=>el?.removeEventListener('billing:reveal',show);
 },[section,setActive]);
 useLayoutEffect(()=>()=>cancelReveal.current?.(),[]);
 function validate(){
  setAttempted(true);
  if(!filled||problems.length){
   const target=Array.from(root.current?.querySelectorAll<HTMLElement>('[data-billing-path]')||[]).find(el=>el.dataset.billingPath===problems[0]?.path)||root.current?.querySelector<HTMLElement>('[aria-invalid=true],input,textarea,select');
   cancelReveal.current?.();if(target&&root.current)cancelReveal.current=revealBillingField(target,root.current);return;
  }
  setValidated(key);setAttempted(false);advance(section,title);
 }
 return <details ref={root} className="bill-section bill-step" data-step={section} data-complete={complete} open={open} onToggle={e=>{if(e.currentTarget.open&&!open)setActive(section);}}>
  <summary aria-label={(open?'Réduire ':'Modifier ')+title} aria-expanded={open} aria-controls={bodyId} onClick={e=>{e.preventDefault();setActive(open?'':section);}}>
   <span className={'bill-step-symbol'+(complete?' is-complete':'')}>{complete?<BlueCheck label={title+' validé'}/>:<Glyph size={21} aria-hidden="true"/>}</span>
   <span className="bill-step-caption"><b>{title}</b>{!open&&<small>{summary||'À compléter'}</small>}</span>
   <span className="bill-step-edit" aria-hidden="true">{open?<ChevronDown size={17}/>:<Pencil size={16}/>}</span>
  </summary>
  <BillingValidationContext.Provider value={{issues:globalValidation.reviewed?globalValidation.issues:issues,reviewed:attempted||globalValidation.reviewed}}>
   <div className="bill-step-body" id={bodyId} inert={!open}>{children}
    <div className="bill-step-actions">{attempted&&(!filled||problems.length)&&<span role="alert">{problems[0]?.message||'Complétez cette section.'}</span>}<button type="button" className="bill-button bill-button-primary" onClick={validate}>{complete?'Continuer':'Valider'}<ArrowRight size={16} aria-hidden="true"/></button></div>
   </div>
  </BillingValidationContext.Provider>
 </details>;
}
