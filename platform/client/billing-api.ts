import type {BillingTransport,BillingDraft,BillingDocument,BillingContext,BillingPage,BillingSettings} from '../billing-contracts';
export function createBillingTransport(options:{baseUrl:string;getToken:()=>Promise<string>;isActive:()=>boolean}):BillingTransport & {dispose:()=>void} {
  let disposed=false;const controllers=new Set<AbortController>();
  const active=()=>{if(disposed||!options.isActive())throw new Error('Votre session ou la page a changé.');};
  async function request<T>(path:string,method='GET',body?:unknown,version?:number,binary=false):Promise<T>{
    active();const token=await options.getToken();active();
    const controller=new AbortController();controllers.add(controller);
    const timer=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch(options.baseUrl.replace(/\/$/,'')+'/api/v1/billing'+path,{method,cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'}),...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});
      const data=response.ok&&binary?await response.blob():await response.json();active();
      if(!response.ok)throw Object.assign(new Error(data.error||'La sauvegarde n’a pas abouti. Vos modifications sont conservées.'),{status:response.status});
      return data as T;
    }catch(error){active();if(controller.signal.aborted)throw new Error('Le service ne répond pas. Vos modifications sont conservées ; vous pouvez réessayer.');throw error;}
    finally{clearTimeout(timer);controllers.delete(controller);}
  }
  return {
    list:query=>request<BillingPage>('/documents?'+new URLSearchParams({kind:query.kind,q:query.q,offset:String(query.offset),limit:String(query.limit)})),
    get:id=>request<BillingDocument>('/documents/'+encodeURIComponent(id)),
    create:(id:string,data:BillingDraft)=>request<BillingDocument>('/documents','POST',{id,data}),
    save:(id:string,version:number,data:BillingDraft)=>request<BillingDocument>('/documents/'+encodeURIComponent(id),'PUT',{data},version),
    convert:(id:string,version:number,newId:string)=>request<BillingDocument>('/documents/'+encodeURIComponent(id)+'/convert','POST',{id:newId},version),
    context:()=>request<BillingContext>('/context'),
    settings:()=>request<BillingSettings>('/settings'),
    saveSettings:(version,data)=>request<BillingSettings>('/settings','PUT',{data},version),
    previewPDF:(id,version)=>request<Blob>('/documents/'+encodeURIComponent(id)+'/preview.pdf','GET',undefined,version,true),
    dispose(){disposed=true;for(const controller of controllers)controller.abort();controllers.clear();}
  };
}
