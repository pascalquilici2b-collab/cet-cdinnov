import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const api=runInNewContext((await readFile(new URL('./client/facturx-integrity.js',import.meta.url),'utf8'))+'\n({facturxSignature,facturxSnapshotMatches})');
const fixture=()=>({id:'invoice-1',number:'F-2026-001',dateFacture:'2026-10-19',client:'Client fictif',code:'2610',ht:100,ttc:120,pdfSource:{sha256:'original'},datePaiement:null});
test('current exports survive payment tracking but not invoice content changes',()=>{
 const f=fixture();f.facturx={snapshot:api.facturxSignature(f)};
 f.datePaiement='2026-10-20';assert.equal(api.facturxSnapshotMatches(f),true);
 for(const patch of [{number:'different'},{dateFacture:'2026-10-21'},{client:'different'},{code:'other'},{ht:101},{ttc:121},{pdfSource:{sha256:'replacement'}},{id:'other'}])assert.equal(api.facturxSnapshotMatches({...f,...patch}),false);
});
test('historical version-one snapshots remain readable without rewriting saved evidence',()=>{
 const f=fixture(),snapshot='["invoice-1","F-2026-001","2026-10-19","Client fictif","2610","100","120",null,"original"]';
 f.facturx={snapshot};f.datePaiement='2026-10-20';assert.equal(api.facturxSnapshotMatches(f),true);assert.equal(f.facturx.snapshot,snapshot);
 f.ttc=121;assert.equal(api.facturxSnapshotMatches(f),false);
});
test('saving an absent optional reference as an empty field does not alter the document',()=>{
 const f=fixture();delete f.code;f.facturx={snapshot:api.facturxSignature(f)};
 f.code='';f.datePaiement='2026-10-20';assert.equal(api.facturxSnapshotMatches(f),true);
 f.facturx.snapshot='["invoice-1","F-2026-001","2026-10-19","Client fictif",null,"100","120",null,"original"]';
 assert.equal(api.facturxSnapshotMatches(f),true);
});
test('absent, truncated, malformed and unknown snapshots cannot validate an export',()=>{
 assert.equal(api.facturxSnapshotMatches(null),false);assert.equal(api.facturxSnapshotMatches(fixture()),false);
 for(const snapshot of ['invalid','[]','null','{"version":3,"document":[]}','["invoice-1"]'])assert.equal(api.facturxSnapshotMatches({...fixture(),facturx:{snapshot}}),false);
});
