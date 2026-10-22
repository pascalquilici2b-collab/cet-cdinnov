import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {CheckCircle2,ChevronDown,FilePenLine,LoaderCircle,Check} from 'lucide-react';
import {DropdownMenu} from 'radix-ui';
import {useConfirmation} from './action-dialog';
import {Help} from './billing-help';
import type {BillingDocument,BillingTransport,BillingIssue} from '../billing-contracts';

export const billingStateLabel=(document:BillingDocument|null|undefined)=>document?.quote?.revision.abandoned?'Version abandonnée':!document?.issuance?'Brouillon':document.issuance.state==='ready'?'Finalisé':document.issuance.state==='failed'?'À reprendre':'Finalisation en cours';
const message=(e:unknown)=>e instanceof Error?e.message:'La finalisation n’a pas abouti.';
export type DocumentStatusHandle={finalize:()=>Promise<BillingDocument|undefined>};
type Props={serviceConfigured:boolean;record:BillingDocument|null;saved:boolean;busy:boolean;transport:BillingTransport;onDocument:(d:BillingDocument)=>void;onBusy:(v:string)=>void;onNotice:(v:string)=>void;onSave:()=>Promise<BillingDocument|undefined>;draftIssues:BillingIssue[];onReview:()=>void};

export const DocumentStatus=forwardRef<DocumentStatusHandle,Props>(function DocumentStatus({record,saved,busy,transport,onDocument,onBusy,onNotice,onSave,draftIssues,onReview,serviceConfigured},ref){
 const [error,setError]=useState(''),{confirm,dialog}=useConfirmation();
 const live=useRef(true),running=useRef(false),attempt=useRef<{key:string;id:string}|null>(null);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 async function finish(){
  if(!record||busy||running.current)return;
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
   onDocument(current);onNotice(current.status==='issued'?'Document finalisé.':current.status==='issue_failed'?'La génération doit être reprise. Le numéro est conservé.':'Génération en cours.');
   return current;
  }catch(e){
   if(!live.current)return;setError(message(e));
   try{const latest=await transport.get(record.id);if(live.current)onDocument(latest);}catch{if(live.current)setError(message(e)+' Actualisez le document avant de réessayer.');}
  }finally{running.current=false;if(live.current)onBusy('');}
 }
 useImperativeHandle(ref,()=>({finalize:finish}));
 const issue=record?.issuance,ready=issue?.state==='ready',inactive=!!record?.quote&&(record.quote.revision.abandoned||record.quote.revision.currentId!==record.id);
 return <div className="bill-status-control" data-ready={ready}>
  <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="bill-status-trigger" aria-label="Statut du document" disabled={busy||!record||inactive}>
   {ready?<CheckCircle2 size={17}/>:issue?<LoaderCircle size={17}/>:<FilePenLine size={17}/>}<span>{billingStateLabel(record)}</span><ChevronDown size={14}/>
  </button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="cdi-action-menu" align="start" sideOffset={6}>
   <DropdownMenu.Item disabled={!!issue} onSelect={()=>setError('')}><FilePenLine size={17}/>Brouillon{!issue&&<Check className="cdi-menu-check" size={15}/>}</DropdownMenu.Item>
   <DropdownMenu.Item disabled={ready||!serviceConfigured} onSelect={()=>{void finish();}}><CheckCircle2 size={17}/>{issue&&!ready?'Reprendre la finalisation':'Finalisé'}{ready&&<Check className="cdi-menu-check" size={15}/>}</DropdownMenu.Item>
  </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
  <Help label="Statut du document" text={ready?'Le document définitif est archivé. Pour corriger un devis, créez une nouvelle version.':!serviceConfigured?'Le moteur PDF est indisponible.':'Choisissez Finalisé pour figer le document et générer ses fichiers définitifs. Le numéro déjà réservé est conservé.'}/>
  {issue&&!ready&&<button className="bill-button" disabled={busy} onClick={()=>{void finish();}}>Reprendre</button>}
  {error&&<span className="bill-status-error" role="alert">{error}</span>}
  {dialog}
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
