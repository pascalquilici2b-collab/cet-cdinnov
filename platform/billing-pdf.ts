import type {Environment,Reply} from './contracts';
import type {BillingDocument} from './billing-contracts';
import {boundedBody} from './portal';

const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
/** A draft PDF is rendered from a saved, version-checked snapshot and is never numbered or issued. */
export async function draftPDF(document:Pick<BillingDocument,'id'|'version'|'data'|'reservedNumber'>,env:Environment,reply:Reply,editable=false):Promise<Response>{
  const base=env.BILLING_PDF_SERVICE_URL,key=env.BILLING_PDF_SERVICE_KEY;
  if(typeof base!=='string'||typeof key!=='string'||key.length<32)return fail(503,'La génération PDF doit être configurée par l’administrateur. Votre brouillon est conservé.');
  let url:URL;
  try{url=new URL(base);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw new Error();}
  catch{return fail(503,'L’adresse du service PDF est invalide.');}
  url.pathname='/api/billing/preview-pdf';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),75000);
  try{
    // Workers support manual/follow redirect modes. Inspect redirects without forwarding the service key.
    const response=await fetch(url,{method:'POST',redirect:'manual',signal:controller.signal,headers:{'Content-Type':'application/json','X-API-Key':key},body:JSON.stringify({document:document.data,...(document.reservedNumber?{number:document.reservedNumber.number}:{}),...(editable?{editable:true}:{})})});
    if(!response.ok){
      if(response.status===422){
        // Only relay fixed, actionable layout errors, never arbitrary upstream output.
        const additionErrors=['Un ajout est rattaché à une page supprimée. Déplacez-le ou supprimez-le dans la barre d’édition.','Le texte dépasse son encart. Agrandissez l’encart ou réduisez la taille du texte.'];
        try{const payload=JSON.parse(new TextDecoder().decode(await boundedBody(response,4096)));if(additionErrors.includes(payload.detail))return fail(422,payload.detail);}catch(error){if(error&&typeof error==='object'&&'status' in error&&error.status===422)throw error;}
        return fail(422,'Le PDF ne peut pas être généré avec ce contenu. Vérifiez les champs et les caractères du brouillon.');
      }
      return fail(503,'Le service PDF est momentanément indisponible. Votre brouillon est conservé.');
    }
    if(!/^application\/pdf(?:\s*;|$)/i.test(response.headers.get('content-type')||''))return fail(502,'Le service n’a pas retourné un PDF valide.');
    const bytes=await boundedBody(response,20*1024*1024);
    if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')return fail(502,'Le service n’a pas retourné un PDF valide.');
    const headers=new Headers(reply(200,{}).headers);
    headers.set('Content-Type','application/pdf');headers.set('Content-Disposition',`attachment; filename="${document.data.kind==='quote'?'devis':'facture'}-brouillon-${document.id}-v${document.version}.pdf"`);
    headers.set('X-Content-Type-Options','nosniff');headers.set('Cache-Control','no-store');
    return new Response(new Uint8Array(bytes),{status:200,headers});
  }catch(e){if(e&&typeof e==='object'&&'status' in e)throw e;return fail(503,'Le service PDF ne répond pas. Votre brouillon est conservé.');}
  finally{clearTimeout(timer);}
}
