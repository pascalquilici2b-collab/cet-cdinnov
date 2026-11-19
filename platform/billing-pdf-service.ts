import {setTimeout as wait} from 'node:timers/promises';

const retryableStatuses = new Set([429, 502, 503, 504]);
const retryDelays = [500, 1500, 3500, 6500, 10500, 16000, 20000];

/** Rendering is read-only on the PDF service. Never retry a portal write here. */
export async function requestBillingPDF(url:URL,key:string,payload:unknown,signal:AbortSignal):Promise<Response>{
 const body=JSON.stringify(payload),headers={'Content-Type':'application/json','X-API-Key':key};
 for(let attempt=0;;attempt++){
  const response=await fetch(url,{method:'POST',redirect:'manual',signal,headers,body});
  const delay=retryDelays[attempt];
  if(delay===undefined||!retryableStatuses.has(response.status))return response;
  const retryAfter=response.headers.get('Retry-After');
  const waitUntil=retryAfter?(/^\d+$/.test(retryAfter)?Number(retryAfter)*1000:Date.parse(retryAfter)-Date.now()):0;
  await response.body?.cancel().catch(()=>{});
  // The same deadline covers the original request, every retry and body validation.
  // Do not start another attempt before the service's Retry-After, even if it exceeds the deadline.
  await wait(Math.min(Math.max(delay,waitUntil||0),2147483647),undefined,{signal});
 }
}
