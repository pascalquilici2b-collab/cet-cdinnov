// Identity enrichment is distinct from electronic-routing verification.
(function(root){
  const compact=value=>String(value||'').replace(/\s/g,'');
  const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function query(party={}){return compact(party.siret)||compact(party.siren)||String(party.name||'').trim();}
  function applyCandidate(current,candidate){
    const id=compact(current.siren)||compact(current.siret).slice(0,9);
    if(id&&id!==candidate.siren)throw new Error('Ce résultat ne correspond pas au SIREN saisi. Corrigez le destinataire avant de poursuivre.');
    if(current.siret&&compact(current.siret)!==candidate.siret)throw new Error('Ce résultat correspond à un autre établissement. Vérifiez le SIRET saisi.');
    const next={...current,name:candidate.name,siren:candidate.siren,siret:candidate.siret,country:candidate.country};
    const addressFields=['street','postal_code','city'];
    const addressDiffers=addressFields.some(key=>current[key]&&candidate[key]&&norm(current[key])!==norm(candidate[key]));
    // A PDF may contain a separate billing address or a Cedex address. Keep it as a block.
    if(!addressDiffers)for(const key of addressFields)if(!next[key])next[key]=candidate[key];
    const route=String(next.electronic_address||'').trim();
    if(route&&/^\d{9}/.test(route)&&!route.startsWith(candidate.siren)){
      delete next.electronic_address;delete next.electronic_scheme;
    }
    if(route&&/^\d{9}_\d{14}(?:_|$)/.test(route)&&route.split('_')[1]!==candidate.siret){
      delete next.electronic_address;delete next.electronic_scheme;
    }
    return {party:next,addressPreserved:addressDiffers};
  }
  function route(party,value){
    const address=String(value||'').trim(),id=compact(party.siren)||compact(party.siret).slice(0,9);
    if(!/^\d{9}(?:_[A-Za-z0-9_-]+)?$/.test(address))throw new Error('Copiez l’adresse de facturation complète de la ligne où « Adresse de facturation active » indique « Oui », sans le préfixe 0225:.');
    if(!/^\d{9}$/.test(id)||address.slice(0,9)!==id)throw new Error('Cette adresse ne correspond pas au SIREN du client.');
    const site=address.match(/^\d{9}_(\d{14})(?:_|$)/)?.[1];
    if(site&&!site.startsWith(id))throw new Error('Le SIRET contenu dans cette adresse ne correspond pas au client.');
    if(site&&party.siret&&site!==compact(party.siret))throw new Error('Cette adresse concerne un autre établissement. Vérifiez le SIRET du client.');
    return {electronic_address:address,electronic_scheme:'0225'};
  }
  root.CDIRecipient={query,applyCandidate,route};
})(typeof window!=='undefined'?window:globalThis);
