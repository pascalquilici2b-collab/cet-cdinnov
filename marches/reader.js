import {Unzip,UnzipInflate,strFromU8} from 'fflate';
import {pdfTextRows,needsPdfOcr,joinPriceTableRows} from './pdf-text.mjs';
const MAX_TEXT=500000,MAX_PAGES=150;
const asset=name=>new URL('marches/vendor/'+name,location.href).href;
function xml(text){if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('XML externe non accepté.');const d=new DOMParser().parseFromString(text,'application/xml');if(d.querySelector('parsererror'))throw new Error('Document Office illisible.');return d;}
const elements=(node,name)=>[...node.getElementsByTagNameNS('*',name)];
function unpack(bytes){
 const files={};let total=0,count=0;files.skippedParts=[];
 const unzip=new Unzip(file=>{
  if(/^(word\/(media|header|footer|footnotes|endnotes|embeddings)|xl\/(media|drawings|embeddings))/.test(file.name))files.skippedParts.push(file.name);
  if(!/^(word\/document\.xml|xl\/(workbook\.xml|_rels\/workbook\.xml.rels|sharedStrings\.xml|styles\.xml|worksheets\/sheet\d+\.xml))$/.test(file.name))return;
  if(++count>200)throw new Error('Trop de feuilles dans ce document.');
  const chunks=[];file.ondata=(error,data,final)=>{if(error)throw error;total+=data.length;if(total>16000000){file.terminate();throw new Error('Document Office décompressé trop volumineux (16 Mo).');}chunks.push(data);if(final){const all=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let off=0;for(const c of chunks){all.set(c,off);off+=c.length;}files[file.name]=strFromU8(all);}};file.start();
 });unzip.register(UnzipInflate);
 // Apply the expanded-size check between small inflation steps, even when the
 // ZIP's declared uncompressed sizes are absent or forged.
 for(let offset=0;offset<bytes.length;offset+=4096)unzip.push(bytes.subarray(offset,offset+4096),offset+4096>=bytes.length);
 return files;
}
function office(bytes,name){
 const files=unpack(bytes);const warnings=[];if(files.skippedParts.length)warnings.push('Le texte et les tableaux ont été lus. Vérifiez aussi les images, notes, en-têtes et objets intégrés dans l’original.');let text='',pages=1;
 if(/\.docx$/i.test(name)){
  const doc=xml(files['word/document.xml']||'');const body=elements(doc,'body')[0];
  if(!body)throw new Error('Texte Word absent.');
  for(const node of body.children){if(node.localName==='p')text+=elements(node,'t').map(x=>x.textContent).join('')+'\n';else if(node.localName==='tbl')for(const row of elements(node,'tr'))text+=elements(row,'tc').map(c=>elements(c,'t').map(t=>t.textContent).join(' ')).join(' | ')+'\n';}
  text='[Document Word — paragraphes et tableaux]\n'+text;
 }else{
  const wb=xml(files['xl/workbook.xml']||''),rels=xml(files['xl/_rels/workbook.xml.rels']||'');
  const shared=files['xl/sharedStrings.xml']?elements(xml(files['xl/sharedStrings.xml']),'si').map(s=>elements(s,'t').map(t=>t.textContent).join('')):[];
  const styles=files['xl/styles.xml']?xml(files['xl/styles.xml']):null,formats=Object.fromEntries((styles?elements(styles,'numFmt'):[]).map(n=>[n.getAttribute('numFmtId'),n.getAttribute('formatCode')]));
  const xf=styles?elements(styles,'cellXfs')[0]?.children||[]:[],date1904=elements(wb,'workbookPr')[0]?.getAttribute('date1904')==='1';
  const sheets=elements(wb,'sheet');pages=sheets.length;if(pages>150)throw new Error('Maximum 150 feuilles par classeur.');
  for(const sheet of sheets){
   const rid=sheet.getAttribute('r:id'),rel=elements(rels,'Relationship').find(r=>r.getAttribute('Id')===rid);let target=rel?.getAttribute('Target')||'';
   target=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
   if(!/^xl\/worksheets\/sheet\d+\.xml$/.test(target)||!files[target])throw new Error('Feuille Excel non lisible.');
   text+='\n[Feuille '+sheet.getAttribute('name')+']\n';const doc=xml(files[target]);
   for(const row of elements(doc,'row')){const values=[];for(const cell of elements(row,'c')){
    const type=cell.getAttribute('t'),raw=elements(cell,'v')[0]?.textContent||'';let value=type==='s'?shared[Number(raw)]||'':type==='inlineStr'?elements(cell,'t').map(t=>t.textContent).join(''):raw;
    const fmt=xf[Number(cell.getAttribute('s')||0)]?.getAttribute('numFmtId'),custom=(formats[fmt]||'').replace(/"[^"]*"|\[[^\]]*\]/g,'');
    if(type!=='s'&&raw!==''&&Number.isFinite(Number(raw))&&((Number(fmt)>=14&&Number(fmt)<=22)||/[dy]/i.test(custom))){const date=new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+Number(raw)*86400000);if(Number.isFinite(date.getTime()))value=date.toISOString().slice(0,10);}
    if(elements(cell,'f').length&&raw==='')warnings.push('Une formule Excel ne contient pas de résultat enregistré : ouvrir et recalculer le classeur.');
    if(value!=='')values.push(cell.getAttribute('r')+' : '+value);
   }text+=values.join(' | ')+'\n';if(text.length>MAX_TEXT)throw new Error('Classeur trop long : maximum 500 000 caractères.');}
  }
 }
 if(text.length>MAX_TEXT)throw new Error('Document trop long : maximum 500 000 caractères.');
 return {text,method:'office',complete:!warnings.length,pages,warnings:[...new Set(warnings)]};
}
export async function readDocument(file,progress=()=>{},cancelled=()=>false){
 const check=()=>{if(cancelled())throw new Error('Lecture interrompue. Vous pouvez reprendre sans perdre les pièces importées.');};
 const warnings=[];let worker=null,usedOcr=false;
 async function ocr(image){check();usedOcr=true;if(!worker){const {default:Tesseract}=await import('./vendor/ocr/tesseract.esm.min.js');const {createWorker}=Tesseract;worker=await createWorker('fra+eng',1,{workerPath:asset('ocr/worker.min.js'),corePath:asset('ocr/core'),langPath:asset('ocr/lang'),workerBlobURL:false});await worker.setParameters({preserve_interword_spaces:'1',user_defined_dpi:'300',tessedit_pageseg_mode:'3'});}const {data}=await worker.recognize(image,{}, {text:true,blocks:true});
 // Rejoin OCR columns on their visual rows so a right-aligned price remains
 // beside its own heading instead of being appended after the next service.
 const words=(data.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]).flatMap(l=>l.words||[]).filter(w=>w.text?.trim()&&w.bbox);
 if(words.length){const rows=[];for(const w of words.sort((a,b)=>(a.bbox.y0+a.bbox.y1)-(b.bbox.y0+b.bbox.y1)||a.bbox.x0-b.bbox.x0)){const cy=(w.bbox.y0+w.bbox.y1)/2,h=w.bbox.y1-w.bbox.y0;let row=rows.at(-1);if(!row||Math.abs(row.cy-cy)>Math.max(5,Math.min(row.h,h)*.55)){row={cy,h,words:[]};rows.push(row);}row.words.push(w);}data.text=rows.map(row=>row.words.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(w=>w.text).join(' ')).join('\n');}
 data.text=joinPriceTableRows(data.text);return data;}
 try{
  if(file.size>5*1024*1024)throw new Error('Maximum 5 Mo par pièce.');check();
  if(/\.(docx|xlsx)$/i.test(file.name))return office(new Uint8Array(await file.arrayBuffer()),file.name);
  if(/\.(txt|csv)$/i.test(file.name)){const text=await file.text();if(text.length>MAX_TEXT)throw new Error('Texte trop long (500 000 caractères).');return {text,method:'text',complete:true,pages:1,warnings};}
  if(/\.(png|jpe?g)$/i.test(file.name)){progress('Reconnaissance du scan');const data=await ocr(file);if(data.confidence<50||!data.text.trim())warnings.push('Scan peu lisible : vérifier le texte et les montants.');return {text:'[Page 1]\n'+data.text,method:'ocr',complete:!warnings.length,pages:1,warnings};}
  if(!/\.pdf$/i.test(file.name))throw new Error('Format non pris en charge.');
  const pdf=await import('./vendor/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc=asset('pdf.worker.mjs');
  const document=await pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,enableXfa:false,useSystemFonts:true,wasmUrl:asset('wasm/'),standardFontDataUrl:asset('standard_fonts/')}).promise;
  try{
   if(document.numPages>MAX_PAGES)throw new Error('Maximum 150 pages par pièce ; découpez le PDF en plusieurs pièces.');
   let text='';for(let i=1;i<=document.numPages;i++){
    check();progress('Page '+i+' / '+document.numPages);const page=await document.getPage(i),data=await page.getTextContent();let content=pdfTextRows(data.items);
    if(needsPdfOcr(content)){progress('Reconnaissance du scan · page '+i+' / '+document.numPages);const viewport=page.getViewport({scale:3}),canvas=documentGlobalCanvas();
     const scale=Math.min(1,3000/Math.max(viewport.width,viewport.height)),vp=page.getViewport({scale:3*scale});canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
     await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;const result=await ocr(canvas);content=result.text;canvas.width=canvas.height=1;
     if(result.confidence<45&&content.trim())warnings.push('Page '+i+' : reconnaissance incertaine, vérifier l’original.');
     if(!content.trim())warnings.push('Page '+i+' : reconnaissance incertaine, aucun texte lu dans le scan.');
    }
    text+='[Page '+i+']\n'+content+'\n';page.cleanup();if(text.length>MAX_TEXT)throw new Error('PDF trop long : maximum 500 000 caractères par pièce.');
   }
   if(!text.replace(/\[Page \d+\]/g,'').trim())warnings.push('Aucun texte exploitable dans cette pièce.');
   if(usedOcr)warnings.push('Les cases cochées, signatures et chiffres reconnus par OCR doivent être vérifiés dans l’original.');
   return {text,method:usedOcr?'ocr':'pdf',complete:!warnings.some(w=>/incertaine|Aucun texte/.test(w)),pages:document.numPages,warnings};
  }finally{await document.destroy();}
 }finally{if(worker)await worker.terminate();}
}
function documentGlobalCanvas(){return window.document.createElement('canvas');}
