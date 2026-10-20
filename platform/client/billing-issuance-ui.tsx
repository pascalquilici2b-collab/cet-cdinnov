import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import type {BillingDocument,BillingNumberSeries,BillingTransport,BillingKind,BillingIssue} from '../billing-contracts';

export const billingStateLabel=(document:BillingDocument|null|undefined)=>document?.quote?.revision.abandoned?'Version abandonnée':!document?.issuance?'Brouillon':document.issuance.state==='ready'?'Émis':document.issuance.state==='failed'?'À reprendre':'Finalisation en cours';
const failures:Record<string,string>={render:'Le rendu du document a échoué.',validation:'Le document n’a pas passé les contrôles définitifs.',storage:'L’archivage des fichiers n’a pas abouti.',unavailable:'Le moteur documentaire était indisponible.'};
const message=(e:unknown)=>e instanceof Error?e.message:'La finalisation n’a pas abouti.';

export function IssuancePanel({record,saved,busy,transport,onDocument,onBusy,onNotice,onDownload,draftIssues,onReview}:{record:BillingDocument|null;saved:boolean;busy:boolean;transport:BillingTransport;onDocument:(d:BillingDocument)=>void;onBusy:(value:string)=>void;onNotice:(value:string)=>void;onDownload:(kind:string)=>void;draftIssues:BillingIssue[];onReview:()=>void}){
 const [series,setSeries]=useState<BillingNumberSeries[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[reload,setReload]=useState(0),[checking,setChecking]=useState(false),[expanded,setExpanded]=useState(false);
 const live=useRef(true),running=useRef(false),attempt=useRef<{key:string;id:string}|null>(null);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{let active=true;if(!record||record.issuance)return;
  transport.numberSeries().then(rows=>{if(!active)return;const siren=record.data.seller.siren.replace(/\s/g,'')||record.data.seller.siret.replace(/\s/g,'').slice(0,9);const matching=rows.filter(s=>s.kind===record.data.kind&&s.issuer_siren===siren&&s.start_date<=record.data.issueDate&&s.end_date>=record.data.issueDate);setSeries(matching);setSelected(matching.length===1?matching[0].id:'');setError('');},e=>{if(active)setError(message(e));});return()=>{active=false;};
 },[record?.id,record?.version,!!record?.issuance,transport,reload]);
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
 if(!issue&&record?.quote&&(record.quote.revision.abandoned||record.quote.revision.currentId!==record.id))return null;
 if(issue?.state==='ready')return issue.files.length>1?<details className="bill-archive-tools"><summary>Fichiers techniques et contrôles <span>⌄</span></summary><p>Le Factur-X contient déjà le XML. Ces fichiers permettent de consulter les contrôles effectués.</p><div className="bill-issuance-actions">{issue.files.filter(kind=>kind!=='pdf').map(kind=><button type="button" className="bill-button" key={kind} disabled={busy} onClick={()=>onDownload(kind)}>{({xml:'Télécharger le XML',validation:'Rapport de validation',verapdf:'Rapport PDF/A'} as Record<string,string>)[kind]||kind}</button>)}</div></details>:null;
 return <details className="bill-finalize-disclosure" open={!!issue||expanded} onToggle={e=>{if(!issue)setExpanded(e.currentTarget.open);}}><summary><span>{issue?'Terminer la génération':'Vérifier et finaliser'}</span><small>{issue?issue.number:'Après avoir enregistré et vérifié votre document'}</small><span>⌄</span></summary><section className="bill-issuance" aria-label="Finalisation du document"><div><h2>{issue?issue.number:'Finaliser le document'}</h2>{issue?<p>{billingStateLabel(record)} · Le numéro est réservé ; le contenu est désormais figé.</p>:<p>Le contrôle préalable vérifie le document avant de réserver son numéro.</p>}</div>
  {error&&<p role="alert" className="bill-issuance-error">{error}</p>}
  {!record?<p>Enregistrez votre brouillon pour accéder à la finalisation.</p>:<>
   {!issue&&<label>Série de numérotation<select aria-label="Série de numérotation" disabled={busy||!saved} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Sélectionnez une série</option>{series.map(s=><option key={s.id} value={s.id}>{s.prefix} · prochaine valeur {s.next_value.toString().padStart(s.width,'0')}</option>)}</select></label>}
   {!issue&&!series.length&&<p>Créez une série pour cet émetteur et cette période dans les paramètres, après vérification des numéros déjà utilisés. <button disabled={busy} onClick={()=>setReload(n=>n+1)}>Actualiser les séries</button></p>}
   {issue?.state==='failed'&&<p role="status">{failures[issue.errorCode||'']||'La finalisation a échoué.'} Une reprise conservera le même numéro.</p>}
   {!saved&&<p>Enregistrez les modifications avant de finaliser.</p>}
   {!issue&&!!draftIssues.length&&<p>{draftIssues.length} point{draftIssues.length>1?'s':''} à compléter avant la finalisation.</p>}
   <div className="bill-issuance-actions">{!issue&&!!draftIssues.length?<button type="button" className="bill-button bill-button-primary" disabled={busy} onClick={onReview}>Compléter le document</button>:<button className="bill-button bill-button-primary" disabled={busy||!saved||(!issue&&!selected)} onClick={finish}>{busy&&!checking?'Finalisation…':issue?'Reprendre la génération':'Finaliser et générer'}</button>}{issue&&<button className="bill-button" disabled={busy} onClick={verify}>{checking?'Vérification…':'Actualiser l’état'}</button>}</div>
  </>}
 </section></details>;
}

