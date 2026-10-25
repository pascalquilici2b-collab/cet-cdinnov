/** A shared, local confirmation for successful saves. Errors keep their own messages. */
type Anchor={element:Element|null;rect:DOMRect|null};
type Feedback={capture:()=>((label?:string)=>void);success:(label?:string)=>void};
declare global {interface Window {CDIActionFeedback?:Feedback;}}

function install():Feedback {
 let anchor:Anchor={element:null,rect:null};
 let clear=()=>{};
 const remember=(element:Element|null)=>{if(element)anchor={element,rect:element.getBoundingClientRect()};};
 document.addEventListener('click',event=>{clear();if(event.target instanceof Element)remember(event.target.closest('button,[role="menuitem"],input[type="submit"],[data-action]'));},true);
 document.addEventListener('input',()=>clear(),true);
 document.addEventListener('submit',event=>{remember((event as SubmitEvent).submitter||(event.target as Element)?.querySelector('button[type="submit"],button:not([type])'));},true);
 const style=document.createElement('style');
 style.textContent=`.cdi-action-success{position:fixed;z-index:2147483647;pointer-events:none;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#e4f6eb;color:#168344;box-shadow:0 3px 14px #102b161a;animation:cdi-success-in .25s ease-out}.cdi-action-success svg{width:28px;height:28px}.cdi-action-success path{fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:24;animation:cdi-success-check .45s ease-out}.cdi-action-success span{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}[data-theme=dark] .cdi-action-success{background:#173d2b;color:#86e6ad}@keyframes cdi-success-in{from{opacity:0;transform:scale(.65)}to{opacity:1;transform:scale(1)}}@keyframes cdi-success-check{from{stroke-dashoffset:24}to{stroke-dashoffset:0}}@media(prefers-reduced-motion:reduce){.cdi-action-success,.cdi-action-success path{animation:none}}`;
 style.textContent+=`
 .cdi-save-confirmed{position:relative!important;opacity:1!important;color:transparent!important;background:#e4f6eb!important;border-color:#a8dabb!important;box-shadow:0 0 0 3px #16834412!important;transition:background .2s,border-color .2s,box-shadow .2s!important;isolation:isolate}
 .cdi-save-confirmed>*:not(.cdi-button-success){opacity:0!important}
 .cdi-button-success{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:7px;padding:0 9px;border-radius:inherit;color:#168344!important;pointer-events:none;font:inherit;line-height:1.15;animation:cdi-success-in .22s ease-out}
 .cdi-button-success svg{width:20px;height:20px;flex-shrink:0}.cdi-button-success path{fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:24;animation:cdi-success-check .45s ease-out}
 .cdi-button-success span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .cdi-action-success.cdi-success-chip{width:auto;max-width:280px;height:38px;border-radius:12px;display:flex;gap:7px;padding:0 13px;font:600 13px/1.2 system-ui}
 .cdi-success-chip span{position:static;width:auto;height:auto;clip-path:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 [data-theme=dark] .cdi-save-confirmed{background:#173d2b!important;border-color:#397052!important;box-shadow:0 0 0 3px #86e6ad10!important}[data-theme=dark] .cdi-button-success{color:#86e6ad!important}
 @media(prefers-reduced-motion:reduce){.cdi-save-confirmed{transition:none!important}.cdi-button-success,.cdi-button-success path{animation:none}}
 `;
 document.head.append(style);
 function show(at:Anchor,label='Enregistré'){requestAnimationFrame(()=>{
  clear();
  const live=at.element?.isConnected?at.element:null,current=live?.getBoundingClientRect(),rect=current?.width&&current.height?current:at.rect;
  const inButton=!!(live?.matches('button')&&current?.width&&current.height&&live.getClientRects().length);
  const node=document.createElement('span');node.className=inButton?'cdi-button-success':'cdi-action-success cdi-success-chip';node.setAttribute('role','status');node.setAttribute('aria-live','polite');
  node.innerHTML='<svg viewBox="0 0 28 28" aria-hidden="true"><path d="m7 14 5 5L22 9"/></svg><span></span>';
  node.querySelector('span')!.textContent=label;
  const float=()=>{
   live?.classList.remove('cdi-save-confirmed');node.className='cdi-action-success cdi-success-chip';node.querySelector('span')!.style.display='';
   const dialog=live?.closest('dialog[open]');(dialog?.isConnected?dialog:document.body).append(node);
   const width=node.getBoundingClientRect().width;
   node.style.left=Math.max(8,Math.min(innerWidth-width-8,(rect?rect.left+rect.width/2:innerWidth/2)-width/2))+'px';
   node.style.top=Math.max(8,Math.min(innerHeight-46,(rect?rect.top+rect.height/2:innerHeight/2)-19))+'px';
  };
  let observer:MutationObserver|undefined;
  if(inButton){
   live!.classList.add('cdi-save-confirmed');
   if(current!.width<100){node.querySelector('span')!.style.display='none';node.setAttribute('aria-label',label);}
   live!.append(node);
   // React or the legacy market controller may replace the button after saving.
   observer=new MutationObserver(()=>{
    if(live?.isConnected&&live.getBoundingClientRect().width){
     if(!live.classList.contains('cdi-save-confirmed'))live.classList.add('cdi-save-confirmed');
     if(!node.isConnected)live.append(node);
    }else{observer?.disconnect();float();}
   });
   observer.observe(document.body,{childList:true,subtree:true});
   observer.observe(live!,{attributes:true,attributeFilter:['class']});
  }else{
   // A saved form may close immediately. Keep its confirmation at the action's location.
   float();
  }
  const timer=setTimeout(()=>clear(),2500);
  const cleanup=()=>{clearTimeout(timer);observer?.disconnect();live?.classList.remove('cdi-save-confirmed');node.remove();};
  clear=()=>{cleanup();clear=()=>{};};
 });
 }
 return {capture:()=>{const at={...anchor};return label=>show(at,label);},success:label=>show(anchor,label)};
}
const feedback=typeof window==='undefined'?null:(window.CDIActionFeedback||=install());
export const captureSuccess=()=>feedback?.capture()||(()=>{});
export const showSuccess=(label?:string)=>feedback?.success(label);
