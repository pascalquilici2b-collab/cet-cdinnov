import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {quoteFixture,quoteFixtureTools,samplePDF} from './billing-quote-fixture.mjs';
import {createNumberSeries,reserveIssuance,claimIssuanceJob,completeIssuanceJob} from './billing-issuance.ts';
export function invoiceFixture(title='Mission d’accompagnement'){
 const d=quoteFixture(title);d.kind='invoice';d.validUntil='';d.dueDate='2020-02-01';
 d.seller.electronicAddress=d.seller.siren;d.seller.electronicScheme='0225';
 d.buyer.siren='552100554';d.buyer.electronicAddress=d.buyer.siren;d.buyer.electronicScheme='0225';
 d.paymentMeans='10';d.businessProcess='S1';d.legalNotes={recovery:'Test indemnité',penalties:'Test pénalités',discount:'Test escompte'};return d;
}
export async function paymentFixtureTools(ctx,token){
 const q=await quoteFixtureTools(ctx,token),email='direction@example.test',series={...q.series,id:randomUUID(),kind:'invoice',prefix:'TEST-FACT-'};await createNumberSeries(ctx.db,series,email);
 const create=async(data=invoiceFixture(),ready=true)=>{
  let doc=await q.create(data,false);if(!ready)return doc;
  const issue=await reserveIssuance(ctx.db,{id:randomUUID(),documentId:doc.id,documentVersion:doc.version,seriesId:series.id},email),lease=randomUUID();assert.ok(await claimIssuanceJob(ctx.db,issue.id,lease,email));
  const bucket=await ctx.worker.getR2Bucket('CET_FILES'),artifacts=[];
  for(const kind of ['pdf','xml','validation','verapdf']){
   const bytes=kind==='pdf'?samplePDF():Buffer.from('synthetic payment test '+kind),sha256=createHash('sha256').update(bytes).digest('hex'),contentType={pdf:'application/pdf',xml:'application/xml',validation:'application/json',verapdf:'application/xml'}[kind],key=`billing/${issue.id}/${kind}/${sha256}`;
   await bucket.put(key,bytes,{httpMetadata:{contentType}});artifacts.push({kind,key,sha256,size:bytes.length,contentType});
  }
  assert.ok(await completeIssuanceJob(ctx.db,issue.id,lease,{schemaVersion:1,envelopeSha256:issue.envelopeSha256,generatorVersion:'synthetic-payment-test',profile:'en16931',artifacts},email));return (await q.call('/documents/'+doc.id)).json();
 };
 const input=(doc,kind='receipt',amount='1000')=>({id:randomUUID(),documentVersion:doc.version,kind,amount,occurredOn:'2020-01-02',method:'transfer',reference:'Virement de test',note:''});
 const send=(doc,data=input(doc),version=doc.settlement?.version||0)=>q.call('/documents/'+doc.id+'/payments','POST',data,{'If-Match':String(version)});
 return {...q,quoteCreate:q.create,create,input,send};
}