export function NumberingPanel({transport,sellerSiren,busy,onBusy,onDirty}:{transport:BillingTransport;sellerSiren:string;busy:boolean;onBusy:(value:string)=>void;onDirty:(value:boolean)=>void}){
 const [rows,setRows]=useState<BillingNumberSeries[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [kind,setKind]=useState<BillingKind>('invoice'),[issuer,setIssuer]=useState(sellerSiren),[prefix,setPrefix]=useState(''),[width,setWidth]=useState('4'),[first,setFirst]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState('');
 const live=useRef(true),saving=useRef(false),attempt=useRef<{key:string;id:string}|null>(null);
 const clean=useRef(JSON.stringify({kind,issuer,prefix,width,first,start,end}));
 useEffect(()=>{onDirty(JSON.stringify({kind,issuer,prefix,width,first,start,end})!==clean.current);},[kind,issuer,prefix,width,first,start,end,onDirty]);
 useEffect(()=>{live.current=true;transport.numberSeries().then(value=>{if(live.current)setRows(value);},e=>{if(live.current)setError(message(e));});return()=>{live.current=false;onDirty(false);};},[transport,onDirty]);
 async function save(event:FormEvent){
  event.preventDefault();if(busy||saving.current)return;setError('');setNotice('');
  if(!/^\d+$/.test(first)||!/^\d+$/.test(width)){setError('Renseignez un premier compteur et une largeur en nombres entiers.');return;}
  const data={issuerSiren:issuer.replace(/\s/g,''),kind,prefix,width:Number(width),firstValue:Number(first),startDate:start,endDate:end};
  if(!window.confirm(`Créer la série ${prefix}, à partir de ${first} ? Vérifiez que les numéros précédents ont été rapprochés de votre historique. La série sera conservée sans remise à zéro.`))return;
  const key=JSON.stringify(data);if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};saving.current=true;onBusy('numbering');
  try{await transport.createNumberSeries({id:attempt.current.id,...data});const latest=await transport.numberSeries();if(live.current){setRows(latest);setNotice('Série enregistrée. Aucun numéro n’a été consommé.');clean.current=JSON.stringify({kind,issuer,prefix:'',width,first:'',start,end});setPrefix('');setFirst('');onDirty(false);attempt.current=null;}}
  catch(e){if(live.current)setError(message(e));}finally{saving.current=false;if(live.current)onBusy('');}
 }
 return <section className="bill-issuance bill-numbering" aria-label="Numérotation"><h2>Numérotation des documents</h2><p>Indiquez la série et la prochaine valeur après contrôle de votre historique. Les brouillons ne consomment aucun numéro.</p>{error&&<p role="alert" className="bill-issuance-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {rows.length>0&&<ul>{rows.map(s=><li key={s.id}><b>{s.prefix}</b> · {s.kind==='invoice'?'Factures':'Devis'} · {s.issuer_siren} · prochaine valeur {s.next_value} · {s.start_date} → {s.end_date}</li>)}</ul>}
  <form onSubmit={save}><fieldset disabled={busy}><div className="bill-fields">
   <label>Type de document<select aria-label="Type de série" value={kind} onChange={e=>setKind(e.target.value as BillingKind)}><option value="invoice">Factures</option><option value="quote">Devis</option></select></label>
   <label>SIREN de l’émetteur<input aria-label="SIREN de la série" value={issuer} maxLength={30} onChange={e=>setIssuer(e.target.value)} required/></label>
   <label>Préfixe<input aria-label="Préfixe de numérotation" value={prefix} maxLength={26} onChange={e=>setPrefix(e.target.value)} placeholder="Ex. FA-2026-" required/></label>
   <label>Premier compteur<input aria-label="Premier compteur" inputMode="numeric" value={first} onChange={e=>setFirst(e.target.value)} required/></label>
   <label>Nombre minimal de chiffres<input aria-label="Largeur du compteur" inputMode="numeric" value={width} onChange={e=>setWidth(e.target.value)} required/></label>
   <label>Début de période<input aria-label="Début de série" type="date" value={start} onChange={e=>setStart(e.target.value)} required/></label>
   <label>Fin de période<input aria-label="Fin de série" type="date" value={end} onChange={e=>setEnd(e.target.value)} required/></label>
  </div><button className="bill-button" type="submit">Créer la série</button></fieldset></form>
 </section>;
}
