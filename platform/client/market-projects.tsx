import {ActivityBadge} from './activity-select';
import {projectActivity} from '../project-activity';
import {defaultFundingProgrammes} from '../billing-domain';
import {useState} from 'react';
import {FolderKanban,FileCheck2,Plus,Pencil,Archive,Check} from 'lucide-react';
import type {Market,MarketsSnapshot} from './markets-contracts';
import {money} from '../../marches/domain.mjs';

export function Projects({s,m}:{s:MarketsSnapshot;m:Market}){
 const [open,setOpen]=useState<string|null>(()=>m.projects?.find(p=>!p.name||p.orders.some(o=>!o.reference))?.id||null);
 const projects=m.projects||[];
 return <section className="mk-projects">
  <div className="mk-projects-heading"><h3><FolderKanban size={20}/> Projets liés</h3><button type="button" className="mk-primary" data-action="add-project" disabled={s.busy}><Plus size={16}/> Ajouter un projet</button></div>
  {!projects.length&&<p className="mk-muted">Ajoutez un projet à ce marché, puis ses bons de commande.</p>}
  {projects.map((project,i)=>{
   const orderCount=new Set([...project.orders.map(o=>o.id),...(m.linkedEngagements||[]).filter(e=>e.kind==='order'&&e.projectId===project.id).map(e=>e.orderId)]).size;
   const path='projects.'+i,expanded=open===project.id||!project.name||project.orders.some(o=>!o.reference),complete=!s.dirty&&!!project.name&&project.orders.every(o=>!!o.reference);
   return <section key={project.id} className="mk-project" data-archived={project.archived}>
    <div className="mk-project-heading">
     <span className={'mk-completion'+(complete?' is-complete':'')} aria-label={complete?'Projet enregistré':'Projet à compléter'}>{complete?<Check size={18}/>:<FolderKanban size={18}/>}</span>
     <div><strong>{project.name||'Nouveau projet'}</strong><small>{[project.code,orderCount+' bon'+(orderCount>1?'s':'')+' de commande',project.archived?'Archivé':''].filter(Boolean).join(' · ')}</small></div>
     <ActivityBadge activity={projectActivity(project)}/><button type="button" className="mk-project-edit" aria-label={'Modifier le projet '+(project.name||'nouveau')} onClick={()=>setOpen(expanded?null:project.id)}><Pencil size={16}/></button>
    </div>
    {expanded&&<div className="mk-project-body">
     <div className="mk-form-grid">
      <label className="mk-field mk-wide">Nom du projet<input aria-label={'Nom du projet '+(i+1)} data-path={path+'.name'} defaultValue={project.name} maxLength={180}/></label>
      <label className="mk-field">Date de début du projet<input type="date" data-path={path+'.startDate'} defaultValue={project.startDate||''}/></label><label className="mk-field">Date de fin du projet<input type="date" min={project.startDate||undefined} data-path={path+'.endDate'} defaultValue={project.endDate||''}/></label>
      <label className="mk-field">ID du projet<input data-path={path+'.code'} defaultValue={project.code} maxLength={80}/></label>
      <label className="mk-field">Programme<input list={'market-programmes-'+project.id} data-path={path+'.programme'} defaultValue={project.programme||''} maxLength={160}/><datalist id={'market-programmes-'+project.id}>{defaultFundingProgrammes.map(p=><option key={p} value={p}/>)}</datalist></label><label className="mk-field mk-wide">Notes<textarea data-path={path+'.notes'} defaultValue={project.notes} maxLength={2000} rows={2}/></label>
     </div>
     <div className="mk-orders-heading"><h4><FileCheck2 size={18}/> Bons de commande</h4><button type="button" data-add-order={i} disabled={s.busy||project.archived}><Plus size={16}/> Ajouter un bon</button></div>
     {project.orders.map((order,j)=>{
      const prefix=path+'.orders.'+j;
      return <div className="mk-order" key={order.id} data-archived={order.archived}>
       <div className="mk-order-heading"><strong>{order.reference||'Nouveau bon de commande'}</strong><span>{order.amountMinor==null?'':money(order.amountMinor)}</span><button type="button" data-toggle-order={i+'.'+j} aria-label={(order.archived?'Restaurer':'Archiver')+' le bon '+(order.reference||j+1)}><Archive size={15}/></button></div>
       <div className="mk-form-grid">
        <label className="mk-field">Référence du bon<input aria-label={'Référence commande '+(i+1)+'-'+(j+1)} data-path={prefix+'.reference'} defaultValue={order.reference} maxLength={120}/></label>
        <label className="mk-field">Date<input type="date" data-path={prefix+'.date'} defaultValue={order.date}/></label>
        <label className="mk-field">Montant HT (€)<input inputMode="decimal" data-path={prefix+'.amountMinor'} defaultValue={order.amountMinor==null?'':(order.amountMinor/100).toFixed(2)}/></label>
        <label className="mk-field">Pièce jointe<select data-path={prefix+'.documentId'} defaultValue={order.documentId}><option value="">Choisir une pièce du marché</option>{s.docs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
       </div>
       {order.archived&&<small>Archivé</small>}
      </div>;
     })}
     <div className="mk-project-actions"><button type="button" data-toggle-project={i} disabled={s.busy}><Archive size={15}/>{project.archived?'Restaurer le projet':'Archiver le projet'}</button><button type="button" className="mk-primary" disabled={s.busy} data-complete-project={i} onClick={()=>{if(project.name.trim()&&project.orders.every(o=>o.reference.trim()))setOpen(null);}}><Check size={17}/> Valider le projet</button></div>
    </div>}
   </section>;
  })}
  {!!projects.length&&<button type="button" className="mk-secondary" data-tab="documents">Ajouter une pièce au marché</button>}
 {!!m.linkedEngagements?.length&&<section className="mk-linked-engagements"><h4><FileCheck2 size={18}/> Engagements reçus</h4>{m.linkedEngagements.map(e=><div className="mk-linked-engagement" key={e.documentId}><div><strong>{e.reference||e.quoteNumber}</strong><small>{[e.project,e.kind==='order'?'Bon de commande':'Devis signé',e.client].filter(Boolean).join(' · ')}</small></div><span>{e.amountMinor==null?'Montant non renseigné':money(e.amountMinor)}</span><button type="button" data-engagement-file={e.documentId} title={e.filename}><FileCheck2 size={16}/>Voir la pièce</button></div>)}</section>}
 </section>;
}
