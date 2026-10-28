import {createHash} from 'node:crypto';
import type {Database} from './contracts';
import type {BillingDraft} from './billing-contracts';
import {createNumberSeries} from './billing-issuance.ts';
import {validBillingDate} from './billing-domain.ts';
const fail=(message:string):never=>{throw Object.assign(new Error(message),{status:409});};
export async function automaticNumberSeries(db:Database,draft:BillingDraft,user:string){
 const date=draft.issueDate,siren=(draft.seller.siren||draft.seller.siret.slice(0,9)).replace(/\s/g,'');
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date());
 if(!validBillingDate(date)||date>today)return fail('La date du document ne peut pas être postérieure à aujourd’hui.');
 const configured=await db.prepare('SELECT s.id FROM billing_default_series p JOIN billing_number_series s ON s.id=p.series_id WHERE p.issuer_siren=? AND p.kind=? AND NOT EXISTS(SELECT 1 FROM billing_retired_series r WHERE r.series_id=s.id)').bind(siren,draft.kind).first<{id:string}>();
 if(configured)return configured.id;
 const quote=draft.kind==='quote',digest=createHash('sha256').update('cdinnov-numbering-v1:'+siren+':'+(quote?date:'invoice')).digest('hex');
 const id=`${digest.slice(0,8)}-${digest.slice(8,12)}-5${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`;
 const series=await createNumberSeries(db,{id,issuerSiren:siren,kind:draft.kind,prefix:quote?date.replace(/-/g,'')+'-':'F-',width:3,firstValue:1,startDate:quote?date:'1970-01-01',endDate:quote?date:'9999-12-31'},user);
 if(!quote){
  // WHERE avoids firing the initial-only marker guard on an idempotent retry after issuance.
  await db.prepare('INSERT INTO billing_dated_series SELECT ? WHERE NOT EXISTS(SELECT 1 FROM billing_dated_series WHERE series_id=?)').bind(id,id).run();
 }
 return series.id;
}
