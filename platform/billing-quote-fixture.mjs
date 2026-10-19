// Synthetic test documents only; the native rendering pipeline has separate integration coverage.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {blankDraft} from './billing-domain.ts';
import {createNumberSeries,reserveIssuance,claimIssuanceJob,completeIssuanceJob} from './billing-issuance.ts';
export function quoteFixture(title='Accompagnement technique',validUntil='2099-12-31'){
 const d=blankDraft('quote','2020-01-01');d.title=title;d.validUntil=validUntil;
 d.seller={...d.seller,name:'CDI Démonstration',addressLine1:'1 rue du Test',postalCode:'20000',city:'Ajaccio',siren:'732829320',vatId:'FR44732829320'};
 d.buyer={...d.buyer,name:'Atelier Horizon',addressLine1:'2 rue du Test',postalCode:'20200',city:'Bastia'};
 d.lines[0]={...d.lines[0],description:'Étude et accompagnement',quantity:'3',unitPrice:'750'};return d;
}
function samplePDF(){
 const stream='BT /F1 20 Tf 50 780 Td (Synthetic quote - test only) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let result='%PDF-1.4\n',offsets=[0];for(const [i,object] of objects.entries()){offsets.push(Buffer.byteLength(result));result+=`${i+1} 0 obj\n${object}\nendobj\n`;}
 const xref=Buffer.byteLength(result);result+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(result);
}
export async function quoteFixtureTools(ctx,token){
 const email='direction@example.test',series={id:randomUUID(),issuerSiren:'732829320',kind:'quote',prefix:'TEST-DEVIS-',width:4,firstValue:1,startDate:'2020-01-01',endDate:'2099-12-31'};
 await createNumberSeries(ctx.db,series,email);
 const call=(path,method='GET',body,headers={})=>ctx.worker.dispatchFetch('https://preview.test/api/v1/billing'+path,{method,headers:{Origin:'https://app.cdinnov.eu','Content-Type':'application/json',Authorization:'Bearer '+token,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const create=async(data=quoteFixture(),ready=true)=>{
  const res=await call('/documents','POST',{id:randomUUID(),data});assert.equal(res.status,201,await res.clone().text());const doc=await res.json();if(!ready)return doc;
  const issue=await reserveIssuance(ctx.db,{id:randomUUID(),documentId:doc.id,documentVersion:doc.version,seriesId:series.id},email);
  const lease=randomUUID();assert.ok(await claimIssuanceJob(ctx.db,issue.id,lease,email));
  const bytes=samplePDF(),sha256=createHash('sha256').update(bytes).digest('hex'),artifact={kind:'pdf',key:`billing/${issue.id}/pdf/${sha256}`,sha256,size:bytes.length,contentType:'application/pdf'};
  const bucket=await ctx.worker.getR2Bucket('CET_FILES');await bucket.put(artifact.key,bytes,{httpMetadata:{contentType:artifact.contentType}});
  assert.ok(await completeIssuanceJob(ctx.db,issue.id,lease,{schemaVersion:1,envelopeSha256:issue.envelopeSha256,generatorVersion:'synthetic-quote-test',profile:'quote-pdf',artifacts:[artifact]},email));
  return (await call('/documents/'+doc.id)).json();
 };
 const input=(doc,action='accepted',note='Accord reçu par e-mail',occurredOn='2020-01-02')=>({id:randomUUID(),documentVersion:doc.version,action,note,occurredOn});
 const send=(doc,data=input(doc),version=doc.quote.version)=>call('/documents/'+doc.id+'/quote-events','POST',data,{'If-Match':String(version)});
 return {call,create,input,send};
}
