import type {BillingTransport,BillingInvoiceSelection,BillingDraft,BillingDocument,BillingContext,BillingPage,BillingSettings,BillingNumberSeries,BillingDirectoryRecord,BillingDirectoryPage,BillingQuoteEvent,BillingQuoteRevisionItem,BillingPaymentEntry} from '../billing-contracts';
export function createBillingTransport(options:{baseUrl:string;getToken:()=>Promise<string>;isActive:()=>boolean}):BillingTransport & {dispose:()=>void} {
  let disposed=false;const controllers=new Set<AbortController>();
  const active=()=>{if(disposed||!options.isActive())throw new Error('Votre session ou la page a changé.');};
  async function request<T>(path:string,method='GET',body?:unknown,version?:number,binary=false,extraHeaders?:Record<string,string>):Promise<T>{
    active();const token=await options.getToken();active();
    const controller=new AbortController();controllers.add(controller);
    const timer=setTimeout(()=>controller.abort(),path.endsWith('/engagement-analysis')?90000:path.endsWith('/finalize')?210000:path.endsWith('/issue')||path.endsWith('.pdf')?90000:30000);
    try{
      const response=await fetch(options.baseUrl.replace(/\/$/,'')+(path.startsWith('/api/v1/')||path.startsWith('/budgets/')?'':'/api/v1/billing')+path,{method,cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+token,...(body===undefined||body instanceof Blob?{}:{'Content-Type':'application/json'}),...extraHeaders,...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:body instanceof Blob?body:JSON.stringify(body)})});
      const data=response.ok&&binary?await response.blob():await response.json();active();
      if(!response.ok)throw Object.assign(new Error(data.error||'La sauvegarde n’a pas abouti. Vos modifications sont conservées.'),{status:response.status});
      return data as T;
    }catch(error){active();if(controller.signal.aborted)throw new Error('Le service ne répond pas. Vos modifications sont conservées ; vous pouvez réessayer.');if(error instanceof TypeError)throw new Error('La connexion au serveur a été interrompue. Votre saisie est conservée ; vous pouvez réessayer.');if(error instanceof SyntaxError)throw new Error('La réponse du serveur est illisible. Votre saisie est conservée ; vous pouvez réessayer.');throw error;}
    finally{clearTimeout(timer);controllers.delete(controller);}
  }
  async function numbered(promise:Promise<BillingDocument>){const doc=await promise;const siren=doc.data.seller.siren.replace(/\s/g,'')||doc.data.seller.siret.replace(/\s/g,'').slice(0,9);return !doc.issuance&&!doc.reservedNumber&&!doc.quote?.revision.abandoned&&/^\d{9}$/.test(siren)?request<BillingDocument>('/documents/'+encodeURIComponent(doc.id)+'/number','POST',{},doc.version):doc;}
  const reportPath=(id:string)=>id.startsWith('imported:')?'/imported-invoices/'+encodeURIComponent(id.slice(9))+'/intervention-report':'/documents/'+encodeURIComponent(id)+'/intervention-report';
  return {
    mailSignature:()=>request('/mail-signature'),
    saveMailSignature:(version,data)=>request('/mail-signature','PUT',{data},version),
    clientEmployees:id=>request('/client-employees/'+encodeURIComponent(id)),
    saveClientEmployees:(id,version,data)=>request('/client-employees/'+encodeURIComponent(id),'PUT',data,version),
    saveClientEmployeeDocument:(id,version,kind,employeeId,file)=>request('/client-employees/'+encodeURIComponent(id)+'/documents?'+new URLSearchParams({kind,employeeId}),'POST',file,version,false,{'X-Filename':encodeURIComponent(file.name),'Content-Type':file.type}),
    clientEmployeeDocument:(id,doc)=>request('/client-employees/'+encodeURIComponent(id)+'/documents/'+encodeURIComponent(doc),'GET',undefined,undefined,true),
    orderBudget:(id,data)=>request('/order-budget','POST',{id,data}),
    engagements:()=>request('/engagements'),
    report:id=>request(reportPath(id)),
    saveReport:(id,version,data)=>request(reportPath(id),'PUT',data,version),
    reportPDF:id=>request(reportPath(id)+'.pdf','GET',undefined,undefined,true),
    previewReport:(id,data)=>request(reportPath(id)+'.pdf','POST',data,undefined,true),
    uploadEngagement:(id,version,kind,file,details)=>request('/documents/'+encodeURIComponent(id)+'/engagement?'+new URLSearchParams({kind,...(details?{reference:details.reference,date:details.date,amountMinor:details.amountMinor===null?'':String(details.amountMinor),marketId:details.marketId,projectId:details.projectId,marketReference:details.marketReference,engagement:details.engagement||'',serviceCode:details.serviceCode||'',otherReference:details.otherReference||''}:{})}),'PUT',file,version,false,{'X-Filename':encodeURIComponent(file.name),'Content-Type':file.type||'application/octet-stream'}),
    analyzeEngagement:text=>request('/engagement-analysis','POST',{text}),
    engagementFile:id=>request('/documents/'+encodeURIComponent(id)+'/engagement','GET',undefined,undefined,true),
    marketDocument:(marketId,documentId)=>request('/budgets/markets/'+encodeURIComponent(marketId)+'/documents/'+encodeURIComponent(documentId),'GET',undefined,undefined,true),
    rectify:(id,version,input)=>numbered(request<BillingDocument>('/documents/'+encodeURIComponent(id)+'/rectify','POST',input,version)),
    session:()=>request('/api/v1/session'),
    confirmSent:(id,version,input)=>request('/documents/'+encodeURIComponent(id)+'/outlook-sent','POST',input,version),
    emailHistory:id=>request('/documents/'+encodeURIComponent(id)+'/email'),
    email:(id,version,input)=>request('/documents/'+encodeURIComponent(id)+'/email','POST',input,version),
    projects:()=>request('/api/v1/projects'),
    saveProject:data=>request('/api/v1/projects','PUT',data),
    directoryList:(kind,query)=>request<BillingDirectoryPage>('/'+kind+'?'+new URLSearchParams({q:query.q,offset:String(query.offset),limit:String(query.limit),archived:String(query.archived)})),
    directoryGet:(kind,id)=>request<BillingDirectoryRecord>('/'+kind+'/'+encodeURIComponent(id)),
    directoryCreate:(kind,id,data)=>request<BillingDirectoryRecord>('/'+kind,'POST',{id,data}),
    directorySave:(kind,id,version,data)=>request<BillingDirectoryRecord>('/'+kind+'/'+encodeURIComponent(id),'PUT',{data},version),
    quoteVersions:(id,before)=>request<{versions:BillingQuoteRevisionItem[];nextBefore:number|null}>('/documents/'+encodeURIComponent(id)+'/quote-versions'+(before?'?before='+before:'')),
    reviseQuote:(id,version,data)=>numbered(request<BillingDocument>('/documents/'+encodeURIComponent(id)+'/revise','POST',data,version)),
    abandonQuoteRevision:(id,version,data)=>request<BillingDocument>('/documents/'+encodeURIComponent(id)+'/abandon-revision','POST',data,version),
    payments:(id,before)=>request<{entries:BillingPaymentEntry[];nextBefore:number|null}>('/documents/'+encodeURIComponent(id)+'/payments'+(before?'?before='+before:'')),
    payment:(id,version,data)=>request<BillingDocument>('/documents/'+encodeURIComponent(id)+'/payments','POST',data,version),
    quoteEvents:(id,before)=>request<{events:BillingQuoteEvent[];nextBefore:number|null}>('/documents/'+encodeURIComponent(id)+'/quote-events'+(before?'?before='+before:'')),
    quoteEvent:(id,version,data)=>request<BillingDocument>('/documents/'+encodeURIComponent(id)+'/quote-events','POST',data,version),
    list:query=>request<BillingPage>('/documents?'+new URLSearchParams({kind:query.kind,q:query.q,offset:String(query.offset),limit:String(query.limit),state:query.state||'all',...(query.client?{client:query.client}:{}),...(query.project?{project:query.project}:{})})),
    trash:(id,version)=>request('/documents/'+encodeURIComponent(id),'DELETE',undefined,version),
    restore:(id,version)=>request('/documents/'+encodeURIComponent(id)+'/restore','POST',{},version),
    get:id=>numbered(request<BillingDocument>('/documents/'+encodeURIComponent(id))),
    create:(id:string,data:BillingDraft)=>numbered(request<BillingDocument>('/documents','POST',{id,data})),
    save:(id:string,version:number,data:BillingDraft)=>numbered(request<BillingDocument>('/documents/'+encodeURIComponent(id),'PUT',{data},version)),
    convert:(id:string,version:number,newId:string,selection?:BillingInvoiceSelection)=>numbered(request<BillingDocument>('/documents/'+encodeURIComponent(id)+'/convert','POST',{id:newId,...(selection?{selection}:{})},version)),
    context:()=>request<BillingContext>('/context'),
    settings:()=>request<BillingSettings>('/settings'),
    saveSettings:(version,data)=>request<BillingSettings>('/settings','PUT',{data},version),
    previewPDF:(id,version)=>request<Blob>('/documents/'+encodeURIComponent(id)+'/preview.pdf','GET',undefined,version,true),
    previewDraft:(data,documentId)=>request<Blob>('/preview.pdf','POST',{data,...(documentId?{documentId}:{})},undefined,true),
    numberSeries:()=>request<BillingNumberSeries[]>('/number-series'),
    createNumberSeries:data=>request<BillingNumberSeries>('/number-series','POST',{data}),
    issue:(id,version,attemptId,seriesId)=>request<BillingDocument>('/documents/'+encodeURIComponent(id)+'/issue','POST',{id:attemptId,seriesId},version),
    finalize:(id,version)=>request<BillingDocument>('/documents/'+encodeURIComponent(id)+'/finalize','POST',{},version),
    issuedFile:(id,kind)=>request<Blob>('/documents/'+encodeURIComponent(id)+'/files/'+encodeURIComponent(kind),'GET',undefined,undefined,true),
    dispose(){disposed=true;for(const controller of controllers)controller.abort();controllers.clear();}
  };
}
