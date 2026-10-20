import {BrandMark} from './loading';
import {useEffect,useRef,useState} from 'react';
import type {BillingDocument,BillingTransport} from '../billing-contracts';

type Viewport={width:number;height:number};
type RenderTask={promise:Promise<void>;cancel:()=>void};
type PDFPage={getViewport:(options:{scale:number})=>Viewport;render:(options:Record<string,unknown>)=>RenderTask;getTextContent:()=>Promise<{items:{str?:string}[]}>};
type PDFDocument={numPages:number;getPage:(n:number)=>Promise<PDFPage>};
type PDFTask={promise:Promise<PDFDocument>;destroy:()=>Promise<void>};
type PDFEngine={GlobalWorkerOptions:{workerSrc:string};getDocument:(options:Record<string,unknown>)=>PDFTask};
let engine:Promise<PDFEngine>|undefined;
function pdfEngine(){
 // Reuse the locally shipped viewer. No CDN, bearer token in a URL or PDF navigation.
 if(!engine){const url=new URL('/marches/vendor/pdf.mjs',location.origin).href;engine=import(/* @vite-ignore */url).then(module=>{
  module.GlobalWorkerOptions.workerSrc=new URL('/marches/vendor/pdf.worker.mjs',location.origin).href;return module as PDFEngine;
 }).catch(error=>{engine=undefined;throw error;});}
 return engine;
}

export function PDFPreview({record,transport}:{record:BillingDocument;transport:BillingTransport}){
 const [pdf,setPDF]=useState<PDFDocument|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [page,setPage]=useState(1),[zoom,setZoom]=useState(1),[width,setWidth]=useState(600),[rendering,setRendering]=useState(false),[text,setText]=useState('');
 const canvas=useRef<HTMLCanvasElement>(null),viewport=useRef<HTMLDivElement>(null);
 useEffect(()=>{const element=viewport.current;if(!element)return;const observer=new ResizeObserver(entries=>setWidth(Math.max(150,entries[0].contentRect.width-32)));observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  let active=true,task:PDFTask|undefined;setPDF(null);setError('');setPage(1);setZoom(1);setText('');
  (async()=>{
   const blob=record.status==='issued'?await transport.issuedFile(record.id,'pdf'):await transport.previewPDF(record.id,record.version);
   if(!active)return;
   if(blob.size>20*1024*1024||await blob.slice(0,5).text()!=='%PDF-')throw new Error('Le fichier reçu ne peut pas être affiché.');
   const library=await pdfEngine();if(!active)return;
   const data=new Uint8Array(await blob.arrayBuffer());if(!active)return;
   task=library.getDocument({data,isEvalSupported:false,useWorkerFetch:false,isOffscreenCanvasSupported:false,stopAtErrors:true});
   const document=await task.promise;if(!active)return;
   if(document.numPages<1||document.numPages>100)throw new Error('Le document dépasse la capacité de l’aperçu. Téléchargez le PDF pour le consulter.');
   setPDF(document);
  })().catch(e=>{if(active)setError(e instanceof Error?e.message:'L’aperçu PDF est indisponible.');});
  return()=>{active=false;if(task)void task.destroy().catch(()=>{});};
 },[record.id,record.version,record.status,transport,retry]);
 useEffect(()=>{
  if(!pdf)return;let active=true,task:RenderTask|undefined;setRendering(true);setText('');
  (async()=>{
   const source=await pdf.getPage(page);if(!active||!canvas.current)return;
   const original=source.getViewport({scale:1}),scale=Math.min(width,1100)/original.width*zoom;
   const view=source.getViewport({scale}),ratio=Math.min(devicePixelRatio||1,2),element=canvas.current;
   element.width=Math.ceil(view.width*ratio);element.height=Math.ceil(view.height*ratio);element.style.width=view.width+'px';element.style.height=view.height+'px';
   const context=element.getContext('2d');if(!context)throw new Error('L’aperçu ne peut pas être affiché dans ce navigateur.');
   task=source.render({canvasContext:context,viewport:view,transform:[ratio,0,0,ratio,0,0],annotationMode:0});await task.promise;
   const content=await source.getTextContent();if(active){setText(content.items.map(item=>item.str||'').join(' '));setRendering(false);}
  })().catch(e=>{if(active){setRendering(false);setError(e instanceof Error?e.message:'Cette page ne peut pas être affichée.');}});
  return()=>{active=false;task?.cancel();};
 },[pdf,page,width,zoom]);
 const turn=(delta:number)=>{setPage(value=>value+delta);viewport.current?.scrollTo({top:0,left:0});};
 return <section className="bill-pdf-viewer" aria-label="Aperçu PDF paginé">
  <div className="bill-pdf-heading"><strong>{record.status==='issued'?'Document définitif':'PDF du brouillon enregistré'}</strong><span>{record.status==='issued'?'Fichier archivé':'Non émis'}</span></div>
  <div className="bill-pdf-controls" role="group" aria-label="Navigation dans le PDF">
   <div><button type="button" aria-label="Page précédente du PDF" disabled={!pdf||page===1} onClick={()=>turn(-1)}>‹</button><span aria-live="polite">Page {page} / {pdf?.numPages||'…'}</span><button type="button" aria-label="Page suivante du PDF" disabled={!pdf||page===pdf.numPages} onClick={()=>turn(1)}>›</button></div>
   <div><button type="button" aria-label="Réduire le zoom" disabled={!pdf||zoom<=.5} onClick={()=>setZoom(n=>Math.max(.5,n-.25))}>−</button><button type="button" aria-label="Ajuster le PDF à la largeur" title="Ajuster à la largeur" disabled={!pdf} onClick={()=>setZoom(1)}>{zoom===1?'Ajuster':Math.round(zoom*100)+' %'}</button><button type="button" aria-label="Agrandir le PDF" disabled={!pdf||zoom>=2} onClick={()=>setZoom(n=>Math.min(2,n+.25))}>+</button></div>
  </div>
  <div className="bill-pdf-viewport" ref={viewport} tabIndex={0} aria-label="Page PDF, défilement horizontal et vertical" aria-busy={!error&&(!pdf||rendering)}>
   {error?<div className="bill-pdf-feedback" role="alert"><b>Aperçu indisponible</b><p>{error}</p><button type="button" className="bill-button" onClick={()=>setRetry(n=>n+1)}>Réessayer l’aperçu</button></div>:!pdf?<div className="bill-pdf-feedback" role="status"><BrandMark/>Préparation de l’aperçu…</div>:<div className="bill-pdf-sheet"><canvas ref={canvas} role="img" aria-label={'Page '+page+' du document PDF'} style={{visibility:rendering?'hidden':'visible'}}/>{rendering&&<div className="bill-pdf-rendering" role="status"><BrandMark/>Affichage de la page…</div>}<p className="bill-sr-only">{text}</p></div>}
  </div>
  <p className="bill-pdf-footnote">{record.status==='issued'?'Le PDF affiché est celui disponible au téléchargement.':'La pagination correspond au PDF téléchargé. Le brouillon reste modifiable.'}</p>
 </section>;
}
