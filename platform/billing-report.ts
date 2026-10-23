import type {Database,Environment,Reply} from './contracts';
import type {BillingDraft,BillingInterventionReport} from './billing-contracts';
import {blankDocumentDetails,normalizeDraft} from './billing-domain';
import {billingToday} from './billing-quote-domain';
import {documentPeriods} from './billing-periods';
import {boundedBody} from './portal';
import {draftPDF} from './billing-pdf';
const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
type Row={version:number;data_json:string};
export async function reportRoute(request:Request,db:Database,env:Environment,key:string,data:BillingDraft,number:string,email:string,reply:Reply,pdf=false){
 if(data.kind!=='invoice')return fail(400,'Le relevé est rattaché à une facture.');
 const saved=await db.prepare('SELECT version,data_json FROM billing_intervention_reports WHERE document_key=?').bind(key).first<Row>();
 const initial:BillingInterventionReport={version:0,date:billingToday(),title:data.title,periods:documentPeriods(data.details),rows:data.details?.interventions?.length?data.details.interventions:data.lines.filter(l=>l.unitCode==='DAY').map(l=>({id:l.id,priceId:'',label:l.description.slice(0,300),description:'',days:l.quantity}))};
 const report:BillingInterventionReport=saved?{...JSON.parse(saved.data_json),version:saved.version}:initial;
 if(request.method==='GET'){
  if(!pdf)return reply(200,report);
  if(!saved||!report.rows.length||report.rows.some(r=>!r.label.trim()||!r.description.trim()||!/^\d+(?:[.,]\d{1,6})?$/.test(r.days)||Number(r.days.replace(',','.'))<=0))return fail(422,'Complétez le travail effectué et le nombre de jours de chaque intervention.');
  return draftPDF({id:key,version:report.version,data:{...data,title:report.title,annotations:[],details:{...data.details||blankDocumentDetails(),interventions:report.rows,periods:report.periods,period:report.periods[0]||''}},reservedNumber:{number,date:data.issueDate,seriesId:''}},env,reply,false,report.date);
 }
 const preview=request.method==='POST'&&pdf;
 if(!preview&&(request.method!=='PUT'||pdf))return reply(405,{error:'Méthode non autorisée.'});
 if(!preview&&request.headers.get('if-match')!==String(report.version))return fail(409,'Le relevé a changé. Fermez puis rouvrez-le pour récupérer la dernière version.');
 let input;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request,1000000)));}catch{return fail(400,'Relevé invalide.');}
 if(!input||Object.keys(input).sort().join()!=='date,periods,rows,title'||typeof input.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(Date.parse(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date||typeof input.title!=='string'||input.title.length>300)return fail(422,'Vérifiez la date et l’objet du relevé.');
 const normalized=normalizeDraft({...data,title:input.title,details:{...data.details||blankDocumentDetails(),periods:input.periods,interventions:input.rows}});
 const value={date:input.date,title:normalized.title,periods:documentPeriods(normalized.details),rows:normalized.details!.interventions};
 if(preview){
  const rows=value.rows.length?value.rows:[{id:'00000000-0000-4000-8000-000000000001',priceId:'',label:'Prestation à renseigner',description:'Travail effectué à renseigner',days:'0'}];
  return draftPDF({id:key,version:report.version,data:{...data,title:value.title,annotations:[],details:{...data.details||blankDocumentDetails(),periods:value.periods,period:value.periods[0]||'',interventions:rows.map(r=>({...r,label:r.label.trim()||'Prestation à renseigner',description:r.description.trim()||'Travail effectué à renseigner',days:r.days||'0'}))}},reservedNumber:{number,date:data.issueDate,seriesId:''}},env,reply,false,value.date);
 }
 const next=await db.prepare(`INSERT INTO billing_intervention_reports(document_key,version,data_json,updated_at,updated_by) SELECT ?,1,?,?,? WHERE ?=0
  ON CONFLICT(document_key) DO UPDATE SET version=version+1,data_json=excluded.data_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by WHERE version=? RETURNING version`)
  .bind(key,JSON.stringify(value),new Date().toISOString(),email,report.version,report.version).first<{version:number}>();
 // For existing reports INSERT SELECT must still produce an input row.
 if(!next&&report.version>0){
  const updated=await db.prepare('UPDATE billing_intervention_reports SET version=version+1,data_json=?,updated_at=?,updated_by=? WHERE document_key=? AND version=? RETURNING version').bind(JSON.stringify(value),new Date().toISOString(),email,key,report.version).first<{version:number}>();
  if(updated)return reply(200,{...value,version:updated.version});
 }
 if(!next)return fail(409,'Le relevé a été modifié dans une autre session.');
 return reply(200,{...value,version:next.version});
}
