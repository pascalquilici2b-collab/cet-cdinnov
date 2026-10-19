/* An export is tied to the invoice content; subsequent payment tracking is separate. */
function facturxDocumentCore(f){
  return [f.id??'',f.number??'',f.dateFacture??'',f.client??'',f.code??'',String(f.ht),String(f.ttc),f.pdfSource?.sha256??''];
}
function facturxSignature(f){
  return JSON.stringify({version:2,document:facturxDocumentCore(f)});
}
function facturxSnapshotMatches(f){
  if(!f?.facturx||typeof f.facturx.snapshot!=='string')return false;
  if(f.facturx.snapshot===facturxSignature(f))return true;
  // Legacy snapshots included a payment date at index 7. Preserve the archived
  // export only when every actual document field and the source hash still match.
  try{
    const old=JSON.parse(f.facturx.snapshot);
    return Array.isArray(old)&&old.length===9&&JSON.stringify([...old.slice(0,5).map(v=>v??''),old[5],old[6],old[8]??''])===JSON.stringify(facturxDocumentCore(f));
  }catch{return false;}
}
