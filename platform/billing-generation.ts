import {Buffer} from 'node:buffer';
import {createHash,randomUUID} from 'node:crypto';
import type {Database,Environment,Reply} from './contracts';
import type {BillingDraft} from './billing-contracts';
import {calculateBilling} from './billing-domain';
import {boundedBody} from './portal';
import {billingCanonicalJSON,readIssuance,readIssuanceJob,claimIssuanceJob,failIssuanceJob,completeIssuanceJob} from './billing-issuance';
import type {Issuance,IssuanceManifest,IssuanceArtifact} from './billing-issuance';

const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
const digest=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).sort().join()===keys.sort().join();
interface PrivateObject {size:number;body:ReadableStream<Uint8Array<ArrayBuffer>>;httpMetadata?:{contentType?:string};}
interface PrivateBucket {get(key:string):Promise<PrivateObject|null>;put(key:string,value:Uint8Array,options:unknown):Promise<unknown>;}
function bucketFor(env:Environment):PrivateBucket{
 const bucket=env.CET_FILES as Partial<PrivateBucket>|undefined;
 if(!bucket||typeof bucket.get!=='function'||typeof bucket.put!=='function')return fail(503,'L’archivage privé doit être configuré avant la finalisation.');
 return bucket as PrivateBucket;
}
function serviceConfig(env:Environment){
 const base=env.BILLING_PDF_SERVICE_URL,key=env.BILLING_PDF_SERVICE_KEY;
 if(typeof base!=='string'||typeof key!=='string'||key.length<32)return fail(503,'Le moteur documentaire doit être configuré avant la finalisation.');
 try{const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw new Error();return {url,key};}
 catch{return fail(503,'L’adresse du moteur documentaire est invalide.');}
}
async function service(env:Environment,path:string,payload:unknown,timeout:number,maximum:number):Promise<Record<string,any>>{
 const {url,key}=serviceConfig(env);url.pathname=path;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(url,{method:'POST',redirect:'manual',signal:controller.signal,headers:{'Content-Type':'application/json','X-API-Key':key},body:JSON.stringify(payload)});
  if(!response.ok){
   if(response.status===422){
    const bytes=await boundedBody(response,30000);let message='Les données ne passent pas les contrôles du moteur documentaire.';
    try{const detail=JSON.parse(new TextDecoder().decode(bytes)).detail;if(typeof detail==='string')message=detail.slice(0,1500);else if(object(detail)&&typeof detail.message==='string')message=detail.message.slice(0,1500);}catch{}
    return fail(422,message);
   }
   return fail(503,'Le moteur documentaire est indisponible. La tentative peut être reprise.');
  }
  if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))return fail(502,'Réponse du moteur documentaire invalide.');
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(response,maximum)));
  if(!object(data))return fail(502,'Réponse du moteur documentaire invalide.');return data;
 }catch(error){if(error&&typeof error==='object'&&'status' in error)throw error;return fail(503,'Le moteur documentaire n’a pas répondu. Reprenez la tentative pour vérifier son résultat.');}
 finally{clearTimeout(timer);}
}

/** No number is reserved if configuration, rendering, identifiers or XML preflight fail. */
export async function preflightIssuance(env:Environment,data:BillingDraft):Promise<void>{
 bucketFor(env);serviceConfig(env);
 const result=await service(env,'/api/billing/preflight',{document:data},45000,30000);
 const hash=digest(billingCanonicalJSON({schemaVersion:1,document:data,totals:calculateBilling(data)}));
 const checks=data.kind==='invoice'?['render','amounts','xsd','schematron','france']:['render','amounts'];
 if(result.valid!==true||result.snapshotSha256!==hash||!object(result.checks)||checks.some(key=>result.checks[key]!==true))return fail(502,'Le contrôle préalable ne correspond pas au document ou reste incomplet.');
}

