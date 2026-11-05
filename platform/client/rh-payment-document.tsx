import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Printer,ZoomIn,Pencil,FileSpreadsheet,FileDown,ChevronLeft,ChevronRight} from 'lucide-react';
import {rhDate,type RhPaymentEntry,type RhPeriod} from '../rh-domain';
import {rhPaymentGroups,rhPaymentSegments,type RhPaymentGroup,type RhPaymentSegment} from '../rh-payment-layout';
import {rhAttestationTitle,rhAttestationText} from '../rh-document-presentation';
import {maritimeLogoData,epcicLogoData} from '../rh-workbook-branding';
import type {RhPaper} from './rh-preview';
import './rh-payment-document.css';

const money=(n:number|null|undefined)=>n==null?'':new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n/100);
const date=(s:string)=>rhDate(s)?new Date(s+'T12:00:00').toLocaleDateString('fr-FR'):'';
const month=(s:string)=>/^\d{4}-\d{2}$/.test(s)?new Date(s+'-01T12:00:00').toLocaleDateString('fr-FR',{month:'short',year:'2-digit'}):'À préciser';
type Page={group:RhPaymentGroup;segments:RhPaymentSegment[];intro?:boolean;introHeight?:number;introScale?:number;certification?:boolean;empty?:boolean;usedHeight:number};
const widths=[22,15,25,30,16,23,27,23,24,25,24,23];

function Table({source,segments,mergeAgents=true}:{source:RhPaper;segments:RhPaymentSegment[];mergeAgents?:boolean}){
 const shown:RhPaymentSegment[]=[];
 for(const segment of segments){const previous=shown[shown.length-1];if(mergeAgents&&previous?.block.key===segment.block.key&&previous.end===segment.start)previous.end=segment.end;else shown.push({...segment});}
 const runs:{agentId:string;name:string;segments:RhPaymentSegment[]}[]=[];
 for(const segment of shown){const previous=runs[runs.length-1];if(mergeAgents&&previous?.agentId===segment.block.agentId)previous.segments.push(segment);else runs.push({agentId:segment.block.agentId,name:segment.block.agentName,segments:[segment]});}
 const paymentCells=(kind:'salary'|'contribution',entries:RhPaymentEntry[],index:number,segment:RhPaymentSegment)=>{
  const merged=entries.length===1;if(merged&&index!==segment.start)return null;const p=merged?entries[0]:entries[index],span=merged?segment.end-segment.start:1;
  return kind==='salary'?<><td rowSpan={span} className="rh-payment-cell" data-payment-id={p?.id}>{p?.reference}</td><td rowSpan={span} className="rh-payment-cell">{p&&date(p.date)}</td><td rowSpan={span} className="rh-payment-cell rh-number">{money(p?.amountCents)}</td></>:<><td rowSpan={span} className="rh-payment-cell" data-payment-id={p?.id}>{p?.organism}</td><td rowSpan={span} className="rh-payment-cell rh-number">{money(p?.amountCents)}</td><td rowSpan={span} className="rh-payment-cell">{p&&date(p.date)}</td></>;
 };
 return <table className="rh-a4-table"><colgroup>{widths.map((width,i)=><col key={i} style={{width:(width/277*100)+'%'}}/>)}</colgroup><thead><tr><th rowSpan={2} scope="col">Agent</th><th rowSpan={2} scope="col">Bulletins de salaire</th><th rowSpan={2} scope="col">Montant mensuel versé par l’employeur</th><th rowSpan={2} scope="col">Projet</th><th rowSpan={2} scope="col">% de temps de travail sur le projet</th><th rowSpan={2} scope="col">Montant total rendu-compte sur le projet</th><th colSpan={3} scope="colgroup">Informations sur le paiement des SALAIRES</th><th colSpan={3} scope="colgroup">Informations sur le paiement des CHARGES</th></tr><tr><th scope="col">N° de mandat de paiement</th><th scope="col">Date de paiement effectif</th><th scope="col">Montant du mandat de paiement</th><th scope="col">Organismes</th><th scope="col">Montant total versé aux organismes</th><th scope="col">Date de paiement effectif</th></tr></thead>
 {runs.map((run,position)=><tbody key={run.agentId+'|'+position} data-segment={position} data-agent={run.agentId} data-month={run.segments.length===1?run.segments[0].block.month:undefined}>
  {run.segments.flatMap((segment,segmentIndex)=>{const block=segment.block;return Array.from({length:segment.end-segment.start},(_,offset)=>{const index=segment.start+offset,line=block.lines[index];return <tr key={block.key+'|'+index} data-line-id={line?.id} data-agent={block.agentId} data-month={block.month}>
   {!segmentIndex&&!offset&&<td rowSpan={run.segments.reduce((n,s)=>n+s.end-s.start,0)} className="rh-a4-agent"><strong>{run.name}</strong></td>}
   {!offset&&<><td rowSpan={segment.end-segment.start}>{month(block.month)}</td><td rowSpan={segment.end-segment.start} className="rh-number">{block.employerCostCents===null?<span className="rh-missing">À compléter</span>:money(block.employerCostCents)}{block.lines.some(l=>l.payrollState==='unconfirmed')&&<small className="rh-missing">À vérifier</small>}</td></>}
   <td>{line?source.projects.find(p=>p.id===line.projectId)?.name:''}</td><td className="rh-number">{line?(line.rateBasisPoints===null?<span className="rh-missing">À compléter</span>:line.rateBasisPoints/100+' %'):''}</td><td className="rh-number"><strong>{line?(line.allocatedCents===null?<span className="rh-missing">{line.payrollState==='unconfirmed'?'À vérifier':'À compléter'}</span>:money(line.allocatedCents)):''}</strong></td>
   {paymentCells('salary',block.salaryPayments,index,segment)}{paymentCells('contribution',block.contributionPayments,index,segment)}
  </tr>;});})}
 </tbody>)}</table>;
}
function Heading({source,group,projects}:{source:RhPaper;group:RhPaymentGroup;projects:RhPeriod[]}){
 return <div className="rh-a4-heading"><div className="rh-a4-logos"><div>{/marit/i.test(group.programme)?<img src={maritimeLogoData} alt="Interreg Italie–France Maritime"/>:<strong>{group.programme}</strong>}</div>{source.client.logoData||/EPCIC|COMMERCE.*CORSE/i.test(source.client.name)?<img src={source.client.logoData||epcicLogoData} alt={source.client.name}/>:<strong>{source.client.name}</strong>}</div>
 <h2>{rhAttestationTitle(source.client.name)}</h2><p className="rh-paper-declaration">{rhAttestationText(source.client.name,group.periods)}</p>
 {!!projects.length&&<div className="rh-a4-projects">{projects.map(p=><div key={p.id}><strong>{source.projects.find(x=>x.id===p.projectId)?.code} · {source.projects.find(x=>x.id===p.projectId)?.name}</strong><span>{date(p.startDate)} — {date(p.endDate)}</span></div>)}</div>}</div>;
}
function Certification(){return <section className="rh-a4-certification"><p>Je soussigné ________________ en qualité de ______________________________, certifie les informations de paiements susmentionnées.</p><div><span>Fait à ____________</span><span>Le ___________</span></div></section>;}
function Footer({page,count}:{page?:number;count?:number}){return <footer className="rh-a4-footer"><span>{page?'Page '+page+' / '+count:'Page'}</span></footer>;}

