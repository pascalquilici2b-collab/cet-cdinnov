// Reuse only company coordinates from invoices reviewed and successfully validated.
// No amounts, dates, line items, payment terms or bank details are memorised.
(function(root){
  const fields=['name','street','postal_code','city','country','siren','siret','vat_number','contact_email','electronic_address','electronic_scheme'];
  const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const id=p=>norm(p?.siren||(p?.siret||'').slice(0,9));
  function addressKey(p){
    if(!p?.name||!p.street||!p.postal_code||!p.country)return '';
    return [p.name,p.street,p.postal_code,p.city,p.country].map(norm).join('|');
  }
  function lookup(entries,party){
    if(!party)return null;
    const identifier=id(party);
    const matches=(Array.isArray(entries)?entries:[]).filter(saved=>{
      // An observed company ID always takes priority, including when it contradicts the name.
      if(identifier)return id(saved)===identifier&&(!party.siret||!saved.siret||norm(party.siret)===norm(saved.siret));
      const key=addressKey(party);return !!key&&addressKey(saved)===key;
    });
    return matches.length===1?matches[0]:null;
  }
  function reuse(invoice,memory={}){
    const copy=JSON.parse(JSON.stringify(invoice||{}));const reused=[];
    for(const role of ['seller','buyer']){
      const current=copy[role],saved=lookup(memory[role],current);if(!saved)continue;
      const addressFields=['street','postal_code','city','country'];
      const addressChanged=addressFields.some(key=>current[key]&&saved[key]&&norm(current[key])!==norm(saved[key]));
      for(const key of fields){
        if(addressChanged&&addressFields.includes(key))continue;
        if((current[key]==null||current[key]==='')&&saved[key]){current[key]=saved[key];reused.push(role+'.'+key);}
      }
    }
    return {invoice:copy,reused};
  }
  function remember(memory,invoice){
    const copy={seller:[...(Array.isArray(memory?.seller)?memory.seller:[])],buyer:[...(Array.isArray(memory?.buyer)?memory.buyer:[])]};
    for(const role of ['seller','buyer']){
      const party=invoice?.[role];if(!party||!id(party))continue;
      const saved={};for(const key of fields)if(party[key])saved[key]=String(party[key]);
      copy[role]=copy[role].filter(p=>id(p)!==id(party)||norm(p.siret)!==norm(party.siret));
      copy[role].push(saved);copy[role]=copy[role].slice(-500);
    }
    return copy;
  }
  root.CDIPartyMemory={reuse,remember,lookup};
})(typeof window!=='undefined'?window:globalThis);
