import {useEffect,useState} from 'react';
import {Building2,RefreshCw,Users} from 'lucide-react';
import type {BillingTransport} from '../billing-contracts';
import {RhAvatar} from './rh-avatar';
import './rh-linked-agents.css';

/** Read the shared agent/project directory without copying payroll into commercial records. */
export function RhProjectAgents({projectId,transport,clients}:{projectId:string;transport:BillingTransport;clients:{id:string;name:string}[]}){
 const [agents,setAgents]=useState<{id:string;name:string;role:string;clientId:string;clientName?:string}[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{let active=true;setAgents([]);setError('');setBusy(true);if(!transport.rhProjectAgents){setBusy(false);return;}
  transport.rhProjectAgents(projectId).then(data=>{if(active)setAgents(data.agents);},e=>{if(active)setError(e instanceof Error?e.message:'Les agents ne peuvent pas être chargés.');}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};
 },[projectId,transport,reload]);
 if(!transport.rhProjectAgents)return null;
 return <section className="bill-section bill-project-agents" aria-label="Salariés rattachés au projet"><h3><Users size={17} aria-hidden="true"/> Salariés rattachés <span>{agents.length}</span></h3>
  {busy?<p role="status">Chargement des salariés…</p>:error?<div className="bill-message bill-message-error" role="alert">{error}<button type="button" className="bill-button" onClick={()=>setReload(n=>n+1)}><RefreshCw size={16}/>Réessayer</button></div>:agents.length?<ul>{agents.map(agent=><li key={agent.clientId+':'+agent.id}><RhAvatar name={agent.name} small/><div><strong>{agent.name}</strong>{agent.role&&<small>{agent.role}</small>}<span className="bill-agent-entity"><Building2 size={13}/>{agent.clientName||clients.find(client=>client.id===agent.clientId)?.name||'Entité archivée'}</span></div></li>)}</ul>:<p className="bill-muted">Aucun salarié rattaché.</p>}
 </section>;
}
