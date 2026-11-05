import React,{useEffect,useState} from 'react';
import {Plus,Trash2,Save,X,WalletCards,Landmark} from 'lucide-react';
import type {RhPaymentEntry} from '../rh-domain';
import type {ClientEmployee} from '../client-employees-domain';
import {RhAvatar} from './rh-avatar';

type InputEntry=Omit<RhPaymentEntry,'amountCents'>&{amountText:string};
const labelMonth=(value:string)=>new Date(value+'-01T12:00:00').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
export function RhPaymentsEditor({value,agents,months,busy,onSave,onCancel,onDirty}:{value:RhPaymentEntry[];agents:Pick<ClientEmployee,'id'|'name'>[];months:string[];busy:boolean;onSave:(value:RhPaymentEntry[])=>Promise<unknown>;onCancel:()=>void;onDirty:(dirty:boolean)=>void}){
 const [entries,setEntries]=useState<InputEntry[]>(()=>value.map(p=>{const {amountCents,...rest}=p;return {...rest,amountText:amountCents===null?'':String(amountCents/100)};}));
 const original=value.map(p=>{const {amountCents,...rest}=p;return {...rest,amountText:amountCents===null?'':String(amountCents/100)};});
 const dirty=JSON.stringify(entries)!==JSON.stringify(original);
 useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
 const choices=[...new Set([...months,...entries.map(p=>p.month)])].sort();
 const [selectedMonth,setMonth]=useState(choices[0]||''),[scope,setScope]=useState(''),[error,setError]=useState('');
 const set=(id:string,field:keyof InputEntry,value:string)=>{setError('');setEntries(items=>items.map(p=>p.id===id?{...p,[field]:value}:p));};
 const add=(kind:RhPaymentEntry['kind'])=>setEntries(items=>[...items,{id:crypto.randomUUID(),agentId:scope,month:selectedMonth,kind,organism:'',amountText:'',date:'',reference:''}]);
 const submit=(event:React.FormEvent)=>{event.preventDefault();setError('');const result:RhPaymentEntry[]=[];
  for(const entry of entries){const text=entry.amountText.trim().replace(/\s/g,'');if(text&&!/^\d+(?:[.,]\d{1,2})?$/.test(text)){setError('Saisissez un montant positif avec deux décimales au maximum, ou laissez la case vide.');return;}const {amountText,...rest}=entry;result.push({...rest,amountCents:text?Math.round(Number(text.replace(',','.'))*100):null});}
  void onSave(result);
 };
 const selected=agents.find(a=>a.id===scope);
 return <form className="rh-payments-editor" data-unsaved={dirty?'true':undefined} onSubmit={submit}>
  <div className="rh-payment-filters"><label className="rh-field"><span>Mois concerné</span><select aria-label="Mois concerné" value={selectedMonth} onChange={e=>setMonth(e.target.value)}>{choices.map(m=><option key={m} value={m}>{labelMonth(m)}</option>)}</select></label><label className="rh-field"><span>Paiements pour</span><select aria-label="Paiements pour" value={scope} onChange={e=>setScope(e.target.value)}><option value="">Tous les salariés du client</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
  {selected?<p className="rh-payment-scope"><RhAvatar name={selected.name} small/>{selected.name} · Les saisies individuelles remplacent les paiements communs de même nature.</p>:<p className="rh-payment-scope">Mandats et organismes communs au client : une seule saisie, reprise pour les salariés concernés.</p>}
  {error&&<p className="rh-error" role="alert">{error}</p>}
  {(['salary','contribution'] as const).map(kind=>{const list=entries.filter(p=>p.month===selectedMonth&&p.agentId===scope&&p.kind===kind);return <section key={kind} className="rh-payment-kind"><div className="rh-section-heading"><h3>{kind==='salary'?<WalletCards size={17}/>:<Landmark size={17}/>}Paiement des {kind==='salary'?'salaires':'charges'}</h3><button className="rh-button rh-quiet" type="button" disabled={busy||!selectedMonth} onClick={()=>add(kind)}><span><Plus size={16}/>{kind==='salary'?'Ajouter un versement':'Ajouter un organisme'}</span></button></div>
   {!list.length?<p className="rh-payment-empty">{scope?'Les paiements communs sont utilisés tant qu’aucune saisie individuelle n’est ajoutée.':'Aucune saisie.'}</p>:<div className="rh-table-scroll"><table><thead><tr><th>{kind==='salary'?'N° de mandat':'Organisme'}</th><th>Montant {kind==='salary'?'du mandat':'versé'} (€)</th><th>Date de paiement effectif</th><th><span className="rh-visually-hidden">Actions</span></th></tr></thead><tbody>{list.map((p,i)=><tr key={p.id}><td><input aria-label={(kind==='salary'?'N° de mandat salaire ':'Organisme charges ')+(i+1)} value={kind==='salary'?p.reference:p.organism} maxLength={kind==='salary'?300:200} placeholder={kind==='salary'?'Référence du mandat':'Nom de l’organisme'} onChange={e=>set(p.id,kind==='salary'?'reference':'organism',e.target.value)}/></td><td><input aria-label={'Montant '+(kind==='salary'?'salaire ':'charges ')+(i+1)} inputMode="decimal" placeholder="À compléter" value={p.amountText} onChange={e=>set(p.id,'amountText',e.target.value)}/></td><td><input type="date" aria-label={'Date '+(kind==='salary'?'salaire ':'charges ')+(i+1)} value={p.date} onChange={e=>set(p.id,'date',e.target.value)}/></td><td><button type="button" className="rh-button rh-quiet" aria-label={'Retirer '+(kind==='salary'?'le versement ':'l’organisme ')+(i+1)} onClick={()=>setEntries(items=>items.filter(x=>x.id!==p.id))}><span><Trash2 size={16}/></span></button></td></tr>)}</tbody></table></div>}
  </section>;})}
  <p className="rh-payment-scope">Les cases peuvent rester vides. La saisie manuelle ne remplace pas le retour signé du service financier.</p>
  <div className="rh-modal-actions"><button type="button" className="rh-button" disabled={busy} onClick={onCancel}><span><X size={16}/>Annuler</span></button><button type="submit" className="rh-button rh-primary" disabled={busy}><span><Save size={16}/>Enregistrer les paiements</span></button></div>
 </form>;
}
