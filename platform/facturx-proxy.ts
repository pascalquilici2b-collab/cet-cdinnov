import {sessionIdentity,hasAccess} from './identity';
import {boundedBody} from './portal';
import type {Environment,Reply} from './contracts';

const routes:Record<string,{method:'GET'|'POST';maximum?:number;type?:string}>= {
  '/health':{method:'GET'},
  '/invoice-schema':{method:'GET'},
  '/recipients/search':{method:'POST',maximum:16384,type:'application/json'},
  '/invoices/read-pdf':{method:'POST',maximum:22*1024*1024,type:'multipart/form-data'},
  '/invoices/preview-pdf':{method:'POST',maximum:22*1024*1024,type:'multipart/form-data'},
  '/facturx/import-pdf':{method:'POST',maximum:22*1024*1024,type:'multipart/form-data'},
  '/facturx/generate':{method:'POST',maximum:22*1024*1024,type:'multipart/form-data'}
};

/** Same-origin portal access; the machine credential never reaches the browser. */
export async function facturxRoute(request:Request,env:Environment,headers:Headers,reply:Reply):Promise<Response>{
  const session=await sessionIdentity(request,env);
  if(!session)return reply(401,{error:'Connexion requise.'});
  if(!hasAccess(session,'facturier'))return reply(403,{error:'Votre compte n’a pas accès au Facturier.'});
  const input=new URL(request.url),path=input.pathname.slice('/api/v1/facturx'.length),route=routes[path];
  if(!route)return reply(404,{error:'Opération documentaire non autorisée.'});
  if(request.method!==route.method)return reply(405,{error:'Méthode non autorisée.'});
  // Only these two documented query parameters can reach the converter.
  const entries=[...input.searchParams];
  if(entries.length>1||entries.some(([name,value])=>!(path==='/invoices/preview-pdf'&&name==='page'&&/^\d{1,4}$/.test(value)||path==='/facturx/generate'&&name==='output'&&['json','pdf','zip','stream'].includes(value))))return reply(400,{error:'Paramètre documentaire invalide.'});
  const base=env.BILLING_PDF_SERVICE_URL,key=env.BILLING_PDF_SERVICE_KEY;
  let target:URL;
  try{
    if(typeof base!=='string'||typeof key!=='string'||key.length<32)throw new Error();
    target=new URL(base);
    if(target.protocol!=='https:'||target.username||target.password||target.search||target.hash||target.pathname!=='/')throw new Error();
  }catch{return reply(503,{error:'Le moteur documentaire est indisponible.'});}
  target.pathname='/api'+path;target.search=input.search;
  const upstreamHeaders=new Headers({'X-API-Key':key as string});
  let body:Uint8Array|undefined;
  if(route.method==='POST'){
    const type=request.headers.get('content-type')||'';
    if(!type.toLowerCase().startsWith(route.type!+';')&&type.toLowerCase()!==route.type)return reply(415,{error:'Format documentaire invalide.'});
    const declared=request.headers.get('content-length');
    if(declared&&(!/^\d+$/.test(declared)||Number(declared)>route.maximum!))return reply(413,{error:'Fichier ou données trop volumineux.'});
    body=await boundedBody(request,route.maximum);
    upstreamHeaders.set('Content-Type',type);
  }
  let response:Response;
  try{response=await fetch(target,{method:route.method,headers:upstreamHeaders,...(body?{body:body as BodyInit}:{}),redirect:'manual',signal:AbortSignal.timeout(240000)});}
  catch{return reply(503,{error:'Le moteur documentaire n’a pas répondu. Réessayez.'});}
  if(response.status>=300&&response.status<400){await response.body?.cancel();return reply(502,{error:'Réponse du moteur documentaire invalide.'});}
  // Do not forward Set-Cookie, authentication, redirects, CORS or any upstream secrets.
  const safe=new Headers(headers);
  for(const name of ['Content-Type','Content-Disposition','X-Accel-Buffering']){const value=response.headers.get(name);if(value)safe.set(name,value);}
  safe.set('Cache-Control','no-store, no-transform');
  const maximum=64*1024*1024;
  if(Number(response.headers.get('content-length')||0)>maximum){await response.body?.cancel();return reply(502,{error:'Réponse documentaire trop volumineuse.'});}
  let size=0;
  const stream=response.body?.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){size+=chunk.byteLength;if(size>maximum)throw new Error('Réponse documentaire trop volumineuse.');controller.enqueue(chunk);}}))||null;
  return new Response(stream,{status:response.status,headers:safe});
}
