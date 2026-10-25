// Render locally: opening a piece must not occupy a PDF-engine worker or rerun OCR.
export async function stampPDFPage(blob:Blob,index:number,signal:AbortSignal){
 const url=new URL('/marches/vendor/pdf.mjs',location.origin).href,engine=await import(/* @vite-ignore */url);
 engine.GlobalWorkerOptions.workerSrc=new URL('/marches/vendor/pdf.worker.mjs',location.origin).href;
 const bytes=await blob.arrayBuffer();signal.throwIfAborted();
 const task=engine.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useWorkerFetch:false,isOffscreenCanvasSupported:false,stopAtErrors:true});
 const cancel=()=>void task.destroy().catch(()=>{});signal.addEventListener('abort',cancel,{once:true});
 try{const pdf=await task.promise;signal.throwIfAborted();const page=await pdf.getPage(Math.min(index+1,pdf.numPages)),viewport=page.getViewport({scale:1.4});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport,annotationMode:1}).promise;signal.throwIfAborted();const image=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Aperçu indisponible.')),'image/png'));return {image,pages:pdf.numPages};}
 finally{signal.removeEventListener('abort',cancel);await task.destroy();}
}
