import {useState} from 'react';
import {Check,Search,FileCheck2,Trash2,Undo2} from 'lucide-react';

export function StampReading({reading,busy,onConfirm}:{reading:any;busy:boolean;onConfirm:(changes:any[])=>void}){
 const [selected,setSelected]=useState(reading.groups[0]?.id||''),[query,setQuery]=useState(''),[edits,setEdits]=useState<Record<string,any>>({});
 const groups=reading.groups.filter((g:any)=>`${g.employee_ref} ${g.period} ${g.allocations.map((a:any)=>a.project).join(' ')}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')));
 const group=reading.groups.find((g:any)=>g.id===selected)||groups[0];
 const value=(a:any)=>edits[a.id]||{groupId:group.id,allocationId:a.id,employee:group.employee_ref,period:group.period,project:a.project,amount:a.amount_cents==null?(a.amountRaw||''):(a.amount_cents/100).toFixed(2),baseAmount:('base_cents' in a?a.base_cents:group.base_amount_cents)==null?(group.baseRaw||''):((('base_cents' in a?a.base_cents:group.base_amount_cents))/100).toFixed(2),excluded:false};
 const update=(a:any,patch:any)=>setEdits(prior=>({...prior,[a.id]:{...value(a),...patch}}));
 const identity=(patch:any)=>setEdits(prior=>({...prior,...Object.fromEntries(group.allocations.map((a:any)=>[a.id,{...value(a),...patch}]))}));
 return <section className="stamp-panel stamp-reading">
  <div className="stamp-section-head"><h2><FileCheck2 size={19}/> Répartition reconnue</h2><span className="stamp-reading-count">{reading.groups.length} salariés / mois</span></div>
  <div className="stamp-reading-layout"><nav aria-label="Salariés et mois du tableau"><label className="stamp-reading-search"><Search size={16}/><input aria-label="Rechercher un salarié ou un mois" placeholder="Salarié, mois, projet…" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="stamp-reading-list">{groups.map((g:any)=><button key={g.id} aria-pressed={g.id===group?.id} onClick={()=>setSelected(g.id)}><strong>{edits[g.allocations[0]?.id]?.employee||g.employee_ref}</strong><span>{edits[g.allocations[0]?.id]?.period||g.period}<small>{g.allocations.length} projet{g.allocations.length>1?'s':''}</small></span>{g.errors.length>0&&<em>À vérifier</em>}</button>)}</div></nav>
  {group?<div className="stamp-reading-fields"><div className="stamp-reading-identity"><label>Salarié<input aria-label="Salarié reconnu" value={value(group.allocations[0]).employee} onChange={e=>identity({employee:e.target.value})}/></label><label>Mois<input type="month" aria-label="Mois reconnu" value={value(group.allocations[0]).period} onChange={e=>identity({period:e.target.value})}/></label></div>
   <div className="stamp-reading-columns"><span>Projet</span><span>Montant rendu compte</span></div>
   {group.allocations.map((a:any)=><div className={"stamp-reading-line"+(value(a).excluded?" is-excluded":"")} key={a.id}><input aria-label={'Projet '+a.project} value={value(a).project} onChange={e=>update(a,{project:e.target.value})}/><div><input inputMode="decimal" aria-label={'Montant '+a.project} value={value(a).amount} onChange={e=>update(a,{amount:e.target.value})}/><span>€</span></div><small>{a.source.sheet} · {a.source.cell}</small><button className="stamp-reading-remove" title={value(a).excluded?"Rétablir la ligne":"Exclure cette ligne"} aria-label={(value(a).excluded?"Rétablir ":"Exclure ")+a.project} onClick={()=>update(a,{excluded:!value(a).excluded})}>{value(a).excluded?<Undo2 size={15}/>:<Trash2 size={15}/>}</button></div>)}
   <details><summary>Assiette du bulletin</summary><label>Coût employeur (EUR)<input inputMode="decimal" value={value(group.allocations[0]).baseAmount} onChange={e=>identity({baseAmount:e.target.value})}/></label></details>
   {group.errors.map((error:string)=><p className="stamp-reading-error" key={error}>{error}</p>)}
  </div>:<p>Aucune ligne ne correspond à la recherche.</p>}</div>
  {reading.errors.length>0&&<details open><summary>{reading.errors.length} ligne(s) à vérifier</summary>{reading.errors.map((e:any,i:number)=><p role="alert" key={i}>{e.sheet} · ligne {e.row} : {e.message}</p>)}</details>}
  <div className="stamp-actions"><button className="stamp-primary" disabled={busy} onClick={()=>onConfirm(Object.values(edits))}><Check size={17}/>Confirmer la répartition</button></div>
 </section>;
}
