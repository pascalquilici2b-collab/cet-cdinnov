/** Print every page from the same PDF used by the preview, without editor overlays. */
export async function printPDF(pdf:{numPages:number;getPage:(n:number)=>Promise<{getViewport:(o:{scale:number})=>{width:number;height:number};render:(o:Record<string,unknown>)=>{promise:Promise<void>}}>}):Promise<void>{
 const frame=document.createElement('iframe');frame.title='Impression du document';frame.className='bill-pdf-print-frame';frame.setAttribute('aria-hidden','true');document.body.append(frame);
 const urls:string[]=[];let timer:ReturnType<typeof setTimeout>|undefined;
 const cleanup=()=>{if(timer)clearTimeout(timer);frame.remove();urls.forEach(url=>URL.revokeObjectURL(url));};
 try{
  const doc=frame.contentDocument,win=frame.contentWindow;if(!doc||!win)throw Error('L’impression est indisponible.');
  const style=doc.createElement('style');style.textContent='@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}img{display:block;width:210mm;height:297mm;object-fit:contain;break-after:page;page-break-after:always}img:last-child{break-after:auto;page-break-after:auto}';doc.head.append(style);doc.title='Document CDInnov';
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n),view=page.getViewport({scale:2}),canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
   await page.render({canvasContext:canvas.getContext('2d'),viewport:view,annotationMode:0}).promise;
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('La page ne peut pas être préparée pour l’impression.')),'image/png'));canvas.width=canvas.height=0;
   const url=URL.createObjectURL(blob);urls.push(url);const image=doc.createElement('img');image.alt='Page '+n;image.src=url;doc.body.append(image);await image.decode();
  }
  win.addEventListener('afterprint',cleanup,{once:true});timer=setTimeout(cleanup,300000);win.focus();win.print();
 }catch(e){cleanup();throw e;}
}
