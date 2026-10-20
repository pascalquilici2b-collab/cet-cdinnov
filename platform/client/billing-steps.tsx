import {createContext,useContext,useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {FileText,UserRound,Layers3,CreditCard,FolderKanban,Pencil,ChevronDown,ArrowRight} from 'lucide-react';
import {BillingValidationContext,sectionForPath} from './billing-validation-ui';
import type {BillingSection} from './billing-validation-ui';
import type {BillingIssue} from '../billing-contracts';
const Flow=createContext<{active:string;setActive:(id:string)=>void}>({active:'document',setActive:()=>{}});
const order=['document','buyer','lines','conditions','references'];
const icons={document:FileText,buyer:UserRound,lines:Layers3,conditions:CreditCard,references:FolderKanban,seller:UserRound};
export function BlueCheck({label='Validé'}:{label?:string}){return <span className="bill-blue-check" role="img" aria-label={label}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="11"/><path d="m7 12 3.2 3.2 6.8-7" pathLength="1"/></svg></span>;}
export function StepFlow({children}:{children:ReactNode}){const[active,setActive]=useState('document');return <Flow.Provider value={{active,setActive}}>{children}</Flow.Provider>;}
export function DocumentStep({section,title,summary,signature,issues,filled=true,children}:{section:BillingSection;title:string;summary:string;signature:unknown;issues:BillingIssue[];filled?:boolean;children:ReactNode}){
 const {active,setActive}=useContext(Flow),[validated,setValidated]=useState<string|null>(null),[attempted,setAttempted]=useState(false),root=useRef<HTMLDetailsElement>(null);
 const globalValidation=useContext(BillingValidationContext);
 const key=JSON.stringify(signature),problems=issues.filter(i=>sectionForPath(i.path)===section),complete=validated===key&&filled&&!problems.length,open=active===section,Glyph=icons[section];
 const previous=useRef(open);
 useEffect(()=>{if(open&&!previous.current)root.current?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});previous.current=open;},[open]);
 function validate(){
  setAttempted(true);
  if(!filled||problems.length){const target=root.current?.querySelector<HTMLElement>('[aria-invalid=true],input,textarea');target?.focus();return;}
  setValidated(key);setAttempted(false);setActive(order[order.indexOf(section)+1]||'');
 }
 return <details ref={root} className="bill-section bill-step" data-step={section} data-complete={complete} open={open} onToggle={e=>{if(e.currentTarget.open&&!open)setActive(section);}}>
  <summary aria-label={(open?'Réduire ':'Modifier ')+title} onClick={e=>{e.preventDefault();setActive(open?'':section);}}>
   <span className={'bill-step-symbol'+(complete?' is-complete':'')}>{complete?<BlueCheck label={title+' validé'}/>:<Glyph size={21} aria-hidden="true"/>}</span>
   <span className="bill-step-caption"><b>{title}</b>{!open&&<small>{summary||'À compléter'}</small>}</span>
   <span className="bill-step-edit" aria-hidden="true">{open?<ChevronDown size={17}/>:<Pencil size={16}/>}</span>
  </summary>
  <BillingValidationContext.Provider value={{issues:globalValidation.reviewed?globalValidation.issues:issues,reviewed:attempted||globalValidation.reviewed}}>
   <div className="bill-step-body">{children}
    <div className="bill-step-actions">{attempted&&(!filled||problems.length)&&<span role="alert">{problems[0]?.message||'Complétez cette section.'}</span>}<button type="button" className="bill-button bill-button-primary" onClick={validate}>{complete?'Continuer':'Valider'}<ArrowRight size={16} aria-hidden="true"/></button></div>
   </div>
  </BillingValidationContext.Provider>
 </details>;
}
