// Shared organisation preferences; never store invoice dates, balances or references.
(function(root){
  const compact=value=>String(value||'').replace(/\s/g,'').toUpperCase();
  function validIban(value){
    if(!/^FR\d{12}[A-Z0-9]{11}\d{2}$/.test(value))return false;
    const digits=(value.slice(4)+value.slice(0,4)).replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));
    let remainder=0;for(const digit of digits)remainder=(remainder*10+Number(digit))%97;
    return remainder===1;
  }
  function normalize(payment){
    const data={means_code:String(payment?.means_code||''),terms:String(payment?.terms||'').trim(),
      vat_due:String(payment?.vat_due||''),iban:compact(payment?.iban),bic:compact(payment?.bic)};
    if(!['30','58','10','48'].includes(data.means_code))throw new Error('Sélectionnez le moyen de paiement.');
    if(!data.terms||data.terms.length>2000)throw new Error('Renseignez les conditions de paiement.');
    if(!['','payment','invoice','delivery'].includes(data.vat_due))throw new Error('Vérifiez le régime d’exigibilité de TVA.');
    if(!validIban(data.iban))throw new Error('Vérifiez l’IBAN français à enregistrer par défaut.');
    if(!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(data.bic))throw new Error('Vérifiez le BIC à enregistrer par défaut.');
    return data;
  }
  function isCDI(seller={}){return compact(seller.siren||compact(seller.siret).slice(0,9))==='322556580'&&(!seller.country||seller.country==='FR');}
  function apply(payment={},defaults){
    let saved;try{saved=normalize(defaults);}catch{return {...payment};}
    const result={...payment};
    for(const key of ['means_code','terms','vat_due'])if(!String(result[key]??'').trim())result[key]=saved[key];
    if(['30','58'].includes(result.means_code)){
      // An account from the PDF/draft takes priority, without mixing banks.
      const sameIban=!result.iban||compact(result.iban)===saved.iban;
      const sameBic=!result.bic||compact(result.bic)===saved.bic;
      if(sameIban&&sameBic)for(const key of ['iban','bic'])if(!String(result[key]||'').trim())result[key]=saved[key];
    }
    return result;
  }
  root.CDIPaymentDefaults={normalize,isCDI,apply};
})(typeof window!=='undefined'?window:globalThis);
