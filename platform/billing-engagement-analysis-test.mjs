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
