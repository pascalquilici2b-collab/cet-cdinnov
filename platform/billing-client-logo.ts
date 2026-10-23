/** Raster data only: no SVG scripts, remote requests, or active URL schemes. */
export function validClientLogoData(value:unknown):value is string{
 if(typeof value!=='string'||value.length>350000)return false;
 const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);if(!match)return false;
 try{const bytes=atob(match[2]);if(bytes.length>256*1024)return false;
  return match[1]==='png'?bytes.startsWith('\x89PNG\r\n\x1a\n'):match[1]==='jpeg'?bytes.startsWith('\xff\xd8\xff'):bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP';
 }catch{return false;}
}
