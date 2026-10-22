import type {Database} from './contracts';
import type {BillingDocument} from './billing-contracts';
import {automaticNumberSeries} from './billing-numbering';
const fail=(message:string):never=>{throw Object.assign(new Error(message),{status:409});};
export async function reserveDraftNumber(db:Database,doc:BillingDocument,user:string){
 if(doc.issuance||doc.reservedNumber)return;
 if(doc.data.creditNote)return fail('La numérotation des avoirs nécessite le contrôle des montants crédités.');
 if(doc.quote?.revision.abandoned)return fail('Ce devis a été abandonné.');
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date());
 const seriesId=await automaticNumberSeries(db,{...doc.data,issueDate:date},user);
 try{
  await db.prepare(`INSERT INTO billing_draft_numbers(document_id,series_id,issuer_siren,sequence_value,number,number_date,created_at,created_by)
  SELECT d.id,s.id,s.issuer_siren,s.next_value,s.prefix||(CASE WHEN EXISTS(SELECT 1 FROM billing_dated_series a WHERE a.series_id=s.id) THEN replace(?,'-','')||'-' ELSE '' END)||printf('%0*d',s.width,s.next_value),?,?,?
  FROM billing_documents d JOIN billing_number_series s ON s.id=? WHERE d.id=? AND d.version=? AND NOT EXISTS(SELECT 1 FROM billing_draft_numbers WHERE document_id=d.id)`)
  .bind(date,date,new Date().toISOString(),user,seriesId,doc.id,doc.version).run();
 }catch(e){if(await db.prepare('SELECT document_id FROM billing_draft_numbers WHERE document_id=?').bind(doc.id).first())return;throw e;}
 if(!await db.prepare('SELECT document_id FROM billing_draft_numbers WHERE document_id=?').bind(doc.id).first())return fail('Le document a changé avant la réservation de son numéro.');
}
