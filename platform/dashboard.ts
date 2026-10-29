import {importedInvoicePaid} from './imported-invoice-state.ts';
import {accountAccess} from './access';
import {portalAdmin} from './identity.ts';
import {leavePeriods} from '../agenda/leave-periods.mjs';
import type {Database, Environment} from './contracts';
import type {DashboardData, DocumentSummary, Leave, Member, Trip} from './dashboard-contracts';

type Row = Record<string, any>;
const rows = (value:unknown):Row[] => Array.isArray(value) ? value.filter(x=>x && typeof x==='object') : [];
const text = (value:unknown) => typeof value==='string' ? value : '';
const email = (value:unknown) => text(value).trim().toLowerCase();
const validDay = (value:string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const addDays = (day:string,n:number) => new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const legacyEmails:Record<string,string> = {
  '001':'quilici.pascal@cdinnov.com','002':'pasqualini.david@cdinnov.com',
  '003':'boulanger.albert@cdinnov.com','004':'calendini.matthieu@cdinnov.com',
  '005':'vincenti.paulmichel@cdinnov.com'
};

/** Identity and the summary share a single KV read within this request only. */
export function dashboardEnvironment(env:Environment):Environment {
  const kv = env.CET_KV as {get(key:string,mode?:string):Promise<unknown>};
  let portal:Promise<unknown>|undefined;
  return {...env,CET_KV:{get(key:string,mode?:string){
    if(key===env.CET_WORKSPACE_KEY && mode==='json') return portal ||= kv.get(key,mode);
    return kv.get(key,mode);
  }}};
}

export async function readDashboard(request:Request,env:Environment,db:Database,user:string,now=new Date()):Promise<DashboardData> {
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const defaultMonday=addDays(today,-((new Date(today+'T12:00:00Z').getUTCDay()+6)%7));
  const start=new URL(request.url).searchParams.get('week') || defaultMonday;
  if(!validDay(start) || start<'2000-01-01' || start>'2100-12-25') throw Object.assign(new Error('Semaine invalide.'),{status:400});
  const end=addDays(start,6);
  const kv=env.CET_KV as {get(key:unknown,mode:string):Promise<Row|null>};
  const [portal,storedTrips]=await Promise.all([
    kv.get(env.CET_WORKSPACE_KEY,'json'),
    db.prepare(`SELECT id,owner,payload FROM agenda_trips WHERE
      (json_extract(payload,'$.start')<=? AND json_extract(payload,'$.end')>=?) OR
      (json_extract(payload,'$.start')<=? AND json_extract(payload,'$.end')>=?)
      ORDER BY json_extract(payload,'$.start'),id`).bind(end,start,today,today).all<{id:string;owner:string;payload:string}>()
  ]);
  if(!portal) throw new Error('Portail indisponible');
  const admin=portalAdmin(portal,user),access=accountAccess(portal.auth?.accounts?.[user]?.access,admin);
  if(!access.agenda){portal.conges=[];storedTrips.results=[];}
  if(!access.notesfrais)portal.notesFrais=[];
  const members:Member[]=rows(portal.salaries).map(s=>({id:String(s.matricule),name:[s.prenom,s.nom].filter(Boolean).join(' '),email:email(s.email)||legacyEmails[String(s.matricule)]||''}));
  const byId=new Map(members.map(m=>[m.id,m]));
  const byEmail=new Map(members.filter(m=>m.email).map(m=>[m.email,m]));
  const periods=leavePeriods(rows(portal.conges));
  const summarize=(p:any):Leave=>({id:p.id,memberId:p.matricule,name:byId.get(p.matricule)?.name||'Collaborateur',type:p.type||'Congé',status:p.statut||'En attente',start:p.start,end:p.end,days:p.days,startHalf:p.entries[0].halves[0],endHalf:p.entries.at(-1).halves.at(-1)});
  const pending=periods.filter((p:any)=>p.statut==='En attente').map(summarize);
  const allTrips:Trip[]=storedTrips.results.map(r=>{
    const p=JSON.parse(r.payload);
    const participants=[...new Set([r.owner,...(Array.isArray(p.participants)?p.participants:[])].map(email).filter(Boolean))];
    const memberIds=participants.map(e=>{
      let member=byEmail.get(e);
      if(!member){member={id:'email:'+e,email:e,name:text(portal.auth?.accounts?.[e]?.name)||e};members.push(member);byEmail.set(e,member);}
      return member.id;
    });
    return {id:r.id,title:text(p.title)||text(p.event)||'Déplacement',location:text(p.location),start:text(p.start),end:text(p.end),memberIds};
  });
  const recent=(items:Row[],kind:'invoice'|'expense'):DocumentSummary[] => items.map(p=>{
    const created=text(p.createdAt), hasCreated=!!created && Number.isFinite(Date.parse(created));
    const documentDate=text(kind==='invoice'?p.dateFacture:p.dateNote);
    const rawAmount=kind==='invoice'?Number(p.ht):rows(p.lignes).reduce((sum,l)=>sum+(Number(l.montant)||0),0);
    return {id:text(p.id),number:String((kind==='invoice'?p.number:p.numero)??''),label:kind==='invoice'?text(p.client):[byId.get(String(p.matricule))?.name,text(p.objet)].filter(Boolean).join(' · '),
      date:hasCreated?created:documentDate,dateSource:hasCreated?'created':'document',amount:Number.isFinite(rawAmount)?Math.round(rawAmount*100)/100:0,
      status:kind==='invoice'?(importedInvoicePaid(p)?'Payée':'À encaisser'):['Soumis','Soumise','Validé','Validée'].includes(p.statut)?'Envoyé':text(p.statut)||'Brouillon'} as DocumentSummary;
  }).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).slice(0,5);
  const ownIds=new Set(members.filter(m=>m.email===user).map(m=>m.id));
  return {generatedAt:now.toISOString(),weekStart:start,today,admin,members,
    leaves:periods.filter((p:any)=>p.start<=end&&p.end>=start).map(summarize),
    trips:allTrips.filter(p=>p.start<=end&&p.end>=start),
    counts:{leaveToday:new Set(periods.filter((p:any)=>p.statut==='Validé'&&p.entries.some((e:any)=>e.date===today)).map((p:any)=>p.matricule)).size,
      travelToday:new Set(allTrips.filter(t=>t.start<=today&&t.end>=today).flatMap(t=>t.memberIds)).size,pending:pending.length},
    pending,invoices:access.facturier?recent(rows(portal.factures),'invoice'):null,
    expenses:recent(rows(portal.notesFrais).filter(n=>admin||ownIds.has(String(n.matricule))),'expense')};
}
