import React,{useEffect,useRef,useState} from 'react';
import {Minus,Plus,Move,Maximize2} from 'lucide-react';
type Position={page:number;x:number;y:number;scale?:number;layoutWidth?:number;allocationIds?:string[]};
type Props={blob:Blob;original:boolean;blocks:any[];editable:boolean;position:Position[]|null;onPosition:(p:Position[])=>void};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
function Page({pdf,index,original,blocks,editable,positions,change,active,setActive}:any){
 const holder=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const [size,setSize]=useState({width:595,height:842}),[visible,setVisible]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState('');
 const blank=index>=pdf.numPages;
 useEffect(()=>{const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting),{root:holder.current?.closest('.stamp-preview')||null,rootMargin:'450px'});observer.observe(holder.current!);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(!visible)return;let cancelled=false,render:any;setError('');
  void(async()=>{const target=canvas.current!;if(blank){target.width=833;target.height=1179;target.getContext('2d')!.fillStyle='#fff';target.getContext('2d')!.fillRect(0,0,833,1179);setReady(true);return;}
   const page=await pdf.getPage(index+1);if(cancelled)return;const base=page.getViewport({scale:1});setSize({width:base.width,height:base.height});const viewport=page.getViewport({scale:1.4});target.width=Math.ceil(viewport.width);target.height=Math.ceil(viewport.height);render=page.render({canvasContext:target.getContext('2d'),viewport,annotationMode:1});await render.promise;if(!cancelled)setReady(true);
  })().catch(e=>{if(!cancelled)setError(e.message||'Page indisponible.');});
  return()=>{cancelled=true;render?.cancel();setReady(false);};
 },[visible,pdf,index]);
 const adjust=(n:number,p:Position)=>{const b=blocks[n],w=b.width/(b.scale||1),h=b.height/(b.scale||1),scale=clamp(p.scale||1,.5,Math.min(3,(size.width-14)/w,(size.height-14)/h));change(n,{...p,scale,x:clamp(p.x,7,size.width-w*scale-7),y:clamp(p.y,7,size.height-h*scale-7)});};
 const drag=(e:React.PointerEvent<HTMLElement>,n:number,resize=false)=>{
  e.preventDefault();e.stopPropagation();setActive(n);const el=e.currentTarget,p={...positions[n]},b=blocks[n],startX=e.clientX,startY=e.clientY,ratio=size.width/holder.current!.getBoundingClientRect().width;el.setPointerCapture(e.pointerId);
  el.onpointermove=event=>{const dx=(event.clientX-startX)*ratio,dy=(event.clientY-startY)*ratio;adjust(n,resize?{...p,scale:(p.scale||1)+dx/(b.width/(b.scale||1))}:{...p,x:p.x+dx,y:p.y+dy});};
  el.onpointerup=el.onpointercancel=()=>{el.onpointermove=null;if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);};
 };
 return <div className="stamp-pdf-sheet"><small>Page {index+1}</small><div ref={holder} className="stamp-page" style={{aspectRatio:`${size.width} / ${size.height}`}} aria-label={`Page ${index+1}`}>
  <canvas ref={canvas} role="img" aria-label={`${original?'Pièce originale':'Aperçu contrôlé du tampon'} · page ${index+1}`} style={{visibility:ready?'visible':'hidden'}}/>
  {!ready&&<span className="stamp-page-loading" role={error?'alert':'status'}>{error||'Chargement…'}</span>}
  {ready&&editable&&blocks.map((b:any,n:number)=>{const p=positions[n];if(p.page!==index||!b.image)return null;const factor=(p.scale||1)/(b.scale||1);
   return <div key={n} className={'stamp-edit-overlay'+(active===n?' is-active':'')} role="button" tabIndex={0} aria-label={`Déplacer le tampon ${n+1}`} title="Glisser pour déplacer · coin inférieur pour redimensionner" style={{left:100*p.x/size.width+'%',top:100*p.y/size.height+'%',width:100*b.width*factor/size.width+'%',height:100*b.height*factor/size.height+'%'}} onFocus={()=>setActive(n)} onPointerDown={e=>drag(e,n)} onKeyDown={e=>{const dirs:Record<string,number[]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(dirs[e.key]){e.preventDefault();const [x,y]=dirs[e.key],step=e.shiftKey?10:1;adjust(n,{...p,x:p.x+x*step,y:p.y+y*step});}}}>
    <img src={'data:image/png;base64,'+b.image} draggable={false} alt="Tampon"/><span className="stamp-drag-grip" aria-hidden="true"><Move size={12}/></span>
    <button type="button" className="stamp-resize-grip" aria-label={`Redimensionner le tampon ${n+1}`} title="Glisser pour agrandir ou réduire" onPointerDown={e=>drag(e,n,true)} onKeyDown={e=>{if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','+','-'].includes(e.key)){e.preventDefault();e.stopPropagation();adjust(n,{...p,scale:(p.scale||1)+(['ArrowLeft','ArrowDown','-'].includes(e.key)?-.05:.05)});}}}><Maximize2 size={12}/></button>
   </div>;
  })}
 </div></div>;
}
export function StampPDFScroll(props:Props){
 const [pdf,setPDF]=useState<any>(null),[error,setError]=useState(''),[active,setActive]=useState(0);
 const positions=props.position||props.blocks.map(({page,x,y,scale,layoutWidth,allocationIds})=>({page,x,y,scale:scale||1,layoutWidth,allocationIds}));
 const current=useRef(positions);current.current=positions;
 const change=(n:number,p:Position)=>{const next=current.current.map((b,i)=>i===n?p:b);current.current=next;props.onPosition(next);};
 useEffect(()=>{let cancelled=false,task:any;setPDF(null);setError('');
  void(async()=>{const url=new URL('/marches/vendor/pdf.mjs',location.origin).href,engine=await import(/* @vite-ignore */url);engine.GlobalWorkerOptions.workerSrc=new URL('/marches/vendor/pdf.worker.mjs',location.origin).href;const bytes=await props.blob.arrayBuffer();if(cancelled)return;task=engine.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useWorkerFetch:false,isOffscreenCanvasSupported:false,stopAtErrors:true});const opened=await task.promise;if(!cancelled)setPDF(opened);})().catch(e=>{if(!cancelled)setError(e.message||'Aperçu indisponible.');});
  return()=>{cancelled=true;void task?.destroy().catch(()=>{});};
 },[props.blob]);
 const count=pdf?Math.max(pdf.numPages,props.editable?Math.max(0,...positions.map(p=>p.page+1)):0):0;
 const resize=async(delta:number)=>{const p=positions[active],b=props.blocks[active];if(!p||!b)return;const size=p.page<pdf.numPages?(await pdf.getPage(p.page+1)).getViewport({scale:1}):{width:595,height:842};const w=b.width/(b.scale||1),h=b.height/(b.scale||1),scale=clamp((p.scale||1)+delta,.5,Math.min(3,(size.width-14)/w,(size.height-14)/h));change(active,{...p,scale,x:clamp(p.x,7,size.width-w*scale-7),y:clamp(p.y,7,size.height-h*scale-7)});};
 return <>{props.editable&&pdf&&positions.length>0&&<div className="stamp-edit-toolbar"><Move size={16}/><span>Tampon</span><button type="button" aria-label="Réduire le tampon" onClick={()=>void resize(-.1)}><Minus size={15}/></button><output>{Math.round((positions[active]?.scale||1)*100)} %</output><button type="button" aria-label="Agrandir le tampon" onClick={()=>void resize(.1)}><Plus size={15}/></button>{count>1&&<select aria-label="Page du tampon" value={positions[active]?.page||0} onChange={async e=>{const page=Number(e.target.value);change(active,{...positions[active],page,x:15,y:15});}}>{Array.from({length:count},(_,i)=><option key={i} value={i}>Page {i+1}</option>)}</select>}</div>}
  <div className="stamp-preview stamp-pdf-scroll" aria-label="Aperçu PDF multipage">{pdf?Array.from({length:count},(_,index)=><Page {...props} key={index} pdf={pdf} index={index} positions={positions} change={change} active={active} setActive={setActive}/>):<p role={error?'alert':'status'}>{error||'Chargement de l’aperçu…'}</p>}</div></>;
}
