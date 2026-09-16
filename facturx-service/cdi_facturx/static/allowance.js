/* Amounts are computed in integer cents; quantity/price retain six decimals. */
const CDIAllowance = (() => {
  function scaled(value,places){
    const match=/^(\d+)(?:\.(\d+))?$/.exec(String(value??'').trim());
    if(!match||(match[2]||'').length>places)throw new Error('Complétez les quantités, prix et montants avec des nombres positifs valides.');
    const result=BigInt(match[1])*10n**BigInt(places)+BigInt((match[2]||'').padEnd(places,'0')||'0');
    if(result>9999999999999999n)throw new Error('Montant trop élevé.');
    return result;
  }
  const euros=cents=>(cents/100n).toString()+'.'+(cents%100n).toString().padStart(2,'0');
  const tax=(base,rate)=>(base*rate+5000n)/10000n;
  function groups(invoice){
    const result=new Map();
    if(!invoice.lines?.length)throw new Error('Ajoutez au moins une prestation.');
    for(const line of invoice.lines){
      const quantity=scaled(line.quantity,6),price=scaled(line.unit_price,6),rate=scaled(line.vat_rate,2),category=line.vat_category||'S';
      if(!quantity||rate>10000n)throw new Error('Vérifiez les quantités et les taux de TVA.');
      if((category==='S'&&rate===0n)||(category!=='S'&&rate!==0n))throw new Error('La catégorie de TVA ne correspond pas au taux.');
      const key=category+':'+rate.toString();
      if(!result.has(key))result.set(key,{key,category,rate,base:0n});
      result.get(key).base+=(quantity*price+5000000000n)/10000000000n;
    }
    return [...result.values()];
  }
  function propose(invoice,targetTtc,groupKey,reason='Remise commerciale'){
    const all=groups(invoice),selected=all.find(g=>g.key===groupKey)||(all.length===1?all[0]:null);
    if(!selected)throw new Error('Choisissez le taux de TVA des prestations concernées par la remise.');
    const target=scaled(targetTtc,2),prepaid=scaled(invoice.payment?.prepaid||'0',2);
    const others=all.filter(g=>g!==selected),otherGross=others.reduce((sum,g)=>sum+g.base+tax(g.base,g.rate),0n);
    const wanted=target-otherGross;
    if(wanted<0n||wanted>=selected.base+tax(selected.base,selected.rate))throw new Error('Le TTC souhaité doit être inférieur au total des prestations et compatible avec le taux de TVA choisi.');
    let low=0n,high=selected.base;
    while(low<high){const mid=(low+high)/2n;if(mid+tax(mid,selected.rate)<wanted)low=mid+1n;else high=mid;}
    if(low+tax(low,selected.rate)!==wanted)throw new Error('Ce TTC ne peut pas être obtenu exactement avec ce taux de TVA. Ajustez le TTC d’un centime.');
    if(prepaid>target)throw new Error('Le montant déjà payé dépasse le TTC après remise.');
    if(!reason.trim())throw new Error('Indiquez le motif de la remise.');
    const net=others.reduce((sum,g)=>sum+g.base,low),vat=target-net,amount=selected.base-low;
    return {allowance:{amount:euros(amount),vat_category:selected.category,vat_rate:euros(selected.rate),reason:reason.trim()},
      totals:{net:euros(net),vat:euros(vat),gross:euros(target),due:euros(target-prepaid),rounding:'0.00'},
      before:{net:euros(net+amount),vat:euros(vat+tax(selected.base,selected.rate)-tax(low,selected.rate)),gross:euros(otherGross+selected.base+tax(selected.base,selected.rate))}};
  }
  return {groups,propose};
})();
if(typeof module!=='undefined')module.exports=CDIAllowance;
