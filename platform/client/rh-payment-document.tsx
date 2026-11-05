import React,{useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Printer,ZoomIn} from 'lucide-react';
import {rhDate,type RhPaymentEntry,type RhPeriod} from '../rh-domain';
import {rhPaymentGroups,rhPaymentSegments,type RhPaymentGroup,type RhPaymentSegment} from '../rh-payment-layout';
import {rhAttestationTitle,rhAttestationText} from '../rh-document-presentation';
import {maritimeLogoData,epcicLogoData} from '../rh-workbook-branding';
import type {RhPaper} from './rh-preview';
import {RhAvatar} from './rh-avatar';
import './rh-payment-document.css';

const money=(n:number|null|undefined)=>n==null?'':new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n/100);
const date=(s:string)=>rhDate(s)?new Date(s+'T12:00:00').toLocaleDateString('fr-FR'):'';
const month=(s:string)=>/^\d{4}-\d{2}$/.test(s)?new Date(s+'-01T12:00:00').toLocaleDateString('fr-FR',{month:'short',year:'2-digit'}):'À préciser';
type Page={group:RhPaymentGroup;segments:RhPaymentSegment[];projects:RhPeriod[];cover?:boolean};
const widths=[22,15,25,30,16,23,27,23,24,25,24,23];

function Table({source,segments}:{source:RhPaper;segments:RhPaymentSegment[]}){
 const paymentCells=(kind:'salary'|'contribution',entries:RhPaymentEntry[],index:number,segment:RhPaymentSegment)=>{
  const merged=entries.length===1;if(merged&&index!==segment.start)return null;const p=merged?entries[0]:entries[index],span=merged?segment.end-segment.start:1;
  return kind==='salary'?<><td rowSpan={span} className="rh-payment-cell" data-payment-id={p?.id}>{p?.reference}</td><td rowSpan={span} className="rh-payment-cell">{p&&date(p.date)}</td><td rowSpan={span} className="rh-payment-cell rh-number">{money(p?.amountCents)}</td></>:<><td rowSpan={span} className="rh-payment-cell" data-payment-id={p?.id}>{p?.organism}</td><td rowSpan={span} className="rh-payment-cell rh-number">{money(p?.amountCents)}</td><td rowSpan={span} className="rh-payment-cell">{p&&date(p.date)}</td></>;
 };
 return <table className="rh-a4-table"><colgroup>{widths.map((width,i)=><col key={i} style={{width:(width/277*100)+'%'}}/>)}</colgroup><thead><tr><th rowSpan={2} scope="col">Agent</th><th rowSpan={2} scope="col">Bulletins de salaire</th><th rowSpan={2} scope="col">Montant mensuel versé par l’employeur</th><th rowSpan={2} scope="col">Projet</th><th rowSpan={2} scope="col">% de temps de travail sur le projet</th><th rowSpan={2} scope="col">Montant total rendu-compte sur le projet</th><th colSpan={3} scope="colgroup">Informations sur le paiement des SALAIRES</th><th colSpan={3} scope="colgroup">Informations sur le paiement des CHARGES</th></tr><tr><th scope="col">N° de mandat de paiement</th><th scope="col">Date de paiement effectif</th><th scope="col">Montant du mandat de paiement</th><th scope="col">Organismes</th><th scope="col">Montant total versé aux organismes</th><th scope="col">Date de paiement effectif</th></tr></thead>
 {segments.map((segment,position)=>{const block=segment.block;return <tbody key={block.key+'|'+segment.start} data-segment={position} data-agent={block.agentId} data-month={block.month}>
  {Array.from({length:segment.end-segment.start},(_,offset)=>{const index=segment.start+offset,line=block.lines[index];return <tr key={index} data-line-id={line?.id}>
   {!offset&&<><td rowSpan={segment.end-segment.start} className="rh-a4-agent"><RhAvatar name={block.agentName} small/><strong>{block.agentName}</strong>{segment.continuation&&<small>suite</small>}</td><td rowSpan={segment.end-segment.start}>{month(block.month)}</td><td rowSpan={segment.end-segment.start} className="rh-number">{block.employerCostCents===null?<span className="rh-missing">À compléter</span>:money(block.employerCostCents)}{block.lines.some(l=>l.payrollState==='unconfirmed')&&<small className="rh-missing">À vérifier</small>}</td></>}
   <td>{line?source.projects.find(p=>p.id===line.projectId)?.name:''}</td><td className="rh-number">{line?(line.rateBasisPoints===null?<span className="rh-missing">À compléter</span>:line.rateBasisPoints/100+' %'):''}</td><td className="rh-number"><strong>{line?(line.allocatedCents===null?<span className="rh-missing">{line.payrollState==='unconfirmed'?'À vérifier':'À compléter'}</span>:money(line.allocatedCents)):''}</strong></td>
   {paymentCells('salary',block.salaryPayments,index,segment)}{paymentCells('contribution',block.contributionPayments,index,segment)}
  </tr>;})}
 </tbody>;})}</table>;
}
function Heading({source,group,projects}:{source:RhPaper;group:RhPaymentGroup;projects:RhPeriod[]}){
 return <div className="rh-a4-heading"><div className="rh-a4-logos"><div>{/marit/i.test(group.programme)?<img src={maritimeLogoData} alt="Interreg Italie–France Maritime"/>:<strong>{group.programme}</strong>}</div>{source.client.logoData||/EPCIC|COMMERCE.*CORSE/i.test(source.client.name)?<img src={source.client.logoData||epcicLogoData} alt={source.client.name}/>:<strong>{source.client.name}</strong>}</div>
 <h2>{rhAttestationTitle(source.client.name)}</h2><p className="rh-paper-declaration">{rhAttestationText(source.client.name,group.periods)}</p>
 {!!projects.length&&<div className="rh-a4-projects">{projects.map(p=><div key={p.id}><strong>{source.projects.find(x=>x.id===p.projectId)?.code} · {source.projects.find(x=>x.id===p.projectId)?.name}</strong><span>{date(p.startDate)} — {date(p.endDate)}</span></div>)}</div>}</div>;
}
function Footer({source,page,count}:{source:RhPaper;page?:number;count?:number}){return <footer className="rh-a4-footer"><span>{source.provisional?'Document en préparation':'Version RH '+source.revision}</span><span>Date, qualité et signature du service financier : ____________________</span><span>{page?'Page '+page+' / '+count:'Page'}</span></footer>;}

