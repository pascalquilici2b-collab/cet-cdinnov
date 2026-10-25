/** A shared, local confirmation for successful saves. Errors keep their own messages. */
type Anchor={element:Element|null;rect:DOMRect|null};
type Feedback={capture:()=>((label?:string)=>void);success:(label?:string)=>void};
declare global {interface Window {CDIActionFeedback?:Feedback;}}

function install():Feedback {
 let anchor:Anchor={element:null,rect:null};
 const remember=(element:Element|null)=>{if(element)anchor={element,rect:element.getBoundingClientRect()};};
 document.addEventListener('click',event=>{if(event.target instanceof Element)remember(event.target.closest('button,[role="menuitem"],input[type="submit"],[data-action]'));},true);
 document.addEventListener('submit',event=>{remember((event as SubmitEvent).submitter||(event.target as Element)?.querySelector('button[type="submit"],button:not([type])'));},true);
 const style=document.createElement('style');
 style.textContent=`.cdi-action-success{position:fixed;z-index:2147483647;pointer-events:none;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#e4f6eb;color:#168344;box-shadow:0 3px 14px #102b161a;animation:cdi-success-in .25s ease-out}.cdi-action-success svg{width:28px;height:28px}.cdi-action-success path{fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:24;animation:cdi-success-check .45s ease-out}.cdi-action-success span{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}[data-theme=dark] .cdi-action-success{background:#173d2b;color:#86e6ad}@keyframes cdi-success-in{from{opacity:0;transform:scale(.65)}to{opacity:1;transform:scale(1)}}@keyframes cdi-success-check{from{stroke-dashoffset:24}to{stroke-dashoffset:0}}@media(prefers-reduced-motion:reduce){.cdi-action-success,.cdi-action-success path{animation:none}}`;
 style.textContent+=`.cdi-save-confirmed{color:transparent!important;background:transparent!important;border-color:transparent!important;box-shadow:none!important}.cdi-save-confirmed>*{opacity:0!important}`;
 document.head.append(style);
 function show(at:Anchor,label='Enregistré'){requestAnimationFrame(()=>{
  document.querySelectorAll('.cdi-action-success').forEach(e=>e.remove());
  document.querySelectorAll('.cdi-save-confirmed').forEach(e=>e.classList.remove('cdi-save-confirmed'));
  const live=at.element?.isConnected?at.element:null,current=live?.getBoundingClientRect(),rect=current?.width&&current.height?current:at.rect;
  const node=document.createElement('div');node.className='cdi-action-success';node.setAttribute('role','status');node.setAttribute('aria-live','polite');
  node.innerHTML='<svg viewBox="0 0 28 28" aria-hidden="true"><path d="m7 14 5 5L22 9"/></svg><span></span>';
  node.querySelector('span')!.textContent=label;
  // Briefly replace the successful button's contents, without covering adjacent actions.
  if(live?.matches('button')&&current?.width&&current.height)live.classList.add('cdi-save-confirmed');
  const x=rect?rect.left+rect.width/2-18:innerWidth/2-18;
  const y=rect?rect.top+rect.height/2-18:innerHeight/2-18;
  node.style.left=Math.max(8,Math.min(innerWidth-44,x))+'px';node.style.top=Math.max(8,Math.min(innerHeight-44,y))+'px';
  // Stay in the top layer while a native dialog remains open.
  (live?.closest('dialog[open]')||document.body).append(node);
  setTimeout(()=>{if(node.isConnected)live?.classList.remove('cdi-save-confirmed');node.remove();},2500);});
 }
 return {capture:()=>{const at={...anchor};return label=>show(at,label);},success:label=>show(anchor,label)};
}
const feedback=typeof window==='undefined'?null:(window.CDIActionFeedback||=install());
export const captureSuccess=()=>feedback?.capture()||(()=>{});
export const showSuccess=(label?:string)=>feedback?.success(label);
