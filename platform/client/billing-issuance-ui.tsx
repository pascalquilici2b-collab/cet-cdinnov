import {useEffect,useRef,useState} from 'react';
import {Help} from './billing-help';
import type {BillingDocument,BillingTransport,BillingIssue} from '../billing-contracts';

export const billingStateLabel=(document:BillingDocument|null|undefined)=>document?.quote?.revision.abandoned?'Version abandonnée':!document?.issuance?'Brouillon':document.issuance.state==='ready'?'Émis':document.issuance.state==='failed'?'À reprendre':'Finalisation en cours';
const failures:Record<string,string>={render:'Le rendu du document a échoué.',validation:'Le document n’a pas passé les contrôles définitifs.',storage:'L’archivage des fichiers n’a pas abouti.',unavailable:'Le moteur documentaire était indisponible.'};
const message=(e:unknown)=>e instanceof Error?e.message:'La finalisation n’a pas abouti.';

export function IssuancePanel({record,saved,busy,transport,onDocument,onBusy,onNotice,onDownload,draftIssues,onReview,serviceConfigured=true}:{serviceConfigured?:boolean;record:BillingDocument|null;saved:boolean;busy:boolean;transport:BillingTransport;onDocument:(d:BillingDocument)=>void;onBusy:(value:string)=>void;onNotice:(value:string)=>void;onDownload:(kind:string)=>void;draftIssues:BillingIssue[];onReview:()=>void}){
 const selected='automatic';
 const [error,setError]=useState(''),[checking,setChecking]=useState(false),[expanded,setExpanded]=useState(false);
 const live=useRef(true),running=useRef(false),attempt=useRef<{key:string;id:string}|null>(null);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 async function verify(){if(!record||running.current)return;running.current=true;setChecking(true);onBusy('issue-check');try{const latest=await transport.get(record.id);if(live.current){onDocument(latest);setError('');}}catch(e){if(live.current)setError(message(e));}finally{running.current=false;if(live.current){setChecking(false);onBusy('');}}}
 async function finish(){
  if(!record||!saved||busy||running.current||(!record.issuance&&!selected))return;
  if(!record.issuance&&draftIssues.length){onReview();return;}
  if(!record.issuance&&!window.confirm('Finaliser ce document ? Un numéro sera réservé et son contenu sera figé. Vérifiez l’aperçu et les coordonnées avant de poursuivre.'))return;
  running.current=true;onBusy('issue');setError('');
  try{
   let current=record;
   if(!current.issuance){const key=current.id+':'+current.version+':'+selected;if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};current=await transport.issue(current.id,current.version,attempt.current.id,selected);if(!live.current)return;onDocument(current);}
   current=await transport.finalize(current.id,current.version);if(!live.current)return;
   onDocument(current);onNotice(current.status==='issued'?'Document finalisé et fichiers archivés. Aucune transmission à AGIRIS n’a été effectuée.':current.status==='issue_failed'?'La génération doit être reprise. Le numéro et le document sont conservés.':'Le traitement est en cours. Actualisez son état dans un instant.');
  }catch(e){
   if(!live.current)return;setError(message(e));
   try{const latest=await transport.get(record.id);if(live.current)onDocument(latest);}catch{if(live.current)setError(message(e)+' Le résultat reste à vérifier avant toute nouvelle tentative.');}
  }finally{running.current=false;if(live.current)onBusy('');}
 }
 const issue=record?.issuance;
 if(!issue&&!serviceConfigured)return <div className="bill-service-pending" role="status">PDF & émission à activer <Help label="Activation des PDF et de l’émission" text="Vos brouillons et l’aperçu en direct sont disponibles. Le moteur documentaire doit être raccordé pour produire les nouveaux PDF et Factur-X. Le convertisseur des factures importées reste dans Historique & dossiers."/></div>;
 if(!issue&&record?.quote&&(record.quote.revision.abandoned||record.quote.revision.currentId!==record.id))return null;
 if(issue?.state==='ready')return issue.files.length>1?<details className="bill-archive-tools"><summary>Fichiers techniques et contrôles <Help label="Fichiers techniques" text="Le Factur-X contient déjà le XML. Ces fichiers donnent accès aux données structurées et aux rapports de contrôle."/><span>⌄</span></summary><div className="bill-issuance-actions">{issue.files.filter(kind=>kind!=='pdf').map(kind=><button type="button" className="bill-button" key={kind} disabled={busy} onClick={()=>onDownload(kind)}>{({xml:'Télécharger le XML',validation:'Rapport de validation',verapdf:'Rapport PDF/A'} as Record<string,string>)[kind]||kind}</button>)}</div></details>:null;
 return <details className="bill-finalize-disclosure" open={!!issue||expanded} onToggle={e=>{if(!issue)setExpanded(e.currentTarget.open);}}><summary><span>{issue?'Terminer la génération':'Vérifier et finaliser'}</span>{issue&&<small>{issue.number}</small>}<span>⌄</span></summary><section className="bill-issuance" aria-label="Finalisation du document"><div><h2 className="bill-title-help">{issue?issue.number:'Finaliser le document'}{!issue&&<Help label="Finalisation" text="Le contrôle préalable vérifie le document avant de réserver son numéro. La finalisation fige son contenu et archive ses fichiers."/>}</h2>{issue&&<p>{billingStateLabel(record)} · Contenu figé.</p>}</div>
  {error&&<p role="alert" className="bill-issuance-error">{error}</p>}
  {!record?<p>Enregistrez votre brouillon pour accéder à la finalisation.</p>:<>
   {!issue&&<p className="bill-title-help">Numérotation automatique <Help label="Numérotation automatique" text="Le numéro est attribué à la finalisation. Les devis ont un compteur quotidien ; les factures ont un compteur continu indépendant et reprennent la référence du devis."/></p>}
   {issue?.state==='failed'&&<p role="status">{failures[issue.errorCode||'']||'La finalisation a échoué.'} Une reprise conservera le même numéro.</p>}
   {!saved&&<p>Enregistrez les modifications avant de finaliser.</p>}
   {!issue&&!!draftIssues.length&&<p>{draftIssues.length} point{draftIssues.length>1?'s':''} à compléter avant la finalisation.</p>}
   <div className="bill-issuance-actions">{!issue&&!!draftIssues.length?<button type="button" className="bill-button bill-button-primary" disabled={busy} onClick={onReview}>Compléter le document</button>:<button className="bill-button bill-button-primary" disabled={busy||!saved||(!issue&&!selected)} onClick={finish}>{busy&&!checking?'Finalisation…':issue?'Reprendre la génération':'Finaliser et générer'}</button>}{issue&&<button className="bill-button" disabled={busy} onClick={verify}>{checking?'Vérification…':'Actualiser l’état'}</button>}</div>
  </>}
 </section></details>;
}

export function NumberingPanel({onDirty}:{transport:BillingTransport;sellerSiren:string;busy:boolean;onBusy:(value:string)=>void;onDirty:(value:boolean)=>void}){
 useEffect(()=>{onDirty(false);},[onDirty]);
 return <section className="bill-issuance bill-numbering" aria-label="Numérotation"><h2 className="bill-title-help">Numérotation automatique <Help label="Numérotation" text="Les brouillons ne consomment aucun numéro. Le compteur des devis repart à 001 chaque jour. Celui des factures continue d’un jour à l’autre. La référence du devis reste visible sur sa facture."/></h2><div className="bill-fields"><p><strong>Devis</strong><br/>AAAAMMJJ-001</p><p><strong>Factures</strong><br/>F-AAAAMMJJ-001</p></div></section>;
}
