import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {billingPreview} from './billing-preview.mjs';
import {quoteFixtureTools,samplePDF} from './billing-quote-fixture.mjs';
import {invoiceFixture} from './billing-payments-fixture.mjs';
import {createNumberSeries,billingCanonicalJSON} from './billing-issuance.ts';
import {renameIssuedQuote} from './maintenance/rename-issued-quote.mjs';
const p=await billingPreview(),db=p.ctx.db,actor='direction@example.test';
try{
 const q=await quoteFixtureTools(p.ctx,p.sessions[0].token),f=await quoteFixtureTools(p.ctx,p.sessions[0].token,{kind:'invoice',prefix:'TEST-FAC-'}),call=q.call;
 const ok=async r=>{assert.ok(r.ok,await r.clone().text());return r.json();};
 const data={...invoiceFixture(),kind:'quote',validUntil:'2099-12-31',dueDate:''};let quote=await q.create(data,false);
 await db.prepare('INSERT INTO billing_draft_numbers VALUES(?,?,?,?,?,?,?,?)').bind(quote.id,q.series.id,q.series.issuerSiren,1,'TEST-DEVIS-0001','2020-01-01',new Date().toISOString(),actor).run();
 quote=await q.finalize(quote);quote=await ok(await q.send(quote,q.input(quote)));
 const pdf=samplePDF();await ok(await p.ctx.worker.dispatchFetch('https://local/api/v1/billing/documents/'+quote.id+'/engagement?kind=signed_quote',{method:'PUT',headers:{Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+p.sessions[0].token,'If-Match':String(quote.version),'X-Filename':'accord.pdf','Content-Type':'application/pdf'},body:pdf}));
 let invoice=await ok(await call('/documents/'+quote.id+'/convert','POST',{id:randomUUID()},{'If-Match':String(quote.version)}));
 invoice=await ok(await call('/documents/'+invoice.id,'PUT',{data:{...invoice.data,paymentMeans:'10',legalNotes:data.legalNotes}},{'If-Match':String(invoice.version)}));
 invoice=await f.finalize(invoice);
 const replacement=await ok(await call('/documents/'+invoice.id+'/rectify','POST',{id:randomUUID(),notTransmitted:true},{'If-Match':String(invoice.version)}));
 await db.prepare('INSERT INTO billing_retired_series SELECT id,?,? FROM billing_number_series').bind(new Date().toISOString(),actor).run();
 for(const kind of ['invoice','quote']){const s=await createNumberSeries(db,{id:randomUUID(),issuerSiren:q.series.issuerSiren,kind,prefix:kind==='quote'?'DEV-':'FAC-',width:7,firstValue:2610067,startDate:'1970-01-01',endDate:'9999-12-31'},actor);await db.prepare('INSERT INTO billing_default_series VALUES(?,?,?)').bind(s.issuer_siren,kind,s.id).run();}
 await ok(await call('/documents/'+replacement.id+'/number','POST',{}, {'If-Match':String(replacement.version)}));
 quote=await ok(await call('/documents/'+quote.id));assert.equal(quote.quote.invoice.id,replacement.id);assert.equal(quote.quote.invoice.number,'FAC-2610067');
 const issuance=await db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(quote.id).first(),job=await db.prepare('SELECT * FROM billing_issue_jobs WHERE issuance_id=?').bind(issuance.id).first();
 const snapshot=issuance.snapshot_json,oldManifest=JSON.parse(job.manifest_json),bucket=await p.ctx.worker.getR2Bucket('CET_FILES');
 const bytes=Buffer.concat([pdf,Buffer.from('\n% renamed synthetic quote')]),hash=createHash('sha256').update(bytes).digest('hex');
 const envelope={schemaVersion:1,id:issuance.id,documentId:quote.id,version:issuance.document_version,issuerSiren:issuance.issuer_siren,number:'DEV-2610067',issueDate:issuance.issue_date,snapshotSha256:issuance.snapshot_sha256};
 const manifest={schemaVersion:1,envelopeSha256:createHash('sha256').update(billingCanonicalJSON(envelope)).digest('hex'),generatorVersion:'synthetic-renumber-test',profile:'quote-pdf',artifacts:[{kind:'pdf',key:`billing/${issuance.id}/pdf/${hash}`,sha256:hash,size:bytes.length,contentType:'application/pdf'}]};
 await bucket.put(manifest.artifacts[0].key,bytes,{httpMetadata:{contentType:'application/pdf'}});
 await renameIssuedQuote(db,{quoteId:quote.id,invoiceId:replacement.id,newNumber:'DEV-2610067',manifest},actor);
 const updated=await ok(await call('/documents/'+quote.id)),updatedInvoice=await ok(await call('/documents/'+replacement.id));
 assert.equal(updated.issuance.number,'DEV-2610067');assert.equal(updated.reservedNumber.number,'DEV-2610067');assert.equal(updated.quote.state,'accepted');assert.equal(updated.quote.invoice.id,replacement.id);assert.equal(updated.quote.invoice.number,'FAC-2610067');assert.equal(updated.quote.engagement.filename,'accord.pdf');
 assert.equal(updatedInvoice.data.references.quoteNumber,'DEV-2610067');assert.equal(updatedInvoice.version,replacement.version+1);
 assert.deepEqual(Buffer.from(await(await call('/documents/'+quote.id+'/files/pdf')).arrayBuffer()),bytes);
 assert.deepEqual(Buffer.from(await(await bucket.get(oldManifest.artifacts[0].key)).arrayBuffer()),pdf);
 assert.equal((await db.prepare('SELECT snapshot_json FROM billing_issuances WHERE id=?').bind(issuance.id).first()).snapshot_json,snapshot);
 const audit=await db.prepare('SELECT * FROM billing_document_number_corrections WHERE document_id=?').bind(quote.id).first();assert.equal(JSON.parse(audit.before_json).issuance.number,'TEST-DEVIS-0001');
 const series=await db.prepare("SELECT s.next_value FROM billing_number_series s JOIN billing_default_series p ON p.series_id=s.id WHERE p.kind='quote'").first();assert.equal(series.next_value,2610068);
 await assert.rejects(()=>db.prepare("UPDATE billing_issuances SET number='BAD' WHERE id=?").bind(issuance.id).run(),/IMMUTABLE/);
 await assert.rejects(()=>db.prepare("UPDATE billing_draft_numbers SET number='BAD' WHERE document_id=?").bind(quote.id).run(),/IMMUTABLE/);
 await assert.rejects(()=>db.prepare("UPDATE billing_issue_jobs SET version=version+1 WHERE issuance_id=?").bind(issuance.id).run(),/TRANSITION/);
 // The transaction assertion table never remains in the application schema.
 assert.equal((await db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='billing_quote_rename_assertion'").first()).n,0);
 console.log('OK corrected quote PDF, accepted status and commitment preserved, link to rectified invoice, draft reference updated, next DEV number and immutable guards restored.');
}finally{await p.close();}
