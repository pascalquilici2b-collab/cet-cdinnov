import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixture,quoteFixtureTools} from './billing-quote-fixture.mjs';
import {automaticNumberSeries} from './billing-numbering.ts';
import {reserveIssuance,billingCanonicalJSON} from './billing-issuance.ts';
import {calculateBilling} from './billing-domain.ts';
let preflightFails=false;
const p=await billingPreview({outboundService:async req=>{assert.equal(new URL(req.url).pathname,'/api/billing/preflight-pdf');if(preflightFails)return new Response('Unavailable',{status:503});const {document}=await req.json();return Response.json({valid:true,snapshotSha256:createHash('sha256').update(billingCanonicalJSON({schemaVersion:1,document,totals:calculateBilling(document)})).digest('hex'),checks:{render:true,amounts:true,xsd:true,schematron:true,france:true}});}}),db=p.ctx.db,user='direction@example.test';
const headers={Origin:'https://app.cdinnov.eu','Content-Type':'application/json',Authorization:'Bearer '+p.sessions[0].token};
const call=(path,method='GET',body,extra={})=>p.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing'+path,{method,headers:{...headers,...extra},...(body?{body:JSON.stringify(body)}:{})});
const create=async(kind,date)=>{const data=quoteFixture();data.kind=kind;data.issueDate=date;data.seller.siren='552100554';data.seller.vatId='FR96552100554';data.seller.electronicAddress='552100554';data.seller.electronicScheme='0225';data.buyer.siren='732829320';data.buyer.electronicAddress='732829320';data.buyer.electronicScheme='0225';if(kind==='invoice'){data.validUntil='';data.dueDate='2020-02-01';data.paymentMeans='10';data.businessProcess='S1';data.legalNotes={recovery:'Indemnité test',penalties:'Pénalités test',discount:'Escompte test'};}const res=await call('/documents','POST',{id:randomUUID(),data});assert.equal(res.status,201,await res.clone().text());return res.json();};
const input=async doc=>({id:randomUUID(),documentId:doc.id,documentVersion:doc.version,seriesId:await automaticNumberSeries(db,doc.data,user)});
try{
 const q1=await create('quote','2020-01-01'),q2=await create('quote','2020-01-01');
 const pair=await Promise.all([q1,q2].map(async d=>reserveIssuance(db,await input(d),user)));assert.deepEqual(pair.map(i=>i.number).sort(),['20200101-001','20200101-002']);
 const q3=await create('quote','2020-01-02');assert.equal((await reserveIssuance(db,await input(q3),user)).number,'20200102-001');
 const f1=await create('invoice','2020-01-01'),request=await input(f1),first=await reserveIssuance(db,request,user);assert.equal(first.number,'F-20200101-001');
 assert.equal(await automaticNumberSeries(db,f1.data,user),request.seriesId);assert.deepEqual(await reserveIssuance(db,request,user),first);
 const f2=await create('invoice','2020-01-02');assert.equal((await reserveIssuance(db,await input(f2),user)).number,'F-20200102-002');
 const late=await create('invoice','2020-01-01');await assert.rejects(async()=>reserveIssuance(db,await input(late),user),e=>e.status===409);
 const docs=await Promise.all(Array.from({length:4},()=>create('invoice','2020-01-02')));const batch=await Promise.all(docs.map(async d=>reserveIssuance(db,await input(d),user)));assert.deepEqual(batch.map(i=>i.number).sort(),[3,4,5,6].map(i=>'F-20200102-'+String(i).padStart(3,'0')));
 const httpQuote=await create('quote','2020-01-03'),attempt={id:randomUUID(),seriesId:'automatic'};
 const issue=()=>call('/documents/'+httpQuote.id+'/issue','POST',attempt,{'If-Match':String(httpQuote.version)});
 preflightFails=true;const before=(await db.prepare('SELECT count(*) AS n FROM billing_number_series').first()).n;assert.equal((await issue()).status,503);assert.equal((await db.prepare('SELECT count(*) AS n FROM billing_number_series').first()).n,before);
 preflightFails=false;const httpResult=await issue();assert.equal(httpResult.status,200,await httpResult.clone().text());assert.equal((await httpResult.json()).issuance.number,'20200103-001');assert.equal((await issue()).status,200);
 // Existing issued quote workflow: refused quotes cannot become invoices; accepted ones keep their reference.
 const q=await quoteFixtureTools(p.ctx,p.sessions[0].token),accepted=await q.create();assert.equal((await q.send(accepted)).status,201);
 const converted=await q.call('/documents/'+accepted.id+'/convert','POST',{id:randomUUID()},{'If-Match':String(accepted.version)});assert.equal(converted.status,201,await converted.clone().text());const invoice=await converted.json();assert.equal(invoice.sourceDocumentId,accepted.id);assert.equal(invoice.data.references.quoteNumber,accepted.issuance.number);
 const refused=await q.create();assert.equal((await q.send(refused,q.input(refused,'refused','Refus client'))).status,201);assert.equal((await q.call('/documents/'+refused.id+'/convert','POST',{id:randomUUID()},{'If-Match':String(refused.version)})).status,409);
 console.log('OK Devis quotidiens, factures continues indépendantes, ordre des dates, concurrence, reprise idempotente et référence du devis accepté conservée.');
}finally{await p.close();}
