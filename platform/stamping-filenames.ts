/** Keep the lot's display name, with characters safe for a downloaded filename. */
export function stampedLotFilename(name:string){
 const lot=name.normalize('NFC').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'-').replace(/\s+/g,' ').trim().replace(/^[. ]+|[. ]+$/g,'').slice(0,140).trim()||'Lot';
 return lot+' tamponné.zip';
}
