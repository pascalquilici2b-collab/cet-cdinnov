type Snapshot = {workspace: Record<string, unknown>;version: number;updatedAt?: string;updatedBy?: string};
type Session = {email: string;token: string};

/** In-memory cache scoped to a signed session. Never persists financial data or tokens. */
export function createBudgetTransport(send: typeof fetch = fetch) {
  let cached: {key:string;tag:string;value:Snapshot} | undefined;
  let generation = 0;
  const clear = () => { cached=undefined; generation++; };
  return {
    clear,
    async request(url: string, session: Session, method: 'GET'|'PUT', workspace?: Record<string, unknown>, version?: number) {
      const key=JSON.stringify([url,session.email,session.token]);
      if(cached && cached.key!==key) clear();
      const start=++generation;
      const headers: Record<string,string>={Authorization:'Bearer '+session.token};
      if(method==='GET' && cached?.key===key) headers['If-None-Match']=cached.tag;
      if(method==='PUT') {cached=undefined;headers['Content-Type']='application/json';headers['If-Match']=String(version);}
      let response: Response;
      try {
        response=await send(url,{method,headers,body:method==='PUT'?JSON.stringify(workspace):undefined,cache:'no-store',signal:AbortSignal.timeout(30000)});
      } catch(error) { if(generation===start)clear(); throw error; }
      if(generation!==start) throw new Error('La session ou le budget a changé. Rechargez les données.');
      if(response.status===304) {
        if(!cached || cached.key!==key) throw new Error('La copie locale a expiré. Rechargez les données.');
        return structuredClone(cached.value);
      }
      const value=await response.json();
      if(generation!==start) throw new Error('La session ou le budget a changé. Rechargez les données.');
      if(!response.ok) { clear();throw Object.assign(new Error(value.error||'Enregistrement impossible. Réessayez.'),{status:response.status}); }
      if(method==='GET') {
        const tag=response.headers.get('ETag');
        if(tag && value.workspace && Number.isSafeInteger(value.version)) cached={key,tag,value:structuredClone(value)};
      }
      return value;
    }
  };
}
