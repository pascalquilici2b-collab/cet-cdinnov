type Flight={controller:AbortController;promise:Promise<void>;subscribers:number;timer:ReturnType<typeof setTimeout>};
const pending=new Map<string,Flight>();
const wakeRetryDelays=[500,1500,3500,6500,10500,16000,20000,10000];
const pause=(delay:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(abortReason(signal));},timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},Math.min(delay,2147483647));signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();});
const unavailable=()=>Object.assign(new Error('Le moteur documentaire est indisponible. Votre saisie est conservée ; vous pouvez réessayer.'),{status:503});
const abortReason=(signal:AbortSignal)=>signal.reason||new DOMException('La demande a été annulée.','AbortError');
const isJSON=(response:Response)=>/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||'');
async function readJSON(response:Response,signal:AbortSignal):Promise<unknown>{
 const reader=response.body?.getReader();if(!reader)throw unavailable();
 const chunks:Uint8Array[]=[];let size=0;
 const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{
  for(;;){signal.throwIfAborted();const {done,value}=await reader.read();signal.throwIfAborted();if(done)break;size+=value.length;if(size>16384)throw unavailable();chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }finally{signal.removeEventListener('abort',cancel);void reader.cancel().catch(()=>{});}
}
async function wake(origin:string,signal:AbortSignal):Promise<void>{
 try{
  const metadata=await fetch(origin+'/api/v1/billing/document-engine',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal,headers:{'X-CDInnov-Request':'1',Accept:'application/json'}});
  if(!metadata.ok){void metadata.body?.cancel().catch(()=>{});if(metadata.status===401)throw Object.assign(new Error('Reconnectez-vous pour poursuivre. Votre saisie est conservée.'),{status:401});throw Object.assign(unavailable(),{status:metadata.status});}
  if(metadata.status!==200||!isJSON(metadata)){void metadata.body?.cancel().catch(()=>{});throw unavailable();}
  const data=await readJSON(metadata,signal);if(!data||typeof data!=='object'||Array.isArray(data)||!('wakeUrl' in data))throw unavailable();
  if(data.wakeUrl===null)return;
  if(typeof data.wakeUrl!=='string'||/[?#]/.test(data.wakeUrl))throw unavailable();
  const url=new URL(data.wakeUrl);
  if(data.wakeUrl!==url.origin+'/api/health'||url.protocol!=='https:'||!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+onrender\.com$/i.test(url.hostname)||url.username||url.password||url.port||url.pathname!=='/api/health'||url.search||url.hash)throw unavailable();
  // Public, document-free wake: never forward the authenticated API headers.
  for(let attempt=0;;attempt++){
   signal.throwIfAborted();let response:Response|undefined,retryAfter=0;
   try{response=await fetch(url.href,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',mode:'cors',signal});}catch{signal.throwIfAborted();}
   if(response){
    const value=response.headers.get('Retry-After')?.trim(),delay=value?(/^\d+$/.test(value)?Number(value)*1000:Date.parse(value)-Date.now()):0;retryAfter=Number.isFinite(delay)?Math.max(0,delay):0;
    if(response.status===200&&isJSON(response)){
     try{const health=await readJSON(response,signal);if(health&&typeof health==='object'&&!Array.isArray(health)&&'ready' in health&&typeof health.ready==='boolean')return;}catch{signal.throwIfAborted();}
    }else{
     void response.body?.cancel().catch(()=>{});
     if(![200,202,429,502,503,504].includes(response.status))throw unavailable();
    }
   }
   const delay=wakeRetryDelays[attempt];if(delay===undefined)throw unavailable();await pause(Math.max(delay,retryAfter),signal);
  }
 }catch(error){signal.throwIfAborted();if(error&&typeof error==='object'&&'status' in error)throw error;throw unavailable();}
}

/** Coalesce concurrent startup checks; never cache readiness past this flight. */
export function ensureDocumentEngine({baseUrl,signal,sessionId}:{baseUrl:string;signal:AbortSignal;sessionId:string}):Promise<void>{
 if(signal.aborted)return Promise.reject(abortReason(signal));
 if(typeof sessionId!=='string'||!sessionId)return Promise.reject(unavailable());
 let origin:string;
 try{const url=new URL(baseUrl||location.origin,location.href);if(url.origin!==location.origin||url.username||url.password||url.search||url.hash)throw unavailable();origin=url.origin;}
 catch{return Promise.reject(unavailable());}
 const key=origin+'\0'+sessionId;let flight=pending.get(key);
 if(!flight){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('Le réveil du moteur documentaire a dépassé le délai. Votre saisie est conservée ; vous pouvez réessayer.','TimeoutError')),75000);
  flight={controller,subscribers:0,timer,promise:Promise.resolve()};const current=flight;
  current.promise=wake(origin,controller.signal).finally(()=>{clearTimeout(timer);if(pending.get(key)===current)pending.delete(key);});pending.set(key,current);
 }
 const current=flight;current.subscribers++;
 return new Promise<void>((resolve,reject)=>{
  let settled=false;
  const leave=()=>{if(settled)return false;settled=true;signal.removeEventListener('abort',cancel);current.subscribers--;if(!current.subscribers&&pending.get(key)===current){pending.delete(key);clearTimeout(current.timer);current.controller.abort();}return true;};
  const cancel=()=>{if(leave())reject(abortReason(signal));};signal.addEventListener('abort',cancel,{once:true});
  if(signal.aborted){cancel();return;}
  current.promise.then(()=>{if(leave())resolve();},error=>{if(leave())reject(error);});
 });
}
