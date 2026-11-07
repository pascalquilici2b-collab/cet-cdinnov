import {Buffer} from 'node:buffer';
import type {Database,Environment,Reply} from './contracts';
import {sessionIdentity,hasAccess} from './identity';
import {boundedBody} from './portal';
import {DAILY_BUDGET} from '../marches/ai-domain.mjs';
import {OCR_MODELS,OCR_DEFAULT_MODEL,OCR_LIMITS,buildOCRInput,ocrReservation,decodeOCRResult} from './document-ocr-domain.mjs';

interface OCRPage {image:string;page:number;width:number;height:number;embeddedText:string;}
export interface OCRPageResult {text:string;complete:boolean;warnings:string[];model:string;}
type OCRReply={status:number;body:OCRPageResult|{error:string}};
const bodyMaximum=Math.ceil(OCR_LIMITS.imageBytes/3)*4+50000;
const fail=(status:number,error:string):never=>{throw Object.assign(Error(error),{status});};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

/** Inspect file headers; caller-supplied dimensions cannot bypass image/token limits. */
function dimensions(bytes:Buffer,mime:string):{width:number;height:number}|null{
 if(mime==='png'){
  if(bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(8)!==13||bytes.subarray(12,16).toString()!=='IHDR')return null;
  return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
 }
 if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return null;
 let offset=2;
 while(offset+4<=bytes.length){
  if(bytes[offset++]!==0xff)return null;
  while(offset<bytes.length&&bytes[offset]===0xff)offset++;
  const marker=bytes[offset++];
  if(marker===0xd9||marker===0xda)return null;
  if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  if(offset+2>bytes.length)return null;
  const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)return null;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
   if(length<8)return null;
   return {width:bytes.readUInt16BE(offset+5),height:bytes.readUInt16BE(offset+3)};
  }
  offset+=length;
 }
 return null;
}

function validatePage(value:unknown):OCRPage{
 if(!object(value)||Object.keys(value).some(k=>!['image','page','width','height','embeddedText'].includes(k))||typeof value.image!=='string'||!Number.isInteger(value.page)||Number(value.page)<1||Number(value.page)>OCR_LIMITS.pages||!Number.isInteger(value.width)||!Number.isInteger(value.height)||Number(value.width)<1||Number(value.height)<1||Number(value.width)>OCR_LIMITS.side||Number(value.height)>OCR_LIMITS.side||Number(value.width)*Number(value.height)>OCR_LIMITS.pixels||typeof value.embeddedText!=='string'||value.embeddedText.length>OCR_LIMITS.embeddedText)return fail(422,'Page documentaire invalide ou trop volumineuse.');
 const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value.image);
 if(!match||match[2].length%4||match[2].length>Math.ceil(OCR_LIMITS.imageBytes/3)*4)return fail(422,'Choisissez une image JPEG ou PNG de 3 Mo maximum.');
 const bytes=Buffer.from(match[2],'base64');
 if(bytes.length>OCR_LIMITS.imageBytes||bytes.toString('base64')!==match[2])return fail(422,'Image documentaire invalide.');
 const actual=dimensions(bytes,match[1]);
 if(!actual||actual.width!==value.width||actual.height!==value.height)return fail(422,'Les dimensions de l’image documentaire sont invalides.');
 return value as unknown as OCRPage;
}

/** Shared by the browser route and authenticated server-side PDF orchestration.
 * No image/transcript cache, persistence, public fetch, or content logging.
 * All OCR and business AI calls share market_ai_daily's atomic reservation.
 */
export async function transcribeDocumentPage(db:Database,env:Environment,value:unknown,timeoutMs=90000):Promise<OCRReply>{
 const model=env.DOCUMENT_OCR_MODEL??OCR_DEFAULT_MODEL;
 if(typeof model!=='string'||!Object.hasOwn(OCR_MODELS,model)||!env.MARKETS_AI)return {status:503,body:{error:'La lecture visuelle n’est pas activée. La lecture locale reste disponible.'}};
 let page:OCRPage;
 try{page=validatePage(value);}catch(error){return {status:(error as {status?:number}).status||422,body:{error:(error as Error).message}};}
 const input=buildOCRInput(page.image,page.embeddedText),reserve=ocrReservation(model,input),day=new Date().toISOString().slice(0,10);
 if(reserve>DAILY_BUDGET)return {status:503,body:{error:'Ce moteur de lecture dépasse la réserve quotidienne autorisée. La lecture locale reste disponible.'}};
 // The INSERT guard covers the first request of the UTC day as well as updates.
 const budget=await db.prepare('INSERT INTO market_ai_daily(day,reserved) SELECT ?,? WHERE ?<=? ON CONFLICT(day) DO UPDATE SET reserved=reserved+excluded.reserved WHERE reserved+excluded.reserved<=? RETURNING reserved').bind(day,reserve,reserve,DAILY_BUDGET,DAILY_BUDGET).first();
 if(!budget)return {status:429,body:{error:'Quota quotidien IA atteint. La lecture locale et la saisie manuelle restent disponibles.'}};
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const ai=env.MARKETS_AI as {run(model:string,input:unknown):Promise<unknown>};
  // Server orchestration may shorten a page's deadline. This parameter is never
  // taken from the browser JSON and can neither remove nor extend the ceiling.
  const deadline=Number.isFinite(timeoutMs)?Math.min(90000,Math.max(1000,Math.floor(timeoutMs))):90000;
  const output=await Promise.race([ai.run(model,input),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),deadline);})]);
  // Provider-reported consumption alone permits refunding. Errors/timeouts keep
  // their reservation, since an abandoned provider call can still be charged.
  const used=(output as {usage?:{neurons?:unknown}})?.usage?.neurons;
  if(typeof used==='number'&&Number.isFinite(used)&&used>=0){
   const difference=Math.ceil(used*1.2)-reserve;
   if(difference)await db.prepare('UPDATE market_ai_daily SET reserved=MAX(0,reserved+?) WHERE day=?').bind(difference,day).run();
  }
  return {status:200,body:{...decodeOCRResult(output),model}};
 }catch{return {status:503,body:{error:'La lecture visuelle n’a pas abouti. Réessayez ou utilisez la lecture locale.'}};}
 finally{clearTimeout(timer);}
}

export async function documentOCRRoute(request:Request,env:Environment,reply:Reply):Promise<Response>{
 const session=await sessionIdentity(request,env);
 if(!session)return reply(401,{error:'Connexion requise.'});
 if(!hasAccess(session,'facturier')&&!hasAccess(session,'tamponnage'))return reply(403,{error:'Votre compte n’a pas accès à la lecture documentaire.'});
 if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
 if(new URL(request.url).search)return reply(400,{error:'Paramètre documentaire invalide.'});
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return reply(415,{error:'Format JSON requis.'});
 let value:unknown;
 try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request,bodyMaximum)));}
 catch(error){return reply((error as {status?:number}).status||400,{error:'Page documentaire invalide ou trop volumineuse.'});}
 const result=await transcribeDocumentPage(env.BUDGETS_DB.withSession('first-primary'),env,value);
 return reply(result.status,result.body);
}
