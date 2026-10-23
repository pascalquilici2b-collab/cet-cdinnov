import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {paymentFixtureTools,invoiceFixture} from './billing-payments-fixture.mjs';
import {addBillingDays,blankDraft} from './billing-domain.ts';
import {billingDisplayState,billingDisplayLabels} from './billing-display-state.ts';
import {defaultBillingEmail} from './billing-email-default.ts';
import {billingToday} from './billing-quote-domain.ts';

test('échéance calendaire J+30 et états avant/après échéance, sans écriture',()=>{
 assert.equal(addBillingDays('2026-10-23',30),'2026-11-22');assert.equal(addBillingDays('2028-02-01',30),'2028-03-02');assert.equal(addBillingDays('2026-12-20',30),'2027-01-19');assert.equal(addBillingDays('bad',30),'');assert.equal(blankDraft('invoice','2026-10-23').dueDate,'2026-11-22');
 const doc={data:{...invoiceFixture(),issueDate:'2026-10-23',dueDate:'2026-11-22'},issuance:{state:'ready',number:'F-20261023-001'},settlement:{state:'unpaid',dueMinor:'100',overdue:false}};
 assert.equal(billingDisplayState(doc,'2026-11-21'),'finalized');assert.equal(billingDisplayState(doc,'2026-11-22'),'finalized');assert.equal(billingDisplayState(doc,'2026-11-23'),'overdue');
 assert.equal(billingDisplayLabels.overdue,'En retard d’encaissement');assert.equal(billingDisplayState({...doc,settlement:{state:'paid',dueMinor:'0'}},'2026-11-24'),'paid');assert.equal(billingDisplayState({...doc,settlement:{state:'partial',dueMinor:'50'}},'2026-11-23'),'overdue');
 doc.data.references.project='PROTERINA';doc.data.details={period:'S8'};assert.equal(defaultBillingEmail(doc),'Bonjour,\n\nJe vous prie de bien vouloir trouver ci-joint la facture F-20261023-001 relative au projet PROTERINA pour la période Semestre 8.\n\nVous en souhaitant bonne réception,\nConseil Développement Innovation');
});
test('API : échéance, filtres et rectification avant transmission avec archive immuable',async()=>{
 const ctx=await testEnvironment();try{await migrateBilling(ctx.db);const token=(await ctx.login(users[0])).token,f=await paymentFixtureTools(ctx,token),{call,create,input,send}=f;
 const ok=async(r,status)=>{assert.equal(r.status,status,await r.clone().text());return r.json();},get=async id=>ok(await call('/documents/'+id),200),headers=d=>({'If-Match':String(d.version)});
 const old=await create(invoiceFixture('Facture ancienne'));assert.equal(old.settlement.overdue,true);
 const future={...invoiceFixture('Facture future'),issueDate:billingToday(),dueDate:''},doc=await create(future),original=structuredClone(doc);assert.equal(doc.data.dueDate,addBillingDays(billingToday(),30));assert.equal(doc.settlement.overdue,false);
 const finalized=await ok(await call('/documents?kind=invoice&state=finalized'),200),late=await ok(await call('/documents?kind=invoice&state=overdue'),200);assert.ok(finalized.documents.some(d=>d.id===doc.id));assert.ok(!finalized.documents.some(d=>d.id===old.id));assert.ok(late.documents.some(d=>d.id===old.id));
 const pdf=await(await call('/documents/'+doc.id+'/files/pdf')).arrayBuffer(),id=randomUUID();
 assert.equal((await call('/documents/'+doc.id+'/rectify','POST',{id,notTransmitted:false},headers(doc))).status,422);
 const results=await Promise.all([call('/documents/'+doc.id+'/rectify','POST',{id,notTransmitted:true},headers(doc)),call('/documents/'+doc.id+'/rectify','POST',{id:randomUUID(),notTransmitted:true},headers(doc))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);const copies=await Promise.all(results.map(r=>r.json()));assert.equal(copies[0].id,copies[1].id);let corrected=copies[0];
 assert.equal(corrected.status,'draft');assert.equal(corrected.rectification.parentId,doc.id);assert.match(corrected.data.notes,/Remplace la facture/);assert.deepEqual(corrected.data.buyer,doc.data.buyer);
 let archived=await get(doc.id);assert.deepEqual(archived.data,original.data);assert.deepEqual(archived.issuance,original.issuance);assert.equal(archived.settlement,null);assert.equal(archived.rectification.replacementId,corrected.id);assert.deepEqual(await(await call('/documents/'+doc.id+'/files/pdf')).arrayBuffer(),pdf);
 assert.equal((await send(doc,input(doc))).status,409);assert.equal((await call('/documents/'+doc.id,'PUT',{data:{...doc.data,title:'Wrong'}},headers(doc))).status,409);
 corrected=await ok(await call('/documents/'+corrected.id,'PUT',{data:{...corrected.data,title:'Rectification éditée'}},headers(corrected)),200);assert.equal(corrected.data.title,'Rectification éditée');
 await ok(await call('/documents/'+corrected.id,'DELETE',undefined,headers(corrected)),200);assert.equal((await get(doc.id)).settlement.state,'unpaid');
 const paid=await ok(await send(await get(doc.id),input(doc)),201);assert.equal(paid.settlement.state,'partial');assert.equal((await call('/documents/'+doc.id+'/rectify','POST',{id:randomUUID(),notTransmitted:true},headers(doc))).status,409);
 assert.equal((await call('/documents/'+corrected.id+'/restore','POST',{},headers(corrected))).status,409);
 const untouched=await create({...invoiceFixture('Facture réglée'),issueDate:billingToday(),dueDate:addBillingDays(billingToday(),30)});const paidOther=await ok(await send(untouched,input(untouched,'receipt','2700')),201);assert.equal((await call('/documents/'+paidOther.id+'/rectify','POST',{id:randomUUID(),notTransmitted:true},headers(paidOther))).status,409);
 await assert.rejects(()=>ctx.db.prepare('DELETE FROM billing_invoice_rectifications').run(),/BILLING_RECTIFICATION_HISTORY/);
 }finally{await ctx.worker.dispose();}
});
