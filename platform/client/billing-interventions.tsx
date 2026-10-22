import {Plus,ClipboardList,Trash2} from 'lucide-react';
import type {BillingDraft,BillingContext} from '../billing-contracts';
import {blankDocumentDetails} from '../billing-domain';
import {Field} from './billing-fields';
export function Interventions({draft:d,context,onChange}:{draft:BillingDraft;context:BillingContext|null;onChange:(p:Partial<BillingDraft>)=>void}){
 if(d.kind!=='invoice')return null;
 const details=d.details||blankDocumentDetails(),rows=details.interventions,prices=context?.markets.find(m=>m.id===d.references.marketId)?.prices||[];
 const update=(interventions:typeof rows)=>onChange({details:{...details,interventions}});
 return <div className="bill-interventions"><Field path="details.returnEmail" label="À retourner à"><input type="email" maxLength={300} value={details.returnEmail} onChange={e=>onChange({details:{...details,returnEmail:e.target.value}})}/></Field>
  <details className="bill-extra-fields"><summary><ClipboardList size={17}/> Relevé d’intervention {rows.length>0&&'· '+rows.length+' ligne(s)'}</summary>
   <div className="bill-reference-tools"><button type="button" className="bill-button" disabled={!prices.length||rows.length>=200} onClick={()=>update([...rows,...prices.filter(p=>p.unit==='day'&&!rows.some(r=>r.priceId===p.id)).slice(0,Math.max(0,200-rows.length)).map(p=>({id:crypto.randomUUID(),priceId:p.id,label:p.label,description:'',days:''}))])}>Reprendre le BPU</button><button type="button" className="bill-button bill-button-quiet" disabled={rows.length>=200} onClick={()=>update([...rows,{id:crypto.randomUUID(),priceId:'',label:'',description:'',days:''}])}><Plus size={15}/> Ajouter une ligne</button></div>
   {rows.map((r,i)=>{const patch=(v:Partial<typeof r>)=>update(rows.map(x=>x.id===r.id?{...x,...v}:x));return <section className="bill-line" key={r.id}><div className="bill-line-heading"><b>Intervention {i+1}</b><button type="button" className="bill-icon-button" aria-label={'Retirer intervention '+(i+1)} onClick={()=>update(rows.filter(x=>x.id!==r.id))}><Trash2 size={15}/></button></div><div className="bill-fields">
    <Field label={'Prestation du relevé '+(i+1)} wide><select value={r.priceId} onChange={e=>{const p=prices.find(p=>p.id===e.target.value);patch({priceId:e.target.value,label:p?.label||r.label});}}><option value="">Prestation libre</option>{r.priceId&&!prices.some(p=>p.id===r.priceId)&&<option value={r.priceId}>{r.label}</option>}{prices.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
    {!r.priceId&&<Field label={'Intitulé intervention '+(i+1)} wide><input maxLength={300} value={r.label} onChange={e=>patch({label:e.target.value})}/></Field>}
    <Field path={'details.interventions.'+i+'.description'} label={'Travail effectué '+(i+1)} wide><textarea rows={3} maxLength={4000} value={r.description} onChange={e=>patch({description:e.target.value})}/></Field><Field path={'details.interventions.'+i+'.days'} label={'Nombre de jours '+(i+1)}><input inputMode="decimal" maxLength={40} value={r.days} onChange={e=>patch({days:e.target.value})}/></Field>
   </div></section>;})}
  </details>
 </div>;
}
