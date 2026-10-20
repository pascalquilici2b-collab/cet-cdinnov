import assert from 'node:assert/strict';
import {companyResults,companyQuery,applyCompany,searchCompanies} from './client/billing-company-search.ts';
import {companyFixture} from './billing-company-fixture.mjs';
const empty={name:'',addressLine1:'',addressLine2:'',postalCode:'',city:'',country:'FR',siren:'',siret:'',vatId:'',email:'',legal:'',electronicAddress:'',electronicScheme:''};
assert.equal(companyQuery('200 076 958 00053'),'20007695800053');
assert.throws(()=>companyQuery('20007695800054'),/Vérifiez/);
assert.throws(()=>companyQuery('12'),/caractères/);
let result=companyResults(companyFixture,'Collectivité');
assert.equal(result.candidates.length,2);assert.equal(result.hasMore,false);
assert.equal(result.candidates[0].party.addressLine2,'Bâtiment de test');
assert.equal(result.candidates[1].party.addressLine1,'PARC TECHNOLOGIQUE D’ERBAJOLO');
assert.equal(JSON.stringify(result).includes('NE DOIT PAS'),false);
assert.equal('vatId' in result.candidates[0].party,false);assert.equal('electronicAddress' in result.candidates[0].party,false);
assert.equal(companyResults(companyFixture,'20007695800053').candidates[0].party.city,'BASTIA');
assert.equal(companyResults(companyFixture,'732829320').candidates.length,0);
for(const patch of [{etat_administratif:'F'},{statut_diffusion:'P'}]){
 const data=structuredClone(companyFixture);Object.assign(data.results[0],patch);assert.equal(companyResults(data,'Collectivité').candidates.length,0);
}
const hidden=structuredClone(companyFixture);hidden.results[0].siege.statut_diffusion_etablissement='P';hidden.results[0].matching_etablissements=[];assert.equal(companyResults(hidden,'Collectivité').candidates.length,0);
assert.throws(()=>companyResults({error:'bad'},'Collectivité'),/illisible/);
const identity=result.candidates[0].party;
const current={...empty,name:'Autre entreprise',siren:'732829320',siret:'73282932000074',email:'other@example.invalid',vatId:'FRXX',electronicAddress:'OLD',electronicScheme:'0009',legal:'Anciennes mentions'};
assert.deepEqual(applyCompany(current,identity),{...empty,...identity});
const same={...current,...identity};assert.equal(applyCompany(same,identity).email,current.email);
const branch=applyCompany(same,result.candidates[1].party);assert.equal(branch.electronicAddress,'');assert.equal(branch.email,current.email);
const originalFetch=globalThis.fetch;
try{
 globalThis.fetch=async(url,options)=>{
  assert.equal(new URL(url).hostname,'recherche-entreprises.api.gouv.fr');
  assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');
  assert.deepEqual(options.headers,{Accept:'application/json'});
  return Response.json(companyFixture);
 };
 assert.equal((await searchCompanies('200076958',new AbortController().signal)).candidates.length,2);
 globalThis.fetch=async()=>new Response('',{status:429});await assert.rejects(searchCompanies('200076958',new AbortController().signal),/trop de demandes/);
 globalThis.fetch=async()=>new Response('not json');await assert.rejects(searchCompanies('200076958',new AbortController().signal),/illisible/);
}finally{globalThis.fetch=originalFetch;}
console.log('OK annuaire : établissement exact, exclusions, champs publics, changement d’identité, requête sans identifiants et erreurs.');
