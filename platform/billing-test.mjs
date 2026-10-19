import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {test} from 'node:test';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {blankDraft,blankSettings,draftWithSettings,normalizeDraft} from './billing-domain.ts';
import {seedBusinessDocument} from './business-migration.mjs';

const fixture=(kind='invoice',title='Mission fictive')=>{
 const d=blankDraft(kind,'2026-10-20');d.title=title;
 d.seller={...d.seller,name:'Émetteur fictif',addressLine1:'1 rue du Test',postalCode:'20000',city:'Ajaccio',siret:'12345678900011'};
 d.buyer={...d.buyer,name:'Client fictif',addressLine1:'2 rue du Test',postalCode:'20200',city:'Bastia'};
 d.lines[0]={...d.lines[0],description:'Accompagnement',quantity:'1.25',unitPrice:'700'};
 d.dueDate='2026-11-19';d.paymentTerms='À 30 jours';
 if(kind==='quote')d.validUntil='2026-11-20';
 return d;
};

await test('API de brouillons : identité, conservation, concurrence et traçabilité',async t=>{
 const ctx=await testEnvironment();
 try{
  const admin=await ctx.login(users[0]),consultant=await ctx.login(users[1]);
  const call=(path='',options={})=>ctx.worker.dispatchFetch('https://preview.example/api/v1/billing'+path,{
   ...options,headers:{Origin:'http://127.0.0.1:5196','Content-Type':'application/json',Authorization:'Bearer '+admin.token,...options.headers}
  });
  const send=(method,path,payload,headers={})=>call(path,{method,headers,body:JSON.stringify(payload)});
  const create=(id,data)=>send('POST','/documents',{id,data});
  const save=(id,version,data)=>send('PUT','/documents/'+id,{data},{'If-Match':String(version)});
  const convert=(id,version,newId)=>send('POST','/documents/'+id+'/convert',{id:newId},{'If-Match':String(version)});
  const read=async(response,status)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
  const history=id=>ctx.db.prepare('SELECT * FROM billing_document_versions WHERE document_id=? ORDER BY version').bind(id).all();

  await t.test('les requêtes ne créent jamais le schéma',async()=>{
   await read(await call('/documents'),503);
   assert.equal((await ctx.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'billing_%'").first()).n,0);
   await migrateBilling(ctx.db);await migrateBilling(ctx.db);
   assert.equal((await read(await call('/documents'),200)).total,0);
  });

  await t.test('la direction seule accède aux routes, avec origine contrôlée',async()=>{
   const id=randomUUID();
   for(const [method,path,payload] of [['GET','/settings'],['PUT','/settings',{data:blankSettings()}],['GET','/documents'],['GET','/context'],['GET','/documents/'+id],['POST','/documents',{id,data:fixture()}],['PUT','/documents/'+id,{data:fixture()}],['POST','/documents/'+id+'/convert',{id:randomUUID()}]]){
    const options={method,headers:{Authorization:''},...(payload?{body:JSON.stringify(payload)}:{})};
    await read(await call(path,options),401);
    await read(await call(path,{...options,headers:{Authorization:'Bearer '+consultant.token}}),403);
   }
   await read(await call('/documents',{headers:{Origin:'https://evil.example'}}),403);
   await read(await call('/documents',{headers:{Authorization:'Bearer invalide'}}),401);
   const response=await call('/documents');assert.match(response.headers.get('cache-control'),/no-store/);
   assert.equal((await ctx.db.prepare('SELECT count(*) AS n FROM billing_documents').first()).n,0);
  });

  let invoice,id;
  await t.test('création, calcul serveur, normalisation et historique initial',async()=>{
   id=randomUUID();invoice=fixture();invoice.buyer.name='Client de\u0301mo';
   const result=await read(await create(id.toUpperCase(),invoice),201);
   assert.equal(result.id,id);assert.equal(result.version,1);assert.equal(result.status,'draft');
   assert.equal(result.data.buyer.name,'Client démo');assert.equal(result.data.lines[0].id,invoice.lines[0].id);
   assert.equal(result.totals.netMinor,'87500');assert.equal(result.totals.taxMinor,'17500');assert.equal(result.totals.grossMinor,'105000');
   assert.equal(result.createdBy,users[0]);assert.equal(result.updatedBy,users[0]);
   const rows=(await history(id)).results;assert.equal(rows.length,1);assert.deepEqual(JSON.parse(rows[0].data_json),result.data);
   assert.deepEqual(await read(await call('/documents/'+id),200),result);
  });

  await t.test('création réessayée sans doublon et collision de contenu rejetée',async()=>{
   const retry=await read(await create(id,invoice),200);assert.equal(retry.version,1);
   await read(await create(id,{...invoice,title:'Autre contenu'}),409);
   const newId=randomUUID(),data=fixture();
   const responses=await Promise.all([create(newId,data),create(newId,data)]);
   assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);
   assert.equal((await history(newId)).results.length,1);
  });

  await t.test('brouillon incomplet et décimale en saisie conservés sans faux zéro',async()=>{
   const data=blankDraft('quote','2026-02-30');data.lines[0].unitPrice='12,';data.lines[0].quantity='';
   const newId=randomUUID(),result=await read(await create(newId,data),201);
   assert.deepEqual(result.data,data);assert.equal(result.totals,null);assert.ok(result.issues.length>0);
   const readBack=await read(await call('/documents/'+newId),200);assert.equal(readBack.data.lines[0].unitPrice,'12,');assert.equal(readBack.data.lines[0].quantity,'');
  });

  await t.test('champs inconnus, montants imposés et identifiants invalides refusés',async()=>{
   const badData=[{...invoice,total:1},{...invoice,number:'FA-1'},{...invoice,seller:{...invoice.seller,admin:true}},
    {...invoice,lines:[{...invoice.lines[0],netMinor:'1'}]}, {...invoice,lines:[invoice.lines[0],invoice.lines[0]]},
    {...invoice,lines:[{...invoice.lines[0],id:'line'}]}, {...invoice,notes:'a'.repeat(10001)}, {...invoice,currency:'USD'}];
   for(const data of badData)await read(await create(randomUUID(),data),400);
   for(const invalid of ['',null,1,'not-a-uuid','00000000-0000-0000-0000-000000000000'])await read(await create(invalid,invoice),400);
   await read(await send('POST','/documents',{id:randomUUID(),data:invoice,totals:{grossMinor:'1'}}),400);
   await read(await send('POST','/documents',{id:randomUUID(),data:invoice,createdBy:'attacker'}),400);
   await read(await call('/documents/not-a-uuid'),400);
   await read(await call('/documents/'+randomUUID()),404);
   await read(await call('/documents',{method:'POST',body:'{'}),400);
   await read(await call('/documents',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'}),415);
   await read(await call('/documents',{method:'POST',body:JSON.stringify({padding:'x'.repeat(300001)})}),413);
  });

  await t.test('If-Match obligatoire ; un conflit laisse les versions inchangées',async()=>{
   await read(await send('PUT','/documents/'+id,{data:invoice}),428);
   for(const version of ['0','-1','1.1','"1"','01','9007199254740992','x'])await read(await send('PUT','/documents/'+id,{data:invoice},{'If-Match':version}),400);
   await read(await save(id,1,{...invoice,kind:'quote'}),400);
   await read(await save(randomUUID(),1,invoice),404);
   assert.equal((await history(id)).results.length,1);
   const updated={...invoice,title:'Version gagnante'};
   const competing={...invoice,title:'Version concurrente'};
   const responses=await Promise.all([save(id,1,updated),save(id,1,competing)]);
   assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
   const winner=await responses.find(r=>r.status===200).json();assert.equal(winner.version,2);
   assert.equal((await read(await call('/documents/'+id),200)).data.title,winner.data.title);
   const rows=(await history(id)).results;assert.equal(rows.length,2);assert.equal(JSON.parse(rows[0].data_json).title,invoice.title);assert.equal(JSON.parse(rows[1].data_json).title,winner.data.title);
   await read(await save(id,1,invoice),409);assert.equal((await history(id)).results.length,2);
   const retry=await read(await create(id,invoice),200);assert.equal(retry.version,2);assert.equal(retry.data.title,winner.data.title);
  });

  await t.test('pagination, filtre de type et recherche littérale',async()=>{
   const one=fixture('invoice','BILL-QUERY %_ literal'),two=fixture('invoice','BILL-QUERY autre'),three=fixture('quote','BILL-QUERY devis');
   for(const data of [one,two,three])await read(await create(randomUUID(),data),201);
   const pages=[];for(const offset of [0,1,2])pages.push(await read(await call('/documents?q=BILL-QUERY&kind=invoice&limit=1&offset='+offset),200));
   assert.deepEqual(pages.map(p=>p.total),[2,2,2]);assert.deepEqual(pages.map(p=>p.documents.length),[1,1,0]);assert.notEqual(pages[0].documents[0].id,pages[1].documents[0].id);
   const special=await read(await call('/documents?q='+encodeURIComponent('%_')),200);assert.equal(special.total,1);assert.equal(special.documents[0].data.title,one.title);
   assert.equal((await read(await call('/documents?q='+encodeURIComponent("' OR 1=1 --")),200)).total,0);
   assert.equal((await read(await call('/documents?q=BILL-QUERY&kind=quote'),200)).total,1);
   for(const query of ['limit=0','limit=101','limit=1.5','offset=-1','offset=1000001','limit=9007199254740992','kind=credit','limit=1&limit=2','other=x','q='+('a'.repeat(201))])await read(await call('/documents?'+query),400);
  });

  let quoteId,quoteData,converted;
  await t.test('conversion versionnée : une facture copiée, aucun numéro émis',async()=>{
   quoteId=randomUUID();quoteData=fixture('quote','Devis à convertir');quoteData.references.orderReference='COMMANDE-TEST';
   await read(await create(quoteId,quoteData),201);
   await read(await convert(quoteId,2,randomUUID()),409);
   await read(await convert(id,2,randomUUID()),400);
   await read(await convert(quoteId,1,quoteId),400);
   await read(await convert(randomUUID(),1,randomUUID()),404);
   const target=randomUUID();converted=await read(await convert(quoteId,1,target),201);
   assert.equal(converted.sourceDocumentId,quoteId);assert.equal(converted.status,'draft');assert.equal(converted.version,1);assert.equal(converted.data.kind,'invoice');
   assert.deepEqual(converted.data,{...quoteData,kind:'invoice',validUntil:''});assert.equal('number' in converted.data,false);
   assert.equal((await read(await call('/documents/'+quoteId),200)).version,1);assert.equal((await history(quoteId)).results.length,1);assert.equal((await history(target)).results.length,1);
   assert.equal((await read(await convert(quoteId,1,target),200)).id,target);
   await read(await convert(quoteId,1,randomUUID()),409);
   await read(await create(target,converted.data),409);
   // Historical retry remains idempotent even if the source has since been edited.
   await read(await save(quoteId,1,{...quoteData,title:'Devis corrigé après copie'}),200);
   const oldCopy=await read(await convert(quoteId,1,target),200);assert.equal(oldCopy.data.title,quoteData.title);
   await read(await convert(quoteId,2,target),409);await read(await convert(quoteId,2,randomUUID()),409);
   const rows=await ctx.db.prepare('SELECT * FROM billing_documents WHERE source_document_id=?').bind(quoteId).all();assert.equal(rows.results.length,1);assert.equal(rows.results[0].source_version,1);
  });

  await t.test('conversions concurrentes : un seul résultat et retries sans doublon',async()=>{
   const source=randomUUID(),data=fixture('quote'),target=randomUUID();await read(await create(source,data),201);
   const same=await Promise.all([convert(source,1,target),convert(source,1,target)]);assert.deepEqual(same.map(r=>r.status).sort(),[200,201]);assert.equal((await history(target)).results.length,1);
   const source2=randomUUID();await read(await create(source2,data),201);
   const different=await Promise.all([convert(source2,1,randomUUID()),convert(source2,1,randomUUID())]);assert.deepEqual(different.map(r=>r.status).sort(),[201,409]);
   assert.equal((await ctx.db.prepare('SELECT count(*) AS n FROM billing_documents WHERE source_document_id=?').bind(source2).first()).n,1);
  });

  await t.test('une modification concurrente ne peut altérer la version copiée du devis',async()=>{
   const source=randomUUID(),target=randomUUID(),data=fixture('quote','Version source 1');await read(await create(source,data),201);
   const changed={...data,title:'Version source 2',lines:[{...data.lines[0],unitPrice:'900'}]};
   const [conversion,modification]=await Promise.all([convert(source,1,target),save(source,1,changed)]);
   const latest=await read(modification,200);assert.equal(latest.version,2);assert.equal(latest.totals.netMinor,'112500');
   if(conversion.status===201){
    const copy=await conversion.json();assert.equal(copy.data.title,data.title);assert.equal(copy.data.lines[0].unitPrice,'700');assert.equal(copy.totals.netMinor,'87500');
    assert.equal((await ctx.db.prepare('SELECT source_version FROM billing_documents WHERE id=?').bind(target).first()).source_version,1);
   }else{
    await read(conversion,409);await read(await call('/documents/'+target),404);
   }
   const staleId=randomUUID();
   await assert.rejects(()=>ctx.db.prepare(`INSERT INTO billing_documents(id,kind,status,version,data_json,totals_json,issues_json,create_hash,source_document_id,source_version,created_at,updated_at,created_by,updated_by)
    SELECT ?,'invoice','draft',1,json_set(data_json,'$.kind','invoice'),totals_json,issues_json,create_hash,id,1,created_at,updated_at,created_by,updated_by FROM billing_documents WHERE id=?`).bind(staleId,source).run(),/BILLING_SOURCE_VERSION/);
   await read(await call('/documents/'+staleId),404);
  });

  await t.test('historique append-only et identité immuable protégés par la base',async()=>{
   const before=(await history(id)).results;
   await assert.rejects(()=>ctx.db.prepare("UPDATE billing_document_versions SET updated_by='tampered' WHERE document_id=?").bind(id).run(),/BILLING_HISTORY_IMMUTABLE/);
   await assert.rejects(()=>ctx.db.prepare('DELETE FROM billing_document_versions WHERE document_id=?').bind(id).run(),/BILLING_HISTORY_IMMUTABLE/);
   await assert.rejects(()=>ctx.db.prepare("UPDATE billing_documents SET created_by='tampered',version=version+1 WHERE id=?").bind(id).run(),/BILLING_IMMUTABLE_IDENTITY/);
   await assert.rejects(()=>ctx.db.prepare("UPDATE billing_documents SET data_json=json_set(data_json,'$.title','tampered') WHERE id=?").bind(id).run(),/BILLING_IMMUTABLE_IDENTITY/);
   await assert.rejects(()=>ctx.db.prepare('DELETE FROM billing_documents WHERE id=?').bind(id).run(),/FOREIGN KEY/);
   assert.deepEqual((await history(id)).results,before);
   const previousCount=(await ctx.db.prepare('SELECT count(*) AS n FROM billing_documents').first()).n;
   // If the history cannot be appended, the document mutation is rolled back too.
   await ctx.db.prepare("CREATE TRIGGER test_reject_billing_history BEFORE INSERT ON billing_document_versions WHEN NEW.version>1 BEGIN SELECT RAISE(ABORT,'TEST_HISTORY_FAILURE'); END").run();
   try{await read(await save(id,2,{...invoice,title:'Must roll back'}),503);}finally{await ctx.db.prepare('DROP TRIGGER test_reject_billing_history').run();}
   assert.equal((await read(await call('/documents/'+id),200)).version,2);assert.deepEqual((await history(id)).results,before);
   assert.equal((await ctx.db.prepare('SELECT count(*) AS n FROM billing_documents').first()).n,previousCount);
  });

  await t.test('le contexte ne contient que les colonnes métier autorisées',async()=>{
   await seedBusinessDocument(ctx.db,'budgets',{clients:[{id:'c-test',name:'Client contexte',internalSecret:'never-expose'}]},2);
   await ctx.setPortal(JSON.stringify({auth:{accounts:ctx.accounts,allowed:users},codesAffaires:[{id:'code-test',code1:31,code2:'AC',label:'Mission contexte',client:'Client contexte',private:'never-expose'}]}));
   await ctx.db.prepare("INSERT INTO markets(id,payload,version,updated_at,updated_by) VALUES(?,?,1,?,?)").bind('market-context',JSON.stringify({title:'Marché contexte',reference:'M-TEST',clientName:'Client contexte',private:'never-expose'}),'2026-10-20',users[0]).run();
   const result=await read(await call('/context'),200);
   assert.deepEqual(result.clients,[{id:'c-test',name:'Client contexte'}]);assert.deepEqual(result.businessCodes,[{id:'code-test',code:'31 AC',label:'Mission contexte',client:'Client contexte'}]);
   assert.deepEqual(result.markets,[{id:'market-context',title:'Marché contexte',reference:'M-TEST',clientName:'Client contexte'}]);
   assert.deepEqual(result.seller,blankSettings().seller);assert.deepEqual(result.settings,{version:0,data:blankSettings(),updatedAt:null});assert.doesNotMatch(JSON.stringify(result),/never-expose|password|salt|hash|accounts/);
  });

  await t.test('paramètres versionnés : premier enregistrement concurrent, historique et instantané du document',async()=>{
   const defaults=blankSettings();defaults.seller.name='Émetteur initial';defaults.legalNotes.discount='Pas d’escompte';
   const settingsHistory=()=>ctx.db.prepare('SELECT * FROM billing_settings_versions ORDER BY version').all();
   const put=(version,data)=>send('PUT','/settings',{data},{'If-Match':String(version)});
   await read(await send('PUT','/settings',{data:defaults}),428);
   for(const version of ['-1','01','1.5','"0"','9007199254740992'])await read(await put(version,defaults),400);
   for(const data of [{...defaults,other:true},{...defaults,paymentMeans:30},{...defaults,vatDue:null},{...defaults,legalNotes:{...defaults.legalNotes,extra:true}}])await read(await put(0,data),400);
   await read(await send('PUT','/settings',{data:defaults,updatedBy:'forged'},{'If-Match':'0'}),400);
   const concurrent=await Promise.all([put(0,defaults),put(0,{...defaults,paymentTerms:'Autres conditions'})]);
   assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
   const saved=await read(concurrent.find(r=>r.status===200),200);assert.equal(saved.version,1);assert.equal((await settingsHistory()).results.length,1);
   const snapshot=draftWithSettings('invoice',saved.data),snapshotId=randomUUID();await read(await create(snapshotId,snapshot),201);
   const next={...saved.data,seller:{...saved.data.seller,name:'Nouvelle dénomination'},legalNotes:{...saved.data.legalNotes,discount:'Autres conditions'}};
   const updated=await read(await put(1,next),200);assert.equal(updated.version,2);
   await read(await put(1,saved.data),409);await read(await put(0,saved.data),409);
   assert.deepEqual((await read(await call('/documents/'+snapshotId),200)).data,snapshot);
   assert.deepEqual(await read(await call('/settings'),200),updated);assert.deepEqual((await read(await call('/context'),200)).settings,updated);
   const history=(await settingsHistory()).results;assert.equal(history.length,2);assert.deepEqual(JSON.parse(history[0].data_json),saved.data);
   assert.equal(history[1].updated_by,users[0]);
   await assert.rejects(()=>ctx.db.prepare("UPDATE billing_settings SET data_json='{}' WHERE id='default'").run(),/BILLING_SETTINGS_VERSION/);
   await assert.rejects(()=>ctx.db.prepare('DELETE FROM billing_settings').run(),/BILLING_SETTINGS_HISTORY/);
   await assert.rejects(()=>ctx.db.prepare("UPDATE billing_settings_versions SET updated_by='tamper'").run(),/BILLING_SETTINGS_HISTORY/);
   await assert.rejects(()=>ctx.db.prepare('DELETE FROM billing_settings_versions').run(),/BILLING_SETTINGS_HISTORY/);
   await ctx.db.prepare("CREATE TRIGGER test_reject_settings BEFORE INSERT ON billing_settings_versions WHEN NEW.version>2 BEGIN SELECT RAISE(ABORT,'TEST_HISTORY_FAILURE'); END").run();
   try{await read(await put(2,defaults),503);}finally{await ctx.db.prepare('DROP TRIGGER test_reject_settings').run();}
   assert.deepEqual(await read(await call('/settings'),200),updated);assert.deepEqual((await settingsHistory()).results,history);
  });

  await t.test('les anciens brouillons v1 se lisent en v2 sans réécrire leur historique et acceptent leurs reprises',async()=>{
   const data=fixture('quote','Document historique v1');data.schemaVersion=1;
   delete data.businessProcess;delete data.paymentMeans;delete data.vatDue;delete data.legalNotes;
   for(const party of [data.seller,data.buyer]){delete party.siren;delete party.electronicAddress;delete party.electronicScheme;}
   const legacyId=randomUUID(),json=JSON.stringify(data),hash=createHash('sha256').update(json).digest('hex');
   await ctx.db.prepare("INSERT INTO billing_documents(id,kind,status,version,data_json,totals_json,issues_json,create_hash,created_at,updated_at,created_by,updated_by) VALUES(?,'quote','draft',1,?,NULL,'[]',?,'2026-10-20','2026-10-20','fixture','fixture')").bind(legacyId,json,hash).run();
   const expected=normalizeDraft(data);
   assert.deepEqual((await read(await call('/documents/'+legacyId),200)).data,expected);
   assert.deepEqual((await read(await create(legacyId,data),200)).data,expected);
   assert.deepEqual((await read(await create(legacyId,expected),200)).data,expected);
   assert.equal((await history(legacyId)).results.length,1);assert.equal((await history(legacyId)).results[0].data_json,json);
   const converted=await read(await convert(legacyId,1,randomUUID()),201);assert.equal(converted.data.schemaVersion,2);
   await read(await save(legacyId,1,{...expected,title:'Mise à jour v2'}),200);
   const records=(await history(legacyId)).results;assert.equal(records.length,2);assert.equal(records[0].data_json,json);assert.equal(JSON.parse(records[1].data_json).schemaVersion,2);
  });

  await t.test('suppression non exposée et révocation effective de la session',async()=>{
   await read(await call('/documents/'+id,{method:'DELETE'}),405);
   await read(await call('/context',{method:'POST',body:'{}'}),405);
   await read(await call('/not-a-route'),404);
   const revoked=await ctx.worker.dispatchFetch('https://preview.example/api/v1/session',{method:'DELETE',headers:{Origin:'http://127.0.0.1:5196',Authorization:'Bearer '+admin.token}});assert.equal(revoked.status,200);
   await read(await call('/documents'),401);await read(await call('/context'),401);await read(await create(randomUUID(),invoice),401);
  });
 }finally{await ctx.worker.dispose();}
});
