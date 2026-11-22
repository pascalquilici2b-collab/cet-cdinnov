import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixture} from './billing-quote-fixture.mjs';
import {createNumberSeries,billingCanonicalJSON} from './billing-issuance.ts';
import {calculateBilling} from './billing-domain.ts';
const p=await billingPreview({outboundService:async req=>{const {document}=await req.json();return Response.json({valid:true,snapshotSha256:createHash('sha256').update(billingCanonicalJSON({schemaVersion:1,document,totals:calculateBilling(document)})).digest('hex'),checks:{render:true,amounts:true,xsd:true,schematron:true,france:true}});}});
const headers={'X-CDInnov-Request':'1',Origin:'https://app.cdinnov.eu','Content-Type':'application/json',Cookie:p.sessions[0].cookie};
const call=(path,method='GET',body,version)=>p.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing'+path,{method,headers:{...headers,...(version?{'If-Match':String(version)}:{})},...(body?{body:JSON.stringify(body)}:{})});
const create=async kind=>{const data=quoteFixture();data.kind=kind;if(kind==='invoice'){data.validUntil='';data.dueDate='2026-12-31';data.paymentMeans='10';data.businessProcess='S1';data.seller.electronicAddress=data.seller.siren;data.seller.electronicScheme='0225';data.buyer.siren='552100554';data.buyer.electronicAddress='552100554';data.buyer.electronicScheme='0225';data.legalNotes={penalties:'Pénalités test',recovery:'Recouvrement test',discount:'Escompte test'};}const r=await call('/documents','POST',{id:randomUUID(),data});assert.equal(r.status,201);return r.json();};
const number=async d=>{const r=await call('/documents/'+d.id+'/number','POST',{},d.version);assert.equal(r.status,200,await r.clone().text());const draft=await r.json();if(d.data.kind==='quote'||draft.issuance)return draft;const issued=await call('/documents/'+d.id+'/issue','POST',{id:randomUUID(),seriesId:'automatic'},d.version);assert.equal(issued.status,200,await issued.clone().text());return issued.json();};
const assigned=d=>d.issuance?.number||d.reservedNumber?.number;
try{
 const old=await number(await create('invoice'));
 const oldQuote=await number(await create('quote'));
 const oldRows=await p.ctx.db.prepare('SELECT * FROM billing_draft_numbers ORDER BY document_id').all();
 await p.ctx.db.prepare('INSERT INTO billing_retired_series SELECT id,?,? FROM billing_number_series').bind(new Date().toISOString(),'test').run();
 for(const [kind,prefix] of [['invoice','FAC-'],['quote','DEV-']]){
  const series=await createNumberSeries(p.ctx.db,{id:randomUUID(),issuerSiren:old.data.seller.siren,kind,prefix,width:7,firstValue:2610067,startDate:'1970-01-01',endDate:'9999-12-31'},'test');
  await p.ctx.db.prepare('INSERT INTO billing_default_series VALUES(?,?,?)').bind(old.data.seller.siren,kind,series.id).run();
 }
 assert.deepEqual((await p.ctx.db.prepare('SELECT * FROM billing_draft_numbers ORDER BY document_id').all()).results,oldRows.results);
 const invoice=await number(await create('invoice')),quote=await number(await create('quote'));
 assert.equal(assigned(invoice),'FAC-2610067');assert.equal(quote.reservedNumber.number,'DEV-2610067');
 const docs=await Promise.all(Array.from({length:3},()=>create('invoice').then(number)));
 assert.deepEqual(docs.map(assigned).sort(),['FAC-2610068','FAC-2610069','FAC-2610070']);
 assert.equal(assigned(await number(invoice)),'FAC-2610067');
 for(const d of [old,oldQuote,invoice,quote]){
  const r=await call('/documents/'+d.id+'/issue','POST',{id:d.issuance?.id||randomUUID(),seriesId:'automatic'},d.version);
  assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).issuance.number,assigned(d));
 }
 const fresh=await create('invoice');
 const historicalSeries=await p.ctx.db.prepare('SELECT series_id FROM billing_issuances WHERE document_id=?').bind(old.id).first();
 await assert.rejects(()=>p.ctx.db.prepare("INSERT INTO billing_draft_numbers SELECT ?,s.id,s.issuer_siren,s.next_value,s.prefix||replace(?,'-','')||'-'||printf('%0*d',s.width,s.next_value),?,?,? FROM billing_number_series s WHERE s.id=?").bind(fresh.id,old.data.issueDate,old.data.issueDate,new Date().toISOString(),'test',historicalSeries.series_id).run(),/CONFLICT/);
 await assert.rejects(()=>p.ctx.db.prepare('UPDATE billing_draft_numbers SET number=? WHERE document_id=?').bind('CHANGED',quote.id).run(),/IMMUTABLE/);
 console.log('OK FAC/DEV independent continuous sequences, concurrent allocation, historical reservations preserved and retired allocations blocked.');
}finally{await p.close();}
