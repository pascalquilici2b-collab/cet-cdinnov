import {ClientEmployees} from './client-employees';
import {showSuccess} from './action-feedback';
import {ClientContacts} from './billing-client-contacts';
import {sameClient,enrichClient} from '../billing-client-match';
import {BrandMark} from './loading';
import {ClientLegalFields} from './billing-client-details-ui';
import {BlueCheck} from './billing-steps';
import {CompanyLookup} from './billing-company-lookup';
import {ClientLogoField} from './billing-client-logo-field';
import {ClientAvatar} from './billing-client-avatar';
import {useEffect,useRef,useState} from 'react';
import type {KeyboardEvent} from 'react';
import type {ReactNode} from 'react';
import {Search,Plus,Pencil,Trash2,RotateCcw,Users} from 'lucide-react';
import type {BillingClientData,BillingDirectoryData,BillingDirectoryKind,BillingDirectoryRecord,BillingKind,BillingServiceData,BillingTransport,VatCategory} from '../billing-contracts';
import {blankClient,blankService} from '../billing-directory-domain';
import {Field,PartyFields} from './billing-fields';
import {Help} from './billing-help';

const titles={clients:{many:'Clients',one:'client',create:'Nouveau client'},services:{many:'Prestations',one:'prestation',create:'Nouvelle prestation'}};
import {saleUnits,unitLabels as units} from '../billing-units';
const name=(r:BillingDirectoryRecord)=>r.kind==='clients'?r.data.party.name:r.data.label;
const message=(e:unknown)=>e instanceof Error?e.message:'Le répertoire est indisponible. Votre saisie est conservée.';
type Edit={id:string;version:number|null;data:BillingDirectoryData;saved:string|null};
type Props={kind:BillingDirectoryKind;transport:BillingTransport;busy:boolean;onBusy:(value:string)=>void;onDirty:(value:boolean)=>void;onChanged:()=>void;onPick?:(record:BillingDirectoryRecord)=>void;onNewDocument?:(record:BillingDirectoryRecord,kind:BillingKind)=>void;contextualServices?:ReactNode|((query:string)=>ReactNode);};

function ServiceFields({data,onChange}:{data:BillingServiceData;onChange:(data:BillingServiceData)=>void}){
 const patch=(value:Partial<BillingServiceData>)=>onChange({...data,...value});
 return <div className="bill-fields">
  <Field label="Nom de la prestation" wide><input value={data.label} maxLength={160} placeholder="Ex. Assistance technique" onChange={e=>patch({label:e.target.value})}/></Field>
  <Field label="Unité de vente"><select value={data.unitCode} onChange={e=>patch({unitCode:e.target.value})}>{Object.entries(saleUnits).map(([value,label])=><option key={value} value={value}>{label}</option>)}{!saleUnits[data.unitCode]&&<option value={data.unitCode}>{units[data.unitCode]||data.unitCode}</option>}</select></Field>
  <Field label="Tarif unitaire HT (€)"><input inputMode="decimal" value={data.unitPrice} maxLength={40} placeholder="0,00" onChange={e=>patch({unitPrice:e.target.value})}/></Field>
  <Field label="Taux de TVA (%)"><input inputMode="decimal" value={data.vatRate} maxLength={40} onChange={e=>patch({vatRate:e.target.value})}/></Field>
  <Field label="Description détaillée" wide hint="Le nom et la description seront repris dans le document."><textarea value={data.description} rows={4} maxLength={3500} onChange={e=>patch({description:e.target.value})}/></Field>
  <Field label="Régime de TVA du catalogue" wide><select value={data.vatCategory} onChange={e=>{const vatCategory=e.target.value as VatCategory;patch({vatCategory,vatRate:vatCategory==='S'?(data.vatRate==='0'?'20':data.vatRate):'0',exemptionReason:['S','Z'].includes(vatCategory)?'':data.exemptionReason});}}><option value="S">TVA standard</option><option value="Z">Taux zéro</option><option value="E">Exonération</option><option value="AE">Autoliquidation</option><option value="O">Hors champ</option></select></Field>
  {['E','AE','O'].includes(data.vatCategory)&&<Field label="Motif d’exonération du catalogue" wide><textarea value={data.exemptionReason} rows={2} maxLength={1000} onChange={e=>patch({exemptionReason:e.target.value})}/></Field>}
 </div>;
}

