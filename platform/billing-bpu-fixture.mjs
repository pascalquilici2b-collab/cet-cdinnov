export const bpuPrices=()=>[
 ['Corse','Sénior',720],['Corse','Junior',500],['France Continentale','Sénior',720],['France Continentale','Junior',500],["à l’étranger",'Sénior',800],["à l’étranger",'Junior',580]
].map(([place,profile,amount],i)=>({id:'rate-'+i,status:'proposed',source:{documentId:'',locator:'',note:''},label:'Journée de travail '+(place.startsWith('à')?'':'en ')+place+' / Consultant '+profile,profile,location:place,amountMinor:amount*100,vatRate:20,unit:'day',startDate:'',endDate:'',notes:''}));
