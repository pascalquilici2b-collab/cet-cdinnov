import {showSuccess} from './action-feedback';
import {QuoteTransition} from './billing-quote-transition';
import {Send,CheckCheck} from 'lucide-react';
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {CheckCircle2,ChevronDown,FilePenLine,LoaderCircle,Check,Banknote,Clock3} from 'lucide-react';
import {billingStateLabel,billingDisplayState,invoiceIsLate} from '../billing-display-state';
export {billingStateLabel} from '../billing-display-state';
import {BillingStateIcon} from './billing-state-icon';
import {StatusPaymentDialog} from './billing-status-payment';
import {DropdownMenu} from 'radix-ui';
import {useConfirmation} from './action-dialog';
import {Help} from './billing-help';
import type {BillingDocument,BillingTransport,BillingIssue} from '../billing-contracts';

const message=(e:unknown)=>e instanceof Error?e.message:'La finalisation n’a pas abouti.';
export type DocumentStatusHandle={finalize:()=>Promise<BillingDocument|undefined>};
type Props={capacityBlocked?:boolean;serviceConfigured:boolean;record:BillingDocument|null;saved:boolean;busy:boolean;transport:BillingTransport;onDocument:(d:BillingDocument)=>void;onBusy:(v:string)=>void;onNotice:(v:string)=>void;onSave:()=>Promise<BillingDocument|undefined>;draftIssues:BillingIssue[];onReview:()=>void};

export const DocumentStatus=forwardRef<DocumentStatusHandle,Props>(function DocumentStatus({record,saved,busy,transport,onDocument,onBusy,onNotice,onSave,draftIssues,onReview,serviceConfigured,capacityBlocked=false},ref){
 const [quoteAction,setQuoteAction]=useState<'sent'|'accepted'|null>(null);
 const [error,setError]=useState(''),[paymentMode,setPaymentMode]=useState<'paid'|'unpaid'|null>(null),{confirm,dialog}=useConfirmation();
 const live=useRef(true),running=useRef(false),attempt=useRef<{key:string;id:string}|null>(null);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 async function finish(){
  if(!record||busy||running.current||capacityBlocked)return;
  if(record.issuance?.state==='ready')return record;
  if(!record.issuance&&draftIssues.length){setError('Finalisation impossible : '+draftIssues.length+' point'+(draftIssues.length>1?'s':'')+' à compléter ci-dessous.');onReview();return;}
  if(!record.issuance&&!await confirm({title:'Finaliser ce document ?',message:'Le contenu sera figé et le PDF définitif sera généré. Le numéro réservé est conservé.',accept:'Finaliser'}))return;
  running.current=true;setError('');
  try{
   let current=record;
   if(!saved&&!current.issuance){const updated=await onSave();if(!updated||!live.current)return;current=updated;}
   onBusy('issue');
   if(!current.issuance){const key=current.id+':'+current.version;if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};current=await transport.issue(current.id,current.version,attempt.current.id,'automatic');if(!live.current)return;onDocument(current);}
   current=await transport.finalize(current.id,current.version);if(!live.current)return;
   onDocument(current);if(current.status==='issued')showSuccess('Finalisé');else onNotice(current.status==='issue_failed'?'La génération doit être reprise. Le numéro est conservé.':'Génération en cours.');
   return current;
  }catch(e){
   if(!live.current)return;setError(message(e));
   try{const latest=await transport.get(record.id);if(live.current)onDocument(latest);}catch{if(live.current)setError(message(e)+' Actualisez le document avant de réessayer.');}
  }finally{running.current=false;if(live.current)onBusy('');}
 }
 useImperativeHandle(ref,()=>({finalize:finish}));
 const issue=record?.issuance,ready=issue?.state==='ready',inactive=!!record?.rectification?.replacementId||!!record?.quote&&(record.quote.revision.abandoned||record.quote.revision.currentId!==record.id);
 return <div className="bill-status-control" data-ready={ready} data-status={billingDisplayState(record)}>
  <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="bill-status-trigger" data-status={billingDisplayState(record)} aria-label="Statut du document" disabled={busy||!record||inactive}>
   <BillingStateIcon state={billingDisplayState(record)}/><span>{billingStateLabel(record)}</span><ChevronDown size={14}/>
  </button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="cdi-action-menu bill-state-menu" align="start" sideOffset={6}>
   <DropdownMenu.Item data-status="draft" disabled={!!issue} onSelect={()=>setError('')}><FilePenLine size={17}/>Brouillon{!issue&&<Check className="cdi-menu-check" size={15}/>}</DropdownMenu.Item>
   <DropdownMenu.Item data-status="finalized" disabled={capacityBlocked||!serviceConfigured||(ready&&(!record?.settlement||record.settlement.netPaidMinor==='0'||invoiceIsLate(record.data.issueDate,record.data.dueDate)))} onSelect={()=>{if(ready)setPaymentMode('unpaid');else void finish();}}><CheckCircle2 className="bill-finalized-icon" size={17}/>{issue&&!ready?'Reprendre la finalisation':'Finalisé'}{billingDisplayState(record)==='finalized'&&<Check className="cdi-menu-check" size={15}/>}</DropdownMenu.Item>
   {record?.data.kind==='quote'&&<><DropdownMenu.Item data-status="sent" disabled={!ready||!!record.quote?.version||!!record.quote?.invoice} onSelect={()=>setQuoteAction('sent')}><Send size={17}/>Envoyé{record.quote?.state==='sent'&&<Check size={15}/>}</DropdownMenu.Item><DropdownMenu.Item data-status="accepted" disabled={!ready||!!record.quote?.invoice||['accepted','refused'].includes(record.quote?.state||'')} onSelect={()=>setQuoteAction('accepted')}><CheckCheck size={17}/>Accepté{record.quote?.state==='accepted'&&<Check size={15}/>}</DropdownMenu.Item></>}
   {record?.data.kind==='invoice'&&<><DropdownMenu.Separator className="cdi-menu-separator"/><DropdownMenu.Item data-status="overdue" title="Automatique après l’échéance, tant qu’un montant reste à encaisser" disabled={!ready||!invoiceIsLate(record.data.issueDate,record.data.dueDate)||record.settlement?.netPaidMinor==='0'} onSelect={()=>setPaymentMode('unpaid')}><Clock3 size={17}/>En retard d’encaissement{billingDisplayState(record)==='overdue'&&<Check className="cdi-menu-check" size={15}/>}</DropdownMenu.Item><DropdownMenu.Item data-status="paid" disabled={!ready||!record.settlement||record.settlement.dueMinor==='0'} onSelect={()=>setPaymentMode('paid')}><Banknote size={17}/>Réglée{record.settlement?.state==='paid'&&<Check className="cdi-menu-check" size={15}/>}</DropdownMenu.Item></>}
  </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
  <Help label="Statut du document" text={ready?'Le document définitif est archivé. Pour corriger un devis, créez une nouvelle version.':!serviceConfigured?'Le moteur PDF est indisponible.':'Choisissez Finalisé pour figer le document et générer ses fichiers définitifs. Le numéro déjà réservé est conservé.'}/>
  {issue&&!ready&&<button className="bill-button" disabled={busy} onClick={()=>{void finish();}}>Reprendre</button>}
  {error&&<span className="bill-status-error" role="alert">{error}</span>}
  {dialog}{quoteAction&&record&&<QuoteTransition action={quoteAction} record={record} transport={transport} onDocument={onDocument} onBusy={onBusy} onClose={()=>setQuoteAction(null)}/>}
  {paymentMode&&record&&<StatusPaymentDialog record={record} mode={paymentMode} transport={transport} onDocument={onDocument} onBusy={onBusy} onClose={()=>setPaymentMode(null)}/>}
 </div>;
});

