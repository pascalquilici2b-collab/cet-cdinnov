import {Unzip,UnzipInflate} from 'fflate';

const MB=1024*1024;
/** Expand PDF entries in memory; never materialize ZIP paths on a filesystem. */
export async function stampImportFiles(files:File[]):Promise<{files:File[];ignored:number}>{
 const output:File[]=[];let total=0,ignored=0;
 const add=(file:File)=>{if(file.size>20*MB)throw Error(file.name+' dépasse 20 Mo.');total+=file.size;if(total>200*MB||output.length>=100)throw Error('Maximum 100 PDF et 200 Mo par import.');output.push(file);};
 for(const file of files){
  if(file.size>20*MB)throw Error(file.name+' dépasse 20 Mo.');
  if(/\.pdf$/i.test(file.name)){add(file);continue;}
  if(!/\.zip$/i.test(file.name))throw Error('Choisissez des PDF ou des archives ZIP.');
  const raw=new Uint8Array(await file.arrayBuffer());let entries=0,pending=0,failure:Error|undefined,expanded=0;
  const unzip=new Unzip(entry=>{
   if(++entries>2000)throw Error('Cette archive contient trop de fichiers.');
   const path=entry.name.replace(/\\/g,'/');
   if(path.startsWith('/')||/^[A-Za-z]:/.test(path)||path.split('/').includes('..'))throw Error('Chemin invalide dans l’archive ZIP.');
   if(path.endsWith('/'))return;
   if(!/\.pdf$/i.test(path)||path.startsWith('__MACOSX/')||path.split('/').pop()!.startsWith('._')){ignored++;return;}
   if(output.length+pending>=100||(entry.originalSize??0)>20*MB)throw Error('Archive limitée à 100 PDF de 20 Mo chacun.');
   pending++;const chunks:ArrayBuffer[]=[];let size=0;
   entry.ondata=(error,chunk,final)=>{
    if(error){failure=Error('Archive ZIP illisible ou protégée.');entry.terminate();return;}
    size+=chunk.length;expanded+=chunk.length;
    if(size>20*MB||total+expanded>200*MB){failure=Error('Archive trop volumineuse après décompression.');entry.terminate();return;}
    chunks.push(new Uint8Array(chunk).buffer);
    if(final){pending--;expanded-=size;add(new File(chunks,path.split('/').pop()!,{type:'application/pdf'}));}
   };
   entry.start();
  });
  unzip.register(UnzipInflate);
  try{for(let offset=0;offset<raw.length;offset+=4096){unzip.push(raw.subarray(offset,offset+4096),offset+4096>=raw.length);if(failure)throw failure;}}
  catch(error){throw failure||new Error(file.name+' : '+(error as Error).message);}
  if(pending||!entries)throw Error(file.name+' : archive incomplète ou vide.');
 }
 if(!output.length)throw Error('Aucun PDF trouvé dans les fichiers sélectionnés.');
 return {files:output,ignored};
}
