import {useEffect,useState} from 'react';
import {Users} from 'lucide-react';
import type {BillingTransport} from '../billing-contracts';
import './rh-linked-agents.css';

/** Read the shared agent/project directory without copying payroll into commercial records. */
export function RhProjectAgents({projectId,transport,clients}:{projectId:string;transport:BillingTransport;clients:{id:string;name:string}[]}){
 const [agents,setAgents]=useState<{id:string;name:string;role:string;clientId:string}[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{let active=true;setAgents([]);setError('');setBusy(true);if(!transport.rhProjectAgents){setBusy(false);return;}
  transport.rhProjectAgents(projectId).then(data=>{if(active)setAgents(data.agents);},e=>{if(active)setError(e instanceof Error?e.message:'Les agents ne peuvent pas être chargés.');}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};
 },[projectId,transport,reload]);
 if(!transport.rhProjectAgents)return null;
 return <section className="bill-section bill-project-agents" aria-label="Agents affectés au projet"><h3><Users size={17} aria-hidden="true"/> Agents affectés <span>{agents.length}</span></h3>
  {busy?<p role="status">Chargement des agents…</p>:error?<div className="bill-message bill-message-error" role="alert">{error}<button type="button" className="bill-button" onClick={()=>setReload(n=>n+1)}>Réessayer</button></div>:agents.length?<ul>{agents.map(agent=><li key={agent.clientId+':'+agent.id}><strong>{agent.name}</strong><span>{[agent.role,clients.find(c=>c.id===agent.clientId)?.name].filter(Boolean).join(' · ')}</span></li>)}</ul>:<p className="bill-muted">Aucun agent affecté.</p>}
 </section>;
}