export function RhPaymentDocument({source}:{source:RhPaper}){
 const groups=useMemo(()=>{const result=rhPaymentGroups(source);return result.length?result:[{key:'empty',name:'RH',programme:'',periods:[],blocks:[]}];},[source]);
 const measure=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null),pagesRef=useRef<HTMLDivElement>(null);
 const [pages,setPages]=useState<Page[]>([]),[segmentLimit,setSegmentLimit]=useState(8),[width,setWidth]=useState(1100),[zoom,setZoom]=useState('fit'),[printError,setPrintError]=useState('');
 useLayoutEffect(()=>{const element=viewport.current;if(!element)return;const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));observer.observe(element);return()=>observer.disconnect();},[]);
 useLayoutEffect(()=>{
  const root=measure.current;if(!root)return;const next:Page[]=[];let smaller=false;
  groups.forEach((group,groupIndex)=>{
   const measured=root.children[groupIndex] as HTMLElement,table=measured.querySelector('table')!,rows=[...measured.querySelectorAll('tbody')];
   const fullHeading=measured.querySelector('[data-full-heading]')!.getBoundingClientRect().height,compactHeading=measured.querySelector('[data-compact-heading]')!.getBoundingClientRect().height;
   const header=table.querySelector('thead')!.getBoundingClientRect().height,footer=measured.querySelector('footer')!.getBoundingClientRect().height;
   const available=210*96/25.4-20*96/25.4-header-footer-16;
   const cover=group.periods.length>8||available-fullHeading<180,capacity=available-(cover?compactHeading:fullHeading),segments=rhPaymentSegments(group,segmentLimit);
   if(cover)for(let i=0;i<group.periods.length;i+=8)next.push({group,projects:group.periods.slice(i,i+8),segments:[],cover:true});
   let current:RhPaymentSegment[]=[],height=0;
   segments.forEach((segment,i)=>{const h=rows[i]?.getBoundingClientRect().height||24;if(h>capacity&&segmentLimit>1){smaller=true;return;}if(current.length&&height+h>capacity){next.push({group,projects:cover?[]:group.periods,segments:current});current=[];height=0;}current.push(segment);height+=h;});
   if(current.length||!segments.length)next.push({group,projects:cover?[]:group.periods,segments:current});
  });
  if(smaller){setSegmentLimit(1);return;}setPages(next);
 },[groups,segmentLimit]);
 const scale=zoom==='100'?1:Math.max(.15,Math.min(1,(width-2)/(297*96/25.4)));
 const print=()=>{
  setPrintError('');const popup=window.open('','_blank');if(!popup){setPrintError('Autorisez l’ouverture de la fenêtre d’impression pour continuer.');return;}
  popup.document.title=source.name;popup.document.documentElement.lang='fr';popup.document.body.className='rh-app rh-print-document';popup.opener=null;
  const styles=[...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
  const ready=styles.map(original=>new Promise<void>(resolve=>{const link=popup.document.createElement('link');link.rel='stylesheet';link.href=original.href;link.onload=()=>resolve();link.onerror=()=>resolve();popup.document.head.append(link);}));
  pagesRef.current?.querySelectorAll('.rh-a4-page').forEach(page=>{const copy=page.cloneNode(true) as HTMLElement;copy.style.transform='none';popup.document.body.append(copy);});
  void Promise.all(ready).then(async()=>{await popup.document.fonts.ready;await Promise.all([...popup.document.images].map(img=>img.complete?Promise.resolve():new Promise<void>(resolve=>{img.onload=()=>resolve();img.onerror=()=>resolve();})));if(!popup.closed){popup.focus();popup.print();}});
 };
 return <div className="rh-a4-viewer" ref={viewport}>
  <div className="rh-a4-controls"><span>A4 paysage · {pages.length||1} page{pages.length>1?'s':''}</span><div><label><ZoomIn size={16}/><select aria-label="Zoom du document" value={zoom} onChange={e=>setZoom(e.target.value)}><option value="fit">Adapter à l’écran</option><option value="100">Taille réelle · 100 %</option></select></label><button type="button" className="rh-button" disabled={!pages.length} onClick={print}><span><Printer size={16}/>Imprimer / PDF</span></button></div></div>
  {printError&&<p role="alert" className="rh-error">{printError}</p>}
  <div className="rh-a4-scroll"><div className="rh-a4-pages" ref={pagesRef}>{pages.map((page,i)=><div className="rh-a4-sheet-wrap" key={page.group.key+'|'+i} style={{width:297*96/25.4*scale,height:210*96/25.4*scale}}><article className="rh-a4-page rh-paper" style={{transform:`scale(${scale})`}} aria-label={'Page '+(i+1)+' du document'}><Heading source={source} group={page.group} projects={page.projects}/>{!page.cover&&(page.segments.length?<Table source={source} segments={page.segments}/>:<p className="rh-paper-placeholder">{page.group.periods.length?'Agents et périodes à compléter':'Projets et périodes à compléter'}</p>)}<Footer source={source} page={i+1} count={pages.length}/></article></div>)}</div></div>
  <div className="rh-a4-measure" ref={measure} aria-hidden="true">{groups.map(group=><div className="rh-a4-page" key={group.key}><div data-full-heading><Heading source={source} group={group} projects={group.periods}/></div><div data-compact-heading><Heading source={source} group={group} projects={[]}/></div><Table source={source} segments={rhPaymentSegments(group,segmentLimit)}/><Footer source={source}/></div>)}</div>
 </div>;
}
