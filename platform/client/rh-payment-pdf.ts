import type {jsPDF as Pdf} from 'jspdf';

export type RhPaymentPdfOptions={title?:string;signal?:AbortSignal;onProgress?:(done:number,total:number)=>void};
type FontStyle='normal'|'bold'|'italic'|'bolditalic';
type FontFile={style:FontStyle;name:string;data:string};
const PT=72/96,FONT='CDI-LiberationSans';
const fontFiles:Array<[FontStyle,string]>=[['normal','Regular'],['bold','Bold'],['italic','Italic'],['bolditalic','BoldItalic']];
let fontsPromise:Promise<FontFile[]>|undefined;

function abort(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('Export PDF annulé.','AbortError');}
function withAbort<T>(operation:Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!signal)return operation;abort(signal);
 return new Promise<T>((resolve,reject)=>{const cancelled=()=>{signal.removeEventListener('abort',cancelled);reject(new DOMException('Export PDF annulé.','AbortError'));};signal.addEventListener('abort',cancelled,{once:true});operation.then(value=>{signal.removeEventListener('abort',cancelled);resolve(value);},error=>{signal.removeEventListener('abort',cancelled);reject(error);});});
}
function base64(bytes:Uint8Array){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);}
function loadFonts(){return fontsPromise??=(async()=>Promise.all(fontFiles.map(async([style,suffix])=>{
 const name=`LiberationSans-${suffix}.ttf`,response=await fetch('/marches/vendor/standard_fonts/'+name,{credentials:'omit'});
 if(!response.ok)throw Error('La police du document PDF n’a pas pu être chargée. Réessayez.');
 const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length<1000||bytes.length>1_000_000)throw Error('La police du document PDF est invalide.');
 return {style,name,data:base64(bytes)};
})))().catch(error=>{fontsPromise=undefined;throw error;});}
function color(value:string):[number,number,number]|null{
 const match=/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(value);
 if(!match||match[4]!==undefined&&Number(match[4])===0)return null;
 return [Number(match[1]),Number(match[2]),Number(match[3])];
}
function transformScale(element:Element,page:HTMLElement){let x=1,y=1;for(let parent:Element|null=element;parent&&parent!==page;parent=parent.parentElement){const transform=getComputedStyle(parent).transform;if(transform&&transform!=='none'){const m=new DOMMatrixReadOnly(transform);x*=Math.hypot(m.a,m.b);y*=Math.hypot(m.c,m.d);}}return {x,y};}
function localRect(rect:DOMRect,page:DOMRect){return {x:(rect.left-page.left)*PT,y:(rect.top-page.top)*PT,w:rect.width*PT,h:rect.height*PT};}
function paintBoxes(pdf:Pdf,page:HTMLElement){
 const origin=page.getBoundingClientRect();
 for(const element of page.querySelectorAll<HTMLElement>('*')){
  const style=getComputedStyle(element),rect=element.getBoundingClientRect();if(style.display==='none'||style.visibility!=='visible'||!rect.width||!rect.height)continue;
  const box=localRect(rect,origin),background=color(style.backgroundColor);
  if(background){pdf.setFillColor(...background);pdf.rect(box.x,box.y,box.w,box.h,'F');}
  const scale=transformScale(element,page),borders=[
   [style.borderTopWidth,style.borderTopStyle,style.borderTopColor,box.x,box.y,box.x+box.w,box.y,scale.y],
   [style.borderBottomWidth,style.borderBottomStyle,style.borderBottomColor,box.x,box.y+box.h,box.x+box.w,box.y+box.h,scale.y],
   [style.borderLeftWidth,style.borderLeftStyle,style.borderLeftColor,box.x,box.y,box.x,box.y+box.h,scale.x],
   [style.borderRightWidth,style.borderRightStyle,style.borderRightColor,box.x+box.w,box.y,box.x+box.w,box.y+box.h,scale.x],
  ] as const;
  for(const [width,lineStyle,shade,x1,y1,x2,y2,factor]of borders){const ink=color(shade),size=parseFloat(width)*PT*factor;if(size>0&&ink&&lineStyle!=='none'&&lineStyle!=='hidden'){pdf.setDrawColor(...ink);pdf.setLineWidth(size);pdf.line(x1,y1,x2,y2);}}
 }
}
function paintImages(pdf:Pdf,page:HTMLElement){const origin=page.getBoundingClientRect();for(const img of page.querySelectorAll('img')){
 const rect=img.getBoundingClientRect();if(!rect.width||!rect.height||getComputedStyle(img).visibility!=='visible')continue;
 if(!img.complete||!img.naturalWidth)throw Error('Un logo du document PDF n’a pas pu être chargé.');
 const box=localRect(rect,origin);pdf.addImage(img,box.x,box.y,box.w,box.h,undefined,'FAST');
}}
type TextStyle={font:FontStyle;size:number;ascent:number;ink:[number,number,number]};
function paintText(pdf:Pdf,page:HTMLElement,metrics:CanvasRenderingContext2D,signal?:AbortSignal){
 const origin=page.getBoundingClientRect(),styles=new WeakMap<Element,TextStyle>(),range=document.createRange(),walker=document.createTreeWalker(page,NodeFilter.SHOW_TEXT);let visited=0;
 for(let node=walker.nextNode();node;node=walker.nextNode()){
  if(++visited%100===0)abort(signal);
  const text=node.textContent||'',parent=node.parentElement;if(!parent||!text.trim())continue;
  const computed=getComputedStyle(parent);if(computed.display==='none'||computed.visibility!=='visible'||parent.closest('.rh-person-avatar,script,style'))continue;
  let style=styles.get(parent);if(!style){const scale=transformScale(parent,page),size=parseFloat(computed.fontSize),bold=Number(computed.fontWeight)>=550||computed.fontWeight==='bold',italic=computed.fontStyle==='italic'||computed.fontStyle==='oblique';
   metrics.font=`${italic?'italic ':''}${bold?'bold ':''}${size}px ${computed.fontFamily}`;const measured=metrics.measureText('Hg');
   style={font:bold?(italic?'bolditalic':'bold'):(italic?'italic':'normal'),size:size*scale.y*PT,ascent:(measured.fontBoundingBoxAscent||size*.9)*scale.y*PT,ink:color(computed.color)||[29,38,48]};styles.set(parent,style);
  }
  pdf.setFont(FONT,style.font);pdf.setFontSize(style.size);pdf.setTextColor(...style.ink);
  const draw=(value:string,rect:DOMRect)=>{if(!rect.width||!rect.height)return;const box=localRect(rect,origin),natural=pdf.getTextWidth(value);if(!natural)return;pdf.text(value,box.x,box.y+style!.ascent,{baseline:'alphabetic',horizontalScale:box.w/natural});};
  // Word positions preserve browser wrapping and justification. Long words are split
  // only where the DOM actually wrapped them; text stays selectable in the PDF.
  for(const token of text.matchAll(/\S+/gu)){
   const start=token.index;range.setStart(node,start);range.setEnd(node,start+token[0].length);const boxes=[...range.getClientRects()].filter(r=>r.width&&r.height);
   if(boxes.length<=1){if(boxes[0])draw(token[0],boxes[0]);continue;}
   let fragment='',bounds:DOMRect|undefined,offset=start;
   for(const character of token[0]){range.setStart(node,offset);range.setEnd(node,offset+character.length);offset+=character.length;const rect=range.getBoundingClientRect();
    if(bounds&&Math.abs(rect.top-bounds.top)>.7){draw(fragment,bounds);fragment='';bounds=undefined;}
    fragment+=character;bounds=bounds?new DOMRect(Math.min(bounds.left,rect.left),Math.min(bounds.top,rect.top),Math.max(bounds.right,rect.right)-Math.min(bounds.left,rect.left),Math.max(bounds.bottom,rect.bottom)-Math.min(bounds.top,rect.top)):rect;
   }if(bounds)draw(fragment,bounds);
  }
 }
}

