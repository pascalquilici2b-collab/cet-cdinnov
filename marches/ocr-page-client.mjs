/** Same-origin, session-bound visual reading. Images never use a third-party URL. */
export function createOcrPageClient({getSession,isActive=()=>true,onUnauthorized=()=>{}}){
 return async input=>{
  const active=()=>{if(!isActive())throw Object.assign(Error('La session ou la page a changé.'),{name:'AbortError'});};
  active();const session=await getSession();active();
  const response=await fetch('/api/v1/ai/ocr-page',{method:'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(90000),headers:{'X-CDInnov-Request':'1','Content-Type':'application/json'},body:JSON.stringify(input)});active();
  if(response.status===401)onUnauthorized(session);
  let data;try{data=await response.json();}catch{throw Object.assign(Error('La réponse de lecture visuelle est illisible.'),{status:response.status});}active();
  if(!response.ok)throw Object.assign(Error(data.error||'Lecture visuelle indisponible.'),{status:response.status});
  return data;
 };
}
