import {useEffect,useLayoutEffect,useState} from 'react';
import type {InputHTMLAttributes,ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import type {BusinessCode,Invoice,Expense,ExpenseLine,Employee} from './finance-domain';
import {codeInput,invoiceInput,codeKey,codeLabel,money,expenseTotal,expenseRefund,expenseStatus} from './finance-domain';

export interface EditorProps {
  loadProjects:()=>Promise<{projects:{id:string;name:string;clientName:string;archived:boolean}[]}>;
  kind:'code'|'invoice'|'expense';record:BusinessCode|Invoice|Expense;existing:boolean;today:string;
  employees:Employee[];codes:BusinessCode[];lockedMat:string|null;paymentLocked:boolean;
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
  <div className="form-row full finance-pdf-box"><label htmlFor="fvPdfInput">Déposer le PDF pour préremplir la facture</label><input className="inp" id="fvPdfInput" type="file" accept="application/pdf,.pdf" onChange={e=>p.act('choosePdf',e.currentTarget)}/><div className="hint" id="fvPdfStatus" role="status">{f.pdfSource?f.pdfSource.name+' · PDF déjà joint. Vous pouvez le remplacer.':'Le numéro, la date, le client, le code affaire et les montants reconnus seront proposés ci-dessous. Vous pourrez les modifier avant de créer la facture.'}</div></div>
  <Field id="fvDate" label="Date de facture" type="date" initial={p.existing?f.dateFacture:p.today}/><Field id="fvNum" label="N° de facture" initial={f.number} placeholder="ex. 26 03 012"/>
  <Field id="fvCode" label="Code affaire" initial={f.code} list="fvCodeList" placeholder="ex. 23145"/><datalist id="fvCodeList">{p.codes.slice().sort((a,b)=>codeKey(a).localeCompare(codeKey(b))).map(c=><option key={c.id} value={codeKey(c)}>{codeLabel(c)} — {(c.label||'').slice(0,50)}</option>)}</datalist>
  <Field id="fvClient" label="Client" initial={f.client} list="cdiClientsList"/><Field id="fvHT" label="Montant HT (€)" type="number" step="0.01" initial={f.ht} onInput={()=>p.act('ttcAuto')}/><Field id="fvTTC" label="Montant TTC (€)" type="number" step="0.01" initial={f.ttc}/>
  <Field id="fvPay" label="Date de paiement" type="date" initial={f.datePaiement}/><p className="finance-field-hint">Laissez vide tant que la facture n’est pas réglée.</p>
  </div></div><Buttons><button type="button" className="btn btn-ghost" onClick={()=>p.act('close')}>Annuler</button><button type="submit" className="btn btn-primary" id="fvSave">{p.existing?'Enregistrer':'Créer la facture'}</button></Buttons></>;}
function ExpenseLineEditor({line:l,index:i,p}:{line:ExpenseLine;index:number;p:EditorProps}){
  const km=l.categorie==='Frais kilométriques',vehicle=l.vehicule||'voiture',cvs=Object.keys(p.vehicles[vehicle]?.cv||{});
  const id=(field:string)=>'nfl-'+field+'-'+i;
  return <div className="nf-line"><div className="nf-line-top">
    <Field id={id('date')} label="Date" type="date" initial={l.date}/><div className="form-row" style={{flex:'1 1 180px'}}><label htmlFor={id('cat')}>Catégorie</label><select className="inp slim" id={id('cat')} defaultValue={l.categorie} onChange={()=>p.act('lineChanged',i)}>{p.categories.map(c=><option key={c}>{c}</option>)}</select></div>
    <Field id={id('montant')} label="Montant €" type="number" step="0.01" readOnly={km} initial={l.montant} onInput={()=>p.act('total')}/>
    <div className="form-row"><label>Justificatif</label><div className="finance-justif">{l.justificatif?<><button type="button" className="btn btn-ghost btn-sm" title={l.justName||'Justificatif'} onClick={()=>p.act('previewReceipt',i)}>Voir</button><button type="button" className="icon-btn" title="Retirer le justificatif" aria-label="Retirer le justificatif" onClick={()=>p.act('removeReceipt',i)}>×</button></>:<label className="btn btn-ghost btn-sm finance-file">Joindre<input type="file" accept="image/*,application/pdf" aria-label="Joindre un justificatif" onChange={e=>p.act('receipt',i,e.currentTarget)}/></label>}<button type="button" className="btn btn-ghost btn-sm finance-danger" aria-label="Supprimer la ligne" onClick={()=>p.act('removeLine',i)}>Supprimer</button></div></div>
  </div>
  {km&&<div className="nf-km"><div className="nf-itin">
    <input className="inp slim" id={id('dep')} list={'nfdl-dep-'+i} aria-label="Départ (ville / adresse)" placeholder="Départ (ville / adresse)" defaultValue={l.depart||''} autoComplete="off" onInput={()=>p.act('address',i,'dep')}/><datalist id={'nfdl-dep-'+i}/><span aria-hidden="true">→</span>
    <input className="inp slim" id={id('arr')} list={'nfdl-arr-'+i} aria-label="Arrivée (ville / adresse)" placeholder="Arrivée (ville / adresse)" defaultValue={l.arrivee||''} autoComplete="off" onInput={()=>p.act('address',i,'arr')}/><datalist id={'nfdl-arr-'+i}/>
    <label className="finance-check"><input type="checkbox" id={id('ar')} defaultChecked={l.allerRetour} onChange={()=>p.act('itinerarySync',i)}/> A/R ×2</label><button type="button" className="btn btn-primary btn-sm" onClick={()=>p.act('itinerary',i)}>Calculer les km</button><button type="button" className="btn btn-ghost btn-sm" onClick={()=>p.act('maps',i)}>Google Maps</button>
  </div><div className="finance-km-fields"><div className="form-row"><label htmlFor={id('vt')}>Véhicule</label><select className="inp slim" id={id('vt')} defaultValue={vehicle} onChange={()=>p.act('lineChanged',i)}>{Object.entries(p.vehicles).map(([v,data])=><option key={v} value={v}>{data.label}</option>)}</select></div>
    <div className="form-row"><label htmlFor={id('cv')}>Puiss. fiscale</label><select className="inp slim" id={id('cv')} defaultValue={String(l.cv||cvs[0])} onChange={()=>p.act('lineChanged',i)}>{cvs.map(cv=><option key={cv}>{cv}</option>)}</select></div>
    <Field id={id('km')} label="Km" type="number" initial={l.km} onInput={()=>p.act('lineKm',i)}/><label className="finance-check"><input type="checkbox" id={id('elec')} defaultChecked={l.elec} onChange={()=>p.act('lineChanged',i)}/> Électrique (+20%)</label>
    <div className="finance-km-formula">Forfait : <b id={id('bareme')}>{p.formula(vehicle,String(l.cv||cvs[0]),l.km||0)}{l.elec?' ×1,2':''}</b> → Indemnité : <b id={id('ind')}>{money(l.montant)}</b></div>
  </div></div>}
  <div style={{marginTop:8}}><Field id={id('desc')} label="Description / commentaire" initial={l.description}/></div></div>;
}
function ExpenseProject({p,n}:{p:EditorProps;n:Expense}){
 const [projects,setProjects]=useState<{id:string;name:string;clientName:string;archived:boolean}[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0),[selected,setSelected]=useState(String(n.projectId||''));
 useEffect(()=>{let active=true;setLoading(true);void p.loadProjects().then(r=>{if(active){setProjects(r.projects);setError('');}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[retry]);
 return <div className="form-row full"><label htmlFor="nfProject">Projet</label><select className="inp" id="nfProject" value={selected} onChange={e=>setSelected(e.target.value)} disabled={loading||!!error}><option value="">{loading?'Chargement…':'Aucun projet'}</option>{selected&&!projects.some(p=>p.id===selected)&&<option value={selected} data-name={String(n.projectName||'')}>{String(n.projectName||'Projet enregistré')}</option>}{projects.filter(p=>!p.archived||p.id===selected).map(p=><option key={p.id} value={p.id} data-name={p.name}>{p.name} · {p.clientName}</option>)}</select>{error&&<span role="alert">{error} <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setRetry(n=>n+1)}>Réessayer</button></span>}</div>;
}
function ExpenseEditor(p:EditorProps){const n=p.record as Expense;const [mat,setMat]=useState(p.lockedMat||n.matricule);const person=p.employees.find(e=>e.matricule===mat);const employees=p.employees.filter(e=>!p.lockedMat||e.matricule===p.lockedMat);return <>
  <header className="modal-head"><h3 id="financeEditorTitle">Note de frais — N°{n.numero}</h3><div className="grow"/><button className="icon-btn" type="button" aria-label="Fermer" onClick={()=>p.act('close')}>×</button></header><div className="modal-body"><section className="finance-employee-header" aria-label="Identification du salarié"><strong>{person?.prenom} {person?.nom}</strong><span>Matricule {mat}</span></section><div className="form-grid">
    <div className="form-row"><label htmlFor="nfSal">Salarié</label><select className="inp" id="nfSal" value={mat} onChange={e=>setMat(e.target.value)} disabled={!!p.lockedMat}>{employees.map(e=><option key={e.matricule} value={e.matricule}>{e.nom} {e.prenom}</option>)}</select></div>
    <div className="form-row"><label htmlFor="nfStatut">Statut</label><select className="inp" id="nfStatut" defaultValue={expenseStatus(n.statut)} disabled={p.paymentLocked}>{p.statuses.map(s=><option key={s}>{s}</option>)}</select></div>
    <Field id="nfObjet" label="Objet de la mission" initial={n.objet} full placeholder="ex. Mission Livorno"/><ExpenseProject p={p} n={n}/><Field id="nfLieu" label="Lieu(x)" initial={n.lieu}/><Field id="nfCodeC" label="Code compta" initial={n.codeCompta}/>
    <Field id="nfD1" label="Date départ" type="date" initial={n.dateDepart} onChange={()=>p.act('duration')}/><Field id="nfD2" label="Date retour" type="date" initial={n.dateRetour} onChange={()=>p.act('duration')}/><Field id="nfDuree" label="Durée (jours)" initial={n.duree} disabled/><Field id="nfDateNote" label="Date de la note" type="date" initial={n.dateNote}/><Field id="nfFaitA" label="Fait à (lieu)" initial={n.faitA} placeholder="ex. Bastia"/>
  </div><div className="section-title">Lignes de dépenses</div><div id="nfLines">{(n.lignes||[]).map((line,i)=><ExpenseLineEditor key={line.id||i} line={line} index={i} p={p}/>)}</div><button type="button" className="btn btn-ghost btn-sm" style={{marginTop:10}} onClick={()=>p.act('addLine')}>Ajouter une ligne</button>
  <div className="finance-refund"><Field id="nfAvance" label="Avance à déduire (€)" type="number" step="0.01" initial={n.avance} onInput={()=>p.act('total')}/><div className="finance-refund-total"><div className="hint">Total / Montant à rembourser</div><strong><span id="nfTotalDisp">{money(expenseTotal(n))}</span> / <span id="nfRembDisp">{money(expenseRefund(n))}</span></strong></div></div>
  <div className="section-title">Signature de l’intéressé(e)</div><div className="finance-sign"><canvas id="nfSign" width={360} height={130} aria-label="Signature de l’intéressé"/><button type="button" className="btn btn-ghost btn-sm" onClick={()=>p.act('clearSignature')}>Effacer</button></div><div className="hint" style={{marginTop:6}}>Signez à la main (souris ou tactile) — la signature sera reprise sur le PDF.</div>
  </div><Buttons><button type="button" className="btn btn-ghost" onClick={()=>p.act('close')}>Fermer</button><div className="grow"/><button type="button" className="btn btn-ghost" onClick={()=>p.act('previewExpense')}>Aperçu</button><button type="submit" className="btn btn-ghost">Enregistrer</button><button type="button" className="btn btn-primary" onClick={()=>p.act('saveExpense',true)}>Enregistrer + PDF</button></Buttons>
  </>;
}
function Editor(p:EditorProps){const [error,setError]=useState('');useLayoutEffect(()=>{p.init();},[]);return <form className="finance-editor" data-react-editor={p.kind} noValidate aria-labelledby="financeEditorTitle" onSubmit={async e=>{
  e.preventDefault();setError('');try{if(p.kind==='expense')p.act('saveExpense',false);else await p.save(p.kind==='code'?codeInput(e.currentTarget):invoiceInput(e.currentTarget));}catch(err){setError(err instanceof Error?err.message:'Enregistrement impossible.');}
 }}>{p.kind==='code'?<CodeEditor {...p}/>:p.kind==='invoice'?<InvoiceEditor {...p}/>:<ExpenseEditor {...p}/ >}{error&&<div className="finance-error" role="alert">{error}</div>}</form>;}
export function mountFinanceEditor(element:HTMLElement,props:EditorProps){const root=createRoot(element);flushSync(()=>root.render(<Editor {...props}/>));return ()=>root.unmount();}
