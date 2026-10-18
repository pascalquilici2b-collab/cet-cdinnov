import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { parsePartnerReport, type PdfPage } from "./partner-report-parser";

GlobalWorkerOptions.workerSrc=workerUrl;
export async function readPartnerReportPdf(file:File){
  if(file.size>30*1024*1024)throw new Error("Le PDF dépasse 30 Mo.");
  const buffer=await file.arrayBuffer();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer))).map(x=>x.toString(16).padStart(2,"0")).join("");
  const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true});
  try{
    const doc=await task.promise;
    if(doc.numPages>300)throw new Error("Le rapport dépasse 300 pages.");
    const pages:PdfPage[]=[];
    for(let number=1;number<=doc.numPages;number++){
      const page=await doc.getPage(number),content=await page.getTextContent();
      const viewport=page.getViewport({scale:1});
      const items=content.items.flatMap(item=>{
        if(!("str" in item)||!item.str.trim())return [];
        const [x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
        return [{text:item.str,x,y,width:item.width,height:item.height}];
      });
      pages.push({number,width:viewport.width,height:viewport.height,items});
    }
    return parsePartnerReport(pages,file.name,hash);
  }finally{await task.destroy();}
}
