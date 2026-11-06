import {History,RotateCcw} from 'lucide-react';
import type {ClientAllocation} from '../client-employees-domain';
import {MISSION_PROFILES,missionTasksForProfile} from '../mission-profiles';
import {Field} from './billing-fields';

/** Existing dated assignments stay editable; a new project link needs no rate or dates. */
export function ClientHistoricalAllocations({allocations,onChange}:{allocations:ClientAllocation[];onChange:(allocations:ClientAllocation[])=>void}){
 if(!allocations.length)return null;
 const patch=(id:string,value:Partial<ClientAllocation>)=>onChange(allocations.map(allocation=>{if(allocation.id!==id)return allocation;const next={...allocation,...value},previous=missionTasksForProfile(allocation.projectRole||'',allocation.project);if('projectRole' in value&&(!allocation.tasks.trim()||previous&&allocation.tasks.trim()===previous.trim()))next.tasks=missionTasksForProfile(next.projectRole||'',next.project);return next;}));
 return <details className="client-assignment-history"><summary><History size={17}/>Affectations détaillées enregistrées <span>{allocations.length}</span></summary>{allocations.map(allocation=><section className="client-allocation" key={allocation.id}>
  <h4>{allocation.project}<small>{allocation.projectCode}</small></h4><div className="bill-fields">
   <Field label="Affectation (%)"><input type="number" min="0.01" max="100" step="0.01" value={allocation.percent} onChange={event=>patch(allocation.id,{percent:event.target.value})}/></Field>
   <Field label="ID du projet"><input readOnly value={allocation.projectCode}/></Field>
   <Field label="Applicable à partir du"><input type="date" value={allocation.startDate} onChange={event=>patch(allocation.id,{startDate:event.target.value})}/></Field>
   <Field label="Valide jusqu’au"><input type="date" min={allocation.startDate||undefined} value={allocation.endDate} onChange={event=>patch(allocation.id,{endDate:event.target.value})}/></Field>
   <Field label="Fonction au sein du projet" wide><select value={allocation.projectRole||''} onChange={event=>patch(allocation.id,{projectRole:event.target.value})}><option value="">Choisir une fonction</option>{allocation.projectRole&&!MISSION_PROFILES.some(profile=>profile.id===allocation.projectRole)&&<option value={allocation.projectRole}>{allocation.projectRole}</option>}{MISSION_PROFILES.map(profile=><option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></Field>
   <Field label="Missions" wide><textarea rows={4} maxLength={6000} value={allocation.tasks} onChange={event=>patch(allocation.id,{tasks:event.target.value})}/></Field>
  </div>{MISSION_PROFILES.some(profile=>profile.id===allocation.projectRole)&&allocation.tasks.trim()!==missionTasksForProfile(allocation.projectRole!,allocation.project).trim()&&<button type="button" className="bill-button" onClick={()=>{if(!allocation.tasks.trim()||confirm('Remplacer les missions saisies par celles du profil ?'))patch(allocation.id,{tasks:missionTasksForProfile(allocation.projectRole!,allocation.project)});}}><RotateCcw size={16}/>Remplacer par les missions du profil</button>}
 </section>)}</details>;
}
