import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {facturXSeed} from './billing-facturx.ts';
import {quoteFixture} from './billing-quote-fixture.mjs';
const d={...quoteFixture(),kind:'invoice'},seed=facturXSeed(d,'F-20261023-001');
const sandbox={state:{factures:[{id:'legacy'}]},factures:()=>sandbox.state.factures,facturxMatchesRecord:(inv,f)=>inv.number===f.number&&inv.issue_date===f.dateFacture&&Number(inv.totals.net)===Number(f.ht)&&Number(inv.totals.gross)===Number(f.ttc)};
vm.createContext(sandbox);vm.runInContext(await readFile(new URL('./client/billing-facturx-bridge.js',import.meta.url),'utf8'),sandbox);
const f={nativeSeed:seed,number:seed.number,dateFacture:seed.issue_date,ht:seed.totals.net,ttc:seed.totals.gross};
assert.equal(sandbox.billingFacturxMatchesSnapshot(seed,f),true);
const completed=structuredClone(seed);completed.buyer.electronic_address='552100554';completed.buyer.electronic_scheme='0225';assert.equal(sandbox.billingFacturxMatchesSnapshot(completed,f),true);
for(const mutate of [i=>i.number='X',i=>i.issue_date='2026-01-01',i=>i.lines[0].quantity='999',i=>i.lines[0].unit_price='0',i=>i.lines[0].description='Different',i=>i.totals.vat='0',i=>i.currency='USD',i=>i.payment.prepaid='10']){const i=structuredClone(seed);mutate(i);assert.equal(sandbox.billingFacturxMatchesSnapshot(i,f),false);}
sandbox.state.billingFacturx={native:f};assert.equal(sandbox.facturxRecord('billing:native'),f);assert.equal(sandbox.facturxRecord('legacy').id,'legacy');assert.equal(sandbox.state.factures.length,1);
console.log('OK native Factur-X sidecar: original numbering, lines, dates, currency and amounts stay bound to the issued PDF; electronic metadata may be completed.');
