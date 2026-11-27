import {setTimeout as wait} from 'node:timers/promises';

const retryableStatuses = new Set([429, 502, 503, 504]);
// A sleeping hosted renderer can need a full minute to start. The last
// attempt used to run at 58.5 s, just before it could become available.
const retryDelays = [500, 1500, 3500, 6500, 10500, 16000, 20000, 10000];
const healthTimeoutMs = 15000;
const jsonResponse=(response:Response)=>/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||'');
const retryAfterMs=(response:Response)=>{
 const value=response.headers.get('Retry-After')?.trim();
 if(!value)return 0;
 const delay=/^\d+$/.test(value)?Number(value)*1000:Date.parse(value)-Date.now();
 return Number.isFinite(delay)?Math.max(0,Math.min(delay,2147483647)):0;
};
function report(phase:'health'|'post',attempt:number,response?:Response,network=false,aborted=false){
 const raw=(response?.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 const contentType=/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(raw)&&raw.length<=60?raw:raw?'other':'';
 const entry=JSON.stringify({event:'billing_pdf_service',phase,attempt,...(response?{status:response.status,contentType}:{}),...(network?{networkError:true}:{}),...(aborted?{aborted:true}:{})});
 if(network||!response?.ok)console.warn(entry);else console.info(entry);
}
async function healthJSON(response:Response,signal:AbortSignal):Promise<unknown>{
 const reader=response.body?.getReader();if(!reader)return null;
 const chunks:Uint8Array[]=[];let size=0;
 const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try{
  for(;;){signal.throwIfAborted();const {done,value}=await reader.read();signal.throwIfAborted();if(done)break;size+=value.length;if(size>16384)throw new Error('Invalid health response');chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }finally{signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});}
}

/** Rendering is read-only on the PDF service. Never retry a portal write here. */
export async function requestBillingPDF(url:URL,key:string,payload:unknown,signal:AbortSignal):Promise<Response>{
 signal.throwIfAborted();
 const body=JSON.stringify(payload),headers={'Content-Type':'application/json','X-API-Key':key};
 let healthAttempts=0;
 async function pause(delay:number){try{await wait(delay,undefined,{signal});}catch(error){signal.throwIfAborted();throw error;}}
 async function wake():Promise<Response|null>{
  const health=new URL(url);health.pathname='/api/health';health.search='';health.hash='';health.username='';health.password='';
  while(healthAttempts<=retryDelays.length){
   signal.throwIfAborted();const attempt=++healthAttempts,controller=new AbortController();
   const abort=()=>controller.abort(signal.reason);signal.addEventListener('abort',abort,{once:true});
   const timer=setTimeout(()=>controller.abort(new DOMException('Health request timed out','TimeoutError')),healthTimeoutMs);
   let retryAfter=0;
   try{
    const response=await fetch(health,{method:'GET',redirect:'manual',signal:controller.signal,headers:{Accept:'application/json'}});
    report('health',attempt,response);retryAfter=retryAfterMs(response);
    if(response.status===200&&jsonResponse(response)){
     let data:unknown;try{data=await healthJSON(response,controller.signal);}catch{controller.signal.throwIfAborted();}
     // ready=false only describes the optional electronic conversion tools.
     // A JSON boolean still proves FastAPI is awake; the business route decides
     // which tools it requires, including ordinary PDFs without PDF/A tooling.
     if(data&&typeof data==='object'&&!Array.isArray(data)&&typeof (data as {ready?:unknown}).ready==='boolean')return null;
    }else{
     void response.body?.cancel().catch(()=>{});
     if(response.status!==200&&response.status!==202&&!retryableStatuses.has(response.status))return new Response(null,{status:response.ok?503:response.status});
    }
   }catch(error){
    report('health',attempt,undefined,true,signal.aborted);
    signal.throwIfAborted();
   }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
   const delay=retryDelays[attempt-1];if(delay===undefined)break;
   await pause(Math.max(delay,retryAfter));
  }
  return new Response(null,{status:503});
 }
 // Render Free can reject POST at its gateway while asleep. Wake it with a
 // public, document-free GET before sending credentials or a document.
 if(url.hostname.endsWith('.onrender.com')){const unavailable=await wake();if(unavailable)return unavailable;}
 for(let attempt=0;;attempt++){
  signal.throwIfAborted();
  const delay=retryDelays[attempt];
  let response:Response;
  try{response=await fetch(url,{method:'POST',redirect:'manual',signal,headers,body});}
  catch(error){
   report('post',attempt+1,undefined,true,signal.aborted);signal.throwIfAborted();if(delay===undefined)throw error;
   await pause(delay);const unavailable=await wake();if(unavailable)return unavailable;
   continue;
  }
  if(!response.ok)report('post',attempt+1,response);
  if(delay===undefined||!retryableStatuses.has(response.status)){
   return response;
  }
  // Hosting gateways can return 429 HTML while the instance is asleep. JSON
  // application backpressure still retries without treating it as a startup.
  const startupResponse=!jsonResponse(response),retryAfter=retryAfterMs(response);
  void response.body?.cancel().catch(()=>{});
  // The deadline and Retry-After apply to the wake request as well as retries.
  await pause(Math.max(delay,retryAfter));
  // A hosting startup page is not an application response. Wake the same
  // configured service with a small GET, without resending any document to
  // another host or changing the portal's reservation/issuance state.
  if(startupResponse){const unavailable=await wake();if(unavailable)return unavailable;}
 }
}
