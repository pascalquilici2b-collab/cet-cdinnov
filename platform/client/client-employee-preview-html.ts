import {strFromU8,unzipSync} from 'fflate';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',A='http://schemas.openxmlformats.org/drawingml/2006/main',WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const children=(node:Element,name:string)=>Array.from(node.children).filter(n=>n.namespaceURI===W&&n.localName===name);
const child=(node:Element,name:string)=>children(node,name)[0];
const value=(node:Element|undefined,key='val')=>node?.getAttributeNS(W,key)||'';
const number=(v:string,max=2000)=>Math.max(0,Math.min(max,Number(v)||0));
const xml=(bytes:Uint8Array)=>{const parsed=new DOMParser().parseFromString(strFromU8(bytes),'application/xml');if(parsed.getElementsByTagName('parsererror').length)throw Error('Le document Word contient un XML illisible. Téléchargez son original.');return parsed;};
function encoded(bytes:Uint8Array){let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result);}
/** A local, non-executable view of the original OOXML. No archive is reconstructed from current employee data. */
export async function clientMissionHTML(blob:Blob):Promise<string>{
 if(blob.size>10*1024*1024)throw Error('Le document est trop volumineux pour cet aperçu. Téléchargez son original.');
 let expanded=0,parts:Record<string,Uint8Array>;try{parts=unzipSync(new Uint8Array(await blob.arrayBuffer()),{filter:file=>{expanded+=file.originalSize;if(file.originalSize>15*1024*1024||expanded>30*1024*1024)throw Error();return true;}});}catch{throw Error('Ce fichier Word ne peut pas être affiché. Téléchargez son original.');}
 if(!parts['word/document.xml'])throw Error('Ce fichier ne contient pas de document Word.');
 const main=xml(parts['word/document.xml']);
 const relationships=(part:string)=>{const slash=part.lastIndexOf('/'),dir=part.slice(0,slash+1),file=dir+'_rels/'+part.slice(slash+1)+'.rels',map=new Map<string,string>();if(parts[file])for(const relation of Array.from(xml(parts[file]).documentElement.children)){if(relation.getAttribute('TargetMode')==='External')continue;const path:string[]=[];for(const segment of (dir+(relation.getAttribute('Target')||'')).split('/')){if(segment==='..')path.pop();else if(segment&&segment!=='.')path.push(segment);}map.set(relation.getAttribute('Id')||'',path.join('/'));}return map;};
 function image(drawing:Element,part:string){const id=drawing.getElementsByTagNameNS(A,'blip')[0]?.getAttributeNS(R,'embed'),file=id&&relationships(part).get(id),bytes=file&&parts[file];if(!bytes)return '';const mime=/\.jpe?g$/i.test(file!)?'image/jpeg':/\.webp$/i.test(file!)?'image/webp':/\.png$/i.test(file!)?'image/png':'';if(!mime)return '';
  const extent=drawing.getElementsByTagNameNS(WP,'extent')[0],width=extent?number(extent.getAttribute('cx')||'',8_000_000)/12700:160;return `<img alt="Logo du document" src="data:${mime};base64,${encoded(bytes)}" style="width:${width}pt;max-width:100%;height:auto">`;
 }
 function inline(node:Element,part:string):string{
  if(node.namespaceURI===W){if(node.localName==='t')return escape(node.textContent||'');if(node.localName==='tab')return '<span class="client-mission-tab"></span>';if(node.localName==='br'||node.localName==='cr')return '<br>';if(node.localName==='drawing')return image(node,part);if(['rPr','pPr','tcPr','tblPr','sectPr','instrText','del'].includes(node.localName))return '';
   if(node.localName==='r'){const props=child(node,'rPr'),styles:string[]=[];if(props){if(child(props,'b')&&value(child(props,'b'))!=='0')styles.push('font-weight:bold');if(child(props,'i')&&value(child(props,'i'))!=='0')styles.push('font-style:italic');if(child(props,'u')&&value(child(props,'u'))!=='none')styles.push('text-decoration:underline');const size=value(child(props,'sz'));if(size)styles.push('font-size:'+number(size,144)/2+'pt');const color=value(child(props,'color'));if(/^[0-9a-f]{6}$/i.test(color))styles.push('color:#'+color);}return `<span${styles.length?' style="'+styles.join(';')+'"':''}>${Array.from(node.children).map(n=>inline(n,part)).join('')}</span>`;}
  }return Array.from(node.children).map(n=>inline(n,part)).join('');
 }
 function paragraph(node:Element,part:string){const props=child(node,'pPr'),align=props?value(child(props,'jc')):'',styles=['white-space:pre-wrap'];if(['left','right','center','both'].includes(align))styles.push('text-align:'+(align==='both'?'justify':align));const content=inline(node,part);return `<p style="${styles.join(';')}">${content||'<br>'}</p>`;}
 function table(node:Element,part:string){type Cell={html:string;span:number;rows:number;style:string};const rows:Cell[][]=[],active=new Map<number,Cell>();
  for(const row of children(node,'tr')){const cells:Cell[]=[];let col=0;for(const cell of children(row,'tc')){const props=child(cell,'tcPr'),span=Math.max(1,number(props?value(child(props,'gridSpan')):'',30)),merge=props&&child(props,'vMerge'),html=Array.from(cell.children).filter(x=>x.localName!=='tcPr').map(x=>block(x,part)).join('');if(merge&&value(merge)!=='restart'&&active.has(col)){const previous=active.get(col)!;previous.rows++;if(cell.getElementsByTagNameNS(W,'t').length)previous.html+=html;}else{const fill=props?value(child(props,'shd'),'fill'):'',entry={html,span,rows:1,style:/^[0-9a-f]{6}$/i.test(fill)?'background:#'+fill:''};cells.push(entry);for(let n=col;n<col+span;n++){if(merge)active.set(n,entry);else active.delete(n);}}col+=span;}rows.push(cells);}
  return '<table><tbody>'+rows.map(row=>'<tr>'+row.map(c=>`<td colspan="${c.span}" rowspan="${c.rows}" style="${c.style}">${c.html}</td>`).join('')+'</tr>').join('')+'</tbody></table>';
 }
 function block(node:Element,part:string):string{if(node.namespaceURI===W&&node.localName==='p')return paragraph(node,part);if(node.namespaceURI===W&&node.localName==='tbl')return table(node,part);if(node.localName.endsWith('Pr'))return '';return Array.from(node.children).map(n=>block(n,part)).join('');}
 const refs=relationships('word/document.xml'),section=main.getElementsByTagNameNS(W,'sectPr')[0];
 const partFor=(kind:string)=>{const list=section?children(section,kind):[],ref=list.find(x=>value(x,'type')==='default')||list[0];return ref?refs.get(ref.getAttributeNS(R,'id')||''):undefined;};
 const headerPart=partFor('headerReference'),footerPart=partFor('footerReference');let header='';
 if(headerPart&&parts[headerPart]){const doc=xml(parts[headerPart]),drawings=Array.from(doc.getElementsByTagNameNS(W,'drawing')).sort((a,b)=>Number(a.getElementsByTagNameNS(WP,'positionH')[0]?.textContent||0)-Number(b.getElementsByTagNameNS(WP,'positionH')[0]?.textContent||0));header='<div class="client-mission-logos">'+drawings.map(d=>image(d,headerPart)).join('')+'</div>';for(const drawing of drawings)drawing.remove();header+=Array.from(doc.documentElement.children).filter(p=>p.textContent?.trim()).map(p=>block(p,headerPart)).join('');}
 const body=main.getElementsByTagNameNS(W,'body')[0];if(!body)throw Error('Le document Word est vide.');
 const footer=footerPart&&parts[footerPart]?Array.from(xml(parts[footerPart]).documentElement.children).map(p=>block(p,footerPart)).join(''):'';
 return header+'<div class="client-mission-content">'+Array.from(body.children).map(p=>block(p,'word/document.xml')).join('')+'</div><div class="client-mission-document-footer">'+footer+'</div>';
}
