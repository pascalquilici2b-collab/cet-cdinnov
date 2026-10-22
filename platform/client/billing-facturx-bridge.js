/* Native invoice conversion reuses the imported-invoice mini-software. Only
 * conversion metadata lives in this sidecar; the issued document stays frozen. */
function facturxRecord(id){return id?.startsWith('billing:')?state.billingFacturx?.[id.slice(8)]:factures().find(f=>f.id===id);}
function billingFacturxMatchesSnapshot(invoice,record){
  const original=record.nativeSeed;
  if(!original||!facturxMatchesRecord(invoice,record)||invoice.currency!==original.currency||invoice.type_code!==original.type_code||invoice.lines?.length!==original.lines.length)return false;
  const number=value=>Number(String(value??'').replace(',','.'));
  return invoice.lines.every((line,index)=>{
    const source=original.lines[index];
    return line.description.trim()===source.description.trim()&&line.unit===source.unit&&line.vat_category===source.vat_category&&['quantity','unit_price','vat_rate','discount_percent'].every(key=>Number.isFinite(number(line[key]??0))&&number(line[key]??0)===number(source[key]??0));
  })&&['net','vat','gross','due'].every(key=>number(invoice.totals?.[key])===number(original.totals[key]))&&number(invoice.totals?.rounding??0)===0&&number(invoice.payment?.prepaid??0)===0;
}
async function billingOpenFacturX(document,seed){
  if(!facturierAdmin()||document.status!=='issued'||document.data.kind!=='invoice'||!document.issuance)return;
  const user=AUTH_USER;
  const fresh=await billingTransport.get(document.id);
  if(fresh.issuance?.id!==document.issuance.id||fresh.status!=='issued')throw new Error('La facture a changé. Rouvrez-la.');
  const pdf=await billingTransport.issuedFile(document.id,'pdf'),sha=await facturxDigest(await pdf.arrayBuffer());
  if(AUTH_USER!==user||!facturierAdmin())return;
  state.billingFacturx??={};
  const previous=state.billingFacturx[document.id];
  const linked=previous?.nativeIssuanceId===document.issuance.id&&previous?.pdfSource?.sha256===sha;
  const number=document.issuance.number;
  state.billingFacturx[document.id]={...(linked?previous:{}),id:'billing:'+document.id,nativeDocumentId:document.id,nativeIssuanceId:document.issuance.id,nativeSeed:seed,
    number,dateFacture:document.data.issueDate,client:document.data.buyer.name,code:document.data.references.businessCode,
    ht:seed.totals.net,ttc:seed.totals.gross,pdfSource:{sha256:sha,name:number+'.pdf'},
    facturxDraft:linked&&previous.facturxDraft||seed,facturxDraftSourceSha:sha,facturxDraftProfile:linked&&previous.facturxDraftProfile||'en16931'};
  save();
  await openFacturX('billing:'+document.id);
}
function billingFacturxGuardScript(record){
  if(!record.nativeDocumentId)return '';
  const bound={nativeSeed:record.nativeSeed,number:record.number,dateFacture:record.dateFacture,ht:record.ht,ttc:record.ttc};
  const attach=function(bound){
    document.querySelector('#invoice-form').addEventListener('submit',event=>{
      if(billingFacturxMatchesSnapshot(invoiceData(),bound))return;
      event.preventDefault();event.stopImmediatePropagation();
      message('Les prestations, le numéro, la date et les montants doivent rester identiques au PDF finalisé. Vous pouvez compléter les coordonnées électroniques.',true);
    },true);
  };
  return '<script>'+facturxMatchesRecord.toString()+'\n'+billingFacturxMatchesSnapshot.toString()+'\n('+attach.toString()+')('+JSON.stringify(bound).replace(/</g,'\\u003c')+');<\/script>';
}
