// The public app and its API share an origin. No client credential is ever
// forwarded to a third-party origin; CET_API is an account-local service binding.
import {contentSecurityPolicy} from './security-policy.mjs';
const apiPath=path=>/^\/(?:api\/v1(?:\/|$)|budgets(?:\/|$)|sheets(?:\/|$)|files(?:\/|$)|notify$)/.test(path);
export function protect(response,html=false){
  const headers=new Headers(response.headers);
  headers.set('Strict-Transport-Security','max-age=31536000');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('X-Frame-Options','SAMEORIGIN');
  headers.set('Referrer-Policy','no-referrer');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  if(html)headers.set('Content-Security-Policy',contentSecurityPolicy+"; frame-ancestors 'self'");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(apiPath(url.pathname)){
    if(!env.CET_API)return protect(new Response(JSON.stringify({error:'Service momentanément indisponible.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));
    return protect(await env.CET_API.fetch(request));
  }
  if(!['GET','HEAD'].includes(request.method))return protect(new Response('Méthode non autorisée.',{status:405}));
  const headers=new Headers(request.headers);
  headers.delete('Cookie');headers.delete('Authorization');
  const response=await env.ASSETS.fetch(new Request(request,{headers}));
  const secured=protect(response,(response.headers.get('Content-Type')||'').includes('text/html'));
  secured.headers.set('Cache-Control','no-cache');
  return secured;
}};
