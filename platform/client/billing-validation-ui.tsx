import {createContext,useContext,useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import type {BillingIssue} from '../billing-contracts';
import {Help} from './billing-help';

export const BillingValidationContext=createContext<{issues:BillingIssue[];reviewed:boolean}>({issues:[],reviewed:false});
export type BillingSection='document'|'seller'|'buyer'|'lines'|'conditions'|'references';
const documentPaths=['title','issueDate','dueDate','validUntil'];
export function sectionForPath(path:string):BillingSection{
 if(documentPaths.includes(path))return 'document';
 if(path.startsWith('details.')&&!path.startsWith('details.interventions')&&path!=='details.returnEmail')return 'document';
 if(path.startsWith('details.interventions')||path==='details.returnEmail')return 'references';
 for(const section of ['seller','buyer','lines','references'] as const)if(path===section||path.startsWith(section+'.'))return section;
 return 'conditions';
}
/** Reveal before focusing: a closed disclosure or an inert step cannot receive focus. */
export function revealBillingField(target:HTMLElement,root:HTMLElement){
 const parents:HTMLDetailsElement[]=[];
 let parent=target.parentElement;
 while(parent&&parent!==root){
  if(parent instanceof HTMLDetailsElement){parents.push(parent);parent.classList.add('bill-reveal-field');parent.open=true;}
  parent=parent.parentElement;
 }
 target.dispatchEvent(new Event('billing:reveal',{bubbles:true}));
 const frame=requestAnimationFrame(()=>{
  target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',behavior:'instant'});
  parents.forEach(el=>el.classList.remove('bill-reveal-field'));
 });
 return()=>{cancelAnimationFrame(frame);parents.forEach(el=>el.classList.remove('bill-reveal-field'));};
}
/** Completion describes the entered fields, never issuance or native validation. */
export function SectionMarker({number,title,section,filled=true}:{number:string;title:string;section:BillingSection;filled?:boolean}){
 const {issues}=useContext(BillingValidationContext);
 const complete=filled&&!issues.some(issue=>sectionForPath(issue.path)===section);
 return <span className="bill-section-marker" data-section={section} data-complete={complete} role="img" aria-label={title+' : '+(complete?'section complétée':'section à compléter')}>
  {complete?<svg key="complete" className="bill-section-check" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m7.5 12 3 3 6-6" pathLength="1"/></svg>:<span aria-hidden="true">{number}</span>}
 </span>;
}
const fieldLabels:Record<string,string>={issueDate:'Date du document',validUntil:'Validité du devis',dueDate:'Échéance',name:'Raison sociale',addressLine1:'Adresse',postalCode:'Code postal',city:'Ville',country:'Pays',email:'E-mail',siren:'SIREN / SIRET',siret:'SIRET',vatId:'N° de TVA',electronicAddress:'Adresse électronique',electronicScheme:'Type d’adresse électronique',description:'Description',unitCode:'Unité',quantity:'Quantité',unitPrice:'Prix unitaire HT',vatRate:'Taux de TVA',discountPercent:'Remise',exemptionReason:'Motif d’exonération',paymentTerms:'Conditions de paiement',businessProcess:'Mode de facturation',iban:'IBAN','legalNotes.recovery':'Indemnité de recouvrement','legalNotes.penalties':'Pénalités de retard','legalNotes.discount':'Escompte','creditNote.reason':'Motif de l’avoir'};
function location(path:string){
 const parts=path.split('.');
 if(parts[0]==='seller'||parts[0]==='buyer')return {group:parts[0]==='seller'?'Émetteur':'Client',label:fieldLabels[parts[1]]||'Coordonnées'};
 if(parts[0]==='lines')return {group:'Prestations',label:parts.length>1?'Prestation '+(Number(parts[1])+1)+(parts[2]?' · '+(fieldLabels[parts[2]]||'Montant'):''):'Ensemble des prestations'};
 return {group:['issueDate','validUntil','dueDate'].includes(path)?'Votre document':'Conditions & mentions',label:fieldLabels[path]||'Document'};
}

/** A review stays beside the editor on mobile, so links can reveal hidden inputs.
 * Only an explicit navigation changes focus; recalculation never steals it. */
export function DraftValidation({issues,reviewRequest,busy,onRevealEditor,children}:{issues:BillingIssue[];reviewRequest:number;busy:boolean;onRevealEditor:()=>void;children:ReactNode}){
 const [reviewed,setReviewed]=useState(false),[expanded,setExpanded]=useState(false),[destination,setDestination]=useState<{path:string|null;serial:number}|null>(null);
 const root=useRef<HTMLDivElement>(null),heading=useRef<HTMLDivElement>(null),listId=useId();
 const sequence=useRef(0);
 useEffect(()=>{if(reviewRequest){setReviewed(true);setExpanded(true);setDestination({path:null,serial:++sequence.current});}},[reviewRequest]);
 useLayoutEffect(()=>{
  if(!destination)return;
  const target=destination.path===null?heading.current:Array.from(root.current?.querySelectorAll<HTMLElement>('[data-billing-path]')||[]).find(el=>el.dataset.billingPath===destination.path);
  if(!target)return;
  return root.current?revealBillingField(target,root.current):undefined;
 },[destination]);
 const go=(path:string)=>{onRevealEditor();setDestination({path,serial:++sequence.current});};
 const groups=[...new Set(issues.map(i=>location(i.path).group))];
 return <BillingValidationContext.Provider value={{issues,reviewed}}><div className="bill-draft-validation" ref={root}>
  {reviewed&&issues.length>0&&<section className="bill-review" aria-label="Vérification du document" data-complete={!issues.length}>
   <div className="bill-review-heading" ref={heading} tabIndex={-1}><div><strong>{issues.length?`${issues.length} point${issues.length>1?'s':''} à compléter`:'Champs renseignés'}</strong><Help label="Vérification du document" text={issues.length?'Choisissez un point pour aller au champ concerné. Vous pouvez enregistrer le brouillon à tout moment.':'Le contrôle définitif sera effectué avant l’attribution du numéro.'}/></div>{!!issues.length&&<button type="button" className="bill-button" disabled={busy} aria-expanded={expanded} aria-controls={listId} onClick={()=>{setReviewed(true);setExpanded(v=>!v);}}>{expanded?'Masquer les points':'Vérifier le document'}</button>}</div>
   <div className="bill-review-content" id={listId} hidden={!expanded||!issues.length}><div className="bill-review-groups">{groups.map(group=><section key={group}><h3>{group}</h3><ul>{issues.filter(i=>location(i.path).group===group).map((issue,index)=><li key={issue.path+':'+index}><button type="button" disabled={busy} onClick={()=>go(issue.path)}><span>{location(issue.path).label}</span><span>{issue.message}</span><span aria-hidden="true">→</span></button></li>)}</ul></section>)}</div></div>
  </section>}{children}
 </div></BillingValidationContext.Provider>;
}
