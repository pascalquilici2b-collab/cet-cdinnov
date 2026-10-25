import React,{useEffect,useRef,useState} from 'react';
import {Move} from 'lucide-react';

type Position={page:number;x:number;y:number};
type Props={blob:Blob;original:boolean;blocks:any[];editable:boolean;position:Position|null;onPosition:(p:Position)=>void};

function Page({pdf,index,original,block,editable,position,onPosition}:Omit<Props,'blob'|'blocks'> & {pdf:any;index:number;block:any}){
 const holder=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const [size,setSize]=useState({width:595,height:842}),[visible,setVisible]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting),{root:holder.current?.closest('.stamp-preview')||null,rootMargin:'450px'});observer.observe(holder.current!);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(!visible)return;let cancelled=false,render:any,page:any;setError('');
  void(async()=>{page=await pdf.getPage(index+1);if(cancelled)return;const base=page.getViewport({scale:1});setSize({width:base.width,height:base.height});const viewport=page.getViewport({scale:1.4}),target=canvas.current!;target.width=Math.ceil(viewport.width);target.height=Math.ceil(viewport.height);render=page.render({canvasContext:target.getContext('2d'),viewport,annotationMode:1});await render.promise;if(!cancelled)setReady(true);})().catch(e=>{if(!cancelled)setError(e.message||'Page indisponible.');});
  return()=>{cancelled=true;render?.cancel();setReady(false);};
 },[visible,pdf,index]);
 const active=position?.page===index?position:block;
 return <div className="stamp-pdf-sheet"><small>Page {index+1} / {pdf.numPages}</small><div ref={holder} className="stamp-page" style={{aspectRatio:`${size.width} / ${size.height}`}} aria-label={`Page ${index+1}`}>
  <canvas ref={canvas} role="img" aria-label={`${original?'Pièce originale':'Aperçu contrôlé du tampon'} · page ${index+1}`} style={{visibility:ready?'visible':'hidden'}}/>
  {!ready&&<span className="stamp-page-loading" role={error?'alert':'status'}>{error||'Chargement…'}</span>}
  {ready&&original&&block&&editable&&<div className="stamp-placement" style={{left:100*active.x/size.width+'%',top:100*active.y/size.height+'%',width:100*block.width/size.width+'%',height:100*block.height/size.height+'%'}} onPointerDown={e=>{const start={x:e.clientX,y:e.clientY,px:active.x,py:active.y},el=e.currentTarget;el.setPointerCapture(e.pointerId);el.onpointermove=event=>{const scale=size.width/holder.current!.getBoundingClientRect().width;onPosition({page:index,x:Math.round(Math.max(7,Math.min(size.width-block.width-7,start.px+(event.clientX-start.x)*scale))),y:Math.round(Math.max(7,Math.min(size.height-block.height-7,start.py+(event.clientY-start.y)*scale)))});};el.onpointerup=el.onpointercancel=()=>{el.onpointermove=null;};}}><Move size={16}/><span>Déplacer le tampon</span></div>}
 </div></div>;
}

export function StampPDFScroll(props:Props){
 const [pdf,setPDF]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{let cancelled=false,task:any;setPDF(null);setError('');
  void(async()=>{const url=new URL('/marches/vendor/pdf.mjs',location.origin).href,engine=await import(/* @vite-ignore */url);engine.GlobalWorkerOptions.workerSrc=new URL('/marches/vendor/pdf.worker.mjs',location.origin).href;const bytes=await props.blob.arrayBuffer();if(cancelled)return;task=engine.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useWorkerFetch:false,isOffscreenCanvasSupported:false,stopAtErrors:true});const opened=await task.promise;if(!cancelled)setPDF(opened);})().catch(e=>{if(!cancelled)setError(e.message||'Aperçu indisponible.');});
  return()=>{cancelled=true;void task?.destroy().catch(()=>{});};
 },[props.blob]);
 return <div className="stamp-preview stamp-pdf-scroll" aria-label="Aperçu PDF multipage">{pdf?Array.from({length:pdf.numPages},(_,index)=><Page {...props} key={index} pdf={pdf} index={index} block={props.blocks.find(b=>b.page===index)}/>):<p role={error?'alert':'status'}>{error||'Chargement de l’aperçu…'}</p>}</div>;
}