/** Render the already paginated RH document locally: vector text, rules and embedded logos. */
export async function exportRhPaymentPdf(pagesRoot:HTMLElement,options:RhPaymentPdfOptions={}):Promise<Blob>{
 abort(options.signal);const originals=[...pagesRoot.querySelectorAll<HTMLElement>('.rh-a4-page')];
 if(!originals.length)throw Error('Le document PDF n’est pas encore prêt.');
 for(const original of originals)for(const img of original.querySelectorAll('img')){const url=new URL(img.currentSrc||img.src,location.href);if(!['data:','blob:'].includes(url.protocol)&&url.origin!==location.origin)throw Error('Le logo doit être enregistré dans le document avant son export PDF.');}
 const host=document.createElement('div');host.className='rh-app rh-print-document';host.setAttribute('aria-hidden','true');Object.assign(host.style,{position:'fixed',left:'-100000px',top:'0',width:'297mm',pointerEvents:'none'});
 for(const original of originals){const copy=original.cloneNode(true) as HTMLElement;copy.style.transform='none';host.append(copy);}
 document.body.append(host);
 try{
  const [{jsPDF},fonts]=await withAbort(Promise.all([import('jspdf'),loadFonts()]),options.signal);await withAbort(document.fonts.ready,options.signal);
  await withAbort(Promise.all([...host.querySelectorAll('img')].map(img=>img.decode().catch(()=>{throw Error('Un logo du document PDF n’a pas pu être chargé.');}))),options.signal);abort(options.signal);
  const pdf=new jsPDF({orientation:'landscape',unit:'pt',format:'a4',compress:true,putOnlyUsedFonts:true});pdf.setProperties({title:options.title||'Attestation de paiement',creator:'CDInnov',subject:'Attestation de paiement des ressources humaines'});
  for(const font of fonts){pdf.addFileToVFS(font.name,font.data);pdf.addFont(font.name,FONT,font.style);}
  const canvas=document.createElement('canvas'),metrics=canvas.getContext('2d');if(!metrics)throw Error('Le navigateur ne permet pas de préparer ce PDF.');
  const pages=[...host.children] as HTMLElement[];options.onProgress?.(0,pages.length);
  for(const [index,page]of pages.entries()){abort(options.signal);if(index)pdf.addPage('a4','landscape');paintBoxes(pdf,page);paintImages(pdf,page);paintText(pdf,page,metrics,options.signal);options.onProgress?.(index+1,pages.length);await withAbort(new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())),options.signal);}
  abort(options.signal);return pdf.output('blob');
 }finally{host.remove();}
}
