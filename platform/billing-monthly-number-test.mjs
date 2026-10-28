import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {billingPreview} from './billing-preview.mjs';
import {invoiceFixture} from './billing-payments-fixture.mjs';
import {quoteFixture} from './billing-quote-fixture.mjs';
import {createNumberSeries,reserveIssuance} from './billing-issuance.ts';
import {reserveDraftNumber} from './billing-draft-number.ts';
import {migrateBilling} from './billing-schema.mjs';
const p=await billingPreview(),db=p.ctx.db,user='test';
const headers={Origin:'https://app.cdinnov.eu','Content-Type':'application/json',Authorization:'Bearer '+p.sessions[0].token};
const call=(path,method='GET',body)=>p.ctx.worker.dispatchFetch('https://preview/api/v1/billing'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
const create=async(kind,date='2026-10-28')=>{const data=kind==='invoice'?invoiceFixture():quoteFixture();data.kind=kind;data.issueDate=date;if(kind==='invoice'){data.validUntil='';data.dueDate='2027-02-01';data.paymentMeans='10';}const r=await call('/documents','POST',{id:randomUUID(),data});assert.equal(r.status,201,await r.clone().text());return r.json();};
const read=async d=>(await call('/documents/'+d.id)).json();
const number=async(d,date)=>{await reserveDraftNumber(db,d,user,new Date(date+'T12:00:00Z'));return read(d);};
try{
 const historical=[];
 for(const kind of ['invoice','quote']){
  const s=await createNumberSeries(db,{id:randomUUID(),issuerSiren:'732829320',kind,prefix:kind==='invoice'?'FAC-':'DEV-',width:7,firstValue:2610067,startDate:'1970-01-01',endDate:'9999-12-31'},user);
  await db.prepare('INSERT INTO billing_default_series VALUES(?,?,?)').bind(s.issuer_siren,kind,s.id).run();
  historical.push(await number(await create(kind),'2026-10-28'));
  await db.prepare('INSERT INTO billing_retired_series VALUES(?,?,?)').bind(s.id,new Date().toISOString(),user).run();
  await db.prepare('DELETE FROM billing_default_series WHERE series_id=?').bind(s.id).run();
  const next=await createNumberSeries(db,{id:randomUUID(),issuerSiren:s.issuer_siren,kind,prefix:s.prefix+'AAAAMM',width:3,firstValue:68,startDate:'1970-01-01',endDate:'9999-12-31'},user);
  await db.prepare('INSERT INTO billing_monthly_series VALUES(?)').bind(next.id).run();await db.prepare('INSERT INTO billing_default_series VALUES(?,?,?)').bind(next.issuer_siren,kind,next.id).run();
 }
 const invoice=await number(await create('invoice'),'2026-10-28');assert.equal(invoice.reservedNumber.number,'FAC-202610068');
 const quote=await number(await create('quote'),'2026-10-28');assert.equal(quote.reservedNumber.number,'DEV-202610068');
 assert.equal((await number(await create('invoice','2026-11-01'),'2026-11-01')).reservedNumber.number,'FAC-202611069');
 assert.equal((await number(await create('quote','2026-11-01'),'2026-11-01')).reservedNumber.number,'DEV-202611069');
 assert.equal((await number(await create('invoice','2027-01-01'),'2027-01-01')).reservedNumber.number,'FAC-202701070');
 assert.equal((await number(await create('quote','2027-01-01'),'2027-01-01')).reservedNumber.number,'DEV-202701070');
 const docs=await Promise.all(Array.from({length:3},()=>create('invoice','2027-01-01'))),allocated=await Promise.all(docs.map(d=>number(d,'2027-01-01')));
 assert.deepEqual(allocated.map(d=>d.reservedNumber.number).sort(),['FAC-202701071','FAC-202701072','FAC-202701073']);
 assert.equal((await number(await read(invoice),'2027-01-01')).reservedNumber.number,'FAC-202610068');
 for(const doc of historical){assert.equal((await read(doc)).reservedNumber.number,(doc.data.kind==='invoice'?'FAC-':'DEV-')+'2610067');const issued=await reserveIssuance(db,{id:randomUUID(),documentId:doc.id,documentVersion:doc.version,seriesId:doc.reservedNumber.seriesId},user);assert.equal(issued.number,doc.reservedNumber.number);}
 const issued=await reserveIssuance(db,{id:randomUUID(),documentId:invoice.id,documentVersion:invoice.version,seriesId:invoice.reservedNumber.seriesId},user);assert.equal(issued.number,'FAC-202610068');
 await migrateBilling(db);assert.equal((await read(invoice)).issuance.number,'FAC-202610068');
 await assert.rejects(()=>db.prepare('UPDATE billing_monthly_series SET series_id=series_id').run(),/IMMUTABLE/);
 console.log('OK FAC/DEV YYYYMM + 3 digits, independent continuous counters across months and years, concurrency, idempotency, historical reservations and issuance preserved.');
}finally{await p.close();}
