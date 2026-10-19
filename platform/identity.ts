import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
import type {Database, Environment, Reply} from './contracts';

// Preserve existing entitlements until accounts have an explicit, migrated role model.
export const admins = ['quilici.pascal@cdinnov.com','pasqualini.david@cdinnov.com','boulanger.albert@cdinnov.com'];
const seededAccounts = [...admins,'calendini.matthieu@cdinnov.com','vincenti.paulmichel@cdinnov.com'];
const sessionAudience = 'cdinnov-budgets'; // Also accepts sessions issued before this migration.
const challengeAudience = 'cdinnov-budget-login';
const sessionDuration = 8 * 60 * 60 * 1000;
type ObjectValue = Record<string, unknown>;
interface Account {salt:string; iter:number; hash:string; name?:string;}
interface Claims {aud:string; email:string; exp:number; fingerprint:string; nonce:string;}
export interface SessionIdentity {email:string; name:string; expiresAt:number; admin:boolean;}
const object = (value:unknown):ObjectValue|null => value !== null && typeof value==='object' && !Array.isArray(value) ? value as ObjectValue : null;
const normalize = (value:unknown) => typeof value==='string' ? value.trim().toLowerCase() : '';
const validEmail = (value:string) => value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const fingerprint = (account:Account) => createHash('sha256').update(JSON.stringify([account.salt,account.iter,account.hash])).digest('hex');

function secret(env:Environment):string {
  if(typeof env.BUDGETS_SESSION_SECRET!=='string' || env.BUDGETS_SESSION_SECRET.length<32) {
    throw Object.assign(new Error('Le service de connexion CDInnov est indisponible.'),{status:503});
  }
  return env.BUDGETS_SESSION_SECRET;
}
function equal(left:string,right:string):boolean {
  const a=Buffer.from(left),b=Buffer.from(right);
  return a.byteLength===b.byteLength && timingSafeEqual(a,b);
}
const sign = (value:string,key:string) => createHmac('sha256',key).update(value).digest('base64url');
const encode = (claims:Claims,key:string) => {
  const body=Buffer.from(JSON.stringify(claims)).toString('base64url');
  return body+'.'+sign(body,key);
};

