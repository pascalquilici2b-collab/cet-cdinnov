import {ArrowUpRight,CalendarDays,Plane,Clock3,Check,RefreshCw} from 'lucide-react';
import {LoadingScreen} from './loading';
import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {DashboardAction, DashboardData, DocumentSummary, Member} from '../dashboard-contracts';
import './dashboard.css';
import {Icon} from './icon';
import {ExpenseStatus} from './expense-status';
import {ExpensePresentationStyle} from './expense-presentation';

interface Props {load:(week:string,signal:AbortSignal)=>Promise<DashboardData>; open:(action:DashboardAction)=>Promise<void>|void; portrait?:(member:Member)=>string;}
const add=(day:string,n:number)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const parisDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const monday=(day:string)=>add(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));
const date=(day:string,options:Intl.DateTimeFormatOptions={day:'numeric',month:'short'})=>day&&Number.isFinite(Date.parse(day))?new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',...options}).format(new Date(day.length===10?day+'T12:00:00Z':day)):'Date non renseignée';
const range=(start:string,end:string)=>start===end?date(start):`${date(start)} – ${date(end)}`;
const euro=(amount:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(amount);
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('');

function Avatar({member,portrait}:{member:Member;portrait?:Props['portrait']}){
  const source=portrait?.(member)||'';
  const [failed,setFailed]=useState('');
  const safe=/^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(source);
  return <span className="db-avatar" aria-hidden="true"><span>{initials(member.name)}</span>{safe&&failed!==source&&<img src={source} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(source)}/>}</span>;
}
function Dashboard({load,open,portrait}:Props){
  const [planningFilter,setPlanningFilter]=useState<'all'|'leave'|'trip'>('all');
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
  ].filter(event=>planningFilter==='all'||(planningFilter==='trip'?event.kind==='trip':event.kind!=='trip')).sort((a,b)=>a.start.localeCompare(b.start)):[];

  function documents(kind:'invoice'|'expense',items:DocumentSummary[]){return <section className={'db-panel db-documents db-'+kind} aria-labelledby={'db-'+kind+'-title'}>
    <header className="db-panel-head"><div><span className="db-eyebrow">{kind==='invoice'?'Facturation':data?.admin?'Dépenses de l’équipe':'Mes dépenses'}</span><h2 id={'db-'+kind+'-title'}>{kind==='invoice'?'Dernières factures':'Dernières notes de frais'}</h2></div>
      <button className="db-link" onClick={()=>navigate({kind:kind==='invoice'?'invoices':'expenses'})}>Tout voir <span aria-hidden="true">↗</span></button></header>
    {items.length?<div className="db-document-list">{items.map(item=><button key={item.id} className="db-document" disabled={opening} onClick={()=>navigate({kind,id:item.id})}>
      <span className="db-file-icon" aria-hidden="true"><Icon name={kind==='invoice'?'file':'wallet'}/></span><span className="db-document-main"><strong>{item.number||'Sans numéro'}</strong><span>{item.label||'Sans libellé'}</span><small>{item.dateSource==='created'?'Créée le ':'Datée du '}{date(item.date)}</small></span>
      <span className="db-document-value"><strong>{euro(item.amount)}{kind==='invoice'&&<small> HT</small>}</strong>{kind==='expense'?<ExpenseStatus status={item.status}/>:<span className={'db-status '+(item.status==='Payée'?'is-paid':'')}>{item.status}</span>}</span><span className="db-chevron" aria-hidden="true">›</span>
    </button>)}</div>:<p className="db-empty">{kind==='invoice'?'Aucune facture enregistrée.':'Aucune note de frais enregistrée.'}</p>}

  </section>;}

  if(!data&&!error)return <LoadingScreen label="Chargement de l’activité…"/>;
  return <div className="cdi-dashboard" aria-busy={busy}>
    <ExpensePresentationStyle/>
    <div className="db-heading"><div><p>{date(data?.today||parisDay(),{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p></div>
      <div className="db-update"><button className="db-button" disabled={busy} onClick={()=>refresh(r=>r+1)}><RefreshCw size={15} className={busy?'db-is-refreshing':''}/> {busy?'Actualisation…':'Actualiser'}</button>{data&&<small>Mis à jour à {date(data.generatedAt,{hour:'2-digit',minute:'2-digit'})}</small>}</div>
    </div>
    {error&&<div className="db-error" role="alert"><strong>Actualisation indisponible.</strong> {error} {data&&'Les informations ci-dessous proviennent de la dernière lecture.'}<button onClick={()=>refresh(r=>r+1)}>Réessayer</button></div>}
    {actionError&&<div className="db-error" role="alert">{actionError}</div>}
    {data&&<>
      <div className="db-metrics">
        {([
          {kind:'leave',label:'En congé',value:data.counts.leaveToday,icon:CalendarDays,unit:'collaborateur',action:()=>navigate({kind:'agenda',date:data.today})},
          {kind:'trip',label:'En déplacement',value:data.counts.travelToday,icon:Plane,unit:'collaborateur',action:()=>navigate({kind:'agenda',date:data.today})},
          {kind:'pending',label:'À examiner',value:data.counts.pending,icon:Clock3,unit:'demande',action:()=>document.getElementById('db-pending-title')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'})}
        ] as const).map(metric=>{
          const values=days.map(day=>metric.kind==='trip'?new Set(data.trips.filter(t=>t.start<=day&&t.end>=day).flatMap(t=>t.memberIds)).size:new Set(data.leaves.filter(l=>l.start<=day&&l.end>=day&&(metric.kind==='pending'?l.status==='En attente':l.status!=='En attente')).map(l=>l.memberId)).size);
          const max=Math.max(1,...values);
          return <button className={'db-metric is-'+metric.kind} key={metric.kind} disabled={opening} onClick={metric.action}>
            <span className="db-metric-top"><span className="db-metric-icon"><metric.icon size={21}/></span><span>{metric.label}<small>{metric.kind==='pending'?'Congés en attente':'Aujourd’hui'}</small></span><ArrowUpRight size={17}/></span>
            <span className="db-metric-body"><strong key={metric.value}>{metric.value}<small>{metric.unit}{metric.value!==1?'s':''}</small></strong><span className="db-spark" aria-label="Répartition sur la semaine affichée">{values.map((v,i)=><span key={days[i]} title={date(days[i])+': '+v} style={{height:Math.max(8,v/max*100)+'%'}} data-today={days[i]===data.today}/>)}</span></span>
            <span className="db-metric-foot">{metric.kind==='pending'?(data.admin?'Voir les demandes':'Suivre mes demandes'):'Ouvrir l’agenda'}<ArrowUpRight size={14}/></span>
          </button>;
        })}
      </div>
      <div className="db-activity-grid">
        <section className="db-panel db-team" aria-labelledby="db-team-title"><header className="db-panel-head"><div><span className="db-eyebrow">Congés & déplacements</span><h2 id="db-team-title">Le planning de l’équipe</h2></div><button className="db-link" onClick={()=>navigate({kind:'agenda',date:data.weekStart})}>Ouvrir l’agenda ↗</button></header>
          <div className="db-week-controls"><strong>{range(data.weekStart,add(data.weekStart,6))} {data.weekStart.slice(0,4)}</strong><div><button className="db-icon-button" aria-label="Semaine précédente" disabled={busy||week<='2000-01-08'} onClick={()=>setWeek(add(week,-7))}>‹</button><button className="db-button" disabled={busy} onClick={()=>setWeek(monday(parisDay()))}>Aujourd’hui</button><button className="db-icon-button" aria-label="Semaine suivante" disabled={busy||week>='2100-12-18'} onClick={()=>setWeek(add(week,7))}>›</button></div></div>
          <div className="db-planning-toolbar"><div className="db-segmented" role="group" aria-label="Événements du planning">{([['all','Tout'],['leave','Congés'],['trip','Déplacements']] as const).map(([value,label])=><button key={value} aria-pressed={planningFilter===value} onClick={()=>setPlanningFilter(value)}>{label}</button>)}</div><span>{data.members.length} collaborateurs</span></div>
          <div className="db-timeline-scroll" tabIndex={0} role="region" aria-label="Planning hebdomadaire, défilement horizontal disponible"><div className="db-timeline">
            <div className="db-timeline-header"><span>Collaborateur</span><div>{days.map(day=><span key={day} className={day===data.today?'is-today':''}>{date(day,{weekday:'short'})}<b>{day.slice(8)}</b></span>)}</div></div>
            {data.members.map(member=>{const events=bars(member.id);return <div className="db-person-row" key={member.id}><div className="db-person"><Avatar member={member} portrait={portrait}/><strong>{member.name}</strong></div><div className="db-lanes">
              <div className="db-day-lines" aria-hidden="true">{days.map(day=><i key={day} className={day===data.today?'is-today':''}/>)}</div>
              {events.length?events.map(event=>{const first=Math.max(0,Math.round((Date.parse(event.start)-Date.parse(data.weekStart))/86400000));const last=Math.min(6,Math.round((Date.parse(event.end)-Date.parse(data.weekStart))/86400000));return <div className="db-lane" key={event.id}><button className={'db-event is-'+event.kind} style={{gridColumn:`${first+1} / ${last+2}`}} title={`${member.name} · ${event.title} · ${range(event.start,event.end)}`} aria-label={`${member.name}, ${event.title}, ${range(event.start,event.end)}`} onClick={()=>navigate(event.action)}>{event.title}</button></div>;}):<div className="db-no-event">Aucun congé ou déplacement</div>}
            </div></div>;})}
            {!data.members.length&&<p className="db-empty">Aucun collaborateur enregistré.</p>}
          </div></div>
          <div className="db-mobile-planning" aria-label="Planning de la semaine par collaborateur">{data.members.map(member=>{const events=bars(member.id);return <section key={member.id} className="db-mobile-person"><div className="db-person"><Avatar member={member} portrait={portrait}/><strong>{member.name}</strong></div>{events.length?events.map(event=><button className={'db-mobile-event is-'+event.kind} key={event.id} onClick={()=>navigate(event.action)}><strong>{event.title}</strong><span>{range(event.start,event.end)} <span aria-hidden="true">↗</span></span></button>):<p>Aucun congé ou déplacement cette semaine.</p>}</section>;})}</div>
          <div className="db-legend"><span className="is-leave">Congé validé</span><span className="is-trip">Déplacement</span><span className="is-pending">Congé en attente</span></div>
        </section>
        <section className="db-panel db-pending" aria-labelledby="db-pending-title"><header className="db-panel-head"><div><span className="db-eyebrow">À suivre</span><h2 id="db-pending-title">Congés en attente</h2></div><span className="db-count">{data.counts.pending}</span></header>
          {data.pending.length?<><div className="db-pending-list">{data.pending.map(item=><div className="db-request" key={item.id}><div className="db-request-person"><Avatar member={data.members.find(m=>m.id===item.memberId)||{id:item.memberId,name:item.name,email:''}} portrait={portrait}/><div><strong>{item.name}</strong><span>{range(item.start,item.end)}{item.start===item.end&&item.startHalf===item.endHalf?(item.startHalf==='AM'?' · matin':' · après-midi'):''}</span><small>{item.type} · {item.days.toLocaleString('fr-FR')} j</small></div></div><button className="db-link" disabled={opening} onClick={()=>navigate({kind:'pending',id:item.id,date:item.start,memberId:item.memberId})}>{data.admin?'Examiner':'Consulter'} <span aria-hidden="true">›</span></button></div>)}</div></>:<div className="db-empty db-empty-pending"><span aria-hidden="true"><Check size={24}/></span><strong>Aucune demande en attente</strong></div>}
        </section>
      </div>
      <div className={'db-finance-grid '+(!data.admin?'is-personal':'')}>{data.invoices!==null&&documents('invoice',data.invoices)}{documents('expense',data.expenses)}</div>
    </>}
  </div>;
}

export function mountDashboard(element:HTMLElement,props:Props){const root=createRoot(element);root.render(<Dashboard {...props}/>);return ()=>root.unmount();}

import './dashboard-refresh.css';
