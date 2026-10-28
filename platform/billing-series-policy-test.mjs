import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixture} from './billing-quote-fixture.mjs';
import {createNumberSeries,billingCanonicalJSON} from './billing-issuance.ts';
import {calculateBilling} from './billing-domain.ts';
const p=await billingPreview({outboundService:async req=>{const {document}=await req.json();return Response.json({valid:true,snapshotSha256:createHash('sha256').update(billingCanonicalJSON({schemaVersion:1,document,totals:calculateBilling(document)})).digest('hex'),checks:{render:true,amounts:true,xsd:true,schematron:true,france:true}});}});
const headers={Origin:'https://app.cdinnov.eu','Content-Type':'application/json',Authorization:'Bearer '+p.sessions[0].token};
const call=(path,method='GET',body,version)=>p.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing'+path,{method,headers:{...headers,...(version?{'If-Match':String(version)}:{})},...(body?{body:JSON.stringify(body)}:{})});
const create=async kind=>{const data=quoteFixture();data.kind=kind;if(kind==='invoice'){data.validUntil='';data.dueDate='2026-12-31';data.paymentMeans='10';data.businessProcess='S1';data.seller.electronicAddress=data.seller.siren;data.seller.electronicScheme='0225';data.buyer.siren='552100554';data.buyer.electronicAddress='552100554';data.buyer.electronicScheme='0225';data.legalNotes={penalties:'Pénalités test',recovery:'Recouvrement test',discount:'Escompte test'};}const r=await call('/documents','POST',{id:randomUUID(),data});assert.equal(r.status,201);return r.json();};
const number=async d=>{const r=await call('/documents/'+d.id+'/number','POST',{},d.version);assert.equal(r.status,200,await r.clone().text());return r.json();};
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
 assert.equal(invoice.reservedNumber.number,'FAC-2610067');assert.equal(quote.reservedNumber.number,'DEV-2610067');
 const docs=await Promise.all(Array.from({length:3},()=>create('invoice').then(number)));
 assert.deepEqual(docs.map(d=>d.reservedNumber.number).sort(),['FAC-2610068','FAC-2610069','FAC-2610070']);
 assert.equal((await number(invoice)).reservedNumber.number,'FAC-2610067');
 for(const d of [old,oldQuote,invoice,quote]){
  const r=await call('/documents/'+d.id+'/issue','POST',{id:randomUUID(),seriesId:'automatic'},d.version);
  assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).issuance.number,d.reservedNumber.number);
 }
 const fresh=await create('invoice');
 await assert.rejects(()=>p.ctx.db.prepare("INSERT INTO billing_draft_numbers SELECT ?,s.id,s.issuer_siren,s.next_value,s.prefix||replace(?,'-','')||'-'||printf('%0*d',s.width,s.next_value),?,?,? FROM billing_number_series s WHERE s.id=?").bind(fresh.id,old.reservedNumber.date,old.reservedNumber.date,new Date().toISOString(),'test',old.reservedNumber.seriesId).run(),/CONFLICT/);
 await assert.rejects(()=>p.ctx.db.prepare('UPDATE billing_draft_numbers SET number=? WHERE document_id=?').bind('CHANGED',invoice.id).run(),/IMMUTABLE/);
 console.log('OK FAC/DEV independent continuous sequences, concurrent allocation, historical reservations preserved and retired allocations blocked.');
}finally{await p.close();}
