import {useEffect,useRef,useState} from 'react';
import './rh-pdf-preview.css';

type Viewport={width:number;height:number};
type RenderTask={promise:Promise<void>;cancel:()=>void};
type PDFPage={getViewport:(options:{scale:number})=>Viewport;render:(options:Record<string,unknown>)=>RenderTask;getTextContent:()=>Promise<{items:{str?:string;hasEOL?:boolean}[]}>};
type PDFDocument={numPages:number;getPage:(number:number)=>Promise<PDFPage>};
type PDFTask={promise:Promise<PDFDocument>;destroy:()=>Promise<void>};
type PDFEngine={GlobalWorkerOptions:{workerSrc:string};getDocument:(options:Record<string,unknown>)=>PDFTask};
let library:Promise<PDFEngine>|undefined;
function pdfEngine(){
 if(!library){const url=new URL('/marches/vendor/pdf.mjs',location.origin).href;library=import(/* @vite-ignore */url).then(engine=>{engine.GlobalWorkerOptions.workerSrc=new URL('/marches/vendor/pdf.worker.mjs',location.origin).href;return engine as PDFEngine;}).catch(error=>{library=undefined;throw error;});}
 return library;
}

/** Read-only local PDF rendering; the original file never leaves this browser. */
export function RhPDFPreview({blob,title='Bulletin original',onReady}:{blob:Blob;title?:string;onReady?:(ready:boolean)=>void}){
 const [pdf,setPDF]=useState<PDFDocument|null>(null),[page,setPage]=useState(1),[zoom,setZoom]=useState(1),[retry,setRetry]=useState(0);
 const [loading,setLoading]=useState(true),[rendering,setRendering]=useState(false),[error,setError]=useState(''),[text,setText]=useState(''),[width,setWidth]=useState(500);
 const viewport=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const element=viewport.current;if(!element)return;const observer=new ResizeObserver(entries=>{const next=Math.floor(entries[0].contentRect.width);if(next>40)setWidth(next);});observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  let active=true,task:PDFTask|undefined;setPDF(null);setLoading(true);setError('');setText('');setPage(1);setZoom(1);
  void(async()=>{
   if(!blob.size||blob.size>15*1024*1024||await blob.slice(0,5).text()!=='%PDF-')throw Error('Ce fichier PDF ne peut pas être affiché (15 Mo maximum).');
   const engine=await pdfEngine(),bytes=new Uint8Array(await blob.arrayBuffer());if(!active)return;
   task=engine.getDocument({data:bytes,isEvalSupported:false,useWorkerFetch:false,isOffscreenCanvasSupported:false,stopAtErrors:true});
   const document=await task.promise;if(!active)return;if(document.numPages<1||document.numPages>500)throw Error('Le document dépasse la capacité de cet aperçu.');
   setPDF(document);setLoading(false);
  })().catch(e=>{if(active){setLoading(false);setError(e instanceof Error?e.message:'Le PDF ne peut pas être affiché.');}});
  return()=>{active=false;void task?.destroy().catch(()=>{});};
 },[blob,retry]);
 useEffect(()=>{
  if(!pdf||loading)return;let active=true,task:RenderTask|undefined;setRendering(true);setText('');setError('');
  void(async()=>{
   const source=await pdf.getPage(page);if(!active)return;const base=source.getViewport({scale:1});
   if(!Number.isFinite(base.width)||!Number.isFinite(base.height)||base.width<=0||base.height<=0)throw Error('Les dimensions de cette page sont invalides.');
   const scale=Math.max(.1,(width-24)/base.width)*zoom,view=source.getViewport({scale});
   const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(16000000/(view.width*view.height)),8192/view.width,8192/view.height);
   const buffer=document.createElement('canvas');buffer.width=Math.max(1,Math.ceil(view.width*ratio));buffer.height=Math.max(1,Math.ceil(view.height*ratio));
   const context=buffer.getContext('2d');if(!context)throw Error('L’aperçu ne peut pas être affiché dans ce navigateur.');
   task=source.render({canvasContext:context,viewport:view,transform:[ratio,0,0,ratio,0,0],annotationMode:0});await task.promise;
   if(!active||!canvas.current)return;const target=canvas.current;target.width=buffer.width;target.height=buffer.height;target.style.width=view.width+'px';target.style.height=view.height+'px';target.getContext('2d')?.drawImage(buffer,0,0);setRendering(false);
   try{const content=await source.getTextContent();if(active)setText(content.items.map(item=>(item.str||'')+(item.hasEOL?'\n':' ')).join('').trim());}catch{if(active)setText('');}
  })().catch(e=>{if(active){setRendering(false);setError(e instanceof Error?e.message:'Cette page ne peut pas être affichée.');}});
  return()=>{active=false;task?.cancel();};
 },[pdf,page,zoom,width,loading]);
 useEffect(()=>{onReady?.(!!pdf&&!loading&&!rendering&&!error);},[pdf,loading,rendering,error,onReady]);
 const turn=(delta:number)=>{setPage(n=>Math.max(1,Math.min(pdf?.numPages||1,n+delta)));viewport.current?.scrollTo({top:0,left:0});};
 return <section className="rh-pdf-viewer" aria-label={title}>
  <div className="rh-pdf-toolbar" role="group" aria-label="Navigation dans le bulletin">
   <div><button type="button" disabled={!pdf||loading||page===1} aria-label="Page précédente" onClick={()=>turn(-1)}>‹</button><span aria-live="polite">{page} / {pdf?.numPages||'…'}</span><button type="button" disabled={!pdf||loading||page===(pdf?.numPages||1)} aria-label="Page suivante" onClick={()=>turn(1)}>›</button></div>
   <div><button type="button" disabled={!pdf||zoom<=.5} aria-label="Réduire le zoom" onClick={()=>setZoom(n=>Math.max(.5,n-.25))}>−</button><button type="button" disabled={!pdf} aria-label="Adapter à la largeur" onClick={()=>setZoom(1)}>{Math.round(zoom*100)} %</button><button type="button" disabled={!pdf||zoom>=2.5} aria-label="Agrandir le zoom" onClick={()=>setZoom(n=>Math.min(2.5,n+.25))}>+</button></div>
  </div>
  <div className="rh-pdf-viewport" ref={viewport} tabIndex={0} aria-label="Bulletin PDF, défilement horizontal et vertical" aria-busy={loading||rendering}>
   {error?<div className="rh-pdf-message" role="alert"><p>{error}</p><button type="button" onClick={()=>setRetry(n=>n+1)}>Réessayer l’aperçu</button></div>:<>{(loading||rendering)&&<p className="rh-pdf-message" role="status">{loading?'Chargement du bulletin…':'Affichage de la page…'}</p>}<canvas ref={canvas} role="img" aria-label={title+' · page '+page} style={{display:!pdf?'none':'block',visibility:rendering?'hidden':'visible'}}/></>}
  </div>
  {pdf&&!error&&!rendering&&<details className="rh-pdf-text"><summary>Texte de la page {page}</summary><div>{text||'Cette page est une image. Consultez le bulletin affiché au-dessus.'}</div></details>}
 </section>;
}
