// Shared agenda, stored separately from the portal's legacy whole-state saves.
export const agendaSchema = `CREATE TABLE IF NOT EXISTS agenda_trips (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL,
  version INTEGER NOT NULL, updated_at TEXT NOT NULL
)`;
export const agendaTypes = ['COPIL', 'Évènement', 'Réunion projet', 'Suivi client', 'Formation', 'Autre'];
export const agendaNotifySchema = `CREATE TABLE IF NOT EXISTS agenda_notifications (
  trip_id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL, updated_at INTEGER NOT NULL
)`;
export const agendaTeam=['quilici.pascal@cdinnov.com','pasqualini.david@cdinnov.com','boulanger.albert@cdinnov.com','calendini.matthieu@cdinnov.com','vincenti.paulmichel@cdinnov.com'];
const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function agendaMembers(portal){
  const allowed=new Set([...agendaTeam,...(portal?.auth?.allowed||[])].map(e=>String(e).trim().toLowerCase()));
  return Object.entries(portal?.auth?.accounts||{}).filter(([email])=>allowed.has(email)).map(([email,account])=>({email,name:account.name||email}));
}
export function agendaMail(trip,portal){
  const allowed=new Set([...agendaTeam,...(portal?.auth?.allowed||[])].map(e=>String(e).trim().toLowerCase()));
  const recipients=[...new Set([...agendaTeam,...Object.keys(portal?.auth?.accounts||{})].map(e=>e.trim().toLowerCase()))].filter(e=>allowed.has(e)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const date=v=>v.split('-').reverse().join('/');
  const names=trip.participants?.map(email=>portal?.auth?.accounts?.[email]?.name||email).join(' + ')||trip.ownerName;
  const rows=[['Consultants',names],['Projets',trip.project],['Objet',trip.type],['Précision / événement',trip.title||trip.event],['Départ',date(trip.start)+(trip.startTime?' à '+trip.startTime:'')],['Retour',date(trip.end)+(trip.endTime?' à '+trip.endTime:'')],['Durée',trip.days+' jour'+(trip.days>1?'s':'')+' calendaires (départ et retour inclus)'],['Lieu',trip.location],['Clients',trip.client],['Informations utiles',trip.notes]].filter(([,v])=>v);
  return {to:recipients.map(email=>({email})),subject:('Déplacement — '+names+' — '+(trip.project||trip.title||trip.type)+' ('+trip.days+' j)').slice(0,200),htmlContent:'<div style="font-family:Arial,sans-serif;color:#183f77;max-width:640px"><h2>Nouveau déplacement</h2><p>Un déplacement vient d’être ajouté à l’Agenda partagé CDInnov.</p><table style="border-collapse:collapse;width:100%">'+rows.map(([k,v])=>'<tr><th style="text-align:left;vertical-align:top;padding:9px;border-bottom:1px solid #c9dcea">'+escapeHtml(k)+'</th><td style="padding:9px;border-bottom:1px solid #c9dcea;white-space:pre-wrap">'+escapeHtml(v)+'</td></tr>').join('')+'</table><p><a href="https://app.cdinnov.eu/?view=agenda">Consulter l’Agenda partagé</a></p></div>',textContent:'Nouveau déplacement CDInnov\n\n'+rows.map(([k,v])=>k+' : '+v).join('\n')+'\n\nhttps://app.cdinnov.eu/?view=agenda'};
}
// Claim an outbox entry before sending. An uncertain network outcome is never retried
// automatically, so a timeout cannot silently generate duplicate messages.
export async function sendAgendaMail(db,id,env,send=fetch){
  const row=await db.prepare("UPDATE agenda_notifications SET status='sending',updated_at=? WHERE trip_id=? AND status IN ('pending','failed') RETURNING *").bind(Date.now(),id).first();
  if(!row)return (await db.prepare('SELECT status FROM agenda_notifications WHERE trip_id=?').bind(id).first())?.status||'none';
  let status='failed';
  try{
    if(env.BREVO_API_KEY&&env.NOTIFY_FROM){
      const response=await send('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':env.BREVO_API_KEY,'Content-Type':'application/json',accept:'application/json'},body:JSON.stringify({...JSON.parse(row.payload),sender:{email:env.NOTIFY_FROM,name:env.NOTIFY_FROM_NAME||'Gestion interne CDInnov'},headers:{idempotencyKey:id}}),signal:AbortSignal.timeout(10000)});
      if(response.ok)status='sent';
      else {const body=await response.json().catch(()=>({}));status=body.code==='duplicate_parameter'?'sent':response.status>=500?'unknown':'failed';}
    }
  }catch{status='unknown';}
  await db.prepare('UPDATE agenda_notifications SET status=?,updated_at=? WHERE trip_id=?').bind(status,Date.now(),id).run();
  return status;
}
export function dayNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const stamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? stamp / 86400000 : NaN;
}
export function validateTrip(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const limits = {title:180, event:180, location:240, start:10, end:10, startTime:5, endTime:5, notes:2000};
  const trip = {};
  for (const [key, max] of Object.entries(limits)) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.length > max) return null;
    trip[key] = value.trim();
  }
  for (const [key, plural, max, count] of [['type','types',40,agendaTypes.length],['project','projects',200,Infinity],['client','clients',300,Infinity]]) {
    const values = input[plural] ?? (input[key] ? [input[key]] : []);
    if (!Array.isArray(values) || values.length > count || values.some(v => typeof v !== 'string' || v.length > max || !v.trim())) return null;
    trip[plural] = [...new Set(values.map(v => v.trim()))];
    trip[key] = trip[plural].join(' + ');
  }
  if(input.participants!==undefined){
    if(!Array.isArray(input.participants)||input.participants.some(v=>typeof v!=='string'||v.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())))return null;
    trip.participants=[...new Set(input.participants.map(v=>v.trim().toLowerCase()))];
  }
  const start = dayNumber(trip.start), end = dayNumber(trip.end);
  if (!trip.types.length || trip.types.some(v => !agendaTypes.includes(v)) || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  if (trip.start < '2000-01-01' || trip.end > '2100-12-31') return null;
  for (const time of [trip.startTime, trip.endTime]) if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  if (trip.start === trip.end && trip.startTime && trip.endTime && trip.endTime < trip.startTime) return null;
  trip.days = end - start + 1;
  return trip;
}
const unpack = row => ({...JSON.parse(row.payload), id:row.id, owner:row.owner, version:row.version, updatedAt:row.updated_at,notificationStatus:row.notification_status||'none'});
export async function handleAgenda(request, db, email, admin, reply, jsonBody, env) {
  const path = new URL(request.url).pathname;
  const notifying=path.endsWith('/notify');
  const id = path.slice('/budgets/agenda/'.length).replace(/\/notify$/,'');
  const collection = path === '/budgets/agenda';
  if (!collection && !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return reply(404, {error:'Déplacement introuvable.'});
  if (collection && request.method === 'GET') {
    const rows = await db.prepare('SELECT t.*,n.status AS notification_status FROM agenda_trips t LEFT JOIN agenda_notifications n ON n.trip_id=t.id ORDER BY t.updated_at DESC').all();
    const portal=await env.CET_KV.get(env.CET_WORKSPACE_KEY,'json');
    const leaves={updatedAt:portal?.majAt||'',records:(portal?.conges||[]).map(({id,matricule,date,half,type,statut,dateDebut,dateFin})=>({id,matricule,date,half,type,statut,dateDebut,dateFin})),employees:(portal?.salaries||[]).map(({matricule,nom,prenom,email})=>({matricule,nom,prenom,email}))};
    return reply(200, {trips:rows.results.map(unpack),leaves,members:agendaMembers(portal)});
  }
  if(notifying){
    if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
    const trip=await db.prepare('SELECT owner FROM agenda_trips WHERE id=?').bind(id).first();
    if(!trip)return reply(404,{error:'Déplacement introuvable.'});
    if(trip.owner!==email&&!admin)return reply(403,{error:'Seul l’auteur ou la direction peut relancer la notification.'});
    return reply(200,{notificationStatus:await sendAgendaMail(db,id,env)});
  }
  if ((collection && request.method !== 'POST') || (!collection && !['PUT','DELETE'].includes(request.method))) return reply(405, {error:'Méthode non autorisée.'});
  let current, version;
  if (!collection) {
    current = await db.prepare('SELECT * FROM agenda_trips WHERE id=?').bind(id).first();
    if (!current) return reply(404, {error:'Ce déplacement a été supprimé. Actualisez l’agenda.'});
    if (current.owner !== email && !admin) return reply(403, {error:'Seul l’auteur ou la direction peut modifier ce déplacement.'});
    const raw = request.headers.get('if-match');
    if (!raw || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) return reply(428, {error:'Version du déplacement requise.'});
    version = Number(raw);
  }
  const stamp = new Date().toISOString();
  let saved;
  if (request.method === 'DELETE') {
    saved = await db.prepare('DELETE FROM agenda_trips WHERE id=? AND version=? RETURNING id').bind(id, version).first();
  } else {
    const trip = validateTrip(await jsonBody(request, 64000));
    if (!trip) return reply(400, {error:'Vérifiez les sélections, l’objet et les dates. Le retour doit suivre le départ.'});
    const owner = current?.owner || email;
    const portal = await env.CET_KV.get(env.CET_WORKSPACE_KEY, 'json');
    trip.ownerName = portal?.auth?.accounts?.[owner]?.name || owner;
    const previous=current?JSON.parse(current.payload):{};
    const participants=trip.participants??previous.participants??[owner];
    const members=new Set(agendaMembers(portal).map(m=>m.email));
    if(participants.some(p=>p!==owner&&!members.has(p)&&!previous.participants?.includes(p)))return reply(400,{error:'Choisissez les collègues dans la liste de l’équipe.'});
    // Keep one shared record. Old clients omitting this field cannot remove colleagues.
    trip.participants=[...new Set([owner,...participants])];
    if (collection) {
      const tripId=crypto.randomUUID();
      const result=await db.batch([
        db.prepare('INSERT INTO agenda_trips (id,owner,payload,version,updated_at) VALUES (?,?,?,1,?) RETURNING *').bind(tripId, owner, JSON.stringify(trip), stamp),
        db.prepare("INSERT INTO agenda_notifications (trip_id,payload,status,updated_at) VALUES (?,?,'pending',?)").bind(tripId,JSON.stringify(agendaMail(trip,portal)),Date.now())
      ]);
      saved=result[0].results[0];
      // Once the trip is committed, mail failure must never look like a failed save.
      try{saved.notification_status=await sendAgendaMail(db,tripId,env);}catch{saved.notification_status='unknown';}
    } else {
      saved = await db.prepare('UPDATE agenda_trips SET payload=?,version=version+1,updated_at=? WHERE id=? AND version=? RETURNING *').bind(JSON.stringify(trip), stamp, id, version).first();
    }
  }
  if (!saved) return reply(409, {error:'Ce déplacement a changé depuis son ouverture. Votre saisie est conservée : fermez la fiche et actualisez l’agenda avant de reporter vos modifications.'});
  if(request.method==='DELETE')await db.prepare('DELETE FROM agenda_notifications WHERE trip_id=?').bind(id).run();
  return reply(collection ? 201 : 200, request.method === 'DELETE' ? {deleted:true} : {trip:unpack(saved)});
}
