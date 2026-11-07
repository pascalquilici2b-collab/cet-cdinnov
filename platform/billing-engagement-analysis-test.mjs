import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['platform/billing-engagement-analysis.ts'],bundle:true,format:'esm',platform:'node',write:false});
const {analyzeEngagement}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
async function analyze(text,facts){
 const db={prepare(){return {bind(){return {async first(){return {reserved:1};}};}};}};
 const env={MARKETS_AI:{async run(){return {response:JSON.stringify({facts})};}}};
 const result=await analyzeEngagement(new Request('https://local/api/v1/billing/engagement-analysis',{method:'POST',body:JSON.stringify({text})}),db,env,(status,body)=>({status,...body}));
 assert.equal(result.status,200);return result.fields;
}
const fact=(field,value,quote=value)=>({field,value,quote});

test('exact but misattributed buyer, object and service quotations do not become market or service references',async()=>{
 const text='Bon de commande fictif.\nAcheteur : Commune Fictive de Démonstration\nObjet : Assistance et entretien du site de démonstration\nService Chorus : SVC-FICTIF-A.\n';
 const fields=await analyze(text,[fact('marketReference','Objet : Assistance et entretien du site de démonstration'),fact('serviceCode','Commune Fictive de Démonstration','Acheteur : Commune Fictive de Démonstration'),fact('marketReference','SVC-FICTIF-A','Service Chorus : SVC-FICTIF-A.')]);
 assert.deepEqual(fields,{});
});

test('bare-value quotes retain qualified market and service references from their actual source lines',async()=>{
 for(const [marketLabel,serviceLabel]of [['Référence du marché :','Service Chorus :'],['Contrat n°','Code service :'],['N° de marché :','Service destinataire :'],['Marché :','Service :'],['Réf. contrat :','Service gestionnaire :']]){
  const text=marketLabel+' MARCHE-FICTIF-26\n'+serviceLabel+' PORT DE PLAISANCE FICTIF\n';
  assert.deepEqual(await analyze(text,[fact('marketReference','MARCHE-FICTIF-26'),fact('serviceCode','PORT DE PLAISANCE FICTIF')]),{marketReference:'MARCHE-FICTIF-26',serviceCode:'PORT DE PLAISANCE FICTIF'});
 }
});

test('a neighboring label or qualified text elsewhere in a multiline quote cannot qualify the wrong row',async()=>{
 const text='Référence du marché : MARCHE-FICTIF-26\nObjet : Assistance fictive\nService Chorus : SVC-FICTIF-01\nAcheteur : Commune Fictive\nContrat :\nM-AUTRE-99\nService destinataire :\nCOMMUNE-AUTRE\n';
 assert.deepEqual(await analyze(text,[fact('marketReference','Assistance fictive',text),fact('serviceCode','Commune Fictive',text),fact('marketReference','M-AUTRE-99'),fact('serviceCode','COMMUNE-AUTRE')]),{});
});

test('cell labels do not qualify unrelated values later on the same row; genuine conflicting service values remain removed',async()=>{
 const text='Acheteur : Commune Fictive\tService Chorus : SVC-FICTIF-01\nObjet : Assistance au Service : AUTRE-COMMUNE\nService Chorus : SVC-FICTIF-A. Service Chorus : SVC-FICTIF-B.\n';
 assert.deepEqual(await analyze(text,[fact('serviceCode','SVC-FICTIF-01'),fact('marketReference','Commune Fictive'),fact('serviceCode','AUTRE-COMMUNE')]),{serviceCode:'SVC-FICTIF-01'});
 assert.deepEqual(await analyze(text,[fact('serviceCode','SVC-FICTIF-A'),fact('serviceCode','SVC-FICTIF-B')]),{});
});

test('PDF.js column separators retain only the immediately preceding qualified label',async()=>{
 for(const separator of [' | ','\t']){
  const text='Référence du marché'+separator+'MARCHE-FICTIF-26\nService Chorus :'+separator+'SVC-FICTIF-01\n';
  assert.deepEqual(await analyze(text,[fact('marketReference','MARCHE-FICTIF-26'),fact('serviceCode','SVC-FICTIF-01')]),{marketReference:'MARCHE-FICTIF-26',serviceCode:'SVC-FICTIF-01'});
  const unrelated='Contrat'+separator+'Objet'+separator+'FAUX-MARCHE\nService Chorus'+separator+'Acheteur'+separator+'COMMUNE-FAUSSE\nService Chorus'+separator+separator+'SVC-LOINTAIN\n';
  assert.deepEqual(await analyze(unrelated,[fact('marketReference','FAUX-MARCHE'),fact('serviceCode','COMMUNE-FAUSSE'),fact('serviceCode','SVC-LOINTAIN')]),{});
 }
});

