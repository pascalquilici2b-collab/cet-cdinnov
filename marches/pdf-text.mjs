// PDF storage order often writes an entire column before the next one.
// Rejoin visual rows so BPU labels, quantities and prices stay together.
export function pdfTextRows(items){
 const text=items.filter(x=>typeof x.str==='string'&&x.str.trim());
 if(text.some(x=>!Number.isFinite(x.transform?.[4])||!Number.isFinite(x.transform?.[5])))return text.map(x=>x.str+(x.hasEOL?'\n':' ')).join('');
 const rows=[];
 for(const item of text.sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4])){
  const y=item.transform[5],h=Math.max(1,Math.abs(item.height||item.transform[3]||10));
  let row=rows.at(-1);
  if(!row||Math.abs(row.y-y)>Math.max(2,Math.min(h,row.h)*.35)){row={y,h,items:[]};rows.push(row);}
  row.items.push(item);
 }
 return rows.map(row=>row.items.sort((a,b)=>a.transform[4]-b.transform[4]).map((item,i,arr)=>{
  const prev=arr[i-1],gap=prev?item.transform[4]-(prev.transform[4]+(prev.width||0)):0;
  return (i?(gap>18?' | ':' '):'')+item.str;
 }).join('')).join('\n');
}
