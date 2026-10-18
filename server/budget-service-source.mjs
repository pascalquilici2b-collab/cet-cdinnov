import { timingSafeEqual, createHash, createHmac, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { canonicalClientName, sameClientName, validClientName } from './client-names.mjs';
import { agendaSchema, agendaNotifySchema, handleAgenda } from './agenda-worker.mjs';
import { handleMarkets } from '../marches/worker.mjs';

const admins=['quilici.pascal@cdinnov.com','pasqualini.david@cdinnov.com','boulanger.albert@cdinnov.com'];
// Same built-in accounts as the main portal; Budget access does not require an admin role.
const portalAccounts=[...admins,'calendini.matthieu@cdinnov.com','vincenti.paulmichel@cdinnov.com'];
const normalize=value=>String(value||'').trim().toLowerCase();
const empty={demo:false,clients:[],projects:[],budgetLines:[],expenses:[],drs:[],imports:[]};
export const clientKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
export function addClientNames(clients,names){
  const result=structuredClone(clients);
  for(const value of names){const name=canonicalClientName(value);if(!validClientName(name))continue;
    if(!result.some(client=>[client.name,...client.aliases||[]].some(alias=>sameClientName(alias,name))))result.push({id:crypto.randomUUID(),name,accounts:[],...(value!==name?{aliases:[value]}:{})});
  }
  return result;
}
export const schema=[
  agendaSchema,
  agendaNotifySchema,
  'CREATE TABLE IF NOT EXISTS budgets_workspace (id TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS budgets_login_limits (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, until_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS budgets_login_challenges (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)',
];
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const fingerprint=acc=>createHash('sha256').update(JSON.stringify([acc.salt,acc.iter,acc.hash])).digest('hex');
async function account(env,email){
  const data=await env.CET_KV.get(env.CET_WORKSPACE_KEY,'json');
  const auth=data?.auth;
  if(!portalAccounts.includes(email)&&!auth?.allowed?.map(normalize).includes(email))return null;
  const acc=auth?.accounts?.[email];
  if(!acc||!/^[a-f0-9]{32}$/i.test(acc.salt)||!/^[a-f0-9]{64}$/i.test(acc.hash)||!Number.isInteger(acc.iter)||acc.iter<100000||acc.iter>1000000)return null;
  return acc;
}
function sign(payload,secret){return createHmac('sha256',secret).update(payload).digest('base64url')}
async function identity(request,env){
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
  if(!token||token.length>2000)return null;
  const [body,sig,extra]=token.split('.');
  if(extra||!body||!sig||!equal(sign(body,env.BUDGETS_SESSION_SECRET),sig))return null;
  try{
    const data=JSON.parse(Buffer.from(body,'base64url').toString());
    if(data.aud!=='cdinnov-budgets'||data.exp<Date.now()||typeof data.email!=='string')return null;
    const acc=await account(env,data.email);
    return acc&&equal(data.fingerprint,fingerprint(acc))?data.email:null;
  }catch{return null}
}
async function jsonBody(request,limit){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw Object.assign(new Error('Format JSON requis.'),{status:415});
  let size=0;const chunks=[];
  for await(const chunk of request.body||[]){size+=chunk.length;if(size>limit)throw Object.assign(new Error('Données trop volumineuses.'),{status:413});chunks.push(Buffer.from(chunk))}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('Données JSON invalides.'),{status:400})}
}
export function validateWorkspace(ws){
  if(!ws||typeof ws!=='object'||Array.isArray(ws)||typeof ws.demo!=='boolean')return false;
  for(const key of ['clients','projects','budgetLines','expenses','drs','imports']){
    if(!Array.isArray(ws[key])||ws[key].length>10000||ws[key].some(item=>!item||typeof item!=='object'||typeof item.id!=='string'))return false;
    if(new Set(ws[key].map(item=>item.id)).size!==ws[key].length)return false;
  }
  return true;
}
export default {
  async fetch(request,env){
    const origin=request.headers.get('origin');
    const allowed=(env.BUDGETS_ALLOWED_ORIGINS||'https://app.cdinnov.eu').split(',').map(x=>x.trim());
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    if(origin&&allowed.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, PUT, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, If-Match'});
    const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
    if(origin&&!allowed.includes(origin))return reply(403,{error:'Origine non autorisée.'});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    const path=new URL(request.url).pathname;
    if(!['/budgets/session','/budgets/workspace','/budgets/clients','/budgets/agenda','/budgets/markets'].includes(path)&&!path.startsWith('/budgets/agenda/')&&!path.startsWith('/budgets/markets/'))return reply(404,{error:'Introuvable.'});
    if(!env.BUDGETS_DB||!env.CET_KV||!env.CET_WORKSPACE_KEY||String(env.BUDGETS_SESSION_SECRET||'').length<32)return reply(503,{error:'Le service Budgets projets doit être configuré avant sa première utilisation.'});
    try{
      const db=env.BUDGETS_DB.withSession('first-primary');
      if(path==='/budgets/session'){
        if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
        const input=await jsonBody(request,4096),email=normalize(input.email);
        if(!email||email.length>254||!['challenge','verify'].includes(input.action))return reply(400,{error:'Identifiants invalides.'});
        const now=Date.now();
        const limitKeys=['email:'+email,'ip:'+(request.headers.get('cf-connecting-ip')||'unknown')].map(v=>createHash('sha256').update(v).digest('hex'));
        if(input.action==='challenge')for(const key of limitKeys){
          const limit=await db.prepare('INSERT INTO budgets_login_limits (id,attempts,until_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN until_at<? THEN 1 ELSE attempts+1 END, until_at=CASE WHEN until_at<? THEN excluded.until_at ELSE until_at END RETURNING attempts').bind(key,now+900000,now,now).first();
          if(limit.attempts>20)return reply(429,{error:'Trop de tentatives. Réessayez dans 15 minutes.'});
        }
        const acc=await account(env,email);
        // The portal derives its existing PBKDF2 key in the browser. Workers impose a
        // production-only 100000-round cap, below the portal's 150000 rounds.
        // Prove possession with a signed, short-lived, single-use challenge; neither
        // the password nor its reusable derived key is sent to this service.
        if(input.action==='challenge'){
          const body=Buffer.from(JSON.stringify({aud:'cdinnov-budget-login',email,exp:now+60000,fingerprint:acc?fingerprint(acc):randomBytes(32).toString('hex'),nonce:randomBytes(24).toString('hex')})).toString('base64url');
          return reply(200,{challenge:body+'.'+sign(body,env.BUDGETS_SESSION_SECRET),salt:acc?.salt||randomBytes(16).toString('hex'),iter:acc?.iter||150000});
        }
        const denied=()=>reply(401,{error:'Connexion CDInnov invalide ou expirée. Reconnectez-vous.'});
        if(typeof input.challenge!=='string'||input.challenge.length>2000||typeof input.proof!=='string'||!/^[a-f0-9]{64}$/.test(input.proof))return denied();
        const [challengeBody,challengeSignature,extra]=input.challenge.split('.');
        if(extra||!challengeBody||!equal(sign(challengeBody,env.BUDGETS_SESSION_SECRET),challengeSignature))return denied();
        let challenge;try{challenge=JSON.parse(Buffer.from(challengeBody,'base64url').toString());}catch{return denied()}
        if(challenge.aud!=='cdinnov-budget-login'||challenge.email!==email||challenge.exp<now||!acc||!equal(challenge.fingerprint,fingerprint(acc)))return denied();
        const consumed=await db.prepare('INSERT INTO budgets_login_challenges (nonce,expires_at) VALUES (?,?) ON CONFLICT(nonce) DO NOTHING RETURNING nonce').bind(challenge.nonce,challenge.exp).first();
        if(!consumed)return denied();
        await db.prepare('DELETE FROM budgets_login_challenges WHERE expires_at<?').bind(now).run();
        const actual=createHmac('sha256',Buffer.from(acc.hash,'hex')).update(input.challenge).digest('hex');
        if(!equal(actual,input.proof))return denied();
        const expiresAt=now+8*60*60*1000;
        const body=Buffer.from(JSON.stringify({aud:'cdinnov-budgets',email,exp:expiresAt,fingerprint:fingerprint(acc),nonce:randomBytes(16).toString('hex')})).toString('base64url');
        await db.prepare('DELETE FROM budgets_login_limits WHERE id=? OR until_at<?').bind(limitKeys[0],now).run();
        return reply(200,{token:body+'.'+sign(body,env.BUDGETS_SESSION_SECRET),expiresAt});
      }
      const email=await identity(request,env);
      if(!email)return reply(401,{error:'Votre connexion CDInnov a expiré. Reconnectez-vous à votre compte CDInnov.'});
      if(path==='/budgets/markets'||path.startsWith('/budgets/markets/'))return await handleMarkets(request,db,email,admins.includes(email),reply,jsonBody,env);
      if(path==='/budgets/agenda'||path.startsWith('/budgets/agenda/'))return await handleAgenda(request,db,email,admins.includes(email),reply,jsonBody,env);
      if(path==='/budgets/clients'){
        if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
        const {names}=await jsonBody(request,500000);
        if(!Array.isArray(names)||names.length>10000||names.some(name=>typeof name!=='string'||name.length>300))return reply(400,{error:'Liste de clients invalide.'});
        for(let attempt=0;attempt<4;attempt++){
          const before=await db.prepare("SELECT payload,version FROM budgets_workspace WHERE id='shared'").first();
          const workspace=before?JSON.parse(before.payload):structuredClone(empty),version=before?.version||0;
          const clients=addClientNames(workspace.clients,names);
          if(clients.length===workspace.clients.length)return reply(200,{clients,version});
          workspace.clients=clients;const payload=JSON.stringify(workspace),stamp=new Date().toISOString();
          if(Buffer.byteLength(payload)>1500000)return reply(413,{error:'Le répertoire dépasse la capacité de cet espace. Réduisez la taille des logos.'});
          const saved=version===0
            ?await db.prepare("INSERT INTO budgets_workspace (id,payload,version,updated_at,updated_by) VALUES ('shared',?,1,?,?) ON CONFLICT(id) DO NOTHING RETURNING version").bind(payload,stamp,email).first()
            :await db.prepare("UPDATE budgets_workspace SET payload=?,version=version+1,updated_at=?,updated_by=? WHERE id='shared' AND version=? RETURNING version").bind(payload,stamp,email,version).first();
          if(saved)return reply(200,{clients,version:saved.version});
        }
        return reply(409,{error:'Le répertoire est en cours de modification. Réessayez.'});
      }
      if(request.method==='GET'){
        const row=await db.prepare("SELECT payload,version,updated_at,updated_by FROM budgets_workspace WHERE id='shared'").first();
        return reply(200,{workspace:row?JSON.parse(row.payload):empty,version:row?.version||0,updatedAt:row?.updated_at,updatedBy:row?.updated_by});
      }
      if(request.method!=='PUT')return reply(405,{error:'Méthode non autorisée.'});
      const versionText=request.headers.get('if-match');
      if(!versionText||!/^\d+$/.test(versionText)||!Number.isSafeInteger(Number(versionText)))return reply(428,{error:'Version de sauvegarde requise.'});
      const version=Number(versionText),workspace=await jsonBody(request,1500000);
      if(!validateWorkspace(workspace))return reply(400,{error:'Structure des budgets invalide.'});
      const stamp=new Date().toISOString(),payload=JSON.stringify(workspace);
      // One conditional SQL statement: two writers of the same revision cannot both succeed.
      const row=version===0
        ?await db.prepare("INSERT INTO budgets_workspace (id,payload,version,updated_at,updated_by) VALUES ('shared',?,1,?,?) ON CONFLICT(id) DO NOTHING RETURNING version").bind(payload,stamp,email).first()
        :await db.prepare("UPDATE budgets_workspace SET payload=?,version=version+1,updated_at=?,updated_by=? WHERE id='shared' AND version=? RETURNING version").bind(payload,stamp,email,version).first();
      if(!row)return reply(409,{error:'Un collègue a enregistré une nouvelle version. Téléchargez votre copie, puis rechargez le budget partagé avant de reporter vos modifications.'});
      return reply(200,{saved:true,version:row.version,updatedAt:stamp});
    }catch(error){
      if(!error.status)console.error('Budget service:',error.name,error.message);
      return reply(error.status||503,{error:error.status?error.message:'Service Budgets projets indisponible. Vos modifications ne sont pas enregistrées.'});
    }
  },
};