export function RhPaymentDocument({source,busy=false,onEditPayments,onExportExcel}:{source:RhPaper;busy?:boolean;onEditPayments?:()=>void;onExportExcel?:()=>void}){
 const groups=useMemo(()=>{const result=rhPaymentGroups(source);return result.length?result:[{key:'empty',name:'RH',programme:'',periods:[],blocks:[]}];},[source]);
 const introGroup={...groups[0],periods:source.periods,programme:[...new Set(groups.map(g=>g.programme).filter(Boolean))].join(' · ')};
 const measure=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null),pagesRef=useRef<HTMLDivElement>(null);
 const [pages,setPages]=useState<Page[]>([]),[segmentLimit,setSegmentLimit]=useState(8),[width,setWidth]=useState(1100),[viewerHeight,setViewerHeight]=useState(600),[currentPage,setCurrentPage]=useState(1),[pdfBusy,setPDFBusy]=useState(false),[zoom,setZoom]=useState('fit'),[printError,setPrintError]=useState('');
 const pdfJob=useRef<AbortController|null>(null);
 useEffect(()=>()=>pdfJob.current?.abort(),[]);
 useEffect(()=>{viewport.current?.scrollTo({top:0,left:0});setCurrentPage(1);},[source.id,source.documentId]);
 useLayoutEffect(()=>{const element=viewport.current;if(!element)return;const observer=new ResizeObserver(entries=>{setWidth(entries[0].contentRect.width);setViewerHeight(entries[0].contentRect.height);});observer.observe(element);return()=>observer.disconnect();},[]);
 useLayoutEffect(()=>{
  const root=measure.current;if(!root)return;const next:Page[]=[];let smaller=false;
  const headingHeight=root.querySelector('[data-document-heading]')!.getBoundingClientRect().height;
  const emptyHeight=root.querySelector('[data-empty-placeholder]')!.getBoundingClientRect().height;
  const footerHeight=root.querySelector('footer')!.getBoundingClientRect().height,certHeight=root.querySelector('.rh-a4-certification')!.getBoundingClientRect().height;
  // The introduction belongs to the document, not to each programme/date group.
  const available=190*96/25.4-footerHeight-4,introScale=Math.min(1,available/Math.max(1,headingHeight)),introHeight=headingHeight*introScale;
  const heights=new Map<RhPaymentSegment,number>(),headers=new Map<string,number>();
  groups.forEach((group,groupIndex)=>{
   const measured=root.querySelectorAll('[data-measure-group]')[groupIndex],header=measured.querySelector('thead')!.getBoundingClientRect().height;
   const rows=[...measured.querySelectorAll('tbody')],segments=rhPaymentSegments(group,segmentLimit);headers.set(group.key,header);
   let current:Page={group,segments:[],intro:groupIndex===0,introHeight,introScale,usedHeight:groupIndex===0?introHeight:0};
   segments.forEach((segment,i)=>{
    const h=rows[i]?.getBoundingClientRect().height||24;heights.set(segment,h);
    if(h+header>available&&segmentLimit>1){smaller=true;return;}
    const added=h+(current.segments.length?0:header);
    if(current.usedHeight+added>available&&(current.intro||current.segments.length)){next.push(current);current={group,segments:[],usedHeight:0};}
    current.usedHeight+=h+(current.segments.length?0:header);current.segments.push(segment);
   });
   if(!segments.length){if(current.intro&&current.usedHeight+emptyHeight>available){next.push(current);current={group,segments:[],usedHeight:0};}current.usedHeight+=emptyHeight;current.empty=true;}
   next.push(current);
  });
  if(smaller){setSegmentLimit(limit=>Math.max(1,Math.floor(limit/2)));return;}
  const last=next[next.length-1];
  if(last.usedHeight+certHeight<=available)last.certification=true;
  else{
   // Move only trailing table blocks when the final declaration needs its own page.
   const header=headers.get(last.group.key)||0,moved:RhPaymentSegment[]=[];let height=header;
   while(last.segments.length){const candidate=last.segments[last.segments.length-1],h=heights.get(candidate)||24;if(height+h+certHeight>available)break;moved.unshift(last.segments.pop()!);height+=h;last.usedHeight-=h;}
   if(!last.segments.length&&!last.intro)next.pop();
   next.push({group:last.group,segments:moved,usedHeight:moved.length?height:0,certification:true});
  }
  setPages(next);
 },[groups,segmentLimit]);
 const scale=zoom==='100'?1:Math.max(.15,Math.min(1,(width-24)/(297*96/25.4),(viewerHeight-24)/(210*96/25.4)));
 const pagePitch=210*96/25.4*scale+24;
 const turnPage=(next:number)=>{viewport.current?.scrollTo({top:(next-1)*pagePitch,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};
 const exportPDF=async()=>{
  if(pdfBusy||busy||!pagesRef.current)return;setPrintError('');setPDFBusy(true);const controller=new AbortController();pdfJob.current=controller;
  try{const {exportRhPaymentPdf}=await import('./rh-payment-pdf');const blob=await exportRhPaymentPdf(pagesRef.current,{title:source.name,signal:controller.signal});if(controller.signal.aborted)return;
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=(source.name.replace(/[<>:"/\\|?*]/g,'_')||'Paiement_RH')+'.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(error){if(!controller.signal.aborted)setPrintError(error instanceof Error?error.message:'Le PDF ne peut pas être exporté.');}finally{if(!controller.signal.aborted)setPDFBusy(false);if(pdfJob.current===controller)pdfJob.current=null;}
 };
 const print=()=>{
  setPrintError('');const popup=window.open('','_blank');if(!popup){setPrintError('Autorisez l’ouverture de la fenêtre d’impression pour continuer.');return;}
  popup.document.title=source.name;popup.document.documentElement.lang='fr';popup.document.body.className='rh-app rh-print-document';popup.opener=null;
  const styles=[...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
  const ready=styles.map(original=>new Promise<void>(resolve=>{const link=popup.document.createElement('link');link.rel='stylesheet';link.href=original.href;link.onload=()=>resolve();link.onerror=()=>resolve();popup.document.head.append(link);}));
  pagesRef.current?.querySelectorAll('.rh-a4-page').forEach(page=>{const copy=page.cloneNode(true) as HTMLElement;copy.style.transform='none';popup.document.body.append(copy);});
  void Promise.all(ready).then(async()=>{await popup.document.fonts.ready;await Promise.all([...popup.document.images].map(img=>img.complete?Promise.resolve():new Promise<void>(resolve=>{img.onload=()=>resolve();img.onerror=()=>resolve();})));if(!popup.closed){popup.focus();popup.print();}});
 };
 return <div className="rh-a4-viewer">
  <div className="rh-a4-controls"><div className="rh-a4-navigation"><button className="rh-button rh-quiet" type="button" aria-label="Page précédente du document" disabled={currentPage<=1} onClick={()=>turnPage(currentPage-1)}><ChevronLeft size={17}/></button><span aria-live="polite">Page {Math.min(currentPage,pages.length)||1} / {pages.length||1}</span><button className="rh-button rh-quiet" type="button" aria-label="Page suivante du document" disabled={currentPage>=pages.length} onClick={()=>turnPage(currentPage+1)}><ChevronRight size={17}/></button><label><ZoomIn size={16}/><select aria-label="Zoom du document" value={zoom} onChange={e=>setZoom(e.target.value)}><option value="fit">Page entière</option><option value="100">Taille réelle · 100 %</option></select></label></div><div className="rh-a4-actions">{onEditPayments&&<button type="button" className="rh-button" disabled={busy||pdfBusy||!source.periods.length} onClick={onEditPayments}><span><Pencil size={16}/>Modifier les informations de paiements</span></button>}<button type="button" className="rh-button" disabled={busy||pdfBusy||!pages.length} onClick={print}><span><Printer size={16}/>Imprimer</span></button>{onExportExcel&&<button type="button" className="rh-button rh-excel-button" disabled={busy||pdfBusy||!source.periods.length} onClick={onExportExcel} title={source.provisional?'Exporter le brouillon. Pour le retour financier, exportez le document après validation.':undefined}><span><FileSpreadsheet size={16}/>Exporter en Excel</span></button>}<button type="button" className="rh-button rh-pdf-button" disabled={busy||pdfBusy||!pages.length} onClick={()=>void exportPDF()}><span><FileDown size={16}/>Exporter en PDF</span></button></div></div>
  {pdfBusy&&<p className="rh-busy" role="status">Export du PDF…</p>}
  {printError&&<p role="alert" className="rh-error">{printError}</p>}
  <div className="rh-a4-scroll" ref={viewport} tabIndex={0} aria-label="Document de paiement, défilement des pages" onScroll={e=>setCurrentPage(Math.max(1,Math.min(pages.length,Math.floor((e.currentTarget.scrollTop+viewerHeight*.25)/pagePitch)+1)))}><div className="rh-a4-pages" ref={pagesRef}>{pages.map((page,i)=><div className="rh-a4-sheet-wrap" key={page.group.key+'|'+i} style={{width:297*96/25.4*scale,height:210*96/25.4*scale}}><article className="rh-a4-page rh-paper" style={{transform:`scale(${scale})`}} aria-label={'Page '+(i+1)+' du document'}>{page.intro&&<div className="rh-a4-intro" style={page.introScale!<1?{height:page.introHeight}:undefined}><div style={page.introScale!<1?{transform:`scale(${page.introScale})`,transformOrigin:'top left'}:undefined}><Heading source={source} group={introGroup} projects={source.periods}/></div></div>}{page.segments.length?<Table source={source} segments={page.segments}/>:page.empty&&<p className="rh-paper-placeholder">{source.periods.length?'Agents et périodes à compléter':'Projets et périodes à compléter'}</p>}{page.certification&&<Certification/>}<Footer page={i+1} count={pages.length}/></article></div>)}</div></div>
  <div className="rh-a4-measure" ref={measure} aria-hidden="true"><div className="rh-a4-page"><div data-document-heading><Heading source={source} group={introGroup} projects={source.periods}/></div><Certification/><Footer/><p className="rh-paper-placeholder" data-empty-placeholder>Agents et périodes à compléter</p></div>{groups.map(group=><div className="rh-a4-page" data-measure-group key={group.key}><Table source={source} segments={rhPaymentSegments(group,segmentLimit)} mergeAgents={false}/></div>)}</div>
 </div>;
}
