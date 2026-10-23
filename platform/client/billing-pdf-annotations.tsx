import {useEffect,useRef,useState} from 'react';
import type {PointerEvent,KeyboardEvent} from 'react';
import {Type,Highlighter,MousePointer2,Undo2,Redo2,Trash2,Pencil,Check,X} from 'lucide-react';
import type {BillingAnnotation} from '../billing-contracts';
import './billing-pdf-annotations.css';

type Tool='select'|'text'|'highlight';
type Box=Pick<BillingAnnotation,'x'|'y'|'width'|'height'>;
type TextBox=Extract<BillingAnnotation,{kind:'text'}>;
type Gesture={kind:'create'|'move'|'resize';start:{x:number;y:number};original:BillingAnnotation;current:BillingAnnotation;pointer:number};
const colors={ink:'#183643',red:'#b42318',blue:'#60a5fa',yellow:'#facc15',green:'#4ade80'};
const colorNames={ink:'Encre',red:'Rouge',blue:'Bleu',yellow:'Jaune',green:'Vert'};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,Math.round(v)));
const inPage=(a:BillingAnnotation):BillingAnnotation=>({...a,width:clamp(a.width,100,10000),height:clamp(a.height,80,10000),x:clamp(a.x,0,10000-clamp(a.width,100,10000)),y:clamp(a.y,0,10000-clamp(a.height,80,10000))});
const position=(b:Box)=>({left:b.x/100+'%',top:b.y/100+'%',width:b.width/100+'%',height:b.height/100+'%'});
const label=(a:BillingAnnotation)=>a.kind==='text'?'Texte : '+a.text.slice(0,35):'Surlignage '+colorNames[a.color].toLocaleLowerCase('fr');

/** Leave one line of breathing room; the server independently refuses clipped text. */
async function fitText(a:TextBox):Promise<TextBox>{
 await document.fonts.load(a.fontSize+'px CDIAnnotation');
 if(!document.fonts.check(a.fontSize+'px CDIAnnotation'))throw new Error('La police PDF ne s’est pas chargée. Réessayez.');
 const ctx=document.createElement('canvas').getContext('2d');if(!ctx)throw new Error('Mesure du texte indisponible.');
 ctx.font=a.fontSize+'px CDIAnnotation';ctx.fontKerning='none';
 const width=clamp(a.width,1200,10000),available=width*595.2756/10000-12;let lines=0;
 for(const paragraph of a.text.replace(/\r\n?/g,'\n').split('\n')){
  let current='';lines++;
  for(const word of paragraph.split(/\s+/)){
   const next=current?current+' '+word:word;
   if(ctx.measureText(next).width<=available){current=next;continue;}
   if(current){lines++;current='';}
   for(const char of word){if(ctx.measureText(current+char).width>available&&current){lines++;current='';}current+=char;}
  }
 }
 const height=Math.max(a.height,Math.ceil(((lines+1)*a.fontSize*1.25+12)/841.8898*10000));
 if(height>10000)throw new Error('Ce texte est trop long pour cet encart. Élargissez-le ou répartissez le texte dans plusieurs encarts.');
 return inPage({...a,width,height}) as TextBox;
}

