// PDF storage order often writes an entire column before the next one.
// Rejoin visual rows so BPU labels, quantities and prices stay together.
export function needsPdfOcr(text){
 const content=String(text).replace(/\[Page \d+\]/g,'').trim();
 if(content.length<80)return true;
 // A text-layer prefecture receipt can sit over a fully scanned BPU page.
 // Its 150+ characters must not make the unread image count as extracted text.
 if(!/accus[eé] de r[eé]ception|r[eé]ception en pr[eé]fecture/i.test(content))return false;
 const body=content.split('\n').filter(line=>!/^\s*(?:accus[eé] de r[eé]ception|date de (?:t[ée]l[ée]transmission|r[eé]ception)|[\w]+-\d{6,}-\d{8}-)/i.test(line)).join('\n').trim();
 return body.length<80;
}
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
