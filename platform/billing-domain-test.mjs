import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDraft,newLine,normalizeDraft,calculateBilling,inspectDraft,formatMinor,billingDecimal,validBillingDate} from './billing-domain.ts';

function document(lines){const d=blankDraft('invoice','2026-10-19');d.lines=lines.map(row=>({...newLine(),description:'Prestation de test',unitPrice:'620',...row}));return d;}
test('fractional quantities and tax bases reproduce the reusable CCIC calculation',()=>{
  const d=document([{quantity:'4',unitPrice:'750'},{quantity:'3.875',unitPrice:'620'}]);
  assert.deepEqual(calculateBilling(d),{lines:[{id:d.lines[0].id,netMinor:'300000',discountMinor:'0'},{id:d.lines[1].id,netMinor:'240250',discountMinor:'0'}],taxes:[{category:'S',rate:'20',baseMinor:'540250',taxMinor:'108050'}],netMinor:'540250',taxMinor:'108050',grossMinor:'648300',discountMinor:'0'});
});
test('line amount rounds once and VAT rounds by group rather than by line',()=>{
  const d=document([{quantity:'1',unitPrice:'0.025'},{quantity:'1',unitPrice:'0.025'}]);
  assert.equal(calculateBilling(d).netMinor,'6');assert.equal(calculateBilling(d).taxMinor,'1');
  const discounted=document([{quantity:'1',unitPrice:'0.015',discountPercent:'50'}]);
  assert.equal(calculateBilling(discounted).netMinor,'1');
});
test('six decimal quantities/prices and French decimal commas remain exact',()=>{
  assert.equal(calculateBilling(document([{quantity:'1,833333',unitPrice:'123,456789'}])).netMinor,'22634');
  assert.equal(billingDecimal('0.000001',6,'Test'),1n);
  for(const value of ['', '1e2','-1','Infinity','NaN','1.0000001','1,2.3','  '])assert.throws(()=>billingDecimal(value,6,'Test'));
});
test('distinct VAT categories and canonical rate strings form deterministic groups',()=>{
  const d=document([{unitPrice:'100',vatRate:'5.5'},{unitPrice:'100',vatRate:'5.50'},{unitPrice:'40',vatRate:'0',vatCategory:'Z'}]);
  const t=calculateBilling(d);assert.equal(t.taxes.length,2);assert.equal(t.taxMinor,'1100');assert.equal(t.grossMinor,'25100');
  assert.throws(()=>calculateBilling(document([{vatCategory:'E',vatRate:'20'}])),/taux nul/);
  assert.throws(()=>calculateBilling(document([{vatCategory:'S',vatRate:'0'}])),/taux positif/);
  assert.throws(()=>calculateBilling(document([{vatCategory:'E',vatRate:'0',exemptionReason:'A'},{vatCategory:'E',vatRate:'0',exemptionReason:'B'}])),/même motif/);
});
test('draft storage accepts incomplete content without treating invalid money as zero',()=>{
  const d=blankDraft('quote','2026-10-19');d.lines[0].quantity='1,';
  const normalized=normalizeDraft(d);assert.equal(normalized.lines[0].quantity,'1,');
  assert.throws(()=>calculateBilling(normalized));assert.ok(inspectDraft(normalized).length>0);
  assert.equal(normalized.lines[0].id,d.lines[0].id);assert.notEqual(normalized.lines,d.lines);
});
test('strict storage boundary blocks mass assignment, duplicate IDs and oversized payload fields',()=>{
  const d=document([{}]);assert.throws(()=>normalizeDraft({...d,status:'issued'}),/non reconnu/);
  assert.throws(()=>normalizeDraft({...d,totals:{grossMinor:'0'}}),/non reconnu/);
  assert.throws(()=>normalizeDraft({...d,lines:[d.lines[0],d.lines[0]]}),/double/);
  assert.throws(()=>normalizeDraft({...d,lines:[d.lines[0],{...d.lines[0],id:d.lines[0].id.toUpperCase()}]}),/double/);
  assert.equal(normalizeDraft({...d,lines:[{...d.lines[0],id:d.lines[0].id.toUpperCase()}]}).lines[0].id,d.lines[0].id);
  assert.throws(()=>normalizeDraft({...d,lines:[{...d.lines[0],id:'unsafe'}]}),/Identifiant/);
  assert.throws(()=>normalizeDraft({...d,notes:'x'.repeat(10001)}),/trop long/);
  assert.throws(()=>normalizeDraft({...d,seller:{...d.seller,account:'secret'}}),/non reconnu/);
});
test('invalid dates, zero quantities, missing exemption reason and mixed O category stay visible',()=>{
  assert.equal(validBillingDate('2026-02-29'),false);assert.equal(validBillingDate('2028-02-29'),true);
  const d=document([{quantity:'0',vatRate:'0',vatCategory:'E'}]);d.dueDate='2026-01-01';
  const issues=inspectDraft(d);assert.ok(issues.some(i=>i.path==='dueDate'));assert.ok(issues.some(i=>i.path==='lines.0.quantity'));assert.ok(issues.some(i=>i.path==='lines.0.exemptionReason'));
  d.lines=[{...newLine(),unitPrice:'20',vatRate:'0',vatCategory:'O'},{...newLine(),unitPrice:'20'}];assert.ok(inspectDraft(d).some(i=>i.message.startsWith('Hors champ')));
});
test('calculations are immutable, limits explicit and formatting does not lose precision',()=>{
  const d=document([{unitPrice:'100',discountPercent:'10'}]),before=JSON.stringify(d);
  assert.equal(calculateBilling(d).grossMinor,'10800');assert.equal(JSON.stringify(d),before);
  assert.throws(()=>calculateBilling(document([{unitPrice:'100',discountPercent:'100.01'}])),/entre 0 et 100/);
  assert.throws(()=>calculateBilling(document([{quantity:'9999999999',unitPrice:'9999999999'}])),/trop élevé/);
  assert.match(formatMinor('1234567890123').replace(/[\u00a0\u202f]/g,' '),/^12 345 678 901,23 €/);
});
