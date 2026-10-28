import {Unzip,UnzipInflate} from 'fflate';

export const MAX_FILE=5*1024*1024,MAX_BATCH=50*1024*1024,MAX_FILES=50;
const supported=/\.(pdf|docx|xlsx|png|jpe?g|txt|csv)$/i;
const plain=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function classifyDocument(name,text=''){
 const match=value=>{
  const s=plain(value).replace(/[_-]/g,' ');
  if(/\bavenant\b/.test(s))return 'amendment';
  if(/\breconduction\b/.test(s))return 'renewal';
  if(/\bnotification\b/.test(s))return 'notification';
  if(/\bbon(?:s)? de commande\b|\bbc\b/.test(s))return 'order';
  if(/\bbpu\b|bordereau.*prix|\bdpgf\b|\bdqe\b/.test(s))return 'price';
  if(/acte d.engagement|\bae\b/.test(s))return 'ae';
  if(/\bccap\b|\bcctp\b|cahier.*clauses/.test(s))return 'clauses';
  if(/\bdevis\b|\boffre\b|proposition.*(?:commerciale|technique)/.test(s))return 'offer';
  return 'other';
 };
 // Prefer the filename; the opening text is only a fallback, not clauses quoted later.
 return match(name)!=='other'?match(name):match(text.slice(0,1800));
}

// Archives are expanded in memory. Both metadata and actual output are bounded.
// Nothing is extracted onto the filesystem; original member names are kept as labels.
export async function expandImportFiles(selected,progress=()=>{}){
 const files=[],warnings=[];let total=0,entries=0;
 const accept=(name,bytes,lastModified)=>{
  if(!supported.test(name)){warnings.push(name+' : format non pris en charge.');return;}
  if(bytes.length>MAX_FILE)throw new Error(name+' dépasse 5 Mo.');
  total+=bytes.length;
  if(total>MAX_BATCH||files.length>=MAX_FILES)throw new Error('Import limité à 50 pièces et 50 Mo décompressés.');
  files.push(new File([bytes],name.split('/').at(-1),{lastModified:lastModified||Date.now()}));
 };
 for(const file of selected){
  if(file.size>MAX_BATCH)throw new Error(file.name+' dépasse 50 Mo.');
  if(!/\.zip$/i.test(file.name)){accept(file.name,new Uint8Array(await file.arrayBuffer()),file.lastModified);continue;}
  progress('Ouverture de '+file.name);
  const unzip=new Unzip(entry=>{
   if(++entries>1000)throw new Error('Archive contenant trop d’entrées.');
   const name=entry.name.replace(/\\/g,'/');
   if(name.startsWith('/')||/^[a-z]:/i.test(name)||name.split('/').includes('..'))throw new Error('Chemin de pièce invalide dans l’archive.');
   if(name.endsWith('/')||name.split('/').some(p=>p.startsWith('.')||p==='__MACOSX'))return;
   if(!supported.test(name)){warnings.push(name+' : format non pris en charge.');return;}
   if(entry.originalSize>MAX_FILE)throw new Error(name+' dépasse 5 Mo.');
   const chunks=[];let size=0;
   entry.ondata=(error,bytes,final)=>{
    if(error)throw new Error('Archive illisible : '+name);
    size+=bytes.length;
    if(size>MAX_FILE||total+size>MAX_BATCH){entry.terminate();throw new Error('Archive trop volumineuse après décompression.');}
    chunks.push(bytes);
    if(final){const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}accept(name,data);}
   };
   entry.start();
  });
  unzip.register(UnzipInflate);
  // Limit each inflation step before the output-size callback can reject it.
  // A forged originalSize must not allocate the full expanded archive first.
  const raw=new Uint8Array(await file.arrayBuffer());
  for(let offset=0;offset<raw.length;offset+=4096)unzip.push(raw.subarray(offset,offset+4096),offset+4096>=raw.length);
 }
 return {files,warnings:[...new Set(warnings)].slice(0,50)};
}
