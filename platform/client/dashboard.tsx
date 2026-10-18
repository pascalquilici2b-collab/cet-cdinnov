import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {DashboardAction, DashboardData, DocumentSummary} from '../dashboard-contracts';
import './dashboard.css';

interface Props {load:(week:string,signal:AbortSignal)=>Promise<DashboardData>; open:(action:DashboardAction)=>Promise<void>|void;}
const add=(day:string,n:number)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const parisDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const monday=(day:string)=>add(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));
const date=(day:string,options:Intl.DateTimeFormatOptions={day:'numeric',month:'short'})=>day&&Number.isFinite(Date.parse(day))?new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',...options}).format(new Date(day.length===10?day+'T12:00:00Z':day)):'Date non renseignée';
const range=(start:string,end:string)=>start===end?date(start):`${date(start)} – ${date(end)}`;
const euro=(amount:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(amount);
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('');

function Dashboard({load,open}:Props){
  const [week,setWeek]=useState(()=>monday(parisDay()));
  const [data,setData]=useState<DashboardData|null>(null);
  const [revision,refresh]=useState(0),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const [opening,setOpening]=useState(false),[actionError,setActionError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setBusy(true);setError('');
    load(week,controller.signal).then(result=>{if(!controller.signal.aborted)setData(result);})
      .catch(err=>{if(!controller.signal.aborted)setError(err.message||'Impossible de charger le tableau de bord.');})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return()=>controller.abort();
  },[week,revision,load]);
  async function navigate(action:DashboardAction){
    if(opening)return;setOpening(true);setActionError('');
    try{await open(action);}catch(err){setActionError(err instanceof Error?err.message:'Impossible d’ouvrir cette fiche.');}finally{setOpening(false);}
  }
  const days=Array.from({length:7},(_,i)=>add(data?.weekStart||week,i));
  const bars=(memberId:string)=>data?[
    ...data.leaves.filter(l=>l.memberId===memberId).map(l=>({id:l.id,start:l.start,end:l.end,title:l.type+(l.status==='En attente'?' · En attente':''),kind:l.status==='En attente'?'pending':'leave',action:{kind:'agenda',date:l.start,memberId} as DashboardAction})),
    ...data.trips.filter(t=>t.memberIds.includes(memberId)).map(t=>({id:t.id,start:t.start,end:t.end,title:[t.title,t.location].filter(Boolean).join(' · '),kind:'trip',action:{kind:'agenda',date:t.start,memberId} as DashboardAction}))
  ].sort((a,b)=>a.start.localeCompare(b.start)):[];

  function documents(kind:'invoice'|'expense',items:DocumentSummary[]){return <section className={'db-panel db-documents db-'+kind} aria-labelledby={'db-'+kind+'-title'}>
    <header className="db-panel-head"><div><span className="db-eyebrow">{kind==='invoice'?'Facturation':data?.admin?'Dépenses de l’équipe':'Mes dépenses'}</span><h2 id={'db-'+kind+'-title'}>{kind==='invoice'?'Dernières factures':'Dernières notes de frais'}</h2></div>
      <button className="db-link" onClick={()=>navigate({kind:kind==='invoice'?'invoices':'expenses'})}>Tout voir <span aria-hidden="true">↗</span></button></header>
    {items.length?<div className="db-document-list">{items.map(item=><button key={item.id} className="db-document" disabled={opening} onClick={()=>navigate({kind,id:item.id})}>
      <span className="db-file-icon" aria-hidden="true">{kind==='invoice'?'F':'N'}</span><span className="db-document-main"><strong>{item.number||'Sans numéro'}</strong><span>{item.label||'Sans libellé'}</span><small>{item.dateSource==='created'?'Créée le ':'Datée du '}{date(item.date)}</small></span>
      <span className="db-document-value"><strong>{euro(item.amount)}{kind==='invoice'&&<small> HT</small>}</strong><span className={'db-status '+(item.status==='Payée'?'is-paid':'')}>{item.status}</span></span><span className="db-chevron" aria-hidden="true">›</span>
    </button>)}</div>:<p className="db-empty">{kind==='invoice'?'Aucune facture enregistrée.':'Aucune note de frais enregistrée.'}</p>}
    {items.some(item=>item.dateSource==='document')&&<p className="db-footnote">Pour les anciens documents, le classement utilise la date du document, la date de création n’étant pas disponible.</p>}
  </section>;}

  return <div className="cdi-dashboard" aria-busy={busy}>
    <div className="db-heading"><div><span className="db-eyebrow">CDInnov · Vue d’ensemble</span><h2>L’activité de votre équipe</h2><p>{date(data?.today||parisDay(),{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p></div>
      <div className="db-update"><button className="db-button" disabled={busy} onClick={()=>refresh(r=>r+1)}><span aria-hidden="true">↻</span> {busy?'Actualisation…':'Actualiser'}</button>{data&&<small>Mis à jour à {date(data.generatedAt,{hour:'2-digit',minute:'2-digit'})}</small>}</div>
    </div>
    {error&&<div className="db-error" role="alert"><strong>Actualisation indisponible.</strong> {error} {data&&'Les informations ci-dessous proviennent de la dernière lecture.'}<button onClick={()=>refresh(r=>r+1)}>Réessayer</button></div>}
    {actionError&&<div className="db-error" role="alert">{actionError}</div>}
    {!data&&!error&&<div className="db-loading" role="status">Chargement de l’activité…</div>}
    {data&&<>
      <div className="db-metrics">
        <button className="db-metric is-leave" onClick={()=>navigate({kind:'agenda',date:data.today})}><span>En congé aujourd’hui</span><strong>{data.counts.leaveToday}<small>collaborateur{data.counts.leaveToday!==1?'s':''}</small></strong><span className="db-metric-foot">Congés validés <b aria-hidden="true">↗</b></span></button>
        <button className="db-metric is-trip" onClick={()=>navigate({kind:'agenda',date:data.today})}><span>En déplacement aujourd’hui</span><strong>{data.counts.travelToday}<small>collaborateur{data.counts.travelToday!==1?'s':''}</small></strong><span className="db-metric-foot">Déplacements de l’équipe <b aria-hidden="true">↗</b></span></button>
        <button className="db-metric is-pending" onClick={()=>document.getElementById('db-pending-title')?.scrollIntoView({behavior:'smooth',block:'center'})}><span>Congés en attente</span><strong>{data.counts.pending}<small>période{data.counts.pending!==1?'s':''}</small></strong><span className="db-metric-foot">{data.admin?'Demandes à examiner':'En attente de validation'} <b aria-hidden="true">↓</b></span></button>
      </div>
      <div className="db-activity-grid">
        <section className="db-panel db-team" aria-labelledby="db-team-title"><header className="db-panel-head"><div><span className="db-eyebrow">Congés & déplacements</span><h2 id="db-team-title">Le planning de l’équipe</h2></div><button className="db-link" onClick={()=>navigate({kind:'agenda',date:data.weekStart})}>Ouvrir l’agenda ↗</button></header>
          <div className="db-week-controls"><strong>{range(data.weekStart,add(data.weekStart,6))} {data.weekStart.slice(0,4)}</strong><div><button className="db-icon-button" aria-label="Semaine précédente" disabled={busy||week<='2000-01-08'} onClick={()=>setWeek(add(week,-7))}>‹</button><button className="db-button" disabled={busy} onClick={()=>setWeek(monday(parisDay()))}>Aujourd’hui</button><button className="db-icon-button" aria-label="Semaine suivante" disabled={busy||week>='2100-12-18'} onClick={()=>setWeek(add(week,7))}>›</button></div></div>
          <div className="db-timeline-scroll" tabIndex={0} role="region" aria-label="Planning hebdomadaire, défilement horizontal disponible"><div className="db-timeline">
            <div className="db-timeline-header"><span>Collaborateur</span><div>{days.map(day=><span key={day} className={day===data.today?'is-today':''}>{date(day,{weekday:'short'})}<b>{day.slice(8)}</b></span>)}</div></div>
            {data.members.map(member=>{const events=bars(member.id);return <div className="db-person-row" key={member.id}><div className="db-person"><span className="db-avatar">{initials(member.name)}</span><strong>{member.name}</strong></div><div className="db-lanes">
              <div className="db-day-lines" aria-hidden="true">{days.map(day=><i key={day} className={day===data.today?'is-today':''}/>)}</div>
              {events.length?events.map(event=>{const first=Math.max(0,Math.round((Date.parse(event.start)-Date.parse(data.weekStart))/86400000));const last=Math.min(6,Math.round((Date.parse(event.end)-Date.parse(data.weekStart))/86400000));return <div className="db-lane" key={event.id}><button className={'db-event is-'+event.kind} style={{gridColumn:`${first+1} / ${last+2}`}} title={`${member.name} · ${event.title} · ${range(event.start,event.end)}`} aria-label={`${member.name}, ${event.title}, ${range(event.start,event.end)}`} onClick={()=>navigate(event.action)}>{event.title}</button></div>;}):<div className="db-no-event">Aucun congé ou déplacement</div>}
            </div></div>;})}
            {!data.members.length&&<p className="db-empty">Aucun collaborateur enregistré.</p>}
          </div></div><div className="db-legend"><span className="is-leave">Congé validé</span><span className="is-trip">Déplacement</span><span className="is-pending">Congé en attente</span></div>
        </section>
        <section className="db-panel db-pending" aria-labelledby="db-pending-title"><header className="db-panel-head"><div><span className="db-eyebrow">À suivre</span><h2 id="db-pending-title">Congés en attente</h2></div><span className="db-count">{data.counts.pending}</span></header>
          {data.pending.length?<><div className="db-pending-list">{data.pending.map(item=><div className="db-request" key={item.id}><div><strong>{item.name}</strong><span>{range(item.start,item.end)}{item.start===item.end&&item.startHalf===item.endHalf?(item.startHalf==='AM'?' · matin':' · après-midi'):''}</span><small>{item.type} · {item.days.toLocaleString('fr-FR')} j</small></div><button className="db-link" disabled={opening} onClick={()=>navigate({kind:'pending',id:item.id,date:item.start,memberId:item.memberId})}>{data.admin?'Examiner':'Consulter'} <span aria-hidden="true">›</span></button></div>)}</div><p className="db-footnote">Les demandes sont regroupées en périodes continues.</p></>:<div className="db-empty db-empty-pending"><span aria-hidden="true">✓</span><strong>Aucune demande en attente</strong><p>Les nouvelles demandes de congés apparaîtront ici.</p></div>}
        </section>
      </div>
      <div className={'db-finance-grid '+(!data.admin?'is-personal':'')}>{data.invoices!==null&&documents('invoice',data.invoices)}{documents('expense',data.expenses)}</div>
    </>}
  </div>;
}

export function mountDashboard(element:HTMLElement,props:Props){const root=createRoot(element);root.render(<Dashboard {...props}/>);return ()=>root.unmount();}
