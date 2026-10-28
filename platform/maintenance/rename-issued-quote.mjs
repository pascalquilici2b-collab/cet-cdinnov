// Explicit, operator-run correction only. Never exposed as an HTTP route.
// The original PDF, snapshot and manifest are retained in the correction audit.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
export const correctionSchema=`CREATE TABLE IF NOT EXISTS billing_document_number_corrections(document_id TEXT PRIMARY KEY REFERENCES billing_documents(id),old_number TEXT NOT NULL,new_number TEXT NOT NULL UNIQUE,invoice_id TEXT NOT NULL REFERENCES billing_documents(id),before_json TEXT NOT NULL CHECK(json_valid(before_json)),after_json TEXT NOT NULL CHECK(json_valid(after_json)),corrected_at TEXT NOT NULL,corrected_by TEXT NOT NULL)`;
export async function renameIssuedQuote(db,{quoteId,invoiceId,newNumber,manifest},actor){
 assert.match(newNumber,/^DEV-\d{7,9}$/);assert.ok(actor);
 const quote=await db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(quoteId).first();
 const invoice=await db.prepare('SELECT * FROM billing_documents WHERE id=?').bind(invoiceId).first();
 const issuance=await db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(quoteId).first();
 const reservation=await db.prepare('SELECT * FROM billing_draft_numbers WHERE document_id=?').bind(quoteId).first();
 const job=await db.prepare('SELECT * FROM billing_issue_jobs WHERE issuance_id=?').bind(issuance?.id).first();
 assert.equal(quote?.kind,'quote');assert.equal(invoice?.kind,'invoice');assert.equal(job?.state,'ready');
 assert.equal(await db.prepare('SELECT id FROM billing_issuances WHERE document_id=?').bind(invoiceId).first(),null,'The linked invoice must still be a draft');
 assert.ok(await db.prepare(`WITH RECURSIVE chain(id) AS (SELECT id FROM billing_documents WHERE source_document_id=? UNION ALL SELECT r.replacement_id FROM billing_invoice_rectifications r JOIN chain c ON c.id=r.original_id) SELECT id FROM chain WHERE id=?`).bind(quoteId,invoiceId).first(),'Invoice is not linked to this quote');
 const data=JSON.parse(invoice.data_json);assert.equal(data.references.quoteNumber,issuance.number);
 const series=await db.prepare("SELECT s.* FROM billing_default_series p JOIN billing_number_series s ON s.id=p.series_id WHERE p.kind='quote' AND p.issuer_siren=?").bind(issuance.issuer_siren).first();
 assert.equal(series.prefix+String(series.next_value).padStart(series.width,'0'),newNumber,'Requested number is no longer the next available quote number');
 assert.equal(reservation.number,issuance.number);assert.equal(reservation.series_id,issuance.series_id);
 const envelope={schemaVersion:1,id:issuance.id,documentId:quoteId,version:issuance.document_version,issuerSiren:issuance.issuer_siren,number:newNumber,issueDate:issuance.issue_date,snapshotSha256:issuance.snapshot_sha256};
 assert.equal(manifest.envelopeSha256,createHash('sha256').update(canonical(envelope)).digest('hex'));
 assert.equal(manifest.profile,'quote-pdf');assert.equal(manifest.artifacts.length,1);
 const pdf=manifest.artifacts[0];assert.equal(pdf.kind,'pdf');assert.equal(pdf.contentType,'application/pdf');assert.equal(pdf.key,`billing/${issuance.id}/pdf/${pdf.sha256}`);assert.ok(pdf.size>0);
 const names=['billing_draft_number_no_update','billing_issuance_no_update','billing_job_guard'];
 const guards=(await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name IN (?,?,?)").bind(...names).all()).results;
 assert.equal(guards.length,names.length);
 const stamp=new Date().toISOString();data.references.quoteNumber=newNumber;
 const before={quote,invoice,issuance,reservation,job},after={number:newNumber,seriesId:series.id,sequenceValue:series.next_value,manifest,invoiceVersion:invoice.version+1};
 const statements=[db.prepare(correctionSchema),
  db.prepare('CREATE TABLE billing_quote_rename_assertion(ok INTEGER NOT NULL CHECK(ok=1))'),
  db.prepare(`INSERT INTO billing_quote_rename_assertion SELECT CASE WHEN
   EXISTS(SELECT 1 FROM billing_documents WHERE id=? AND version=? AND data_json=?) AND
   EXISTS(SELECT 1 FROM billing_documents WHERE id=? AND version=? AND data_json=?) AND
   NOT EXISTS(SELECT 1 FROM billing_issuances WHERE document_id=?) AND
   EXISTS(SELECT 1 FROM billing_issuances WHERE id=? AND number=? AND snapshot_sha256=?) AND
   EXISTS(SELECT 1 FROM billing_issue_jobs WHERE issuance_id=? AND version=? AND state='ready' AND manifest_json=?) AND
   EXISTS(SELECT 1 FROM billing_number_series WHERE id=? AND next_value=?) THEN 1 ELSE 0 END`)
   .bind(quoteId,quote.version,quote.data_json,invoiceId,invoice.version,invoice.data_json,invoiceId,issuance.id,issuance.number,issuance.snapshot_sha256,issuance.id,job.version,job.manifest_json,series.id,series.next_value),
  db.prepare('INSERT INTO billing_document_number_corrections VALUES(?,?,?,?,?,?,?,?)').bind(quoteId,issuance.number,newNumber,invoiceId,JSON.stringify(before),JSON.stringify(after),stamp,actor),
  ...names.map(name=>db.prepare('DROP TRIGGER '+name)),
  db.prepare('UPDATE billing_draft_numbers SET series_id=?,sequence_value=?,number=? WHERE document_id=?').bind(series.id,series.next_value,newNumber,quoteId),
  db.prepare('UPDATE billing_issuances SET series_id=?,sequence_value=?,number=? WHERE id=?').bind(series.id,series.next_value,newNumber,issuance.id),
  db.prepare('UPDATE billing_number_series SET next_value=next_value+1,version=version+1,last_issue_date=? WHERE id=?').bind(issuance.issue_date,series.id),
  db.prepare('UPDATE billing_issue_jobs SET version=version+1,manifest_json=?,updated_at=?,updated_by=? WHERE issuance_id=?').bind(JSON.stringify(manifest),stamp,actor,issuance.id),
  db.prepare('UPDATE billing_documents SET version=version+1,data_json=?,updated_at=?,updated_by=? WHERE id=?').bind(JSON.stringify(data),stamp,actor,invoiceId),
  ...guards.map(g=>db.prepare(g.sql)),db.prepare('DROP TABLE billing_quote_rename_assertion')];
 await db.batch(statements);
 return {oldNumber:issuance.number,newNumber,quoteId,invoiceId,invoiceVersion:invoice.version+1};
}
