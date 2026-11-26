import {ActivitySelect} from './activity-select';
import {projectActivity} from '../project-activity';
import {useEffect,useLayoutEffect,useState} from 'react';
import type {InputHTMLAttributes,ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import type {BusinessCode,Invoice,Expense,ExpenseLine,ExpenseProject,Employee} from './finance-domain';
import {codeInput,invoiceInput,codeKey,codeLabel,money,expenseTotal,expenseRefund,expenseStatus} from './finance-domain';
import {displayedKilometres,sharedGoogleRoute} from './expense-itinerary';

type MapsDraft = {open?:boolean;link?:string;distance?:string};
export interface EditorProps {
  loadProjects:()=>Promise<{projects:{id:string;name:string;clientName:string;archived:boolean;startDate?:string;endDate?:string}[]}>;
  kind:'code'|'invoice'|'expense';record:BusinessCode|Invoice|Expense;existing:boolean;today:string;
  employees:Employee[];codes:BusinessCode[];lockedMat:string|null;paymentLocked:boolean;
  mapsDrafts:(MapsDraft|undefined)[];
  categories:string[];statuses:string[];vehicles:Record<string,{label:string;cv:Record<string,unknown>}>;
  formula:(vehicle:string,cv:string,km:unknown)=>string;
  act:(name:string,...args:any[])=>any;save:(value:unknown)=>Promise<void>|void;init:()=>void;
}
const value=(v:unknown)=>v==null?'':String(v);
function Field({id,label,initial,full=false,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'defaultValue'> & {id:string;label:string;initial?:unknown;full?:boolean}){
  return <div className={'form-row'+(full?' full':'')}><label htmlFor={id}>{label}</label><input className="inp" id={id} name={id} defaultValue={value(initial)} {...props}/></div>;
}
function Buttons({children}:{children:ReactNode}){return <div className="modal-foot">{children}</div>;}
function CodeEditor({record,act}:EditorProps){const c=record as BusinessCode;return <><header className="modal-head"><h3 id="financeEditorTitle">{c.id?'Modifier le code affaire':'Nouveau code affaire'}</h3></header><div className="modal-body"><div className="form-grid">
  <Field id="caC1" label="Code (1re partie)" type="number" initial={c.code1} placeholder="ex. 23"/><Field id="caC2" label="Code (2e partie)" type="number" initial={c.code2} placeholder="ex. 145"/>
  <Field id="caPil" label="Pilotage" initial={c.pilote} placeholder="ex. PQ"/><Field id="caProg" label="Avancement (%)" type="number" min={0} max={100} initial={c.progress??0}/>
  <Field id="caLabel" label="Nom de l’affaire" initial={c.label} full/><Field id="caClient" label="Client" initial={c.client} list="cdiClientsList"/><Field id="caHT" label="Montant HT (€)" type="number" step="0.01" initial={c.montantHT}/>
  </div></div><Buttons><button type="button" className="btn btn-ghost" onClick={()=>act('close')}>Annuler</button><button type="submit" className="btn btn-primary">Enregistrer</button></Buttons></>;}
function InvoiceEditor(p:EditorProps){const f=p.record as Invoice;return <><header className="modal-head"><h3 id="financeEditorTitle">{p.existing?'Modifier la facture':'Nouvelle facture'}</h3></header><div className="modal-body"><div className="form-grid">
  {!p.existing&&<div className="form-row full finance-pdf-box"><label htmlFor="fvPdfInput">Déposer le PDF pour préremplir la facture</label><input className="inp" id="fvPdfInput" type="file" accept="application/pdf,.pdf" onChange={e=>p.act('choosePdf',e.currentTarget)}/><div className="hint" id="fvPdfStatus" role="status">{f.pdfSource?f.pdfSource.name+' · PDF déjà joint. Vous pouvez le remplacer.':'Le numéro, la date, le client, le code affaire et les montants reconnus seront proposés ci-dessous. Vous pourrez les modifier avant de créer la facture.'}</div></div>}
  <Field id="fvDate" label="Date de facture" type="date" initial={p.existing?f.dateFacture:p.today}/><Field id="fvNum" label="N° de facture" initial={f.number} placeholder="ex. 26 03 012"/>
  <Field id="fvCode" label="Code affaire" initial={f.code} list="fvCodeList" placeholder="ex. 23145"/><datalist id="fvCodeList">{p.codes.slice().sort((a,b)=>codeKey(a).localeCompare(codeKey(b))).map(c=><option key={c.id} value={codeKey(c)}>{codeLabel(c)} — {(c.label||'').slice(0,50)}</option>)}</datalist>
  <Field id="fvClient" label="Client" initial={f.client} list="cdiClientsList"/><Field id="fvHT" label="Montant HT (€)" type="number" step="0.01" initial={f.ht} onInput={()=>p.act('ttcAuto')}/><Field id="fvTTC" label="Montant TTC (€)" type="number" step="0.01" initial={f.ttc}/>
  <Field id="fvSent" label="Envoyée le" type="date" initial={f.dateEnvoi} min={f.dateFacture||undefined} max={p.today}/><Field id="fvPay" label="Date de paiement" type="date" initial={f.datePaiement}/>
  </div></div><Buttons><button type="button" className="btn btn-ghost" onClick={()=>p.act('close')}>Annuler</button><button type="submit" className="btn btn-primary" id="fvSave">{p.existing?'Enregistrer':'Créer la facture'}</button></Buttons></>;}
function MileageItinerary({line,index,mapsDraft,act}:{line:ExpenseLine;index:number;mapsDraft?:MapsDraft;act:EditorProps['act']}){
  const [stops,setStops]=useState(Array.isArray(line.etapes)?line.etapes.filter(stop=>typeof stop==='string'):[]);
  const [error,setError]=useState('');
  const storedLink=line.googleMapsUrl&&sharedGoogleRoute(line.googleMapsUrl)?.url;
  const routeId=(field:string)=>'nfl-'+field+'-'+index;
  const linkId=routeId('maps-link'),distanceId=routeId('maps-km');
  const inputId=(stop:number)=>routeId('stop')+'-'+stop;
  useEffect(()=>{act('itinerarySync',index);},[act,index,stops]);
  const addStop=()=>{
    setStops([...stops,'']);
    requestAnimationFrame(()=>document.getElementById(inputId(stops.length))?.focus());
  };
  const moveStop=(from:number,to:number)=>{
    const next=stops.slice();
    [next[from],next[to]]=[next[to],next[from]];
    setStops(next);
  };
  const apply=(details:HTMLElement)=>{
    const link=details.querySelector<HTMLInputElement>('#'+linkId)!;
    const distance=details.querySelector<HTMLInputElement>('#'+distanceId)!;
    const route=sharedGoogleRoute(link.value);
    if(!route){setError('Collez un lien d’itinéraire Google Maps valide.');link.focus();return;}
    const km=displayedKilometres(distance.value);
    if(km===null){setError('Saisissez la distance totale affichée, par exemple 123,4 km.');distance.focus();return;}
    setError('');
    act('importMaps',index,route,km);
  };
  return <>
    <div className="finance-route" id={routeId('route')}>
      <div className="finance-route-place">
        <input className="inp slim" id={routeId('dep')} list={routeId('dep-options')} aria-label="Départ (ville / adresse)" placeholder="Départ (ville / adresse)" defaultValue={line.depart||''} autoComplete="off" onInput={e=>act('address',index,e.currentTarget)}/>
        <datalist id={routeId('dep-options')}/>
      </div>
      {stops.map((stop,position)=><div className="finance-route-place" key={position}>
        <input className="inp slim" id={inputId(position)} data-nf-stop list={inputId(position)+'-options'} aria-label={'Étape '+(position+1)+' (ville / adresse)'} placeholder={'Étape '+(position+1)+' (ville / adresse)'} value={stop} autoComplete="off" onChange={e=>{
          const value=e.currentTarget.value;
          setStops(stops.map((previous,i)=>i===position?value:previous));
          act('address',index,e.currentTarget);
        }}/>
        <datalist id={inputId(position)+'-options'}/>
        <div className="finance-route-order">
          <button type="button" className="btn btn-ghost btn-sm" aria-label={'Monter l’étape '+(position+1)} disabled={position===0} onClick={()=>moveStop(position,position-1)}>↑</button>
          <button type="button" className="btn btn-ghost btn-sm" aria-label={'Descendre l’étape '+(position+1)} disabled={position===stops.length-1} onClick={()=>moveStop(position,position+1)}>↓</button>
          <button type="button" className="btn btn-ghost btn-sm" aria-label={'Retirer l’étape '+(position+1)} onClick={()=>setStops(stops.filter((_,i)=>i!==position))}>×</button>
        </div>
      </div>)}
      <div className="finance-route-place">
        <input className="inp slim" id={routeId('arr')} list={routeId('arr-options')} aria-label="Arrivée (ville / adresse)" placeholder="Arrivée (ville / adresse)" defaultValue={line.arrivee||''} autoComplete="off" onInput={e=>act('address',index,e.currentTarget)}/>
        <datalist id={routeId('arr-options')}/>
      </div>
    </div>
    <div className="finance-route-actions">
      <button type="button" className="btn btn-ghost btn-sm" onClick={addStop}>Ajouter une étape</button>
      <label className="finance-check"><input type="checkbox" id={routeId('ar')} defaultChecked={line.allerRetour} onChange={()=>act('itinerarySync',index)}/> A/R ×2</label>
      <button type="button" className="btn btn-primary btn-sm" onClick={()=>act('itinerary',index)}>Calculer les km</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={()=>act('maps',index,storedLink)}>Google Maps</button>
    </div>
    <details className="finance-maps-import" open={mapsDraft?.open} onToggle={e=>act('mapsDraft',index,{open:e.currentTarget.open})}>
      <summary>Importer depuis Google Maps</summary>
      <p className="hint">Collez le lien partagé et la distance totale affichée dans Google Maps. Pour un aller-retour, renseignez la distance de l’ensemble du trajet.</p>
      <div className="finance-maps-fields">
        <Field id={linkId} label="Lien Google Maps" type="url" initial={mapsDraft?.link??storedLink} placeholder="https://maps.app.goo.gl/…" autoComplete="off" onInput={e=>act('mapsDraft',index,{link:e.currentTarget.value})}/>
        <Field id={distanceId} label="Distance affichée (km)" initial={mapsDraft?.distance??line.googleMapsKm?.toLocaleString('fr-FR',{maximumFractionDigits:20})} inputMode="decimal" placeholder="ex. 123,4" onInput={e=>act('mapsDraft',index,{distance:e.currentTarget.value})}/>
      </div>
      <div className="finance-route-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={e=>apply(e.currentTarget.closest('details')!)}>Appliquer à la ligne</button>
        {storedLink&&<a className="btn btn-ghost btn-sm" href={storedLink} target="_blank" rel="noopener noreferrer">Ouvrir le lien enregistré</a>}
      </div>
      {error&&<p role="alert" className="finance-maps-error">{error}</p>}
    </details>
  </>;
}
function ExpenseLineEditor({line:l,index:i,p}:{line:ExpenseLine;index:number;p:EditorProps}){
  const km=l.categorie==='Frais kilométriques',vehicle=l.vehicule||'voiture',cvs=Object.keys(p.vehicles[vehicle]?.cv||{});
  const id=(field:string)=>'nfl-'+field+'-'+i;
  return <div className="nf-line"><div className="nf-line-top">
    <Field id={id('date')} label="Date" type="date" initial={l.date}/><div className="form-row" style={{flex:'1 1 180px'}}><label htmlFor={id('cat')}>Catégorie</label><select className="inp slim" id={id('cat')} defaultValue={l.categorie} onChange={()=>p.act('lineChanged',i)}>{p.categories.map(c=><option key={c}>{c}</option>)}</select></div>
    <Field id={id('montant')} label="Montant €" type="number" step="0.01" readOnly={km} initial={l.montant} onInput={()=>p.act('total')}/>
    <div className="form-row"><label>Justificatif</label><div className="finance-justif">{l.justificatif?<><button type="button" className="btn btn-ghost btn-sm" title={l.justName||'Justificatif'} onClick={()=>p.act('previewReceipt',i)}>Voir</button><button type="button" className="icon-btn" title="Retirer le justificatif" aria-label="Retirer le justificatif" onClick={()=>p.act('removeReceipt',i)}>×</button></>:<label className="btn btn-ghost btn-sm finance-file">Joindre<input type="file" accept="image/*,application/pdf" aria-label="Joindre un justificatif" onChange={e=>p.act('receipt',i,e.currentTarget)}/></label>}<button type="button" className="btn btn-ghost btn-sm finance-danger" aria-label="Supprimer la ligne" onClick={()=>p.act('removeLine',i)}>Supprimer</button></div></div>
  </div>
  {km&&<div className="nf-km"><MileageItinerary line={l} index={i} mapsDraft={p.mapsDrafts[i]} act={p.act}/>
  <div className="finance-km-fields"><div className="form-row"><label htmlFor={id('vt')}>Véhicule</label><select className="inp slim" id={id('vt')} defaultValue={vehicle} onChange={()=>p.act('lineChanged',i)}>{Object.entries(p.vehicles).map(([v,data])=><option key={v} value={v}>{data.label}</option>)}</select></div>
    <div className="form-row"><label htmlFor={id('cv')}>Puiss. fiscale</label><select className="inp slim" id={id('cv')} defaultValue={String(l.cv||cvs[0])} onChange={()=>p.act('lineChanged',i)}>{cvs.map(cv=><option key={cv}>{cv}</option>)}</select></div>
    <Field id={id('km')} label="Km" type="number" min={0} step="any" initial={l.km} onInput={()=>p.act('lineKm',i)}/><label className="finance-check"><input type="checkbox" id={id('elec')} defaultChecked={l.elec} onChange={()=>p.act('lineChanged',i)}/> Électrique (+20%)</label>
    <div className="finance-km-formula">Forfait : <b id={id('bareme')}>{p.formula(vehicle,String(l.cv||cvs[0]),l.km||0)}{l.elec?' ×1,2':''}</b> → Indemnité : <b id={id('ind')}>{money(l.montant)}</b></div>
  </div></div>}
  <div style={{marginTop:8}}><Field id={id('desc')} label="Description / commentaire" initial={l.description}/></div></div>;
}
function ExpenseProjects({loadProjects,initial,change}:{loadProjects:EditorProps['loadProjects'];initial:ExpenseProject[];change:(projects:ExpenseProject[])=>void}){
  const [catalogue,setCatalogue]=useState<Awaited<ReturnType<EditorProps['loadProjects']>>['projects']>([]);
  const [selected,setSelected]=useState(initial);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    setError('');
    void loadProjects().then(({projects})=>{if(active)setCatalogue(projects);})
      .catch(()=>{if(active)setError('Impossible de charger les projets.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[loadProjects,retry]);
  const available=catalogue.filter(project=>!project.archived&&!selected.some(item=>item.id===project.id));
  const update=(projects:ExpenseProject[])=>{setSelected(projects);change(projects);};
  const add=(id:string)=>{
    const project=available.find(item=>item.id===id);
    if(project)update([...selected,{id:project.id,name:project.name}]);
  };
  return <div className="form-row full">
    <label htmlFor="nfProjectChoice">Projets</label>
    {selected.length>0&&<ul className="finance-selected-projects" aria-label="Projets sélectionnés">{selected.map((project,index)=>
      <li key={project.id||project.name}><span>{project.name}</span>
        <button type="button" aria-label={'Retirer '+project.name} onClick={()=>update(selected.filter((_,i)=>i!==index))}>×</button>
      </li>)}</ul>}
    <ActivitySelect id="nfProjectChoice" label="Ajouter un projet" value="" onChange={add} allowEmpty={false}
      disabled={loading||!!error||!available.length}
      placeholder={loading?'Chargement…':error?'Projets indisponibles':available.length?'Ajouter un projet':'Aucun projet disponible'}
      options={available.map(project=>({value:project.id,label:project.name,detail:project.clientName,activity:projectActivity(project)}))}/>
    {error&&<span role="alert">{error} <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setRetry(attempt=>attempt+1)}>Réessayer</button></span>}
  </div>;
}
function ExpensePersonAvatar({person}:{person:Employee}){
  const [failed,setFailed]=useState(false);
  const initials=[person.prenom,person.nom].map(part=>(part||'').trim().charAt(0)).join('').toLocaleUpperCase('fr-FR');
  return <span className="finance-person-avatar" aria-hidden="true">
    {person.photo&&!failed?<img src={person.photo} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:initials}
  </span>;
}
function ExpenseEmployee({employees,lockedMat,matricule}:{employees:Employee[];lockedMat:string|null;matricule:string}){
  const [mat,setMat]=useState(lockedMat||matricule);
  const person=employees.find(employee=>employee.matricule===mat);
  const name=(employee:Employee)=>[employee.prenom,employee.nom].filter(Boolean).join(' ');
  return <div className="form-row">
    {lockedMat?<><label id="nfSalLabel">Salarié</label><div className="finance-locked-person" aria-labelledby="nfSalLabel">
      {person&&<><ExpensePersonAvatar person={person}/>{name(person)}</>}
      <input type="hidden" id="nfSal" value={mat}/>
    </div></>:<>
      <label htmlFor="nfSalChoice">Salarié</label>
      <ActivitySelect id="nfSalChoice" nativeId="nfSal" label="Salarié" value={mat} onChange={setMat}
        placeholder="Choisir un salarié" allowEmpty={false}
        options={employees.map(employee=>({value:employee.matricule,label:name(employee),visual:<ExpensePersonAvatar key={employee.matricule} person={employee}/>}))}/>
    </>}
  </div>;
}
function ExpenseEditor(p:EditorProps){const n=p.record as Expense;return <>
  <header className="modal-head"><h3 id="financeEditorTitle">Note de frais — N°{n.numero}</h3><div className="grow"/><button className="icon-btn" type="button" aria-label="Fermer" onClick={()=>p.act('close')}>×</button></header><div className="modal-body"><div className="form-grid">
    <ExpenseEmployee employees={p.employees} lockedMat={p.lockedMat} matricule={n.matricule}/>
    <div className="form-row"><label htmlFor="nfStatut">Statut</label><select className="inp" id="nfStatut" defaultValue={expenseStatus(n.statut)} disabled={p.paymentLocked}>{p.statuses.map(s=><option key={s}>{s}</option>)}</select></div>
    <Field id="nfObjet" label="Objet de la mission" initial={n.objet} full placeholder="ex. Mission Livorno"/><ExpenseProjects loadProjects={p.loadProjects} initial={n.projects||[]} change={projects=>p.act('projects',projects)}/><Field id="nfLieu" label="Lieu(x)" initial={n.lieu}/><Field id="nfCodeC" label="Code compta" initial={n.codeCompta}/>
    <Field id="nfD1" label="Date départ" type="date" initial={n.dateDepart} onChange={()=>p.act('duration')}/><Field id="nfD2" label="Date retour" type="date" initial={n.dateRetour} onChange={()=>p.act('duration')}/><Field id="nfDuree" label="Durée (jours)" initial={n.duree} disabled/><Field id="nfDateNote" label="Date de la note" type="date" initial={n.dateNote}/><Field id="nfFaitA" label="Fait à (lieu)" initial={n.faitA} placeholder="ex. Bastia"/>
  </div><div className="section-title">Lignes de dépenses</div><div id="nfLines">{(n.lignes||[]).map((line,i)=><ExpenseLineEditor key={line.id||i} line={line} index={i} p={p}/>)}</div><button type="button" className="btn btn-ghost btn-sm" style={{marginTop:10}} onClick={()=>p.act('addLine')}>Ajouter une ligne</button>
  <div className="finance-refund"><Field id="nfAvance" label="Avance à déduire (€)" type="number" step="0.01" initial={n.avance} onInput={()=>p.act('total')}/><div className="finance-refund-total"><div className="hint">Total / Montant à rembourser</div><strong><span id="nfTotalDisp">{money(expenseTotal(n))}</span> / <span id="nfRembDisp">{money(expenseRefund(n))}</span></strong></div></div>
  <div className="section-title">Signature de l’intéressé(e)</div><div className="finance-sign"><canvas id="nfSign" width={360} height={130} aria-label="Signature de l’intéressé"/><button type="button" className="btn btn-ghost btn-sm" onClick={()=>p.act('clearSignature')}>Effacer</button></div><div className="hint" style={{marginTop:6}}>Signez à la main (souris ou tactile) — la signature sera reprise sur le PDF.</div>
  </div><Buttons><button type="button" className="btn btn-ghost" onClick={()=>p.act('close')}>Fermer</button><div className="grow"/><button type="button" className="btn btn-ghost" onClick={()=>p.act('previewExpense')}>Aperçu</button><button type="button" className="btn btn-ghost" onClick={()=>p.act('saveExpense',false)}>Enregistrer</button><button type="button" className="btn btn-primary" onClick={()=>p.act('saveExpense',true)}>Enregistrer + PDF</button></Buttons>
  </>;
}
function Editor(p:EditorProps){const [error,setError]=useState('');useLayoutEffect(()=>{p.init();},[]);return <form className="finance-editor" data-react-editor={p.kind} noValidate aria-labelledby="financeEditorTitle" onSubmit={async e=>{
  e.preventDefault();if(p.kind==='expense')return;
  setError('');try{await p.save(p.kind==='code'?codeInput(e.currentTarget):invoiceInput(e.currentTarget));}catch(err){setError(err instanceof Error?err.message:'Enregistrement impossible.');}
 }}>{p.kind==='code'?<CodeEditor {...p}/>:p.kind==='invoice'?<InvoiceEditor {...p}/>:<ExpenseEditor {...p}/ >}{error&&<div className="finance-error" role="alert">{error}</div>}</form>;}
export function mountFinanceEditor(element:HTMLElement,props:EditorProps){const root=createRoot(element);flushSync(()=>root.render(<Editor {...props}/>));return ()=>root.unmount();}
