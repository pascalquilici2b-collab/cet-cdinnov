import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

/** Hover/focus help, with tap-to-pin on touch devices. No action is hidden here. */
export function Help({label,text}:{label:string;text:string}){
 const id=useId(),button=useRef<HTMLButtonElement>(null),bubble=useRef<HTMLSpanElement>(null);
 const [open,setOpen]=useState(false),[position,setPosition]=useState<{left:number;top:number}|null>(null);
 const pointer=useRef(false),inside=useRef(false),focused=useRef(false),pinned=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const cancelTimer=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
 const close=()=>{cancelTimer();inside.current=false;pinned.current=false;setOpen(false);setPosition(null);};
 const show=()=>{cancelTimer();document.dispatchEvent(new CustomEvent('billing-help-open',{detail:id}));setOpen(true);};
 const leave=()=>{cancelTimer();timer.current=setTimeout(()=>{if(!pointer.current&&!inside.current&&!focused.current&&!pinned.current)close();},160);};
 useEffect(()=>()=>{cancelTimer();},[]);
 useEffect(()=>{
  if(!open)return;
  const outside=(e:PointerEvent)=>{if(!button.current?.contains(e.target as Node)&&!bubble.current?.contains(e.target as Node))close();};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
  const other=(e:Event)=>{if((e as CustomEvent).detail!==id)close();};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);document.addEventListener('billing-help-open',other);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);document.removeEventListener('billing-help-open',other);};
 },[open,id]);
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{
   if(!button.current||!bubble.current)return;
   const anchor=button.current.getBoundingClientRect(),tip=bubble.current.getBoundingClientRect(),width=window.innerWidth,height=window.innerHeight;
   if(anchor.bottom<0||anchor.top>height){close();return;}
   setPosition({left:Math.max(12,Math.min(anchor.left,width-tip.width-12)),top:Math.max(12,Math.min(anchor.bottom+tip.height+20<=height?anchor.bottom+8:anchor.top-tip.height-8,height-tip.height-12))});
  };
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  const observer=new ResizeObserver(place);if(button.current)observer.observe(button.current);if(bubble.current)observer.observe(bubble.current);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);observer.disconnect();};
 },[open,text]);
 const host=button.current?.closest('dialog')||button.current?.closest('.bill-app')||document.body;
 return <><button ref={button} className="bill-help" type="button" aria-label={'Aide — '+label} aria-describedby={open?id:undefined}
  onPointerEnter={e=>{if(e.pointerType!=='touch'){pointer.current=true;show();}}} onPointerLeave={()=>{pointer.current=false;leave();}}
  onFocus={()=>{focused.current=true;show();}} onBlur={()=>{focused.current=false;pinned.current=false;leave();}}
  onClick={e=>{e.preventDefault();e.stopPropagation();if(pinned.current)close();else{pinned.current=true;show();}}}><span aria-hidden="true">?</span></button>
  {open&&createPortal(<span ref={bubble} id={id} role="tooltip" className="bill-help-tooltip" style={{left:position?.left||0,top:position?.top||0,visibility:position?'visible':'hidden'}}
   onPointerEnter={()=>{inside.current=true;cancelTimer();}} onPointerLeave={()=>{inside.current=false;leave();}}>{text}</span>,host)}
 </>;
}
