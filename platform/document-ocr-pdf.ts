import type {Database,Environment} from './contracts';
import {transcribeDocumentPage} from './document-ocr';
import {OCR_DEFAULT_MODEL} from './document-ocr-domain.mjs';

export interface PreparedOCRPage {
 source_sha256:string;page:number;pages:number;image:string;width:number;height:number;nativeText:string;needsOCR:boolean;
}
export interface SuppliedOCRPage {
 source_sha256:string;page:number;text:string;complete:boolean;warnings:string[];model:string;
}
export interface PDFOCRResult {pages:SuppliedOCRPage[];complete:boolean;warnings:string[];inspected:number;}
export const pdfVisionEnabled=(env:Environment)=>env.DOCUMENT_OCR_PDF_BRIDGE==='v1'&&!!env.MARKETS_AI;

/** Only machine-authenticated image renderers call this adapter. Browser text
 * never becomes an attested reading. Page/source checks precede each AI call.
 * Sequential pages keep memory and the shared daily reservation bounded.
 */
export async function collectPDFOCR(db:Database,env:Environment,sourceHash:string,
 prepare:(page:number,signal:AbortSignal)=>Promise<PreparedOCRPage>,options:{maximumPages?:number;deadlineMs?:number;visionPages?:number}={}):Promise<PDFOCRResult>{
 if(!/^[a-f0-9]{64}$/.test(sourceHash))throw Error('Invalid documentary source hash');
 const maximum=Math.min(150,Math.max(1,options.maximumPages??100));
 const deadline=Date.now()+Math.min(180000,Math.max(1000,options.deadlineMs??150000));
 const limit=Math.min(30,Math.max(1,options.visionPages??12));
 const result:PDFOCRResult={pages:[],complete:true,warnings:[],inspected:0};
 let total=1;
 const incomplete=(page:number,message:string)=>{
  result.complete=false;result.warnings.push(message);
  result.pages.push({page,source_sha256:sourceHash,text:'[illisible]',complete:false,warnings:[message],model:OCR_DEFAULT_MODEL});
 };
 for(let page=0;page<total;page++){
  if(Date.now()+1000>=deadline){incomplete(page,'La lecture visuelle de ce PDF n’a pas couvert toutes les pages dans le délai autorisé.');break;}
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  let packet:PreparedOCRPage;
  try{
   packet=await Promise.race([prepare(page,controller.signal),new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(Error('Page rendering timeout'));},Math.min(40000,Math.max(1,deadline-Date.now())));
   })]);
  }catch{incomplete(page,'La préparation visuelle de cette page n’a pas abouti. Vérifiez le PDF manuellement.');break;}
  finally{clearTimeout(timer);}
  if(packet.source_sha256!==sourceHash||packet.page!==page||!Number.isInteger(packet.pages)||packet.pages<1||packet.pages>maximum||page&&packet.pages!==total||typeof packet.needsOCR!=='boolean'||typeof packet.nativeText!=='string')throw Error('Invalid documentary page binding');
  total=packet.pages;result.inspected++;
  if(!packet.needsOCR)continue;
  if(result.pages.length>=limit){incomplete(page,'Ce PDF comporte trop de pages à lire visuellement en une seule opération. Vérifiez les pages restantes ou découpez le document.');break;}
  if(Date.now()+1000>=deadline){incomplete(page,'Le délai de lecture visuelle est atteint. Vérifiez les pages restantes manuellement.');break;}
  const response=await transcribeDocumentPage(db,env,{image:packet.image,page:page+1,width:packet.width,height:packet.height,embeddedText:packet.nativeText},Math.min(60000,deadline-Date.now()));
  if(response.status!==200||!('text' in response.body)){
   incomplete(page,'La lecture visuelle de cette page n’a pas abouti. '+('error' in response.body?response.body.error:''));break;
  }
  const read=response.body;
  if(new TextEncoder().encode(read.text).byteLength>60000){incomplete(page,'La transcription de cette page est trop volumineuse. Vérifiez le document manuellement.');break;}
  const warnings=read.warnings.slice(0,9).map(w=>w.slice(0,300));
  if(read.warnings.length>9)warnings.push('D’autres points de lecture demandent une vérification de l’original.');
  result.pages.push({page,source_sha256:sourceHash,text:read.text,complete:read.complete,warnings,model:read.model});
  result.complete&&=read.complete;
 }
 return result;
}
