import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixture,quoteFixtureTools,samplePDF} from './billing-quote-fixture.mjs';
import {blankDocumentDetails,addBillingMonths} from './billing-domain.ts';
import {fixture as marketFixture} from '../marches/test.mjs';
let sent=[],mode='ok';
const p=await billingPreview({bindings:{BREVO_API_KEY:'synthetic-test-key',NOTIFY_FROM:'sender@example.test'},outboundService:async req=>{assert.equal(new URL(req.url).hostname,'api.brevo.com');sent.push(await req.json());return mode==='ok'?Response.json({messageId:'test-message'},{status:201}):new Response('Unavailable',{status:503});}});
try{
 const token=p.sessions[0].token,headers={Authorization:'Bearer '+token,Origin:'https://app.cdinnov.eu','Content-Type':'application/json'};
 const api=(path,method='GET',body,extra={})=>p.ctx.worker.dispatchFetch('https://preview.test'+path,{method,headers:{...headers,...extra},...(body?{body:JSON.stringify(body)}:{})});
 const m={...marketFixture(),projects:[{id:'project-1',name:'Projet test',code:'PT',notes:'Privé',archived:false,orders:[{id:'order-1',reference:'BC-1',date:'2020-01-01',amountMinor:100,documentId:'',archived:false,notes:''}]}]};
 assert.equal((await api('/budgets/markets','POST',{id:'market-1',market:m})).status,201);
 let projects=(await(await api('/api/v1/projects')).json()).projects;assert.equal(projects.length,1);
 const input={id:'project-1',marketId:'market-1',marketVersion:1,name:'Projet renommé',code:'PR',programme:'Interreg Euro-Med',notes:'Privé',archived:false};
 assert.equal((await api('/api/v1/projects','PUT',input)).status,200);assert.equal((await api('/api/v1/projects','PUT',input)).status,409);
 assert.equal((await api('/api/v1/projects','PUT',{...input,marketVersion:2},{Authorization:'Bearer '+p.sessions[1].token})).status,403);
 const employee=(await(await api('/api/v1/projects','GET',undefined,{Authorization:'Bearer '+p.sessions[1].token})).json()).projects[0];assert.equal(employee.programme,'Interreg Euro-Med');assert.equal(employee.notes,undefined);assert.equal(employee.orders,undefined);
 assert.equal((await(await api('/budgets/markets/market-1')).json()).market.projects[0].orders.length,1);
 const {programme,...legacyProject}=input;assert.equal((await api('/api/v1/projects','PUT',{...legacyProject,marketVersion:2})).status,200);
 assert.equal((await(await api('/api/v1/projects')).json()).projects[0].programme,'Interreg Euro-Med');
 const q=await quoteFixtureTools(p.ctx,token),data=quoteFixture();data.references.marketId='market-1';data.references.projectId='project-1';data.references.project='Projet renommé';data.details={...blankDocumentDetails(),marketObject:m.title,period:'S1',fundingProgramme:'Horizon Europe',personInCharge:'Direction test',validityMonths:'3'};data.validUntil=addBillingMonths(data.issueDate,'3');
 let doc=await q.create(data);assert.deepEqual(doc.data.details,data.details);
 const mail={id:randomUUID(),recipient:'recipient@example.test',subject:'Devis de test',message:'Document fictif.'};const email=(d,i=mail)=>q.call('/documents/'+d.id+'/email','POST',i,{'If-Match':String(d.version)});
 assert.equal((await email(doc)).status,200);assert.equal((await email(doc)).status,200);assert.equal(sent.length,1);assert.deepEqual(Buffer.from(sent[0].attachment[0].content,'base64'),samplePDF());
 assert.equal((await q.call('/documents/'+doc.id)).status,200);doc=await(await q.call('/documents/'+doc.id)).json();assert.equal(doc.quote.version,1);
 let market=(await(await api('/budgets/markets/market-1')).json()).market;assert.equal(market.tracking.quotedMinor,225000);assert.equal(market.tracking.sentQuoteCount,1);
 let rejected=await q.send(doc,q.input(doc,'refused','Refus client','2020-01-02')); // A refusal cannot predate the recorded sent date.
 assert.ok([400,409,422].includes(rejected.status),await rejected.clone().text());
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});rejected=await q.send(doc,q.input(doc,'refused','Refus client',today));assert.equal(rejected.status,201,await rejected.clone().text());
 assert.equal((await(await api('/budgets/markets/market-1')).json()).market.tracking.quotedMinor,0);
 const legacy=await q.create(quoteFixture(),false),converted=await q.call('/documents/'+legacy.id+'/convert','POST',{id:randomUUID()},{'If-Match':'1'});assert.equal(converted.status,201,await converted.clone().text());assert.equal((await converted.json()).data.details.returnEmail,'cdi@cdinnov.com');
 mode='unknown';const uncertain=await q.create(),attempt={...mail,id:randomUUID()};assert.equal((await(await email(uncertain,attempt)).json()).delivery.state,'unknown');await email(uncertain,attempt);assert.equal(sent.length,2);
 console.log('OK Projets, conservation des BC, droits, devis, conversion, e-mail idempotent et consommation par devis envoyés/refusés.');
}finally{await p.close();}
