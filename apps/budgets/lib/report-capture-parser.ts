export type OcrWord={text:string;confidence:number;bbox:{x0:number;y0:number;x1:number;y1:number}};
export type OcrLine={text:string;confidence:number;bbox:OcrWord["bbox"];words:OcrWord[]};
export type OcrPage={text:string;blocks:{paragraphs:{lines:OcrLine[]}[]}[]|null};
export type CaptureRow={rawId:string;expenseId:string;description:string;confidence:number;inferredId:boolean;y:number};
export type CaptureReading={file:string;hash:string;reportNumber?:number;partnerId?:string;rows:CaptureRow[];warnings:string[]};
const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
export const ocrLines=(page:OcrPage)=>page.blocks?.flatMap(b=>b.paragraphs.flatMap(p=>p.lines))||[];
export const ocrWords=(page:OcrPage)=>ocrLines(page).flatMap(l=>l.words);
export function captureLayout(page:OcrPage,scale:number,width:number,height:number){
  const words=ocrWords(page);
  const description=words.find(w=>/^(description|descrizione)$/.test(normalize(w.text)));
  if(!description)throw new Error("La colonne Description est illisible. Utilisez une capture avec les en-têtes et les identifiants visibles, ou agrandissez l’affichage dans JEMS.");
  const nearHeader=(w:OcrWord)=>Math.abs((w.bbox.y0+w.bbox.y1-description.bbox.y0-description.bbox.y1)/2)<(description.bbox.y1-description.bbox.y0)*2;
  const id=words.find(w=>/^(id|1d|ld)$/.test(normalize(w.text))&&w.bbox.x0<description.bbox.x0&&nearHeader(w));
  const comment=words.find(w=>/^(commentaire|commento)$/.test(normalize(w.text))&&w.bbox.x0>description.bbox.x1&&nearHeader(w));
  if(!id||!comment)throw new Error("Les colonnes ID, Description et Commentaire doivent être visibles dans la capture pour séparer correctement les libellés.");
  const h=(id.bbox.y1-id.bbox.y0)/scale;
  const top=Math.min(height-1,Math.ceil(Math.max(id.bbox.y1,description.bbox.y1,comment.bbox.y1)/scale+h));
  const idLeft=Math.max(0,Math.floor(id.bbox.x0/scale-h*1.6));
  const idRight=Math.min(description.bbox.x0/scale,Math.ceil(id.bbox.x0/scale+Math.max(h*5,(id.bbox.x1-id.bbox.x0)/scale*3.5)));
  const descriptionLeft=Math.max(0,Math.floor(description.bbox.x0/scale-h*.6)),descriptionRight=Math.min(width,Math.floor(comment.bbox.x0/scale-h*.5));
  const reportNumber=Number(page.text.match(/(?:Rapport\s+du\s+partenaire|Report\s+del\s+partner)\s+R\s*\.?\s*(\d+)/i)?.[1])||undefined;
  const partnerId=page.text.match(/\b(PP|LP)\s*(\d+)\b/i)?.[0]?.replace(/\s/g,"").toUpperCase();
  return {reportNumber,partnerId,ids:{left:idLeft,top,width:idRight-idLeft,height:height-top},descriptions:{left:descriptionLeft,top,width:descriptionRight-descriptionLeft,height:height-top}};
}

export function combineCaptureColumns(ids:OcrPage,descriptions:OcrPage,reportNumber?:number):CaptureRow[]{
  const idLines=ocrLines(ids).filter(l=>l.text.trim()).sort((a,b)=>a.bbox.y0-b.bbox.y0);
  const descLines=ocrLines(descriptions).sort((a,b)=>a.bbox.y0-b.bbox.y0);
  const center=(line:OcrLine)=>(line.bbox.y0+line.bbox.y1)/2;
  return idLines.map((line,index)=>{
    const rawId=line.text.trim(),compact=rawId.toUpperCase().replace(/\s/g,"");
    const exact=compact.match(/^R(\d+)\.(\d+)$/);
    let expenseId=exact?`R${Number(exact[1])}.${Number(exact[2])}`:"";
    if(!expenseId&&reportNumber){const digits=compact.match(/^R(\d+)$/)?.[1];const prefix=String(reportNumber);if(digits?.startsWith(prefix)&&digits.length>prefix.length)expenseId=`R${reportNumber}.${Number(digits.slice(prefix.length))}`}
    const top=index?(center(idLines[index-1])+center(line))/2:line.bbox.y0-(line.bbox.y1-line.bbox.y0)*2;
    const bottom=index<idLines.length-1?(center(line)+center(idLines[index+1]))/2:line.bbox.y1+(line.bbox.y1-line.bbox.y0)*2;
    const words=descLines.flatMap(l=>l.words.filter(w=>(w.bbox.y0+w.bbox.y1)/2>=top&&(w.bbox.y0+w.bbox.y1)/2<bottom).sort((a,b)=>a.bbox.x0-b.bbox.x0));
    return {rawId,expenseId,description:words.map(w=>w.text).join(" ").trim(),confidence:Math.min(line.confidence,...words.map(w=>w.confidence)),inferredId:!exact,y:center(line)};
  }).filter(r=>r.description||r.expenseId);
}
