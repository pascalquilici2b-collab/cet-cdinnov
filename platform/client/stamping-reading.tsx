import {useState} from 'react';
import {Check,Search,FileCheck2,Trash2,Undo2,UserRound,CalendarDays,ChevronRight} from 'lucide-react';
import {stampingPeriod} from './stamping-period';

export function StampReading({reading,busy,onConfirm}:{reading:any;busy:boolean;onConfirm:(changes:any[])=>void}){
 const [selected,setSelected]=useState(reading.groups[0]?.id||''),[query,setQuery]=useState(''),[edits,setEdits]=useState<Record<string,any>>({});
 const identityOf=(g:any)=>({employee:edits[g.allocations[0]?.id]?.employee??g.employee_ref,period:edits[g.allocations[0]?.id]?.period??g.period});
 const keyOf=(g:any)=>String(identityOf(g).employee||'Salarié à préciser').trim().replace(/\s+/g,' ').toLocaleLowerCase('fr');
 const matches=reading.groups.filter((g:any)=>{const i=identityOf(g);return `${i.employee} ${i.period} ${stampingPeriod(i.period)} ${g.allocations.map((a:any)=>edits[a.id]?.project??a.project).join(' ')}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'));});
 const employees=Array.from(new Set<string>(matches.map(keyOf))).map(key=>({key,groups:matches.filter((g:any)=>keyOf(g)===key).sort((a:any,b:any)=>String(identityOf(a).period).localeCompare(String(identityOf(b).period)))})).sort((a,b)=>keyOf(a.groups[0]).localeCompare(keyOf(b.groups[0]),'fr'));
 const selectedGroup=matches.find((g:any)=>g.id===selected),employee=employees.find(e=>e.key===(selectedGroup&&keyOf(selectedGroup)))||employees[0];
 const group=employee?.groups.find((g:any)=>g.id===selected)||employee?.groups[0];
 const value=(a:any)=>edits[a.id]||{groupId:group.id,allocationId:a.id,employee:group.employee_ref,period:group.period,project:a.project,amount:a.amount_cents==null?(a.amountRaw||''):(a.amount_cents/100).toFixed(2),baseAmount:('base_cents' in a?a.base_cents:group.base_amount_cents)==null?(group.baseRaw||''):((('base_cents' in a?a.base_cents:group.base_amount_cents))/100).toFixed(2),excluded:false};
 const update=(a:any,patch:any)=>setEdits(prior=>({...prior,[a.id]:{...value(a),...patch}}));
 const identity=(patch:any)=>setEdits(prior=>({...prior,...Object.fromEntries(group.allocations.map((a:any)=>[a.id,{...value(a),...patch}]))}));
 return <section className="stamp-panel stamp-reading">
  <div className="stamp-section-head"><h2><FileCheck2 size={19}/> Répartition reconnue</h2><span className="stamp-reading-count">{new Set(reading.groups.map(keyOf)).size} salariés · {reading.groups.length} périodes</span></div>
  <label className="stamp-reading-search"><Search size={16}/><input aria-label="Rechercher un salarié ou un mois" placeholder="Salarié, mois, projet…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <div className="stamp-reading-layout">
   <nav aria-label="Salariés du tableau" className="stamp-reading-people"><h3><UserRound size={15}/>Salariés</h3><div className="stamp-reading-list">{employees.map(e=><button key={e.key} aria-pressed={e.key===employee?.key} onClick={()=>setSelected(e.groups[0].id)}><strong>{identityOf(e.groups[0]).employee||'Salarié à préciser'}</strong><span><small>{e.groups.length} mois</small><ChevronRight size={14}/></span>{e.groups.some((g:any)=>g.errors.length>0)&&<em>À vérifier</em>}</button>)}</div></nav>
   <nav aria-label="Mois du salarié" className="stamp-reading-months"><h3><CalendarDays size={15}/>Mois</h3><div className="stamp-reading-list">{employee?.groups.map((g:any)=><button key={g.id} aria-pressed={g.id===group?.id} onClick={()=>setSelected(g.id)}><strong>{stampingPeriod(identityOf(g).period)||'Mois à préciser'}</strong><span><small>{g.allocations.length} projet{g.allocations.length>1?'s':''}</small><ChevronRight size={14}/></span>{g.errors.length>0&&<em>À vérifier</em>}</button>)}</div></nav>
   {group?<div className="stamp-reading-fields"><h3 className="stamp-reading-period"><CalendarDays size={17}/>{stampingPeriod(identityOf(group).period)||'Mois à préciser'}</h3><div className="stamp-reading-identity"><label>Salarié<input aria-label="Salarié reconnu" value={value(group.allocations[0]).employee} onChange={e=>identity({employee:e.target.value})}/></label><label>Mois<input type="month" aria-label="Mois reconnu" value={value(group.allocations[0]).period} onChange={e=>identity({period:e.target.value})}/></label></div>
    <div className="stamp-reading-columns"><span>Projet</span><span>Montant rendu compte</span></div>
    {group.allocations.map((a:any)=><div className={"stamp-reading-line"+(value(a).excluded?" is-excluded":"")} key={a.id}><input aria-label={'Projet '+a.project} value={value(a).project} onChange={e=>update(a,{project:e.target.value})}/><div><input inputMode="decimal" aria-label={'Montant '+a.project} value={value(a).amount} onChange={e=>update(a,{amount:e.target.value})}/><span>€</span></div><small>{a.source.sheet} · {a.source.cell}</small><button className="stamp-reading-remove" title={value(a).excluded?"Rétablir la ligne":"Exclure cette ligne"} aria-label={(value(a).excluded?"Rétablir ":"Exclure ")+a.project} onClick={()=>update(a,{excluded:!value(a).excluded})}>{value(a).excluded?<Undo2 size={15}/>:<Trash2 size={15}/>}</button></div>)}
    <details><summary>Assiette du bulletin</summary><label>Coût employeur (EUR)<input inputMode="decimal" value={value(group.allocations[0]).baseAmount} onChange={e=>identity({baseAmount:e.target.value})}/></label></details>
    {group.errors.map((error:string)=><p className="stamp-reading-error" key={error}>{error}</p>)}
   </div>:<p>Aucune ligne ne correspond à la recherche.</p>}
  </div>
  {reading.errors.length>0&&<details open><summary>{reading.errors.length} ligne(s) à vérifier</summary>{reading.errors.map((e:any,i:number)=><p role="alert" key={i}>{e.sheet} · ligne {e.row} : {e.message}</p>)}</details>}
  <div className="stamp-actions"><button className="stamp-primary" disabled={busy} onClick={()=>onConfirm(Object.values(edits))}><Check size={17}/>Confirmer la répartition</button></div>
 </section>;
}
