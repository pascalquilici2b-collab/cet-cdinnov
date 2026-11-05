import './action-feedback.ts';
export {accountAccess,accessModules} from '../access.ts';
type Snapshot = {workspace: Record<string, unknown>;version: number;updatedAt?: string;updatedBy?: string};
type Session = {email: string;sessionId: string};
import {recordChanges} from '../record-changes.ts';
export {recordChanges} from '../record-changes.ts';

/** In-memory cache scoped to a signed session. Never persists financial data or tokens. */
export function createBudgetTransport(send: typeof fetch = fetch) {
  let cached: {key:string;tag:string;value:Snapshot} | undefined;
  let baseline: {key:string;owner:string;workspace:Record<string,unknown>} | undefined;
  let generation = 0;
  const suspend = () => {cached=undefined;generation++;};
  const clear = () => {baseline=undefined;suspend();};
  return {
    clear,
    // A same-account reconnect retains the original record versions for conflict
    // checks, so an unsaved edit can be retried without overwriting newer work.
    suspend,
    async request(url: string, session: Session, method: 'GET'|'PUT', workspace?: Record<string, unknown>, version?: number) {
      const key=JSON.stringify([url,session.email,session.sessionId]);
      const owner=JSON.stringify([url,session.email]);
      if(baseline && baseline.owner!==owner)clear();
      else if(baseline && baseline.key!==key){suspend();baseline={...baseline,key};}
      const start=++generation;
      const headers: Record<string,string>={'X-CDInnov-Request':'1'};
      if(method==='GET' && cached?.key===key) headers['If-None-Match']=cached.tag;
      if(method==='PUT'&&(!baseline||!workspace))throw new Error('Rechargez le budget avant de modifier un enregistrement.');
      const submitted=method==='PUT'?structuredClone(workspace!):undefined;
      const changes=method==='PUT'?recordChanges(baseline!.workspace,submitted):undefined;
      if(method==='PUT') {cached=undefined;headers['Content-Type']='application/json';}
      let response: Response;
      try {
        response=await send(url,{method:method==='PUT'?'PATCH':'GET',credentials:'same-origin',headers,body:method==='PUT'?JSON.stringify({changes}):undefined,cache:'no-store',signal:AbortSignal.timeout(30000)});
      } catch(error) { if(generation===start)cached=undefined; throw error; }
      if(generation!==start) throw new Error('La session ou le budget a changé. Rechargez les données.');
      if(response.status===304) {
        if(!cached || cached.key!==key) throw new Error('La copie locale a expiré. Rechargez les données.');
        return structuredClone(cached.value);
      }
      if(response.status===401&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('cdinnov-session-expired',{detail:{sessionId:session.sessionId}}));
      const value=await response.json();
      if(generation!==start) throw new Error('La session ou le budget a changé. Rechargez les données.');
      if(!response.ok) { cached=undefined;if(response.status===401)suspend();throw Object.assign(new Error(value.error||'Enregistrement impossible. Réessayez.'),{status:response.status}); }
      if(method==='GET') {
        const tag=response.headers.get('ETag');
        if(tag && value.workspace && Number.isSafeInteger(value.version)) cached={key,tag,value:structuredClone(value)};
        if(value.workspace&&Number.isSafeInteger(value.version))baseline={key,owner,workspace:structuredClone(value.workspace)};
      }
      else {if(!Number.isSafeInteger(value.version))throw new Error('Confirmation de sauvegarde invalide.');baseline={key,owner,workspace:submitted!};}
      return value;
    }
  };
}
