import {BrandMark} from './loading';
import {useEffect,useRef,useState} from 'react';
import type {BillingDocument,BillingDraft,BillingTransport} from '../billing-contracts';
import {Pencil} from 'lucide-react';
import {blankDocumentDetails,addBillingMonths} from '../billing-domain';

type Viewport={width:number;height:number;convertToViewportRectangle:(r:number[])=>number[]};
type RenderTask={promise:Promise<void>;cancel:()=>void};
type PDFPage={getViewport:(options:{scale:number})=>Viewport;render:(options:Record<string,unknown>)=>RenderTask;getTextContent:()=>Promise<{items:{str?:string}[]}>;getAnnotations:()=>Promise<{url?:string;rect:number[]}[]>};
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

export function PDFPreview({record,transport,draft,onChange,file}:{record:BillingDocument|null;transport?:BillingTransport;draft?:BillingDraft;onChange?:(p:Partial<BillingDraft>)=>void;file?:Blob}){
 const [pdf,setPDF]=useState<PDFDocument|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [page,setPage]=useState(1),[zoom,setZoom]=useState(1),[rendering,setRendering]=useState(false),[text,setText]=useState(''),[pending,setPending]=useState(false);
 const [areas,setAreas]=useState<{path:string;rect:number[]}[]>([]),[edit,setEdit]=useState<{path:string;value:string}|null>(null),dialog=useRef<HTMLDialogElement>(null);
 const snapshot=draft?JSON.stringify(draft):'';
 const canvas=useRef<HTMLCanvasElement>(null),viewport=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(edit)dialog.current?.showModal();else dialog.current?.close();},[!!edit]);
 useEffect(()=>{
  let active=true,task:PDFTask|undefined;setPDF(null);setError('');setPending(true);setAreas([]);
  const timer=setTimeout(()=>{void (async()=>{
   const blob=file||(draft?await transport!.previewDraft(JSON.parse(snapshot),record?.id):record?.status==='issued'?await transport!.issuedFile(record.id,'pdf'):record?await transport!.previewPDF(record.id,record.version):null);
   if(!blob)throw new Error('Document indisponible.');
   if(!active)return;
   if(blob.size>20*1024*1024||await blob.slice(0,5).text()!=='%PDF-')throw new Error('Le fichier reçu ne peut pas être affiché.');
   const library=await pdfEngine();if(!active)return;
   const data=new Uint8Array(await blob.arrayBuffer());if(!active)return;
   task=library.getDocument({data,isEvalSupported:false,useWorkerFetch:false,isOffscreenCanvasSupported:false,stopAtErrors:true});
   const document=await task.promise;if(!active)return;
   if(document.numPages<1||document.numPages>100)throw new Error('Le document dépasse la capacité de l’aperçu. Téléchargez le PDF pour le consulter.');
   setPDF(document);setPage(p=>Math.min(p,document.numPages));setPending(false);
  })().catch(e=>{if(active){setPending(false);setError(e instanceof Error?e.message:'L’aperçu PDF est indisponible.');}});},draft?800:0);
  return()=>{active=false;clearTimeout(timer);if(task)void task.destroy().catch(()=>{});};
 },[record?.id,record?.version,record?.status,record?.reservedNumber?.number,transport,retry,snapshot,file]);
 useEffect(()=>{
  if(!pdf)return;let active=true,task:RenderTask|undefined;setRendering(true);setText('');
  (async()=>{
   const source=await pdf.getPage(page);if(!active||!canvas.current)return;
   const scale=96/72*zoom;
   const view=source.getViewport({scale}),ratio=Math.min(devicePixelRatio||1,2),element=canvas.current;
   element.width=Math.ceil(view.width*ratio);element.height=Math.ceil(view.height*ratio);element.style.width=view.width+'px';element.style.height=view.height+'px';
   const context=element.getContext('2d');if(!context)throw new Error('L’aperçu ne peut pas être affiché dans ce navigateur.');
   task=source.render({canvasContext:context,viewport:view,transform:[ratio,0,0,ratio,0,0],annotationMode:0});await task.promise;
   const content=await source.getTextContent(),annotations=draft?await source.getAnnotations():[];
   if(active){setText(content.items.map(item=>item.str||'').join(' '));setRendering(false);setAreas(annotations.filter(a=>a.url?.startsWith('https://editor.cdinnov.invalid/field/')).map(a=>({path:a.url!.slice('https://editor.cdinnov.invalid/field/'.length),rect:view.convertToViewportRectangle(a.rect)})).filter(a=>editablePath(a.path)));}
  })().catch(e=>{if(active){setRendering(false);setError(e instanceof Error?e.message:'Cette page ne peut pas être affichée.');}});
  return()=>{active=false;task?.cancel();};
 },[pdf,page,zoom]);
 function startEdit(path:string){if(!draft||!onChange||pending||!editablePath(path))return;let value:unknown=draft;for(const k of path.split('.'))value=(value as Record<string,unknown>)?.[k];if(typeof value==='string')setEdit({path,value});}
 function applyEdit(){if(!draft||!edit||!onChange)return;const copy=structuredClone(draft),keys=edit.path.split('.');let target:Record<string,unknown>=copy as unknown as Record<string,unknown>;for(const key of keys.slice(0,-1))target=target[key] as Record<string,unknown>;target[keys.at(-1)!]=edit.value;
  if(edit.path==='validUntil')copy.details={...copy.details||blankDocumentDetails(),validityMonths:''};
  if(edit.path==='issueDate'&&copy.kind==='quote'&&copy.details?.validityMonths)copy.validUntil=addBillingMonths(copy.issueDate,copy.details.validityMonths);
  onChange(copy);setEdit(null);
 }
 const turn=(delta:number)=>{setPage(value=>value+delta);viewport.current?.scrollTo({top:0,left:0});};
 return <section className="bill-pdf-viewer" aria-label="Aperçu PDF paginé">
  <div className="bill-pdf-heading"><strong>{file?'Aperçu A4':record?.status==='issued'?'Document définitif':draft?'Aperçu A4':'PDF du brouillon enregistré'}</strong><span>{file?'':record?.status==='issued'?'Fichier archivé':pending?'Actualisation…':'Non émis'}</span></div>
  <div className="bill-pdf-controls" role="group" aria-label="Navigation dans le PDF">
   <div><button type="button" aria-label="Page précédente du PDF" disabled={!pdf||page===1} onClick={()=>turn(-1)}>‹</button><span aria-live="polite">Page {page} / {pdf?.numPages||'…'}</span><button type="button" aria-label="Page suivante du PDF" disabled={!pdf||page===pdf.numPages} onClick={()=>turn(1)}>›</button></div>
   <div><button type="button" aria-label="Réduire le zoom" disabled={!pdf||zoom<=.5} onClick={()=>setZoom(n=>Math.max(.5,n-.25))}>−</button><button type="button" aria-label="Format A4 à 100 %" title="Format A4 à 100 %" disabled={!pdf} onClick={()=>setZoom(1)}>{Math.round(zoom*100)} %</button><button type="button" aria-label="Agrandir le PDF" disabled={!pdf||zoom>=2} onClick={()=>setZoom(n=>Math.min(2,n+.25))}>+</button></div>
  </div>
  <div className="bill-pdf-viewport" ref={viewport} tabIndex={0} aria-label="Page PDF, défilement horizontal et vertical" aria-busy={!error&&(!pdf||rendering)}>
   {error?<div className="bill-pdf-feedback" role="alert"><b>Aperçu indisponible</b><p>{error}</p><button type="button" className="bill-button" onClick={()=>setRetry(n=>n+1)}>Réessayer l’aperçu</button></div>:!pdf?<div className="bill-pdf-feedback" role="status"><BrandMark/>Préparation de l’aperçu…</div>:<div className="bill-pdf-sheet"><div className="bill-pdf-page"><canvas ref={canvas} role="img" aria-label={'Page '+page+' du document PDF'} style={{visibility:rendering?'hidden':'visible'}}/>{!rendering&&!pending&&areas.map((a,i)=><button type="button" key={i} className="bill-pdf-edit-field" style={{left:Math.min(a.rect[0],a.rect[2]),top:Math.min(a.rect[1],a.rect[3]),width:Math.abs(a.rect[2]-a.rect[0]),height:Math.abs(a.rect[3]-a.rect[1])}} aria-label={'Modifier '+fieldLabel(a.path)} title={'Modifier '+fieldLabel(a.path)} onClick={()=>startEdit(a.path)}><Pencil size={13}/></button>)}{rendering&&<div className="bill-pdf-rendering" role="status"><BrandMark/>Affichage de la page…</div>}<p className="bill-sr-only">{text}</p></div></div>}
  </div>
  <dialog ref={dialog} className="bill-preview-edit-dialog" aria-label="Modifier dans l’aperçu" onCancel={()=>setEdit(null)}>{edit&&<form onSubmit={e=>{e.preventDefault();applyEdit();}}><label>{fieldLabel(edit.path)}{['issueDate','dueDate','validUntil'].includes(edit.path)?<input type="date" aria-label="Valeur du champ" value={edit.value} onChange={e=>setEdit({...edit,value:e.target.value})}/>:<textarea aria-label="Valeur du champ" autoFocus rows={3} maxLength={edit.path==='notes'?10000:4000} value={edit.value} onChange={e=>setEdit({...edit,value:e.target.value})}/>}</label><div><button type="button" className="bill-button" onClick={()=>setEdit(null)}>Annuler</button><button type="submit" className="bill-button bill-button-primary">Appliquer</button></div></form>}</dialog>
 </section>;
}
const editablePath=(p:string)=>/^(title|issueDate|dueDate|validUntil|paymentTerms|description|notes|references\.(businessCode|marketReference|orderReference|project|serviceCode|engagement)|details\.(marketObject|personInCharge|fundingProgramme|returnEmail)|details\.interventions\.\d{1,3}\.(label|description|days)|buyer\.(name|addressLine1|addressLine2|postalCode|city|siren|siret|vatId|email|electronicAddress)|lines\.\d{1,3}\.(description|quantity|unitPrice|discountPercent|vatRate)|legalNotes\.(recovery|penalties|discount))$/.test(p);
const fieldLabel=(p:string)=>p==='description'?'la description du document':({marketObject:'l’objet du marché',personInCharge:'la personne en charge',fundingProgramme:'le programme de financement',returnEmail:'l’adresse de retour',marketReference:'le numéro du marché',orderReference:'le bon de commande',project:'le projet',businessCode:'le code affaire',serviceCode:'le code service',engagement:'le numéro d’engagement',postalCode:'le code postal',vatId:'le numéro de TVA',days:'le nombre de jours',label:'l’intitulé',recovery:'l’indemnité de recouvrement',penalties:'les pénalités',discount:'l’escompte',title:'l’objet du document',issueDate:'la date du document',dueDate:'l’échéance',validUntil:'la validité',paymentTerms:'les conditions de paiement',notes:'les informations complémentaires',name:'le nom',description:'la prestation',quantity:'la quantité',unitPrice:'le prix unitaire HT',discountPercent:'la remise',vatRate:'le taux TVA',addressLine1:'l’adresse',addressLine2:'le complément d’adresse',city:'la ville',siret:'le SIRET',siren:'le SIREN',email:'l’e-mail'} as Record<string,string>)[p.split('.').at(-1)!]||p;