function decode(value:unknown,key:string,audience:string,now:number):Claims|null {
  if(typeof value!=='string' || value.length>2000) return null;
  const parts=value.split('.');
  if(parts.length!==2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  if(!equal(sign(parts[0],key),parts[1])) return null;
  try {
    const data=object(JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')));
    if(!data || data.aud!==audience || !Number.isSafeInteger(data.exp) || (data.exp as number)<=now ||
      typeof data.email!=='string' || data.email!==normalize(data.email) || !validEmail(data.email) ||
      typeof data.fingerprint!=='string' || !/^[a-f0-9]{64}$/.test(data.fingerprint) ||
      typeof data.nonce!=='string' || !new RegExp(audience===challengeAudience?'^[a-f0-9]{48}$':'^[a-f0-9]{32}$').test(data.nonce)) return null;
    return data as unknown as Claims;
  } catch {return null;}
}

async function account(env:Environment,email:string):Promise<Account|null> {
  const kv=env.CET_KV as {get(key:string,mode:'json'):Promise<unknown>}|undefined;
  if(!kv || typeof env.CET_WORKSPACE_KEY!=='string') throw Object.assign(new Error('Le service de connexion CDInnov est indisponible.'),{status:503});
  const portal=object(await kv.get(env.CET_WORKSPACE_KEY,'json')),auth=object(portal?.auth);
  const allowed=Array.isArray(auth?.allowed) ? auth.allowed.map(normalize) : [];
  if(!seededAccounts.includes(email) && !allowed.includes(email)) return null;
  const accounts=object(auth?.accounts);
  const candidate=accounts && Object.hasOwn(accounts,email) ? object(accounts[email]) : null;
  if(!candidate || typeof candidate.salt!=='string' || !/^[a-f0-9]{32}$/i.test(candidate.salt) ||
    typeof candidate.hash!=='string' || !/^[a-f0-9]{64}$/i.test(candidate.hash) ||
    !Number.isInteger(candidate.iter) || (candidate.iter as number)<100000 || (candidate.iter as number)>1000000) return null;
  return {salt:candidate.salt,hash:candidate.hash,iter:candidate.iter as number,...(typeof candidate.name==='string'?{name:candidate.name}:{})};
}

/** Read the account on every request: no identity or permission cache across users. */
export async function sessionIdentity(request:Request,env:Environment,now=Date.now()):Promise<SessionIdentity|null> {
  const authorization=request.headers.get('authorization');
  if(!authorization || !/^Bearer [A-Za-z0-9_.-]+$/i.test(authorization)) return null;
  const claims=decode(authorization.slice(7),secret(env),sessionAudience,now);
  if(!claims) return null;
  const revoked=await env.BUDGETS_DB.withSession('first-primary').prepare('SELECT token_hash FROM app_session_revocations WHERE token_hash=?').bind(createHash('sha256').update(authorization.slice(7)).digest('hex')).first();
  if(revoked)return null;
  const current=await account(env,claims.email);
  if(!current || !equal(claims.fingerprint,fingerprint(current))) return null;
  return {email:claims.email,name:current.name || claims.email,expiresAt:claims.exp,admin:admins.includes(claims.email)};
}

/** Compatibility contract used by Budgets, Agenda, Marchés, Smartsheet and Dashboard. */
export async function identity(request:Request,env:Environment):Promise<string|null> {
  return (await sessionIdentity(request,env))?.email || null;
}

async function loginBody(request:Request):Promise<ObjectValue|null> {
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw Object.assign(new Error('Format JSON requis.'),{status:415});
  const reader=request.body?.getReader(),chunks:Uint8Array[]=[];
  let size=0;
  if(reader) try {
    while(true) {
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>4096){await reader.cancel();throw Object.assign(new Error('Données trop volumineuses.'),{status:413});}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  try {return object(JSON.parse(Buffer.concat(chunks).toString('utf8')));}
  catch {throw Object.assign(new Error('Données JSON invalides.'),{status:400});}
}

/** Existing challenge/proof protocol; password derivation stays in the browser. */
export async function login(request:Request,env:Environment,db:Database,reply:Reply,now=Date.now()):Promise<Response> {
  if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
  const key=secret(env),input=await loginBody(request),email=normalize(input?.email);
  if(!input || !validEmail(email) || typeof input.action!=='string' || !['challenge','verify'].includes(input.action))return reply(400,{error:'Identifiants invalides.'});
  const limitKeys=['email:'+email,'ip:'+(request.headers.get('cf-connecting-ip') || 'unknown')].map(value=>createHash('sha256').update(value).digest('hex'));
  if(input.action==='challenge') for(const id of limitKeys) {
    const limit=await db.prepare('INSERT INTO budgets_login_limits (id,attempts,until_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN until_at<? THEN 1 ELSE attempts+1 END, until_at=CASE WHEN until_at<? THEN excluded.until_at ELSE until_at END RETURNING attempts').bind(id,now+900000,now,now).first<{attempts:number}>();
    if(!limit)throw new Error('Login limit unavailable');
    if(limit.attempts>20)return reply(429,{error:'Trop de tentatives. Réessayez dans 15 minutes.'});
  }
  const current=await account(env,email);
  if(input.action==='challenge')return reply(200,{
    challenge:encode({aud:challengeAudience,email,exp:now+60000,fingerprint:current?fingerprint(current):randomBytes(32).toString('hex'),nonce:randomBytes(24).toString('hex')},key),
    salt:current?.salt || randomBytes(16).toString('hex'),iter:current?.iter || 150000
  });
  const denied=()=>reply(401,{error:'Connexion CDInnov invalide ou expirée. Reconnectez-vous.'});
  if(typeof input.proof!=='string' || !/^[a-f0-9]{64}$/.test(input.proof))return denied();
  const challenge=decode(input.challenge,key,challengeAudience,now);
  if(!challenge || challenge.email!==email || !current || !equal(challenge.fingerprint,fingerprint(current)))return denied();
  // Consume even a failed proof, so a challenge cannot be retried or used concurrently.
  const consumed=await db.prepare('INSERT INTO budgets_login_challenges (nonce,expires_at) VALUES (?,?) ON CONFLICT(nonce) DO NOTHING RETURNING nonce').bind(challenge.nonce,challenge.exp).first();
  if(!consumed)return denied();
  await db.prepare('DELETE FROM budgets_login_challenges WHERE expires_at<?').bind(now).run();
  const proof=createHmac('sha256',Buffer.from(current.hash,'hex')).update(input.challenge as string).digest('hex');
  if(!equal(proof,input.proof))return denied();
  const expiresAt=now+sessionDuration;
  const token=encode({aud:sessionAudience,email,exp:expiresAt,fingerprint:fingerprint(current),nonce:randomBytes(16).toString('hex')},key);
  await db.prepare('DELETE FROM budgets_login_limits WHERE id=? OR until_at<?').bind(limitKeys[0],now).run();
  return reply(200,{token,expiresAt});
}
