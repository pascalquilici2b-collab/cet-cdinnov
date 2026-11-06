import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
import {emptyMarket} from '../marches/domain.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {blankClient} from './billing-directory-domain.ts';

const ctx=await testEnvironment();let checks=0;
try{
 await migrateBilling(ctx.db);const login=await ctx.login(users[0]);
 const api=(path,method='GET',body)=>ctx.worker.dispatchFetch('https://preview.example'+path,{method,headers:{Cookie:login.cookie,Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const read=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
 const check=async(name,fn)=>{await fn();checks++;console.log('OK '+name);};
 const clientA=randomUUID(),clientB=randomUUID(),clientC=randomUUID(),marketA=randomUUID(),marketB=randomUUID(),projectId=randomUUID(),date=new Date().toISOString();
 for(const [id,name] of [[clientA,'Entité actuelle Alpha'],[clientB,'Entité actuelle Beta'],[clientC,'Entité explicite Gamma']]){const data=blankClient();data.party.name=name;await read(await api('/api/v1/billing/clients','POST',{id,data}),201);}
 const project={id:projectId,name:'Projet partagé fictif',code:'IF TEST',programme:'Interreg fictif',marketIds:[marketA,marketB],clientIds:[clientC],notes:'',archived:false,orders:[]};
 for(const [id,clientId,projects] of [[marketA,clientA,[project]],[marketB,clientB,[]]])await ctx.db.prepare('INSERT INTO markets VALUES(?,?,1,?,?)').bind(id,JSON.stringify({...emptyMarket(),title:'Marché fictif',clientId,clientName:'Ancien libellé historique',projects}),date,'fixture').run();
 let shared=(await read(await api('/api/v1/projects'))).projects.find(p=>p.id===projectId);
 await check('Project lookup separates explicit relationships from effective client memberships and resolves current names',async()=>{
  assert.deepEqual(shared.clientIds,[clientC]);assert.deepEqual(new Set(shared.effectiveClientIds),new Set([clientA,clientB,clientC]));assert.equal(shared.clientName,'Entité actuelle Alpha');assert.deepEqual(new Set(shared.clientNames),new Set(['Entité actuelle Alpha','Entité actuelle Beta','Entité explicite Gamma']));
 });
 // Same editable-field projection used by ProjectDirectory.open: derived memberships are read-only.
 const editable=p=>({id:p.id,marketId:p.marketId,marketVersion:p.marketVersion,marketIds:p.marketIds,clientIds:p.clientIds,logoData:p.logoData||'',name:p.name,code:p.code,programme:p.programme||'',startDate:p.startDate||'',endDate:p.endDate||'',notes:p.notes,archived:p.archived});
 await check('Saving a project keeps effective memberships out of persisted client relationships',async()=>{
  const input={...editable(shared),name:'Projet partagé renommé'};assert.ok(!('effectiveClientIds' in input));shared=(await read(await api('/api/v1/projects','PUT',input))).project;
  const saved=JSON.parse((await ctx.db.prepare('SELECT payload FROM markets WHERE id=?').bind(marketA).first()).payload).projects[0];assert.deepEqual(saved.clientIds,[clientC]);assert.ok(!('effectiveClientIds' in saved));assert.deepEqual(new Set(shared.effectiveClientIds),new Set([clientA,clientB,clientC]));
 });
 await check('The write API rejects derived fields instead of persisting them as editable state',async()=>{
  await read(await api('/api/v1/projects','PUT',{...editable(shared),effectiveClientIds:[clientA,clientB,clientC]}),400);assert.equal((await ctx.db.prepare('SELECT version FROM markets WHERE id=?').bind(marketA).first()).version,shared.marketVersion);
 });
 await check('Removing a secondary market removes its derived client while retaining explicit memberships and history',async()=>{
  shared=(await read(await api('/api/v1/projects','PUT',{...editable(shared),marketIds:[marketA]}))).project;assert.deepEqual(new Set(shared.effectiveClientIds),new Set([clientA,clientC]));assert.deepEqual(shared.clientIds,[clientC]);
  const owner=JSON.parse((await ctx.db.prepare('SELECT payload FROM markets WHERE id=?').bind(marketA).first()).payload),secondary=JSON.parse((await ctx.db.prepare('SELECT payload FROM markets WHERE id=?').bind(marketB).first()).payload);assert.equal(owner.clientName,'Ancien libellé historique');assert.equal(secondary.clientName,'Ancien libellé historique');assert.deepEqual(owner.projects[0].clientIds,[clientC]);
 });
 console.log(JSON.stringify({checks,status:'passed',environment:'isolated cookie Worker/D1; fictional clients and projects'}));
}finally{await ctx.worker.dispose();}
