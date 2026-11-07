/** Bound each visual request independently from the source PDF size. */
export const OCR_MAX_SIDE=2400,OCR_MAX_PIXELS=4000000,OCR_MAX_BYTES=900000;
export function ocrRasterSize(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Dimensions de la page invalides.');
 const scale=Math.min(1,OCR_MAX_SIDE/Math.max(width,height),Math.sqrt(OCR_MAX_PIXELS/(width*height)));
 return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
/** A substantial raster image is positive evidence of a mixed/scanned body.
 * Small logos alone keep the existing fast text path. Text length is not used
 * to discard an image: a digital heading can cover a fully scanned document.
 */
export function substantialPdfRaster(operatorList,ops,view){
 const [x0,y0,x1,y1]=view||[],pageArea=Math.abs((x1-x0)*(y1-y0));if(!pageArea)return false;
 let current=[1,0,0,1,0,0];const stack=[];
 const substantial=matrix=>{
  const points=[[0,0],[0,1],[1,0],[1,1]].map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const width=Math.max(0,Math.min(Math.max(...xs),Math.max(x0,x1))-Math.max(Math.min(...xs),Math.min(x0,x1))),height=Math.max(0,Math.min(Math.max(...ys),Math.max(y0,y1))-Math.max(Math.min(...ys),Math.min(y0,y1)));
  return width*height>=pageArea*.12;
 };
 for(let i=0;i<(operatorList?.fnArray?.length||0);i++){
  const op=operatorList.fnArray[i],args=operatorList.argsArray[i];
  if(op===ops.save||op===ops.paintFormXObjectBegin){stack.push([...current]);if(op===ops.paintFormXObjectBegin&&args?.[0]?.length===6)current=multiply(current,args[0]);}
  else if(op===ops.restore||op===ops.paintFormXObjectEnd)current=stack.pop()||[1,0,0,1,0,0];
  else if(op===ops.transform&&args?.length===6)current=multiply(current,args);
  else if([ops.paintImageXObject,ops.paintInlineImageXObject,ops.paintImageMaskXObject,ops.paintSolidColorImageMask].includes(op)&&substantial(current))return true;
  else if(op===ops.paintImageXObjectRepeat){const [,sx,sy,positions]=args||[];for(let p=0;p<(positions?.length||0);p+=2)if(substantial(multiply(current,[sx,0,0,sy,positions[p],positions[p+1]])))return true;}
  else if(op===ops.paintInlineImageXObjectGroup){for(const entry of args?.[1]||[])if(entry.transform&&substantial(multiply(current,entry.transform)))return true;}
 }
 return false;
}
export function hasPdfWrittenAnnotations(annotations){
 return (annotations||[]).some(a=>!a.hidden&&((a.subtype==='Ink'&&a.inkLists?.length)||(['Tx','Ch','Btn'].includes(a.fieldType)&&a.fieldValue!==undefined&&a.fieldValue!==null&&a.fieldValue!==''&&a.fieldValue!=='Off')));
}
export async function jpegOcrPayload(canvas,page,embeddedText=''){
 let target=canvas;
 for(let attempt=0;attempt<5;attempt++){
  const image=target.toDataURL('image/jpeg',attempt?0.78:0.9),bytes=Math.ceil((image.length-image.indexOf(',')-1)*3/4);
  if(bytes<=OCR_MAX_BYTES){const payload={image,page,width:target.width,height:target.height,embeddedText:String(embeddedText).slice(0,10000)};if(target!==canvas)target.width=target.height=1;return payload;}
  const smaller=document.createElement('canvas');smaller.width=Math.max(1,Math.floor(target.width*.75));smaller.height=Math.max(1,Math.floor(target.height*.75));smaller.getContext('2d').drawImage(target,0,0,smaller.width,smaller.height);if(target!==canvas)target.width=target.height=1;target=smaller;
 }
 if(target!==canvas)target.width=target.height=1;
 throw Error('La page reste trop volumineuse pour la lecture visuelle.');
}
export async function imageOcrCanvas(file){
 const bitmap=await createImageBitmap(file);try{
  if(bitmap.width*bitmap.height>80000000)throw Object.assign(Error('Image trop grande : redimensionnez-la avant import.'),{unrecoverable:true});
  const size=ocrRasterSize(bitmap.width,bitmap.height),canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas;
 }finally{bitmap.close();}
}
