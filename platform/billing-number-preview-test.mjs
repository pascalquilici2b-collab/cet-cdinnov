import assert from 'node:assert/strict';
import {test} from 'node:test';
import {billingNumberPreview} from './client/billing-number-preview.ts';

test('monthly quote preview follows the Paris calendar across a month boundary',()=>{
 const series={kind:'quote',prefix:'DEV-AAAAMM',width:3,nextValue:68,format:'monthly'};
 assert.equal(billingNumberPreview(series,new Date('2026-11-30T22:30:00Z')),'DEV-202611068');
 assert.equal(billingNumberPreview(series,new Date('2026-11-30T23:30:00Z')),'DEV-202612068');
 assert.equal(billingNumberPreview(series,new Date('2026-06-30T22:30:00Z')),'DEV-202607068');
});
test('dated, daily literal and ordinary literal series retain their actual rules',()=>{
 const now=new Date('2026-11-30T23:30:00Z');
 assert.equal(billingNumberPreview({kind:'invoice',prefix:'F-',width:3,nextValue:7,format:'dated'},now),'F-20261201-007');
 assert.equal(billingNumberPreview({kind:'quote',prefix:'20261127-',width:3,nextValue:2,format:'literal'},now),'20261127-002');
 assert.equal(billingNumberPreview({kind:'quote',prefix:'DEV-',width:7,nextValue:2610067,format:'literal'},now),'DEV-2610067');
 // The marker is authoritative; a literal containing template-like text stays literal.
 assert.equal(billingNumberPreview({kind:'quote',prefix:'DEV-AAAAMM',width:3,nextValue:2,format:'literal'},now),'DEV-AAAAMM002');
 assert.equal(billingNumberPreview({kind:'quote',prefix:'DEV-AAAAMM',width:3,nextValue:2},now),'DEV-AAAAMM002');
});
