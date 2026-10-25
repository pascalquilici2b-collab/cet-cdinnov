import {useEffect,useMemo,useRef,useState} from 'react';
import {read,utils,type WorkBook} from 'xlsx';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import type {PaymentFocus} from './stamping-payment-preview';
const PAGE=100;
export function StampWorkbookPreview({file,name,focus}:{file:Blob;name:string;focus:PaymentFocus|null}){
 const [book,setBook]=useState<WorkBook|null>(null),[sheet,setSheet]=useState(''),[start,setStart]=useState(0),[error,setError]=useState('');const view=useRef<HTMLDivElement>(null);
 useEffect(()=>{let active=true;setBook(null);setError('');void(async()=>{const input=/\.csv$/i.test(name)?await file.text():await file.arrayBuffer(),wb=read(input,{type:typeof input==='string'?'string':'array',cellStyles:true,cellNF:true,cellHTML:false,cellFormula:false,bookVBA:false});if(wb.SheetNames.length>25)throw Error('Le classeur dépasse la capacité de l’aperçu.');for(const n of wb.SheetNames){const r=utils.decode_range(wb.Sheets[n]['!ref']||'A1');if(r.e.r>5000||r.e.c>99)throw Error('Feuille trop grande pour l’aperçu.');}if(active){setBook(wb);setSheet(wb.SheetNames[0]||'');setStart(0);}})().catch(e=>{if(active)setError(e.message||'Aperçu Excel indisponible.');});return()=>{active=false;};},[file,name]);
 useEffect(()=>{if(!book||!focus)return;if(focus.sheet&&book.SheetNames.includes(focus.sheet))setSheet(focus.sheet);const row=focus.row||Number(focus.cell?.match(/\d+$/)?.[0]);if(row>0)setStart(Math.floor((row-1)/PAGE)*PAGE);},[focus,book]);
 const ws=book?.Sheets[sheet],range=utils.decode_range(ws?.['!ref']||'A1'),last=Math.min(start+PAGE-1,range.e.r),cols=range.e.c+1;
 const rows=useMemo(()=>{
  if(!ws)return [];const merges=ws['!merges']||[],result=[];
  for(let r=start;r<=last;r++){const cells=[];for(let c=0;c<cols;c++){
   const merged=merges.find(m=>r>=m.s.r&&r<=m.e.r&&c>=m.s.c&&c<=m.e.c);if(merged&&(c!==merged.s.c||r!==Math.max(start,merged.s.r)))continue;
   const address=utils.encode_cell(merged?merged.s:{r,c}),cell=ws[address],fill=cell?.s?.fgColor?.rgb;
   cells.push({address,text:cell?utils.format_cell(cell):'',rowSpan:merged?Math.min(last,merged.e.r)-r+1:1,colSpan:merged?merged.e.c-c+1:1,color:/^[\da-f]{6}$/i.test(fill||'')?'#'+fill:undefined,ink:/^[\da-f]{6}$/i.test(fill||'')&&(.2126*parseInt(fill.slice(0,2),16)+.7152*parseInt(fill.slice(2,4),16)+.0722*parseInt(fill.slice(4,6),16))<135?'#fff':'#202a36',numeric:cell?.t==='n'});
  }result.push({r,cells});}return result;
 },[ws,start,last,cols]);
 useEffect(()=>{if(!focus)return;const pane=view.current,cell=pane?.querySelector('[data-focused=true]');if(!pane||!cell)return;const p=pane.getBoundingClientRect(),c=cell.getBoundingClientRect();pane.scrollBy({left:c.left-p.left-(p.width-c.width)/2,top:c.top<p.top+35?c.top-p.top-35:c.bottom>p.bottom?c.bottom-p.bottom:0});},[focus,rows]);
 if(error)return <p role="alert" className="stamp-preview-feedback">{error}</p>;
 if(!book)return <p role="status" className="stamp-preview-feedback">Lecture du classeur…</p>;
 return <><div className="stamp-payment-controls"><select aria-label="Feuille du document de paiement" value={sheet} onChange={e=>{setSheet(e.target.value);setStart(0);}}>{book.SheetNames.map(n=><option key={n}>{n}</option>)}</select><button aria-label="Lignes précédentes" disabled={start===0} onClick={()=>setStart(n=>Math.max(0,n-PAGE))}><ChevronLeft size={17}/></button><span>{start+1}–{last+1} / {range.e.r+1}</span><button aria-label="Lignes suivantes" disabled={last>=range.e.r} onClick={()=>setStart(n=>n+PAGE)}><ChevronRight size={17}/></button></div><div ref={view} className="stamp-workbook-scroll" tabIndex={0} aria-label="Contenu du document de paiement"><table><thead><tr><th></th>{Array.from({length:cols},(_,c)=><th key={c}>{utils.encode_col(c)}</th>)}</tr></thead><tbody>{rows.map(({r,cells})=><tr key={r}><th>{r+1}</th>{cells.map(cell=><td key={cell.address} data-focused={focus?.sheet===sheet&&cell.address===focus.cell} rowSpan={cell.rowSpan} colSpan={cell.colSpan} style={{background:cell.color,color:cell.ink,textAlign:cell.numeric?'right':undefined}}>{cell.text}</td>)}</tr>)}</tbody></table></div></>;
}
