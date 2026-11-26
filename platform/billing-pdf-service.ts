import {setTimeout as wait} from 'node:timers/promises';

const retryableStatuses = new Set([429, 502, 503, 504]);
// A sleeping hosted renderer can need a full minute to start. The last
// attempt used to run at 58.5 s, just before it could become available.
const retryDelays = [500, 1500, 3500, 6500, 10500, 16000, 20000, 10000];

/** Rendering is read-only on the PDF service. Never retry a portal write here. */
export async function requestBillingPDF(url:URL,key:string,payload:unknown,signal:AbortSignal):Promise<Response>{
 const body=JSON.stringify(payload),headers={'Content-Type':'application/json','X-API-Key':key};
 let wakeRequested=false;
 for(let attempt=0;;attempt++){
  const response=await fetch(url,{method:'POST',redirect:'manual',signal,headers,body});
  const delay=retryDelays[attempt];
  if(delay===undefined||!retryableStatuses.has(response.status)){
   if(retryableStatuses.has(response.status))console.warn(JSON.stringify({event:'billing_pdf_service_unavailable',path:url.pathname,status:response.status,attempts:attempt+1}));
   return response;
  }
  const startupResponse=response.status!==429&&!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||'');
  const retryAfter=response.headers.get('Retry-After');
  const waitUntil=retryAfter?(/^\d+$/.test(retryAfter)?Number(retryAfter)*1000:Date.parse(retryAfter)-Date.now()):0;
  await response.body?.cancel().catch(()=>{});
  // The deadline and Retry-After apply to the wake request as well as retries.
  await wait(Math.min(Math.max(delay,waitUntil||0),2147483647),undefined,{signal});
  // A hosting startup page is not an application response. Wake the same
  // configured service with a small GET, without resending any document to
  // another host or changing the portal's reservation/issuance state.
  if(startupResponse&&!wakeRequested){
   wakeRequested=true;const health=new URL(url);health.pathname='/api/health';health.search='';health.hash='';
   try{const wake=await fetch(health,{method:'GET',redirect:'manual',signal,headers:{'X-API-Key':key}});await wake.body?.cancel().catch(()=>{});}
   catch(error){if(signal.aborted)throw error;}
  }
 }
}
