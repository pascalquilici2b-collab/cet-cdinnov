import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixture} from './billing-quote-fixture.mjs';
import {billingCanonicalJSON} from './billing-issuance.ts';
import {calculateBilling} from './billing-domain.ts';
const p=await billingPreview({outboundService:async req=>{const {document}=await req.json();return Response.json({valid:true,snapshotSha256:createHash('sha256').update(billingCanonicalJSON({schemaVersion:1,document,totals:calculateBilling(document)})).digest('hex'),checks:{render:true,amounts:true,xsd:true,schematron:true,france:true}});}});
const headers={Origin:'https://app.cdinnov.eu','Content-Type':'application/json',Authorization:'Bearer '+p.sessions[0].token};
const call=(path,method='GET',body,version,auth=headers)=>p.ctx.worker.dispatchFetch('https://preview.test/api/v1/billing'+path,{method,headers:{...auth,...(version?{'If-Match':String(version)}:{})},...(body?{body:JSON.stringify(body)}:{})});
const ok=async(r,status=200)=>{assert.equal(r.status,status,await r.clone().text());return r.json();};
try{
 for(const kind of ['quote','invoice']){
  const data={...quoteFixture('Brouillon restaurable '+kind),kind},created=await ok(await call('/documents','POST',{id:randomUUID(),data}),201),doc=await ok(await call('/documents/'+created.id+'/number','POST',{},created.version));
  const path='/documents/'+doc.id;
  await ok(await call(path,'DELETE',undefined,doc.version+1),409);
  await ok(await call(path,'DELETE',undefined,doc.version,{...headers,Authorization:'Bearer '+p.sessions[1].token}),403);
  await ok(await call(path,'DELETE'),428);
  await ok(await call(path,'DELETE',undefined,doc.version));await ok(await call(path,'DELETE',undefined,doc.version));
  assert.equal((await ok(await call('/documents?kind='+kind))).total,0);
  let listing=await ok(await call('/documents?kind='+kind+'&state=trash&q='+encodeURIComponent(doc.reservedNumber.number)));assert.equal(listing.total,1);assert.equal(listing.documents[0].id,doc.id);
  for(const [suffix,method,body] of [['','GET'],['','PUT',{data}],['/issue','POST',{id:randomUUID(),seriesId:'automatic'}],['/number','POST',{}],['/convert','POST',{id:randomUUID()}]])await ok(await call(path+suffix,method,body,doc.version),410);
  await ok(await call('/documents','POST',{id:doc.id,data}),410);
  await assert.rejects(()=>p.ctx.db.prepare('UPDATE billing_documents SET version=version+1 WHERE id=?').bind(doc.id).run(),/BILLING_TRASH_CONFLICT/);
  await ok(await call(path+'/restore','POST',{},doc.version+1),409);
  const restored=await ok(await call(path+'/restore','POST',{},doc.version));assert.equal(restored.id,doc.id);assert.equal(restored.reservedNumber.number,doc.reservedNumber.number);assert.deepEqual(restored.data,doc.data);
  assert.equal((await ok(await call('/documents?kind='+kind+'&state=trash'))).total,0);assert.equal((await ok(await call('/documents?kind='+kind))).total,1);
  const edited=await ok(await call(path,'PUT',{data:{...doc.data,title:'Modifié après restauration'}},doc.version));assert.equal(edited.version,doc.version+1);await ok(await call(path,'DELETE',undefined,doc.version),409);
  if(kind==='quote'){
   await ok(await call(path+'/issue','POST',{id:randomUUID(),seriesId:'automatic'},edited.version));await ok(await call(path,'DELETE',undefined,edited.version),409);
  }else{
   // A stale deletion cannot win after a concurrent edit.
   await assert.rejects(()=>p.ctx.db.prepare('INSERT INTO billing_document_trash VALUES(?,?,?,?)').bind(doc.id,doc.version,new Date().toISOString(),'test').run(),/BILLING_TRASH_CONFLICT/);
   await ok(await call(path,'DELETE',undefined,edited.version));
   const next=await ok(await call('/documents','POST',{id:randomUUID(),data}),201);const numbered=await ok(await call('/documents/'+next.id+'/number','POST',{},next.version));assert.match(numbered.reservedNumber.number,/-002$/);
  }
 }
 console.log('OK Corbeille : droits, conflits de version, recherche, masquage, protection contre modification/émission, restauration, aucun numéro recyclé.');
}finally{await p.close();}
