import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixture} from './billing-quote-fixture.mjs';
import {billingCanonicalJSON} from './billing-issuance.ts';
import {calculateBilling} from './billing-domain.ts';
const p=await billingPreview({outboundService:async req=>{const {document}=await req.json();return Response.json({valid:true,snapshotSha256:createHash('sha256').update(billingCanonicalJSON({schemaVersion:1,document,totals:calculateBilling(document)})).digest('hex'),checks:{render:true,amounts:true,xsd:true,schematron:true,france:true}});}});
const headers={Origin:'https://app.cdinnov.eu','Content-Type':'application/json',Authorization:'Bearer '+p.sessions[0].token};
const call=(path,method='GET',body,version)=>p.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing'+path,{method,headers:{...headers,...(version?{'If-Match':String(version)}:{})},...(body?{body:JSON.stringify(body)}:{})});
const create=async kind=>{const data=quoteFixture();data.kind=kind;if(kind==='invoice'){data.validUntil='';data.dueDate='2026-12-31';data.paymentMeans='10';data.businessProcess='S1';data.seller.electronicAddress=data.seller.siren;data.seller.electronicScheme='0225';data.buyer.siren='552100554';data.buyer.electronicAddress='552100554';data.buyer.electronicScheme='0225';data.legalNotes={penalties:'Pénalités test',recovery:'Recouvrement test',discount:'Escompte test'};}const r=await call('/documents','POST',{id:randomUUID(),data});assert.equal(r.status,201);return r.json();};
const number=async d=>{const r=await call('/documents/'+d.id+'/number','POST',{},d.version);assert.equal(r.status,200,await r.clone().text());return r.json();};
try{
 const d=await create('quote'),batch=await Promise.all(Array.from({length:6},()=>number(d)));assert.equal(new Set(batch.map(x=>x.reservedNumber.number)).size,1);
 const first=batch[0];assert.match(first.reservedNumber.number,/^\d{8}-001$/);assert.equal(first.issuance,null);assert.equal(first.status,'draft');
 const incomplete={...first.data,title:'',buyer:{...first.data.buyer,name:''},lines:[]};const update=await call('/documents/'+first.id,'PUT',{data:incomplete},first.version);assert.equal(update.status,200);assert.equal((await update.json()).reservedNumber.number,first.reservedNumber.number);
 const quotes=await Promise.all(Array.from({length:3},()=>create('quote').then(number)));assert.equal(new Set(quotes.map(x=>x.reservedNumber.number)).size,3);
 // Quotes retain their reserved number when their editable document date differs
 // from the reservation day, including an older quote finalized after a newer one.
 const q1=quotes[0],q2=quotes[1];
 for(const [q,date] of [[q2,'2020-02-02'],[q1,'2020-01-01']]){
  const edited=await call('/documents/'+q.id,'PUT',{data:{...q.data,issueDate:date}},q.version);assert.equal(edited.status,200);const savedQuote=await edited.json();
  const issue=await call('/documents/'+q.id+'/issue','POST',{id:randomUUID(),seriesId:'automatic'},savedQuote.version);assert.equal(issue.status,200,await issue.clone().text());assert.equal((await issue.json()).issuance.number,q.reservedNumber.number);
 }
 const invoice=await number(await create('invoice')),same=await number(invoice);assert.equal(same.reservedNumber.number,invoice.reservedNumber.number);assert.match(invoice.reservedNumber.number,/^F-\d{8}-001$/);
 const changed={...invoice.data,title:'Facture modifiable avant émission',lines:invoice.data.lines.map(l=>({...l,quantity:'1'}))};const put=await call('/documents/'+invoice.id,'PUT',{data:changed},invoice.version);assert.equal(put.status,200);const saved=await put.json();assert.equal(saved.reservedNumber.number,invoice.reservedNumber.number);
 const issued=await call('/documents/'+invoice.id+'/issue','POST',{id:randomUUID(),seriesId:'automatic'},saved.version);assert.equal(issued.status,200,await issued.clone().text());assert.equal((await issued.json()).issuance.number,invoice.reservedNumber.number);
 const next=await number(await create('invoice'));assert.match(next.reservedNumber.number,/-002$/);
 const listing=await (await call('/documents?kind=invoice&q='+encodeURIComponent(next.reservedNumber.number))).json();assert.equal(listing.documents.length,1);assert.equal(listing.documents[0].id,next.id);
 await assert.rejects(()=>p.ctx.db.prepare('DELETE FROM billing_draft_numbers WHERE document_id=?').bind(next.id).run(),/IMMUTABLE/);
 await assert.rejects(()=>p.ctx.db.prepare('UPDATE billing_draft_numbers SET number=? WHERE document_id=?').bind('CHANGED',next.id).run(),/IMMUTABLE/);
 console.log('OK Réservation immédiate, brouillon éditable, concurrence sans doublon, recherche et même numéro à l’émission sans double consommation.');
}finally{await p.close();}
