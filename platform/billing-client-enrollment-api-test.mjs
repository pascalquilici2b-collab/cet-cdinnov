import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {blankDraft} from './billing-domain.ts';
import {blankClient} from './billing-directory-domain.ts';
import {companyResults,applyCompany} from './client/billing-company-search.ts';
import {companyFixture} from './billing-company-fixture.mjs';
import {sameClient} from './billing-client-match.ts';
import {sameClientForCreation} from './billing-client-creation-match.ts';

const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ1cAAAAASUVORK5CYII=';

await test('ajout aux clients depuis un document : identités, données corrigées et liens persistants',async t=>{
 const externalRequests=[];
 const ctx=await testEnvironment({outboundService:request=>{externalRequests.push(request.url);return new Response('Réseau externe interdit dans ce test',{status:502});}});
 try{
  await migrateBilling(ctx.db);
  const admin=await ctx.login(users[0]),consultant=await ctx.login(users[1]);
  const call=(path,method='GET',payload,headers={})=>ctx.worker.dispatchFetch('https://preview.example/api/v1/billing'+path,{
   method,headers:{Origin:'https://app.cdinnov.eu','Content-Type':'application/json',Authorization:'Bearer '+admin.token,...headers},
   ...(payload===undefined?{}:{body:JSON.stringify(payload)})
  });
  const read=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
  const history=id=>ctx.db.prepare("SELECT * FROM billing_directory_versions WHERE kind='clients' AND id=? ORDER BY version").bind(id).all();
  const countSiret=siret=>ctx.db.prepare("SELECT count(*) AS n FROM billing_directory WHERE kind='clients' AND json_extract(data_json,'$.party.siret')=?").bind(siret).first();

  // Real lookup transformation, with a local public-directory fixture: no external service or real client is changed.
  const source=structuredClone(companyFixture);
  source.results[0].nature_juridique='7372';
  source.results[0].dirigeants=[{nom:'FICTIF',prenoms:'Alex',qualite:'Président',date_de_naissance:'1900-01-01',adresse:'Adresse privée exclue'}];
  source.results[0].tva=['FR00200076958'];
  const candidates=companyResults(source,'Collectivité').candidates;
  assert.equal(candidates.length,2);
  const first=candidates.find(c=>c.party.siret==='20007695800012'),second=candidates.find(c=>c.party.siret==='20007695800053');
  assert.ok(first);assert.ok(second);
  const clientId=randomUUID();
  const customer={...blankClient(),party:{...applyCompany(blankClient().party,first.party),
   name:'Collectivité de Corse — Direction des projets',addressLine1:'Adresse de facturation précisée par le client',
   addressLine2:'À l’attention du service financier',email:'facturation@example.invalid',legal:'Référence de service conservée'},
   notes:'Fiche créée depuis le devis, données corrigées avant ajout.',details:structuredClone(first.details),
   logoKey:'collectivite-corse.webp',logoData:pixel};
  let savedClient,document;

  await t.test('ajout soumis à la session et au rôle, sans écriture refusée',async()=>{
   for(const [authorization,status] of [['',401],['Bearer '+consultant.token,403]]){
    await read(await call('/clients','POST',{id:clientId,data:customer},{Authorization:authorization}),status);
   }
   assert.equal((await countSiret(first.party.siret)).n,0);
  });

  await t.test('le nom et l’adresse modifiés, les détails annuaire et les logos survivent à la création',async()=>{
   savedClient=await read(await call('/clients','POST',{id:clientId,data:customer}),201);
   assert.equal(savedClient.id,clientId);assert.equal(savedClient.version,1);
   assert.equal(savedClient.data.party.name,'Collectivité de Corse — Direction des projets');
   assert.equal(savedClient.data.party.addressLine1,'Adresse de facturation précisée par le client');
   assert.equal(savedClient.data.party.addressLine2,'À l’attention du service financier');
   assert.equal(savedClient.data.party.siret,'20007695800012');
   assert.equal(savedClient.data.party.email,'facturation@example.invalid');
   assert.deepEqual(savedClient.data,customer);
   assert.equal(savedClient.data.details.source,'https://annuaire-entreprises.data.gouv.fr/etablissement/20007695800012');
   assert.equal(savedClient.data.details.representatives,'Alex FICTIF — Président');
   assert.deepEqual(savedClient.data.details.vatNumbers,['FR00200076958']);
   assert.doesNotMatch(JSON.stringify(savedClient),/1900-01-01|Adresse privée exclue/);
   assert.deepEqual(await read(await call('/clients/'+clientId)),savedClient);
   assert.deepEqual(JSON.parse((await history(clientId)).results[0].data_json),customer);
   const context=await read(await call('/context'));
   assert.ok(context.clients.some(c=>c.id===clientId&&c.name===customer.party.name));
   assert.deepEqual(context.clientLogos.find(c=>c.id===clientId),{id:clientId,name:customer.party.name,siren:'200076958',siret:'20007695800012',logoKey:customer.logoKey,logoData:pixel});
  });

  await t.test('rejouer le même ajout est idempotent ; changer son contenu est un conflit',async()=>{
   const attempts=await Promise.all([call('/clients','POST',{id:clientId,data:customer}),call('/clients','POST',{id:clientId.toUpperCase(),data:customer})]);
   for(const attempt of attempts)assert.deepEqual(await read(attempt),savedClient);
   await read(await call('/clients','POST',{id:clientId,data:{...customer,party:{...customer.party,name:'Autre libellé après perte de réponse'}}}),409);
   assert.equal((await history(clientId)).results.length,1);
   assert.equal((await countSiret(first.party.siret)).n,1);
  });

  await t.test('un SIRET existant sous un autre identifiant ne duplique ni n’écrase la fiche ou son logo',async()=>{
   const attempted={...customer,party:{...customer.party,name:'Libellé officiel récupéré ultérieurement',addressLine1:'Adresse annuaire différente'},details:second.details,logoKey:'',logoData:''};
   await read(await call('/clients','POST',{id:randomUUID(),data:attempted}),409);
   assert.deepEqual(await read(await call('/clients/'+clientId)),savedClient);
   assert.equal((await countSiret(first.party.siret)).n,1);
   assert.equal((await history(clientId)).results.length,1);
   const search=await read(await call('/clients?q='+first.party.siret));
   assert.equal(search.total,1);assert.equal(search.records[0].id,clientId);
  });

  await t.test('un autre SIRET du même SIREN et du même nom est une nouvelle fiche distincte',async()=>{
   const data={...customer,party:{...customer.party,...second.party,name:customer.party.name},details:second.details};
   const created=await read(await call('/clients','POST',{id:randomUUID(),data}),201);
   assert.notEqual(created.id,clientId);assert.equal(created.data.party.siren,savedClient.data.party.siren);
   assert.equal(created.data.party.name,savedClient.data.party.name);assert.equal(created.data.party.siret,'20007695800053');
   assert.equal(created.data.details.source,'https://annuaire-entreprises.data.gouv.fr/etablissement/20007695800053');
   assert.equal((await countSiret(first.party.siret)).n,1);assert.equal((await countSiret(second.party.siret)).n,1);
   const list=await read(await call('/clients?q=200076958'));
   assert.equal(list.total,2);assert.deepEqual(new Set(list.records.map(r=>r.id)),new Set([clientId,created.id]));
   assert.deepEqual(await read(await call('/clients/'+clientId)),savedClient);
  });

  await t.test('deux ajouts simultanés du même nouvel établissement ne produisent qu’une fiche et un historique',async()=>{
   const data={...blankClient(),party:{...blankClient().party,name:'Client concurrent fictif',siren:'392175568',siret:'39217556800022'}};
   const attempts=await Promise.all([randomUUID(),randomUUID()].map(id=>call('/clients','POST',{id,data})));
   assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);
   const created=await read(attempts.find(r=>r.status===201),201);
   assert.equal((await countSiret('39217556800022')).n,1);assert.equal((await history(created.id)).results.length,1);
  });

  await t.test('le même SIRET copié avec des espaces insécables reste unique pendant deux ajouts simultanés',async()=>{
   const data={...blankClient(),party:{...blankClient().party,name:'Client SIRET copié fictif',siren:'188300016',siret:'188\u00a0300\u00a0016\u00a000030'}};
   const attempts=await Promise.all([randomUUID(),randomUUID()].map(id=>call('/clients','POST',{id,data})));
   assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);
   const rows=await ctx.db.prepare("SELECT data_json FROM billing_directory WHERE kind='clients' AND json_extract(data_json,'$.party.siren')='188300016'").all();
   assert.equal(rows.results.filter(r=>JSON.parse(r.data_json).party.siret.replace(/\s/g,'')==='18830001600030').length,1);
  });

  await t.test('une fiche historique avec SIREN seul ne bloque pas la création explicite d’un établissement',async()=>{
   const historical={...blankClient(),party:{...blankClient().party,name:'Société historique sans établissement identifié',siren:'552100554'},notes:'Données historiques à conserver'};
   const id=randomUUID(),before=await read(await call('/clients','POST',{id,data:historical}),201);
   const establishment={...blankClient(),party:{...blankClient().party,name:'Société — établissement précisé',siren:'552100554',siret:'55210055400013',addressLine1:'Adresse de cet établissement'}};
   assert.equal(sameClient(historical,establishment.party),true,'Le rapprochement historique trouve seulement la société.');
   assert.equal(sameClientForCreation(historical,establishment.party),false,'Le SIREN seul ne prouve pas le même établissement.');
   const created=await read(await call('/clients','POST',{id:randomUUID(),data:establishment}),201);
   assert.notEqual(created.id,id);assert.equal(created.data.party.siret,'55210055400013');
   assert.deepEqual(await read(await call('/clients/'+id)),before);assert.equal((await history(id)).results.length,1);
   await read(await call('/clients','POST',{id:randomUUID(),data:{...establishment,party:{...establishment.party,name:'Autre libellé du même établissement'}}}),409);
   assert.equal((await countSiret('55210055400013')).n,1);
  });

  await t.test('un logo historique sans identifiants reste une suggestion et ne fusionne pas un nouvel établissement',async()=>{
   const historical={...blankClient(),party:{...blankClient().party,name:'Libellé historique du service financier',email:'historique@example.invalid'},logoKey:'cci-var.webp',logoData:pixel,notes:'Logo historique conservé'};
   const id=randomUUID(),before=await read(await call('/clients','POST',{id,data:historical}),201);
   const establishment={...blankClient(),party:{...blankClient().party,name:"CHAMBRE DE COMMERCE ET D’INDUSTRIE TERRITORIALE DU VAR",siren:'188300016',siret:'18830001600014'}};
   assert.equal(sameClient(historical,establishment.party),true,'Le logo identifie l’organisation, pas son établissement.');
   assert.equal(sameClientForCreation(historical,establishment.party),false);
   const created=await read(await call('/clients','POST',{id:randomUUID(),data:establishment}),201);
   assert.notEqual(created.id,id);assert.equal(created.data.party.siret,'18830001600014');
   assert.deepEqual(await read(await call('/clients/'+id)),before);assert.equal((await history(id)).results.length,1);
   assert.equal(created.data.party.email,'');assert.equal(created.data.logoData,undefined);
   // Manual name-only creation keeps the historical duplicate policy.
   assert.equal(sameClientForCreation(historical,historical.party),true);
   await read(await call('/clients','POST',{id:randomUUID(),data:historical}),409);
  });

  await t.test('le devis déjà ouvert conserve son client lié après sauvegarde et relecture dans une nouvelle session',async()=>{
   const draft=blankDraft('quote','2026-10-30');draft.title='Devis fictif avec ajout client';
   draft.buyer=structuredClone(customer.party);
   document=await read(await call('/documents','POST',{id:randomUUID(),data:draft}),201);
   assert.equal(document.data.clientId,'');
   document=await read(await call('/documents/'+document.id,'PUT',{data:{...document.data,clientId}},{'If-Match':String(document.version)}));
   const fresh=await ctx.login(users[0]);
   const reloaded=await read(await call('/documents/'+document.id,'GET',undefined,{Authorization:'Bearer '+fresh.token}));
   assert.equal(reloaded.data.clientId,clientId);assert.deepEqual(reloaded.data.buyer,customer.party);
   assert.equal(reloaded.data.buyer.name,'Collectivité de Corse — Direction des projets');
   const persisted=await ctx.db.prepare('SELECT data_json FROM billing_documents WHERE id=?').bind(document.id).first();
   assert.equal(JSON.parse(persisted.data_json).clientId,clientId);
   const linked=await read(await call('/clients/'+reloaded.data.clientId));
   assert.deepEqual(linked.data.details,first.details);assert.equal(linked.data.logoData,pixel);
  });

  await t.test('une fiche mise à jour reste intacte lors du retry de création et ne réécrit pas le document',async()=>{
   const changed={...customer,party:{...customer.party,name:'Nom du répertoire corrigé après le devis',addressLine1:'Nouvelle adresse après le devis'}};
   const updated=await read(await call('/clients/'+clientId,'PUT',{data:changed},{'If-Match':'1'}));
   assert.equal(updated.version,2);
   assert.deepEqual(await read(await call('/clients','POST',{id:clientId,data:customer})),updated);
   assert.equal((await history(clientId)).results.length,2);
   const reloaded=await read(await call('/documents/'+document.id));
   assert.equal(reloaded.data.clientId,clientId);assert.deepEqual(reloaded.data.buyer,customer.party);
   assert.equal(updated.data.logoKey,customer.logoKey);assert.equal(updated.data.logoData,pixel);
   assert.deepEqual(updated.data.details,customer.details);
  });

  await t.test('les métadonnées illégales et logos distants ou actifs sont refusés avant écriture',async()=>{
   for(const patch of [{logoKey:'../../private.svg'},{logoData:'https://example.invalid/logo.png'},{logoData:'data:image/svg+xml;base64,PHN2Zy8+'},
    {details:{...first.details,source:'https://example.invalid/annuaire'}},{details:{...first.details,unlistedSecret:'forbidden'}}]){
    const id=randomUUID();await read(await call('/clients','POST',{id,data:{...customer,...patch}}),422);
    assert.equal(await ctx.db.prepare("SELECT id FROM billing_directory WHERE kind='clients' AND id=?").bind(id).first(),null);
   }
   assert.equal((await countSiret(first.party.siret)).n,1);
   assert.deepEqual(externalRequests,[]);
  });
 }finally{await ctx.worker.dispose();}
});