export function IssuanceFiles({record,busy,onDownload}:{record:BillingDocument;busy:boolean;onDownload:(kind:string)=>void}){
 const files=record.issuance?.files.filter(f=>f!=='pdf')||[];
 return files.length?<details className="bill-archive-tools"><summary>Fichiers techniques et contrôles</summary><div className="bill-issuance-actions">{files.map(kind=><button type="button" className="bill-button" key={kind} disabled={busy} onClick={()=>onDownload(kind)}>{({xml:'Télécharger le XML',validation:'Rapport de validation',verapdf:'Rapport PDF/A'} as Record<string,string>)[kind]||kind}</button>)}</div></details>:null;
}
export function NumberingPanel({onDirty}:{transport:BillingTransport;sellerSiren:string;busy:boolean;onBusy:(value:string)=>void;onDirty:(value:boolean)=>void}){
 useEffect(()=>{onDirty(false);},[onDirty]);
 return <section className="bill-issuance bill-numbering" aria-label="Numérotation"><h2 className="bill-title-help">Numérotation automatique <Help label="Numérotation" text="Le numéro est réservé à la création et ne sera pas réutilisé. Le compteur des devis est quotidien ; celui des factures est continu. La référence du devis reste visible sur sa facture."/></h2><div className="bill-fields"><p><strong>Devis</strong><br/>AAAAMMJJ-001</p><p><strong>Factures</strong><br/>F-AAAAMMJJ-001</p></div></section>;
}
