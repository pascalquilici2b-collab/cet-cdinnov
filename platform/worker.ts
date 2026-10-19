import legacy from '../server/legacy-runtime.mjs';
import {identity, sessionIdentity, login} from './identity.ts';
import type {Environment} from './contracts';
import {responseHeaders} from './http';
import {readWorkspace, readRecords, syncClientNames} from './budgets';
import {dashboardEnvironment, readDashboard} from './dashboard';
import {portalEnvironment,portalRoute,filesRoute,notificationRequest} from './portal';
import {createHash} from 'node:crypto';
import {workspaceRecords,workspacePut} from './workspace-records';

/** One deployable entry; modern and compatibility routes share the typed identity module. */
export default {
  async fetch(request: Request, env: Environment, ctx?: unknown): Promise<Response> {
    const path = new URL(request.url).pathname;
    let headers = new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body),{status,headers});
    try {
      headers = responseHeaders(request,env);
      if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
      env=portalEnvironment(env);
      if(path==='/api/v1/portal'||path.startsWith('/api/v1/portal/'))return await portalRoute(request,env,reply);
      if(path.startsWith('/files/'))return await filesRoute(request,env,headers,reply);
      if(path==='/notify')return await legacy.fetch(await notificationRequest(request,env),env,ctx);
      if(['PATCH','PUT'].includes(request.method)&&(path==='/budgets/workspace'||path==='/sheets/state')){
        const email=await identity(request,env);
        if(!email)return reply(401,{error:'Votre connexion CDInnov a expiré. Reconnectez-vous.'});
        return await (request.method==='PATCH'?workspaceRecords:workspacePut)(request,env.BUDGETS_DB.withSession('first-primary'),path==='/sheets/state'?'sheets':'budgets',email,reply);
      }
      if(!['/api/v1/session','/budgets/workspace','/budgets/clients','/api/v1/budget-records','/api/v1/dashboard'].includes(path)){
        if(path.startsWith('/budgets/')||path==='/sheets/state'||path==='/sheets/session')return await legacy.fetch(request,env,ctx);
        return reply(410,{error:'Cet ancien accès est fermé. Utilisez le portail CDInnov et connectez-vous.'});
      }
      if(path==='/api/v1/session') {
        if(request.method==='POST')return await login(request,env,env.BUDGETS_DB.withSession('first-primary'),reply);
        if(request.method==='DELETE'){
          const session=await sessionIdentity(request,env);if(!session)return reply(401,{error:'Connexion requise.'});
          const hash=createHash('sha256').update(request.headers.get('authorization')!.slice(7)).digest('hex');
          await env.BUDGETS_DB.prepare('INSERT OR IGNORE INTO app_session_revocations(token_hash,expires_at) VALUES (?,?)').bind(hash,session.expiresAt).run();
          await env.BUDGETS_DB.prepare('DELETE FROM app_session_revocations WHERE expires_at<?').bind(Date.now()).run();
          return reply(200,{ok:true});
        }
        if(request.method!=='GET')return reply(405,{error:'Méthode non autorisée.'});
        const session=await sessionIdentity(request,env);
        return session ? reply(200,session) : reply(401,{error:'Votre connexion CDInnov a expiré. Reconnectez-vous.'});
      }
      if(path==='/budgets/workspace' && request.method!=='GET') return reply(405,{error:'Méthode non autorisée.'});
      if(path==='/api/v1/dashboard') env=dashboardEnvironment(env);
      const email = await identity(request,env);
      if(!email) return reply(401,{error:'Votre connexion CDInnov a expiré. Reconnectez-vous.'});
      const db = env.BUDGETS_DB.withSession('first-primary');
      if(path==='/api/v1/dashboard' && request.method==='GET') return reply(200,await readDashboard(request,env,db,email));
      if(path==='/budgets/workspace') return await readWorkspace(request,db,headers);
      if(path==='/budgets/clients' && request.method==='POST') return await syncClientNames(request,db,email,reply);
      if(path==='/api/v1/budget-records' && request.method==='GET') return await readRecords(request,db,reply);
      return reply(405,{error:'Méthode non autorisée.'});
    } catch(error: unknown) {
      const failure = error as {status?:number;message?:string};
      return reply(failure.status || 503,{error:failure.status?failure.message:'Service indisponible. Vos modifications ne sont pas enregistrées.'});
    }
  }
};