function decodeArtifacts(result:Record<string,any>,issuance:Issuance):{manifest:IssuanceManifest;files:{metadata:IssuanceArtifact;bytes:Uint8Array}[]}{
 if(!exactKeys(result,['schemaVersion','envelopeSha256','generatorVersion','profile','artifacts'])||result.schemaVersion!==1||result.envelopeSha256!==issuance.envelopeSha256||
  typeof result.generatorVersion!=='string'||!/^[-A-Za-z0-9._+]{1,100}$/.test(result.generatorVersion)||
  result.profile!==(issuance.snapshot.kind==='quote'?'quote-pdf':'en16931')||!Array.isArray(result.artifacts))return fail(502,'Les fichiers retournés ne correspondent pas à la réservation.');
 const kinds=issuance.snapshot.kind==='quote'?['pdf']:['pdf','xml','validation','verapdf'];
 if(result.artifacts.length!==kinds.length||result.artifacts.some((a:unknown)=>!object(a))||result.artifacts.map((a:any)=>a.kind).sort().join()!==kinds.sort().join())return fail(502,'Le moteur n’a pas fourni tous les fichiers et rapports requis.');
 const files=result.artifacts.map((a:Record<string,any>)=>{
  const mime=({pdf:'application/pdf',xml:'application/xml',validation:'application/json',verapdf:'application/xml'} as Record<string,string>)[a.kind];
  if(!exactKeys(a,['kind','sha256','size','contentType','base64'])||typeof a.sha256!=='string'||!/^[a-f0-9]{64}$/.test(a.sha256)||!Number.isSafeInteger(a.size)||a.size<1||a.size>20*1024*1024||a.contentType!==mime||typeof a.base64!=='string'||a.base64.length!==4*Math.ceil(a.size/3))return fail(502,'Fichier produit invalide.');
  const bytes=Buffer.from(a.base64,'base64');
  if(bytes.length!==a.size||bytes.toString('base64')!==a.base64||digest(bytes)!==a.sha256||(a.kind==='pdf'&&bytes.subarray(0,5).toString()!=='%PDF-'))return fail(502,'L’empreinte ou le contenu d’un fichier produit est invalide.');
  const metadata:IssuanceArtifact={kind:a.kind,key:`billing/${issuance.id}/${a.kind}/${a.sha256}`,sha256:a.sha256,size:a.size,contentType:a.contentType};
  return {metadata,bytes};
 });
 if(issuance.snapshot.kind==='invoice'){
  const read=(kind:string)=>files.find(f=>f.metadata.kind===kind)!;
  let report;try{report=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(read('validation').bytes));}catch{return fail(502,'Rapport de validation illisible.');}
  if(!object(report)||report.valid!==true||report.profile!=='en16931'||report.envelope_sha256!==issuance.envelopeSha256||report.pdf_sha256!==read('pdf').metadata.sha256||report.xml_sha256!==read('xml').metadata.sha256||
   !object(report.checks)||['structured_source','amounts','xsd','schematron','france','embedding','pdfa_3b'].some(key=>report.checks[key]!==true)||report.pdf_differences_acknowledged!==false)return fail(502,'Le rapport ne valide pas les fichiers de cette facture.');
 }
 return {manifest:{schemaVersion:1,envelopeSha256:issuance.envelopeSha256,generatorVersion:result.generatorVersion,profile:result.profile,artifacts:files.map(f=>f.metadata)},files};
}

async function readVerified(bucket:PrivateBucket,metadata:IssuanceArtifact):Promise<Uint8Array>{
 const stored=await bucket.get(metadata.key);
 if(!stored||stored.size!==metadata.size||stored.httpMetadata?.contentType!==metadata.contentType)return fail(503,'Un fichier archivé est absent ou incomplet.');
 const bytes=await boundedBody(stored,20*1024*1024);
 if(bytes.length!==metadata.size||digest(bytes)!==metadata.sha256)return fail(503,'L’intégrité du fichier archivé ne peut pas être confirmée.');
 return bytes;
}

export async function generateIssuance(db:Database,env:Environment,issuanceId:string,user:string):Promise<void>{
 const issuance=await readIssuance(db,issuanceId);if(!issuance)return fail(404,'Émission introuvable.');
 const existing=await readIssuanceJob(db,issuanceId);if(existing?.state==='ready')return;
 const bucket=bucketFor(env);serviceConfig(env);
 const token=randomUUID(),claim=await claimIssuanceJob(db,issuanceId,token,user,Date.now(),240000);
 if(!claim)return;
 let stage:'render'|'validation'|'storage'|'unavailable'='render';
 try{
  const result=await service(env,'/api/billing/generate-issued',{
   schemaVersion:1,id:issuance.id,documentId:issuance.documentId,documentVersion:issuance.documentVersion,issuerSiren:issuance.issuerSiren,
   number:issuance.number,document:issuance.snapshot,snapshotSha256:issuance.snapshotSha256,envelopeSha256:issuance.envelopeSha256
  },180000,32*1024*1024);
  stage='validation';const {manifest,files}=decodeArtifacts(result,issuance);
  stage='storage';
  for(const {metadata,bytes} of files){
   await bucket.put(metadata.key,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:metadata.contentType},customMetadata:{issuance:issuance.id,sha256:metadata.sha256}});
   await readVerified(bucket,metadata);
  }
  // If another worker took over after expiration, our files remain unreferenced and cannot be downloaded.
  await completeIssuanceJob(db,issuance.id,token,manifest,user);
 }catch(error){
  const status=(error as {status?:number})?.status;
  await failIssuanceJob(db,issuance.id,token,status===422?'validation':status===503&&stage==='render'?'unavailable':stage,user);
 }
}

export async function issuedFile(db:Database,env:Environment,issuanceId:string,kind:string,reply:Reply):Promise<Response>{
 const issuance=await readIssuance(db,issuanceId),job=await readIssuanceJob(db,issuanceId);
 if(!issuance||job?.state!=='ready'||!job.manifest_json)return fail(409,'Les fichiers de ce document ne sont pas encore disponibles.');
 const manifest=JSON.parse(job.manifest_json) as IssuanceManifest,metadata=manifest.artifacts.find(a=>a.kind===kind);
 if(!metadata)return fail(404,'Ce fichier n’existe pas pour ce document.');
 if(manifest.envelopeSha256!==issuance.envelopeSha256||metadata.key!==`billing/${issuance.id}/${metadata.kind}/${metadata.sha256}`)return fail(503,'La référence du fichier est incohérente.');
 const bytes=await readVerified(bucketFor(env),metadata),headers=new Headers(reply(200,{}).headers);
 const extension=kind==='pdf'?'pdf':kind==='validation'?'json':'xml',safe=issuance.number.replace(/[^A-Za-z0-9_-]/g,'-');
 headers.set('Content-Type',metadata.contentType);headers.set('Content-Disposition',`attachment; filename="${safe}-${kind}.${extension}"`);
 headers.set('Cache-Control','no-store');headers.set('Content-Security-Policy',"sandbox; default-src 'none'");headers.set('X-Content-Type-Options','nosniff');
 return new Response(new Uint8Array(bytes),{status:200,headers});
}