test('HT amount belongs to its own total, not a neighboring TTC or unit price in an exact quotation',async()=>{
 for(const separator of [' | ','\t',' ; ']){
  const quote='Total HT : 1 000,00 EUR'+separator+'Total TTC : 1 200,00 EUR';
  assert.deepEqual(await analyze('Bon de commande fictif.\n'+quote,[fact('amountMinor',120000,quote)]),{});
  assert.deepEqual(await analyze('Bon de commande fictif.\n'+quote,[fact('amountMinor',100000,quote)]),{amountMinor:100000});
 }
 for(const text of ['Montant total HT : 1 260,00 EUR','Total HT | 1 260,00 EUR','Montant total : 1 260,00 EUR HT','Total hors taxes : 1.260,00 EUR'])assert.deepEqual(await analyze(text,[fact('amountMinor',126000,text)]),{amountMinor:126000});
 for(const text of ['Prix unitaire HT : 1 260,00 EUR','Total HT : 1 260,00 EUR TTC'])assert.deepEqual(await analyze(text,[fact('amountMinor',126000,text)]),{});
 const partial='Total HT : 10000,00 EUR | Prix unitaire HT : 1000 EUR';
 assert.deepEqual(await analyze(partial,[fact('amountMinor',100000,partial)]),{},'a shorter unrelated amount cannot borrow the prefix of the actual total');
});

test('order date and Chorus engagement keep their source role with bare-value quotations',async()=>{
 const text='Bon de commande fictif.\nDate de signature : 01/11/2026\nDate du bon de commande | 07/11/2026\nService Chorus : SVC-FICTIF-01\nN° d’engagement Chorus : ENG-FICTIF-42\n';
 assert.deepEqual(await analyze(text,[fact('date','2026-11-01','Date de signature : 01/11/2026'),fact('engagement','SVC-FICTIF-01','Service Chorus : SVC-FICTIF-01')]),{});
 assert.deepEqual(await analyze(text,[fact('date','2026-11-07','07/11/2026'),fact('engagement','ENG-FICTIF-42')]),{date:'2026-11-07',engagement:'ENG-FICTIF-42'});
 for(const date of ['2026-11-07','7 novembre 2026','07/11/2026']){
  const source='Bon de commande fictif.\nDate : '+date;
  assert.deepEqual(await analyze(source,[fact('date','2026-11-07',date)]),{date:'2026-11-07'});
 }
 const unrelated='Date du bon : 07/11/2026\nDate de livraison : 09/11/2026\nEngagement Chorus | Service | SVC-FICTIF-01';
 assert.deepEqual(await analyze(unrelated,[fact('date','2026-11-09',unrelated),fact('engagement','SVC-FICTIF-01')]),{});
 for(const heading of ['Facture F-FICTIVE-99','Signature','Bon pour accord','Devis DEV-FICTIF-42']){
  const attached='Bon de commande BC-FICTIF-42\nDate du bon : 01/10/2026\n'+heading+'\nDate : 07/11/2026';
  assert.deepEqual(await analyze(attached,[fact('date','2026-11-07','Date : 07/11/2026')]),{},'the closest document/section heading owns a generic date');
 }
 for(const separator of [' | ','\t']){
  const source='Bon de commande BC-FICTIF-42'+separator+'Date : 07/11/2026';
  assert.deepEqual(await analyze(source,[fact('date','2026-11-07','07/11/2026')]),{date:'2026-11-07'});
  for(const heading of ['Facture F-FICTIVE-99','Signature','Devis DEV-FICTIF-42']){
   const unrelated='Bon de commande BC-FICTIF-42\n'+heading+separator+'Date : 07/11/2026';
   assert.deepEqual(await analyze(unrelated,[fact('date','2026-11-07','Date : 07/11/2026')]),{});
  }
 }
});
