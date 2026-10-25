import './action-feedback';
export {accountAccess,accessModules} from '../access';
type Snapshot = {workspace: Record<string, unknown>;version: number;updatedAt?: string;updatedBy?: string};
type Session = {email: string;token: string};
import {recordChanges} from '../record-changes.ts';
export {recordChanges} from '../record-changes.ts';

/** In-memory cache scoped to a signed session. Never persists financial data or tokens. */
export function createBudgetTransport(send: typeof fetch = fetch) {
  let cached: {key:string;tag:string;value:Snapshot} | undefined;
  let baseline: {key:string;workspace:Record<string,unknown>} | undefined;
  let generation = 0;
  const clear = () => { cached=undefined;baseline=undefined; generation++; };
  return {
    clear,
    async request(url: string, session: Session, method: 'GET'|'PUT', workspace?: Record<string, unknown>, version?: number) {
      const key=JSON.stringify([url,session.email,session.token]);
      if(baseline && baseline.key!==key) clear();
      const start=++generation;
      const headers: Record<string,string>={Authorization:'Bearer '+session.token};
      if(method==='GET' && cached?.key===key) headers['If-None-Match']=cached.tag;
      if(method==='PUT'&&(!baseline||!workspace))throw new Error('Rechargez le budget avant de modifier un enregistrement.');
      const submitted=method==='PUT'?structuredClone(workspace!):undefined;
      const changes=method==='PUT'?recordChanges(baseline!.workspace,submitted):undefined;
      if(method==='PUT') {cached=undefined;headers['Content-Type']='application/json';}
      let response: Response;
      try {
        response=await send(url,{method:method==='PUT'?'PATCH':'GET',headers,body:method==='PUT'?JSON.stringify({changes}):undefined,cache:'no-store',signal:AbortSignal.timeout(30000)});
      } catch(error) { if(generation===start)cached=undefined; throw error; }
      if(generation!==start) throw new Error('La session ou le budget a changé. Rechargez les données.');
      if(response.status===304) {
        if(!cached || cached.key!==key) throw new Error('La copie locale a expiré. Rechargez les données.');
        return structuredClone(cached.value);
      }
      const value=await response.json();
      if(generation!==start) throw new Error('La session ou le budget a changé. Rechargez les données.');
      if(!response.ok) { cached=undefined;if(response.status===401)clear();throw Object.assign(new Error(value.error||'Enregistrement impossible. Réessayez.'),{status:response.status}); }
      if(method==='GET') {
        const tag=response.headers.get('ETag');
        if(tag && value.workspace && Number.isSafeInteger(value.version)) cached={key,tag,value:structuredClone(value)};
        if(value.workspace&&Number.isSafeInteger(value.version))baseline={key,workspace:structuredClone(value.workspace)};
      }
      else {if(!Number.isSafeInteger(value.version))throw new Error('Confirmation de sauvegarde invalide.');baseline={key,workspace:submitted!};}
      return value;
    }
  };
}