export function usePDFAnnotations({enabled,documentId,items,onChange,page,onPage,pages,ready}:{enabled:boolean;documentId:string;items:BillingAnnotation[];onChange:(items:BillingAnnotation[])=>void;page:number;onPage:(page:number)=>void;pages:number;ready:boolean}){
 const [tool,setTool]=useState<Tool>('select'),[selectedId,setSelectedId]=useState(''),[color,setColor]=useState<'yellow'|'blue'|'green'>('yellow'),[edit,setEdit]=useState<BillingAnnotation|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[ghost,setGhost]=useState<BillingAnnotation|null>(null);
 const layer=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null),gesture=useRef<Gesture|null>(null),latest=useRef(items),history=useRef<{past:BillingAnnotation[][];future:BillingAnnotation[][];last:string}>({past:[],future:[],last:JSON.stringify(items)});
 latest.current=items;const signature=JSON.stringify(items),selected=items.find(a=>a.id===selectedId);
 useEffect(()=>{history.current={past:[],future:[],last:signature};setSelectedId('');setTool('select');setEdit(null);setGhost(null);gesture.current=null;},[documentId]);
 useEffect(()=>{if(history.current.last!==signature)history.current={past:[],future:[],last:signature};},[signature]);
 useEffect(()=>{if(edit)dialog.current?.showModal();else dialog.current?.close();},[!!edit]);
 function commit(next:BillingAnnotation[]){if(JSON.stringify(next)===JSON.stringify(latest.current))return;history.current.past.push(structuredClone(latest.current));history.current.past=history.current.past.slice(-30);history.current.future=[];history.current.last=JSON.stringify(next);onChange(next);setRevision(v=>v+1);setMessage('');}
 function undo(){const h=history.current,next=h.past.pop();if(!next)return;h.future.push(structuredClone(latest.current));h.last=JSON.stringify(next);onChange(next);setRevision(v=>v+1);setSelectedId('');setMessage('');}
 function redo(){const h=history.current,next=h.future.pop();if(!next)return;h.past.push(structuredClone(latest.current));h.last=JSON.stringify(next);onChange(next);setRevision(v=>v+1);setSelectedId('');setMessage('');}
 function remove(){if(selected){commit(items.filter(a=>a.id!==selected.id));setSelectedId('');}}
 function point(e:PointerEvent){const rect=layer.current!.getBoundingClientRect();return {x:clamp((e.clientX-rect.left)/rect.width*10000,0,10000),y:clamp((e.clientY-rect.top)/rect.height*10000,0,10000)};}
 function begin(e:PointerEvent<HTMLDivElement>,a?:BillingAnnotation,resize=false){
  if(!ready||busy||e.button!==0)return;if(!a&&tool==='select'){setSelectedId('');return;}
  e.preventDefault();e.stopPropagation();const start=point(e);e.currentTarget.setPointerCapture(e.pointerId);
  if(!a){
   if(items.length>=80){setMessage('Le document contient déjà 80 ajouts.');return;}
   const common={id:crypto.randomUUID(),page,x:start.x,y:start.y,width:tool==='text'?3500:2000,height:tool==='text'?1000:220};
   a=inPage(tool==='text'?{...common,kind:'text',text:'',fontSize:11,color:'ink'}:{...common,kind:'highlight',color});
  }else setSelectedId(a.id);
  gesture.current={kind:resize?'resize':items.some(v=>v.id===a!.id)?'move':'create',original:a,current:a,start,pointer:e.pointerId};setGhost(a);setMessage('');
 }
 function move(e:PointerEvent){const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;const p=point(e),dx=p.x-g.start.x,dy=p.y-g.start.y;let current:BillingAnnotation;
  if(g.kind==='create'){current=inPage({...g.original,x:Math.min(g.start.x,p.x),y:Math.min(g.start.y,p.y),width:Math.max(100,Math.abs(dx)),height:Math.max(80,Math.abs(dy))});}
  else if(g.kind==='resize'){current={...g.original,width:clamp(g.original.width+dx,g.original.kind==='text'?1200:100,10000-g.original.x),height:clamp(g.original.height+dy,80,10000-g.original.y)};}
  else current=inPage({...g.original,x:g.original.x+dx,y:g.original.y+dy});
  g.current=current;setGhost(current);
 }
 async function end(e:PointerEvent){const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;gesture.current=null;setGhost(null);setTool('select');
  const p=point(e),click=Math.abs(p.x-g.start.x)+Math.abs(p.y-g.start.y)<60;
  let a=g.kind==='create'&&click?g.original:g.current;
  if(g.kind==='create'&&a.kind==='text'){setEdit({...a,width:Math.max(1200,a.width),height:Math.max(800,a.height)});return;}
  try{setBusy(true);if(g.kind==='resize'&&a.kind==='text')a=await fitText(a);commit(g.kind==='create'?[...latest.current,a]:latest.current.map(v=>v.id===a.id?a:v));setSelectedId(a.id);}catch(error){setMessage(error instanceof Error?error.message:'Déplacement impossible.');}finally{setBusy(false);}
 }
 function keyboard(e:KeyboardEvent,a:BillingAnnotation){
  if(e.key==='Enter'){e.preventDefault();setEdit(a);return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();commit(items.filter(v=>v.id!==a.id));setSelectedId('');return;}
  if(e.key==='Escape'){setSelectedId('');setTool('select');return;}
  const change:Record<string,[number,number]>={ArrowUp:[0,-25],ArrowDown:[0,25],ArrowLeft:[-25,0],ArrowRight:[25,0]};const delta=change[e.key];if(!delta)return;
  e.preventDefault();const next=inPage({...a,x:a.x+delta[0]*(e.shiftKey?10:1),y:a.y+delta[1]*(e.shiftKey?10:1)});commit(items.map(v=>v.id===a.id?next:v));
 }
 async function apply(){if(!edit)return;setBusy(true);setMessage('');try{
  if(edit.kind==='text'&&!edit.text.trim())throw new Error('Saisissez le texte de la mention.');
  const value=edit.kind==='text'?await fitText(edit):edit;
  commit(items.some(a=>a.id===value.id)?items.map(a=>a.id===value.id?value:a):[...items,value]);setSelectedId(value.id);onPage(Math.min(value.page,pages||value.page));setEdit(null);
 }catch(error){setMessage(error instanceof Error?error.message:'Ajout impossible.');}finally{setBusy(false);}}
 const iconButton=(name:string,icon:React.ReactNode,click:()=>void,disabled=false,pressed?:boolean)=><button type="button" className="bill-pdf-tool" title={name} aria-label={name} aria-pressed={pressed} disabled={disabled} onClick={click}>{icon}</button>;
 const editingColors=edit?.kind==='text'?['ink','blue','red'] as const:['yellow','blue','green'] as const;
 const toolbar=enabled?<><div className="bill-pdf-edit-toolbar" role="toolbar" aria-label="Édition du PDF" data-revision={revision}>
  <div className="bill-pdf-tool-group">{iconButton('Sélectionner et déplacer',<MousePointer2 size={16}/>,()=>setTool('select'),!ready,tool==='select')}
   <button type="button" className="bill-pdf-tool" aria-pressed={tool==='text'} title="Cliquez sur la page pour placer votre texte" disabled={!ready||busy} onClick={()=>{setTool(tool==='text'?'select':'text');setSelectedId('');}}><Type size={17}/><span>Texte</span></button>
   <button type="button" className="bill-pdf-tool" aria-pressed={tool==='highlight'} title="Dessinez la zone à surligner" disabled={!ready||busy} onClick={()=>{setTool(tool==='highlight'?'select':'highlight');setSelectedId('');}}><Highlighter size={17}/><span>Surligner</span></button>
  </div><div className="bill-pdf-tool-group">{iconButton('Annuler le dernier ajout ou déplacement',<Undo2 size={16}/>,undo,!history.current.past.length||busy)}{iconButton('Rétablir l’ajout ou le déplacement',<Redo2 size={16}/>,redo,!history.current.future.length||busy)}</div>
  {items.length>0&&<div className="bill-pdf-tool-group bill-pdf-selection"><select aria-label="Ajouts au document" value={selectedId} onChange={e=>{setSelectedId(e.target.value);setTool('select');const a=items.find(v=>v.id===e.target.value);if(a)onPage(Math.min(a.page,pages||a.page));}}><option value="">{items.length} ajout{items.length>1?'s':''}</option>{items.map(a=><option key={a.id} value={a.id}>p. {a.page} · {label(a)}</option>)}</select>{iconButton('Modifier l’ajout sélectionné',<Pencil size={15}/>,()=>selected&&setEdit(selected),!selected||busy)}{iconButton('Supprimer l’ajout sélectionné',<Trash2 size={15}/>,remove,!selected||busy)}</div>}
  {tool==='highlight'&&<div className="bill-pdf-colors" role="group" aria-label="Couleur du surlignage">{(['yellow','blue','green'] as const).map(c=><button type="button" key={c} style={{backgroundColor:colors[c]}} aria-label={colorNames[c]} aria-pressed={color===c} onClick={()=>setColor(c)}>{color===c&&<Check size={13}/>}</button>)}</div>}
 </div>{message&&!edit&&<p className="bill-pdf-edit-error" role="alert">{message}</p>}
 <dialog ref={dialog} className="bill-preview-edit-dialog bill-annotation-dialog" aria-label="Modifier un ajout PDF" onCancel={()=>{setEdit(null);setMessage('');}}>{edit&&<form onSubmit={e=>{e.preventDefault();void apply();}}><header><strong>{edit.kind==='text'?'Encart texte':'Surlignage'}</strong><button type="button" aria-label="Fermer l’éditeur d’ajout" disabled={busy} onClick={()=>{setEdit(null);setMessage('');}}><X size={18}/></button></header>
  {edit.kind==='text'&&<label>Texte<textarea autoFocus aria-label="Texte de l’encart" rows={5} maxLength={2000} value={edit.text} onChange={e=>setEdit({...edit,text:e.target.value})}/></label>}
  <div className="bill-annotation-options"><label>Page<select aria-label="Page de l’ajout" value={edit.page} onChange={e=>setEdit({...edit,page:Number(e.target.value)})}>{Array.from({length:Math.max(pages,edit.page)},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label>{edit.kind==='text'&&<label>Taille<select aria-label="Taille du texte" value={edit.fontSize} onChange={e=>setEdit({...edit,fontSize:Number(e.target.value)})}>{[8,9,10,11,12,14,16,18,20,24].map(v=><option key={v} value={v}>{v} pt</option>)}</select></label>}
  <div className="bill-pdf-colors" role="group" aria-label="Couleur de l’ajout">{editingColors.map(c=><button type="button" key={c} style={{backgroundColor:c==='blue'&&edit.kind==='text'?'#0066cc':colors[c]}} aria-label={colorNames[c]} aria-pressed={edit.color===c} onClick={()=>setEdit({...edit,color:c} as BillingAnnotation)}>{edit.color===c&&<Check size={13}/>}</button>)}</div></div>
  {message&&<p className="bill-pdf-edit-error" role="alert">{message}</p>}<footer><button type="button" className="bill-button" disabled={busy} onClick={()=>{setEdit(null);setMessage('');}}>Annuler</button><button type="submit" className="bill-button bill-button-primary" disabled={busy}><Check size={16}/>{busy?'Application…':'Appliquer'}</button></footer>
 </form>}</dialog></>:null;
 const overlay=enabled?<div ref={layer} className="bill-pdf-annotation-layer" data-tool={ready?tool:'busy'} onPointerDown={e=>begin(e)} onPointerMove={move} onPointerUp={e=>void end(e)} onPointerCancel={()=>{gesture.current=null;setGhost(null);}}>
  {ready&&items.filter(a=>a.page===page).map(a=><div key={a.id} data-annotation={a.id} className="bill-pdf-added-box" data-selected={selectedId===a.id} role="button" tabIndex={0} aria-label={label(a)} style={position(a)} title="Déplacer avec les flèches ou la souris. Entrée pour modifier." onPointerDown={e=>begin(e,a)} onFocus={()=>setSelectedId(a.id)} onDoubleClick={()=>setEdit(a)} onKeyDown={e=>keyboard(e,a)}>{selectedId===a.id&&<div className="bill-pdf-resize" role="button" tabIndex={0} aria-label="Redimensionner l’ajout" title="Glissez pour redimensionner" onPointerDown={e=>begin(e,a,true)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setEdit(a);}}}/>}</div>)}
  {ghost&&<div className="bill-pdf-addition-ghost" style={{...position(ghost),...(ghost.kind==='highlight'?{backgroundColor:colors[ghost.color]+'55'}:{})}}/>}
 </div>:null;
 return {toolbar,overlay};
}
