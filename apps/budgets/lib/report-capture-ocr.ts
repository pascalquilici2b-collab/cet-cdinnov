import { captureLayout, combineCaptureColumns, ocrWords, ocrLines, type CaptureReading, type OcrPage } from "./report-capture-parser";

type OcrWorker={setParameters:(params:Record<string,string>)=>Promise<unknown>;recognize:(image:HTMLCanvasElement,options:Record<string,never>,output:{text:boolean;blocks:boolean})=>Promise<{data:OcrPage}>;terminate:()=>Promise<unknown>};
type OcrModule={createWorker:(language:string,mode:number,options:{workerPath:string;corePath:string;langPath:string;cachePath:string;logger:(message:{status:string;progress:number})=>void})=>Promise<OcrWorker>};
const canvasFor=(image:ImageBitmap,rect:{left:number;top:number;width:number;height:number},scale:number)=>{
  const canvas=document.createElement("canvas");canvas.width=Math.round(rect.width*scale);canvas.height=Math.round(rect.height*scale);
  const context=canvas.getContext("2d");if(!context)throw new Error("La lecture d’images n’est pas disponible dans ce navigateur.");
  context.fillStyle="white";context.fillRect(0,0,canvas.width,canvas.height);context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";context.drawImage(image,rect.left,rect.top,rect.width,rect.height,0,0,canvas.width,canvas.height);return canvas;
};

export async function readReportCapture(file:File,progress:(message:string)=>void,signal:AbortSignal):Promise<CaptureReading>{
  if(!/\.(png|jpe?g|webp)$/i.test(file.name)||file.size>8*1024*1024)throw new Error("Choisissez une capture PNG, JPEG ou WebP de moins de 8 Mo.");
  let worker:OcrWorker|undefined,image:ImageBitmap|undefined;
  const controller=new AbortController();const abort=()=>controller.abort();signal.addEventListener("abort",abort,{once:true});
  const timeout=setTimeout(abort,120000);let rejectAbort:(reason:Error)=>void=()=>{};
  const stopped=new Promise<never>((_,reject)=>{rejectAbort=reject});
  const onAbort=()=>{rejectAbort(new Error(signal.aborted?"Lecture annulée.":"La lecture a pris trop de temps. Essayez une capture plus petite, avec le texte agrandi."));void worker?.terminate()};
  controller.signal.addEventListener("abort",onAbort,{once:true});
  if(signal.aborted)abort();
  async function run(){
    image=await createImageBitmap(file);
    if(image.width*image.height>24000000||image.width<200||image.height<100)throw new Error("La taille de cette capture ne permet pas une lecture fiable. Capturez la liste des dépenses avec ses en-têtes.");
    const base=new URL("ocr/v7/",document.baseURI).href;
    const {default:engine}=await import(/* @vite-ignore */ `${base}tesseract.esm.min.js`) as {default:OcrModule};
    let stage="Préparation de la lecture";
    worker=await engine.createWorker("fra",1,{workerPath:`${base}worker.min.js`,corePath:base,langPath:base,cachePath:"cdinnov-captures-fr-v7",logger:m=>progress(`${stage} · ${Math.round(m.progress*100)} %`)});
    if(controller.signal.aborted){await worker.terminate();throw new Error("Lecture annulée.")}
    stage="Repérage des colonnes";
    await worker.setParameters({tessedit_pageseg_mode:"11",user_defined_dpi:"300"});
    const scale=Math.max(1,Math.min(3,6500/image.width,Math.sqrt(15000000/(image.width*image.height))));
    const full=canvasFor(image,{left:0,top:0,width:image.width,height:image.height},scale);
    const {data:layoutData}=await worker.recognize(full,{}, {text:true,blocks:true});full.width=1;full.height=1;
    let layout:ReturnType<typeof captureLayout>;
    try{layout=captureLayout(layoutData,scale,image.width,image.height)}catch(error){
      // A second pass enlarges only the header strip when small grey text was missed.
      const heading=ocrWords(layoutData).find(w=>/^(description|descrizione)$/i.test(w.text.trim()));
      if(!heading)throw error;
      const h=(heading.bbox.y1-heading.bbox.y0)/scale,top=Math.max(0,heading.bbox.y0/scale-h*.5);
      const headerScale=Math.min(5,10000/image.width);
      const header=canvasFor(image,{left:0,top,width:image.width,height:Math.min(h*2.5,image.height-top)},headerScale);
      await worker.setParameters({tessedit_pageseg_mode:"6"});
      const {data}=await worker.recognize(header,{}, {text:true,blocks:true});header.width=1;header.height=1;
      const rebase=(page:OcrPage,s:number,offset:number)=>ocrLines(page).map(l=>{const box=(b:typeof l.bbox)=>({x0:b.x0/s,x1:b.x1/s,y0:b.y0/s+offset,y1:b.y1/s+offset});return {...l,bbox:box(l.bbox),words:l.words.map(w=>({...w,bbox:box(w.bbox)}))}});
      const combined:OcrPage={text:layoutData.text,blocks:[{paragraphs:[{lines:[...rebase(layoutData,scale,0),...rebase(data,headerScale,top)]}]}]};
      layout=captureLayout(combined,1,image.width,image.height);
    }
    stage="Lecture des identifiants";
    await worker.setParameters({tessedit_pageseg_mode:"6",tessedit_char_whitelist:"Rr0123456789."});
    const columnScale=Math.min(5,Math.sqrt(14000000/(layout.descriptions.width*layout.descriptions.height)));
    const idsCanvas=canvasFor(image,layout.ids,columnScale);const {data:ids}=await worker.recognize(idsCanvas,{}, {text:true,blocks:true});idsCanvas.width=1;idsCanvas.height=1;
    stage="Lecture des descriptions françaises";
    await worker.setParameters({tessedit_char_whitelist:""});
    const descriptionsCanvas=canvasFor(image,layout.descriptions,columnScale);const {data:descriptions}=await worker.recognize(descriptionsCanvas,{}, {text:true,blocks:true});descriptionsCanvas.width=1;descriptionsCanvas.height=1;
    const rows=combineCaptureColumns(ids,descriptions,layout.reportNumber);
    if(!rows.length)throw new Error("Aucun libellé exploitable trouvé. Agrandissez le texte dans JEMS et incluez les colonnes ID, Description et Commentaire.");
    if(rows.length>250)throw new Error("Séparez cette liste en plusieurs captures de moins de 250 dépenses.");
    const warnings=["Vérifiez les identifiants et corrigez les libellés reconnus avant de les enregistrer."];
    if(!layout.reportNumber||!layout.partnerId)warnings.push("Le rapport ou le partenaire n’est pas entièrement lisible dans l’image. Confirmez le projet et le rapport ci-dessous.");
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer())),b=>b.toString(16).padStart(2,"0")).join("");
    return {file:file.name,hash,reportNumber:layout.reportNumber,partnerId:layout.partnerId,rows,warnings};
  }
  try{return await Promise.race([run(),stopped])}finally{clearTimeout(timeout);signal.removeEventListener("abort",abort);controller.signal.removeEventListener("abort",onAbort);image?.close();if(worker)await worker.terminate().catch(()=>{})}
}
