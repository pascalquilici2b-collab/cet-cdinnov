import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {marketClientGroups} from './market-client-filter.ts';
import {emptyMarket} from '../marches/domain.mjs';

const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const bundle=await build({entryPoints:[fileURLToPath(new URL('./client/markets.tsx',import.meta.url))],bundle:true,format:'cjs',platform:'node',write:false,loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime']});
const compiled={exports:{}};new Function('module','exports','require',bundle.outputFiles[0].text)(compiled,compiled.exports,require);
const {MarketList}=compiled.exports;
const market=(id,clientId,clientName)=>({...emptyMarket(),id,version:1,title:'Accompagnement '+id,reference:id,clientId,clientName});
const clients=[{id:'client-a',name:'Dénomination actuelle'}];
const markets=[market('market-old','client-a','Ancienne dénomination'),market('market-new','client-a','Dénomination actuelle')];
const state=(clients,rows,query='')=>({clients,rows,query,busy:false});
const render=(s,client='')=>renderToStaticMarkup(React.createElement(MarketList,{state:s,client,onClient:()=>{},onQuery:()=>{}}));

test('Marchés : un même clientId et plusieurs dénominations donnent une seule carte',()=>{
 const before=structuredClone(markets),groups=marketClientGroups(clients,markets),html=render(state(clients,markets));
 assert.equal(groups.length,1);assert.equal(groups[0].value,'id:client-a');assert.equal(groups[0].label,'Dénomination actuelle');assert.equal(groups[0].markets.length,2);
 assert.equal((html.match(/class="mk-client-row"/g)||[]).length,1);assert.match(html,/data-client-filter="id:client-a"/);assert.match(html,/2 marchés/);
 assert.deepEqual(markets,before,'Les intitulés archivés des marchés ne sont pas renommés');
});

test('Marchés : homonymes avec IDs distincts restent deux cartes distinctes',()=>{
 const directory=[{id:'north',name:'Client homonyme'},{id:'south',name:'Client homonyme'}],rows=[market('north-contract','north','Client homonyme'),market('south-contract','south','Client homonyme')];
 const groups=marketClientGroups(directory,rows),html=render(state(directory,rows));
 assert.equal(groups.length,2);assert.notEqual(groups[0].label,groups[1].label);
 assert.equal((html.match(/class="mk-client-row"/g)||[]).length,2);assert.match(html,/data-client-filter="id:north"/);assert.match(html,/data-client-filter="id:south"/);
 const selected=render(state(directory,rows),'id:north');assert.match(selected,/data-open="north-contract"/);assert.doesNotMatch(selected,/data-open="south-contract"/);
});

test('Marchés : recherche par le nom courant ou historique, et titre depuis la clé stable',()=>{
 assert.equal(marketClientGroups(clients,markets,'denomination actuelle')[0].markets.length,2);
 assert.deepEqual(marketClientGroups(clients,markets,'ancienne dénomination')[0].markets.map(m=>m.id),['market-old']);
 const html=render(state(clients,markets,'Dénomination actuelle'),'id:client-a');
 assert.match(html,/<h1>Dénomination actuelle<\/h1>/);assert.equal((html.match(/class="mk-contract-row"/g)||[]).length,2);
 assert.match(render(state(clients,markets,'absent'),'id:client-a'),/Aucun marché trouvé/);
});

test('Marchés : alias exact prouvé sans élargissement par préfixe ni fusion de deux IDs',()=>{
 const directory=[{id:'adec-client',name:'Agence de développement économique de la Corse'}],rows=[market('contract-1','adec-client','Agence de développement économique de la Corse'),market('contract-2','','ADEC'),market('contract-3','','ADEC partenaire indépendant')];
 const groups=marketClientGroups(directory,rows);
 assert.equal(groups.find(g=>g.value==='id:adec-client').markets.length,2);
 assert.equal(groups.find(g=>g.value==='name:adec partenaire independant').markets.length,1);
});