export function DirectoryPanel({kind,transport,busy,onBusy,onDirty,onChanged,onPick,onNewDocument,contextualServices}:Props){
 const [employees,setEmployees]=useState(false);
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[archived,setArchived]=useState(false),[offset,setOffset]=useState(0),[total,setTotal]=useState(0),[rows,setRows]=useState<BillingDirectoryRecord[]>([]),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 const [editor,setEditor]=useState<Edit|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[listError,setListError]=useState(''),[conflict,setConflict]=useState(false),[pending,setPending]=useState('');
 const live=useRef(true),running=useRef(false),editRef=useRef(editor),root=useRef<HTMLElement>(null),copy=useRef<{key:string;id:string}|null>(null);editRef.current=editor;
 const dirty=!!editor&&(editor.saved===null||JSON.stringify(editor.data)!==editor.saved);
 useEffect(()=>{live.current=true;return()=>{live.current=false;onDirty(false);};},[onDirty]);
 useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
 useEffect(()=>{const next=query.trim();if(next===search)return;const timer=setTimeout(()=>{setSearch(next);setOffset(0);},200);return()=>clearTimeout(timer);},[query,search]);
 useEffect(()=>{let active=true;setLoading(true);setListError('');transport.directoryList(kind,{q:search,offset,limit:10,archived}).then(result=>{if(!active||!live.current)return;setRows(result.records);setTotal(result.total);if(offset&&offset>=result.total)setOffset(Math.max(0,Math.floor((result.total-1)/10)*10));},e=>{if(active&&live.current)setListError(message(e));}).finally(()=>{if(active&&live.current)setLoading(false);});return()=>{active=false;};},[kind,transport,search,offset,archived,revision]);
 useEffect(()=>{if(editor)root.current?.querySelector<HTMLInputElement>('.bill-directory-editor input')?.focus();},[editor?.id]);
 const canLeave=()=>!dirty||window.confirm('Cette fiche contient des modifications non enregistrées. Quitter sans les enregistrer ?');
 const change=(data:BillingDirectoryData)=>{setEditor(value=>value?{...value,data}:value);onDirty(true);setNotice('');};
 const adopt=(value:BillingDirectoryRecord)=>{const next={id:value.id,version:value.version,data:structuredClone(value.data),saved:JSON.stringify(value.data)};editRef.current=next;setEditor(next);onDirty(false);setError('');setConflict(false);};
 const newEntry=()=>{if(busy||!canLeave())return;setEditor({id:crypto.randomUUID(),version:null,data:kind==='clients'?blankClient():blankService(),saved:null});onDirty(true);setError('');setNotice('');setConflict(false);};
 const back=()=>{if(busy||!canLeave())return;setEditor(null);onDirty(false);setError('');setNotice('');setConflict(false);};
 async function open(id:string){
  if(busy||running.current)return;running.current=true;onBusy('directory-open');setPending('open');setError('');
  try{const result=await transport.directoryGet(kind,id);if(live.current)adopt(result);}catch(e){if(live.current)setError(message(e));}finally{running.current=false;if(live.current){setPending('');onBusy('');}}
 }
 async function save(asCopy=false,dataOverride?:BillingDirectoryData){
  const value=editRef.current;if(!value||busy||running.current)return;const data=structuredClone(dataOverride||value.data);let id=value.id;
  if(asCopy){const key=JSON.stringify(data);if(copy.current?.key!==key)copy.current={key,id:crypto.randomUUID()};id=copy.current.id;}
  running.current=true;setPending('save');onBusy('directory-save');setError('');setNotice('');let selected:BillingDirectoryRecord|undefined;
  try{
   const result=value.version===null||asCopy?await transport.directoryCreate(kind,id,data):await transport.directorySave(kind,id,value.version,data);
   if(live.current){adopt(result);setRevision(n=>n+1);onChanged();showSuccess(result.data.archived?'Fiche archivée':'Fiche enregistrée');if(onPick&&!result.data.archived)selected=result;}
  }catch(e){if(live.current){setError(message(e));setConflict(!!e&&typeof e==='object'&&'status' in e&&e.status===409);}}
  finally{running.current=false;if(live.current){setPending('');onBusy('');}}
  if(selected&&live.current)onPick?.(selected);
 }
 async function removeClient(row:BillingDirectoryRecord){
  if(kind!=='clients'||busy||running.current||!canLeave())return;
  const restoring=row.data.archived;
  if(!restoring&&!window.confirm('Supprimer le client « '+name(row)+' » ? Ses documents seront conservés et la fiche restera restaurable dans la corbeille.'))return;
  running.current=true;onBusy('directory-delete');setError('');
  try{
   await transport.directorySave('clients',row.id,row.version,{...row.data,archived:!restoring});
   if(live.current){if(editRef.current?.id===row.id){setEditor(null);editRef.current=null;onDirty(false);}setRevision(n=>n+1);onChanged();showSuccess(restoring?'Client restauré':'Client supprimé');}
  }catch(e){if(live.current)setError(message(e));}finally{running.current=false;if(live.current)onBusy('');}
 }
 function navigateResults(event:KeyboardEvent<HTMLElement>){
  if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!['ArrowDown','ArrowUp'].includes(event.key))return;
  const target=event.target as HTMLElement,searchInput=root.current?.querySelector<HTMLInputElement>('input[type="search"]');
  const results=Array.from(root.current?.querySelectorAll<HTMLButtonElement>('.bill-directory-name:not(:disabled)')||[]);
  const index=results.indexOf(target as HTMLButtonElement);
  if(!results.length||(target!==searchInput&&index===-1))return;
  if(target===searchInput&&event.key==='ArrowUp')return;
  event.preventDefault();
  if(event.key==='ArrowUp'&&index===0)searchInput?.focus();
  else results[Math.min(results.length-1,index+(event.key==='ArrowDown'?1:-1))]?.focus();
 }
 const current=editor&&editor.version!==null?{kind,id:editor.id,version:editor.version,data:editor.data,updatedAt:null} as BillingDirectoryRecord:null;
 const [matches,setMatches]=useState<{rows:BillingDirectoryRecord[];party:BillingClientData['party'];details:BillingClientData['details']}|null>(null);
 function useExisting(row:BillingDirectoryRecord,party:BillingClientData['party'],details:BillingClientData['details']){
  if(row.kind!=='clients')return;
  setEditor({id:row.id,version:row.version,data:enrichClient(row.data,party,details),saved:JSON.stringify(row.data)});onDirty(true);setMatches(null);showSuccess('Fiche préremplie');
 }
 async function prefillClient(party:BillingClientData['party'],details:BillingClientData['details']){
  if(busy||running.current)return;
  running.current=true;onBusy('client-match');setError('');setNotice('');setConflict(false);
  try{
   const found:BillingDirectoryRecord[]=[];let offset=0;
   for(;;){const page=await transport.directoryList('clients',{q:'',offset,limit:100,archived:false});found.push(...page.records.filter(r=>r.kind==='clients'&&sameClient(r.data,party)));offset+=page.records.length;if(offset>=page.total)break;if(!page.records.length)throw Error('Le répertoire a changé. Relancez la recherche.');}
   if(!live.current)return;
   if(found.length===1)useExisting(found[0],party,details);
   else if(found.length>1)setMatches({rows:found,party,details});
   else{setEditor({id:editor?.version===null?editor.id:crypto.randomUUID(),version:null,data:enrichClient(editor?.version===null?editor.data as BillingClientData:blankClient(),party,details),saved:null});onDirty(true);}
  }catch(e){if(live.current)setError(message(e));}finally{running.current=false;if(live.current)onBusy('');}
 };

 return <section ref={root} className="bill-directory" data-kind={kind} data-picker={!!onPick} aria-label={titles[kind].many} onKeyDown={navigateResults}>
  <header className="bill-directory-heading"><div>{editor?<button type="button" className="bill-back" disabled={busy} onClick={back}>‹ {titles[kind].many}</button>:<p className="bill-eyebrow">{kind==='clients'?'CARNET CLIENTS':'CATALOGUE'}</p>}<h2 className="bill-title-help">{editor?(editor.version===null?titles[kind].create:kind==='clients'?(editor.data as BillingClientData).party.name:(editor.data as BillingServiceData).label):titles[kind].many}{<Help label={titles[kind].many} text={kind==='clients'?'Choisir un client préremplit ses coordonnées dans le document. Elles restent modifiables. Les documents existants conservent leurs informations.':'Le catalogue préremplit la désignation, le tarif, l’unité et la TVA. Ces valeurs restent modifiables dans le document.'}/>}</h2></div>{!editor&&<button type="button" className="bill-button bill-button-primary" disabled={busy} onClick={newEntry}>+ {titles[kind].create}</button>}</header>
  {error&&<div className="bill-message bill-message-error" role="alert"><div><b>{conflict?'Cette fiche doit être vérifiée.':'L’action n’a pas abouti.'}</b><p>{error}</p>{conflict&&editor&&<div className="bill-message-actions"><button type="button" disabled={busy} onClick={()=>open(editor.id)}>Recharger la fiche</button><button type="button" disabled={busy} onClick={()=>save(true)}>Conserver dans une nouvelle fiche</button></div>}</div></div>}
  {matches&&<div className="bill-client-match" role="group" aria-label="Choisir la fiche existante"><span>Choisir la fiche à compléter</span>{matches.rows.map(row=><button className="bill-button" type="button" key={row.id} onClick={()=>useExisting(row,matches.party,matches.details)}>{name(row)}</button>)}<button type="button" className="bill-button" onClick={()=>setMatches(null)}>Annuler</button></div>}
  {notice&&<div className="bill-message bill-message-success" role="status"><BlueCheck label="Enregistrement confirmé"/>{notice}</div>}
  {pending==='open'&&<div className="bill-directory-pending" role="status"><BrandMark/>Ouverture de la fiche…</div>}
  {editor?<div className={'bill-directory-edit-layout'+(!current&&kind!=='clients'?' bill-directory-edit-new':'')}><form className="bill-directory-editor bill-editor" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy}><div className="bill-section">{kind==='clients'?<><ClientLogoField data={editor.data as BillingClientData} onChange={change}/><CompanyLookup key={editor.id} party={(editor.data as BillingClientData).party} disabled={busy} onSelect={(party,details)=>{if(editor.version===null){void prefillClient(party,details);return;}change(enrichClient(editor.data as BillingClientData,party,details,true));}}/><PartyFields party={(editor.data as BillingClientData).party} prefix="Client" onChange={patch=>change({...editor.data,party:{...(editor.data as BillingClientData).party,...patch}} as BillingClientData)}/><ClientLegalFields data={editor.data as BillingClientData} onChange={change}/><details className="bill-extra-fields"><summary>Notes internes</summary><Field label="Notes internes du client" wide hint="Ces notes ne sont pas copiées dans les devis ni dans les factures."><textarea rows={3} maxLength={4000} value={(editor.data as BillingClientData).notes} onChange={e=>change({...editor.data,notes:e.target.value} as BillingClientData)}/></Field></details></>:<ServiceFields data={editor.data as BillingServiceData} onChange={change}/>}</div><div className="bill-directory-save"><span role="status">{pending==='save'?'Enregistrement…':dirty?'Modifications non enregistrées':editor.version===0?'Coordonnées à compléter':'Fiche enregistrée'}</span><button type="submit" className="bill-button bill-button-primary" disabled={busy||(!dirty&&editor.version!==0)}>{pending==='save'?'Enregistrement…':onPick?'Enregistrer et choisir':'Enregistrer la fiche'}</button></div></fieldset></form><aside className="bill-directory-aside">{kind==='clients'&&<ClientContacts contacts={(editor.data as BillingClientData).contacts||[]} disabled={busy} onChange={contacts=>change({...editor.data,contacts} as BillingClientData)}/>}
   {current?.kind==='clients'&&<div><button type="button" className="bill-button" disabled={busy||dirty||current.version===0||current.data.archived} onClick={()=>setEmployees(true)}><Users size={17}/>Espace salariés</button></div>}
   {current&&kind==='clients'&&onNewDocument&&<div><h3>Préparer un document</h3><button type="button" className="bill-button" disabled={busy||dirty||editor.data.archived} onClick={()=>onNewDocument(current,'quote')}>Créer un devis pour ce client</button><button type="button" className="bill-button" disabled={busy||dirty||editor.data.archived} onClick={()=>onNewDocument(current,'invoice')}>Créer une facture pour ce client</button>{dirty&&<small>Enregistrez d’abord les modifications.</small>}</div>}
   {current&&(kind==='clients'?<div><h3>{editor.data.archived?'Corbeille':'Gestion du client'}</h3><button type="button" className={'bill-button'+(editor.data.archived?'':' bill-icon-danger')} disabled={busy||dirty} onClick={()=>removeClient(current)}>{editor.data.archived?<RotateCcw size={16}/>:<Trash2 size={16}/ >}{editor.data.archived?'Restaurer le client':'Supprimer le client'}</button></div>:current.version>0&&<div><h3 className="bill-title-help">{editor.data.archived?'Fiche archivée':'Archivage'}</h3><button type="button" className="bill-button" disabled={busy||dirty} onClick={()=>save(false,{...editor.data,archived:!editor.data.archived})}>{editor.data.archived?'Restaurer la fiche':'Archiver la fiche'}</button></div>)}
  </aside></div>:<><div className="bill-directory-search"><Field label={'Rechercher '+(kind==='clients'?'un client':'une prestation')}><Search className="bill-directory-search-icon" size={18} aria-hidden="true"/><input type="search" value={query} placeholder={kind==='clients'?'Nom, SIREN, SIRET ou e-mail…':'Nom de la prestation…'} onChange={e=>setQuery(e.target.value)}/></Field>{!onPick&&<label className="bill-directory-archived"><input type="checkbox" checked={archived} onChange={e=>{setArchived(e.target.checked);setOffset(0);}}/>{kind==='clients'?'Voir la corbeille':'Voir les archives'}</label>}</div>
   {typeof contextualServices==='function'?contextualServices(query):contextualServices}
   {kind==='services'&&onPick&&contextualServices&&<h3 className="bill-catalogue-general-title">Catalogue général</h3>}
   {kind==='clients'&&!archived&&<div className="bill-client-prefill"><CompanyLookup party={blankClient().party} disabled={busy} onSelect={prefillClient}/></div>}
   {loading?<div className="bill-loading" role="status"><BrandMark/>Chargement du répertoire…</div>:listError?<div className="bill-empty" role="alert"><p>{listError}</p><button type="button" className="bill-button" onClick={()=>setRevision(n=>n+1)}>Réessayer le répertoire</button></div>:rows.length?<><div className="bill-directory-rows">{rows.map(row=><div className="bill-directory-row" key={row.id}>
    <button type="button" className="bill-directory-name" disabled={busy} aria-label={(onPick?'Choisir ':'Ouvrir la fiche ')+name(row)} onClick={()=>onPick?onPick(row):open(row.id)}>
     {row.kind==='clients'&&<ClientAvatar name={name(row)} identifier={row.data.party.siren||row.data.party.siret} logoKey={row.data.logoKey} logoData={row.data.logoData}/>}
     <span><strong>{name(row)}</strong>{row.kind==='clients'&&<small>{[row.data.party.email,row.data.party.city].filter(Boolean).join(' · ')||'Coordonnées à compléter'}</small>}</span>
     {onPick&&<Plus className="bill-directory-add" size={17} aria-hidden="true"/>}
    </button>
    <span className="bill-directory-meta">{row.kind==='clients'?(row.data.party.siren?'SIREN '+row.data.party.siren:row.version===0?'À compléter':''):row.data.unitPrice?row.data.unitPrice.replace('.',',')+' € / '+(units[row.data.unitCode]||row.data.unitCode):'Tarif à préciser'}</span>
    {onPick?<button type="button" className="bill-icon-button bill-directory-edit" disabled={busy} aria-label={'Modifier la fiche '+name(row)} title="Modifier la fiche" onClick={()=>open(row.id)}><Pencil size={16} aria-hidden="true"/></button>:kind==='clients'?<button type="button" className={'bill-icon-button'+(archived?'':' bill-icon-danger')} disabled={busy} aria-label={(archived?'Restaurer le client ':'Supprimer le client ')+name(row)} title={archived?'Restaurer':'Supprimer'} onClick={()=>removeClient(row)}>{archived?<RotateCcw size={17}/>:<Trash2 size={17}/>}</button>:<span className="bill-directory-row-arrow" aria-hidden="true">›</span>}
   </div>)}</div><div className="bill-pagination"><span>{offset+1}–{Math.min(offset+rows.length,total)} sur {total}</span><div><button type="button" disabled={offset===0||busy} onClick={()=>setOffset(n=>Math.max(0,n-10))}>Précédent</button><button type="button" disabled={offset+10>=total||busy} onClick={()=>setOffset(n=>n+10)}>Suivant</button></div></div></>:<div className="bill-empty"><h3>{search?'Aucun résultat':archived?(kind==='clients'?'La corbeille est vide':'Aucune fiche archivée'):kind==='clients'?'Votre carnet clients commence ici':'Composez votre catalogue'}</h3><p>{search?'Essayez un autre nom.':kind==='clients'?'Ajoutez un client pour retrouver ses coordonnées dans vos prochains documents.':'Enregistrez vos prestations habituelles pour préparer vos documents plus rapidement.'}</p>{!archived&&<button type="button" className="bill-button" disabled={busy} onClick={newEntry}>{titles[kind].create}</button>}</div>}
  </>}
 {employees&&current?.kind==='clients'&&<ClientEmployees clientId={current.id} client={current.data} transport={transport} onClose={()=>setEmployees(false)}/>}
 </section>;
}

export function DirectoryDialog({onClose,...props}:Props&{onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),dirty=useRef(false),busy=useRef(props.busy);busy.current=props.busy;
 const dirtyHandler=useRef((value:boolean)=>{dirty.current=value;props.onDirty(value);});
 const close=()=>{if(!busy.current&&(!dirty.current||window.confirm('La fiche contient une saisie non enregistrée. Fermer sans l’enregistrer ?')))onClose();};
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();dialog.current?.querySelector<HTMLInputElement>('input[type=search]')?.focus();return()=>{dialog.current?.close();if(previous?.isConnected)previous.focus();};},[]);
 return <dialog ref={dialog} className="bill-directory-dialog" aria-label={props.kind==='clients'?'Choisir un client':'Choisir une prestation'} onCancel={e=>{e.preventDefault();close();}}><div className="bill-dialog-top"><span>{props.kind==='clients'?'CARNET CLIENTS':'CATALOGUE DE PRESTATIONS'}</span><button type="button" aria-label="Fermer le répertoire" disabled={props.busy} onClick={close}>✕</button></div><DirectoryPanel {...props} onDirty={dirtyHandler.current}/></dialog>;
}
