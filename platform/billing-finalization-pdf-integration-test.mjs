// Real local Worker/D1/R2 -> authenticated FastAPI -> ReportLab PDF. No email or external service.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {test} from 'node:test';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {blankDraft,blankDocumentDetails} from './billing-domain.ts';
import {billingCanonicalJSON} from './billing-issuance.ts';

const sha=value=>createHash('sha256').update(value).digest('hex');
const python=process.env.BILLING_TEST_PYTHON||resolve('.private/facturx-venv/bin/python');
const key='synthetic-finalization-pdf-key-01234567890123456789';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date());
function fixture(){
 const d=blankDraft('quote',today());d.validUntil='2099-12-31';
 const sentence='Étude & accompagnement <Corse> : coordination des partenaires européens. ';
 d.title=('OBJET-DÉBUT '+sentence.repeat(8)).slice(0,289)+' OBJET-FIN.';
 d.details={...blankDocumentDetails(),marketObject:('MARCHÉ-DÉBUT '+sentence.repeat(8)).slice(0,488)+' MARCHÉ-FIN.'};
 d.seller={...d.seller,name:'Émetteur fictif de démonstration',addressLine1:'1 rue des Tests',postalCode:'20000',city:'Ajaccio',siren:'732829320',vatId:'FR44732829320'};
 d.buyer={...d.buyer,name:'Client fictif de démonstration',addressLine1:'2 rue des Tests',postalCode:'20200',city:'Bastia',siren:'552100554'};
 d.lines[0]={...d.lines[0],description:'PRESTATION-FIGEE-DEMONSTRATION',quantity:'2',unitPrice:'300',discountPercent:'0'};
 d.references={...d.references,businessCode:'AFFAIRE-FICTIVE',marketReference:'MARCHE-FICTIF',project:'PROJET-FICTIF',serviceCode:'00123',engagement:'ENG-FICTIF'};
 d.legalNotes={recovery:'Indemnité fictive de démonstration',penalties:'Pénalités fictives de démonstration',discount:'Sans escompte fictif'};
 return d;
}
function inspectPDF(bytes){
 const script="import io,json,sys;from pypdf import PdfReader;r=PdfReader(io.BytesIO(sys.stdin.buffer.read()));print(json.dumps({'pages':len(r.pages),'title':r.metadata.title,'text':'\\n'.join(p.extract_text() or '' for p in r.pages),'attachments':list(r.attachments)},ensure_ascii=False))";
 const checked=spawnSync(python,['-c',script],{input:bytes,encoding:'utf8',maxBuffer:4*1024*1024});
 assert.equal(checked.status,0,checked.stderr);return JSON.parse(checked.stdout);
}
function assertSubjects(pdf,document){
 const compact=value=>value.replace(/\s+/g,'');
 for(const value of [document.title,document.details.marketObject])assert.ok(compact(pdf.text).includes(compact(value)),'The complete entered subject must be preserved');
}
async function startPDFService(){
 const child=spawn(python,['-m','uvicorn','cdi_facturx.api:app','--host','127.0.0.1','--port','0'],{
  env:{...process.env,PYTHONPATH:resolve('facturx-service'),PYTHONIOENCODING:'utf-8',FACTURX_DEPLOYMENT:'server',FACTURX_API_KEY:key,FACTURX_ALLOWED_HOSTS:'127.0.0.1'},
  stdio:['ignore','pipe','pipe']
 });
 let logs='';
 try{
  const base=await new Promise((done,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Local PDF service startup timed out: '+logs)),20000);
   const read=chunk=>{logs+=chunk;const match=logs.match(/Uvicorn running on (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);done(match[1]);}};
   child.stdout.on('data',read);child.stderr.on('data',read);
   child.once('error',error=>{clearTimeout(timer);reject(error);});
   child.once('exit',code=>{clearTimeout(timer);reject(new Error('Local PDF service exited '+code+': '+logs));});
  });
  return {base,close:()=>child.kill('SIGTERM')};
 }catch(error){child.kill('SIGTERM');throw error;}
}

test('invoice number is assigned at finalization and the real frozen PDF survives render/storage retries', {timeout:90000}, async()=>{
 const pdf=await startPDFService();let ctx,mode='ok',poisonedKey;
 const calls=[];
 try{
  ctx=await testEnvironment({bindings:{BILLING_PDF_SERVICE_URL:'https://pdf-finalization.test',BILLING_PDF_SERVICE_KEY:key},outboundService:async request=>{
   const url=new URL(request.url);assert.equal(url.origin,'https://pdf-finalization.test');
   assert.ok(['/api/billing/preview-pdf','/api/billing/preflight-pdf','/api/billing/generate-issued-pdf','/api/billing/intervention-report'].includes(url.pathname));
   assert.equal(request.headers.get('x-api-key'),key);assert.equal(request.headers.has('authorization'),false);assert.equal(request.headers.has('cookie'),false);
   const payload=await request.json();calls.push({path:url.pathname,payload});
   if(mode==='render-error'&&url.pathname.endsWith('/generate-issued-pdf'))return Response.json({detail:'Synthetic renderer interruption'},{status:500});
   const upstream=await fetch(pdf.base+url.pathname,{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':key},body:JSON.stringify(payload)});
   const bytes=await upstream.arrayBuffer();
   if(upstream.ok&&url.pathname.endsWith('/preflight-pdf')&&mode==='wrong-preflight'){
    const result=JSON.parse(new TextDecoder().decode(bytes));return Response.json({...result,snapshotSha256:'0'.repeat(64)});
   }
   if(upstream.ok&&url.pathname.endsWith('/generate-issued-pdf')&&mode==='corrupt-storage'){
    const result=JSON.parse(new TextDecoder().decode(bytes)),artifact=result.artifacts.find(value=>value.kind==='pdf');
    poisonedKey=`billing/${payload.id}/pdf/${artifact.sha256}`;
    // The immutable conditional write must detect an already corrupt stored object.
    const bucket=await ctx.worker.getR2Bucket('CET_FILES');await bucket.put(poisonedKey,'%PDF-corrupt-local-test',{httpMetadata:{contentType:'application/pdf'}});
   }
   return new Response(bytes,{status:upstream.status,headers:upstream.headers});
  }});
  await migrateBilling(ctx.db);const admin=await ctx.login(users[0]);
  const headers={'X-CDInnov-Request':'1',Origin:'https://app.cdinnov.eu',Cookie:admin.cookie,'Content-Type':'application/json'};
  const call=(path,method='GET',body,extra={})=>ctx.worker.dispatchFetch('https://preview.test/api/v1/billing'+path,{method,headers:{...headers,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const ok=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
  const issue=async(doc,input)=>ok(await call('/documents/'+doc.id+'/issue','POST',input,{'If-Match':String(doc.version)}));
  const finalize=async doc=>ok(await call('/documents/'+doc.id+'/finalize','POST',{}, {'If-Match':String(doc.version)}));
  const invoiceSeries={id:randomUUID(),issuerSiren:'732829320',kind:'invoice',prefix:'PDF-FACT-',width:4,firstValue:41,startDate:'2020-01-01',endDate:'2099-12-31'};
  await ok(await call('/number-series','POST',{data:invoiceSeries}),201);
  const counter=async()=>(await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(invoiceSeries.id).first()).next_value;

  // Quotes retain their early reservation and the real PDF displays that same number.
  let quote=await ok(await call('/documents','POST',{id:randomUUID(),data:fixture()}),201);
  quote=await ok(await call('/documents/'+quote.id+'/number','POST',{}, {'If-Match':String(quote.version)}));
  const quoteNumber=quote.reservedNumber.number;
  const quotePreview=await call('/documents/'+quote.id+'/preview.pdf','GET',undefined,{'If-Match':String(quote.version)});
  assert.equal(quotePreview.status,200);const quotePreviewPDF=inspectPDF(Buffer.from(await quotePreview.arrayBuffer()));assert.ok(quotePreviewPDF.text.includes(quoteNumber));assertSubjects(quotePreviewPDF,quote.data);
  quote=await issue(quote,{id:randomUUID(),seriesId:'automatic'});assert.equal(quote.issuance.number,quoteNumber);
  quote=await finalize(quote);assert.equal(quote.status,'issued');assert.equal(await counter(),41);
  for(const action of ['sent','accepted'])quote=await ok(await call('/documents/'+quote.id+'/quote-events','POST',{
   id:randomUUID(),documentVersion:quote.version,action,occurredOn:today(),note:'Accord fictif local, aucun e-mail envoyé'
  },{'If-Match':String(quote.quote.version)}),201);
  const quoteFile=await call('/documents/'+quote.id+'/files/pdf');assert.equal(quoteFile.status,200);const quoteBytes=Buffer.from(await quoteFile.arrayBuffer());
  const engagement=await ctx.worker.dispatchFetch('https://preview.test/api/v1/billing/documents/'+quote.id+'/engagement?'+new URLSearchParams({kind:'signed_quote',reference:quoteNumber,date:today(),amountMinor:'60000'}),{
   method:'PUT',headers:{...headers,'If-Match':String(quote.version),'Content-Type':'application/pdf','X-Filename':'accord-entierement-fictif.pdf'},body:quoteBytes
  });
  quote=await ok(engagement,201);
  let invoice=await ok(await call('/documents/'+quote.id+'/convert','POST',{id:randomUUID()},{'If-Match':String(quote.version)}),201);
  assert.equal(invoice.sourceDocumentId,quote.id);assert.equal(invoice.data.references.quoteNumber,quoteNumber);assert.equal(invoice.reservedNumber,null);
  const initialDate=invoice.data.issueDate;
  for(let n=0;n<3;n++){
   invoice=await ok(await call('/documents/'+invoice.id+'/number','POST',{}, {'If-Match':String(invoice.version)}));
   assert.equal(invoice.reservedNumber,null);assert.equal(invoice.issuance,null);assert.equal(await counter(),41);
  }
  const edited={...invoice.data,description:'DESCRIPTION-FIGEE-AVANT-FINALISATION',references:{...invoice.data.references,serviceCode:'00123',engagement:'ENG-FIGEE'}};
  invoice=await ok(await call('/documents/'+invoice.id,'PUT',{data:edited},{'If-Match':String(invoice.version)}));
  const draft=await call('/documents/'+invoice.id+'/preview.pdf','GET',undefined,{'If-Match':String(invoice.version)});
  assert.equal(draft.status,200);const provisional=inspectPDF(Buffer.from(await draft.arrayBuffer()));
  assertSubjects(provisional,invoice.data);
  assert.match(provisional.text,/BROUILLON/);assert.match(provisional.text,/Numéro attribué à la finalisation/);assert.doesNotMatch(provisional.text,/PDF-FACT-0041/);
  assert.equal(await counter(),41);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM billing_draft_numbers WHERE document_id=?').bind(invoice.id).first()).n,0);

  const reservation={id:randomUUID(),seriesId:invoiceSeries.id},beforeCalls=calls.length;
  mode='wrong-preflight';const rejected=await call('/documents/'+invoice.id+'/issue','POST',reservation,{'If-Match':String(invoice.version)});
  assert.equal(rejected.status,502);assert.equal(await counter(),41);assert.equal((await ctx.db.prepare('SELECT count(*) n FROM billing_issuances WHERE document_id=?').bind(invoice.id).first()).n,0);
  mode='ok';invoice=await issue(invoice,reservation);
  assert.equal(invoice.issuance.number,'PDF-FACT-0041');assert.equal(invoice.status,'finalizing');assert.equal(invoice.data.issueDate,initialDate);assert.equal(await counter(),42);
  const reserved=await ctx.db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(invoice.id).first();
  assert.deepEqual(JSON.parse(reserved.snapshot_json),invoice.data);
  assert.equal(reserved.snapshot_sha256,sha(billingCanonicalJSON({schemaVersion:1,document:invoice.data,totals:invoice.totals})));
  assert.ok(calls.slice(beforeCalls).filter(value=>value.path.endsWith('/preflight-pdf')).every(value=>Object.keys(value.payload).join()==='document'));
  assert.equal((await call('/documents/'+invoice.id+'/preview.pdf','GET',undefined,{'If-Match':String(invoice.version)})).status,409);

  mode='render-error';invoice=await finalize(invoice);
  assert.equal(invoice.status,'issue_failed');assert.equal(invoice.issuance.attempts,1);assert.equal(invoice.issuance.number,reserved.number);assert.equal(await counter(),42);
  assert.equal((await call('/documents/'+invoice.id+'/files/pdf')).status,409);
  mode='corrupt-storage';invoice=await finalize(invoice);
  assert.equal(invoice.status,'issue_failed');assert.equal(invoice.issuance.errorCode,'storage');assert.equal(invoice.issuance.attempts,2);assert.equal(await counter(),42);
  assert.equal((await call('/documents/'+invoice.id+'/files/pdf')).status,409);
  const bucket=await ctx.worker.getR2Bucket('CET_FILES');assert.ok(poisonedKey);await bucket.delete(poisonedKey);
  mode='ok';invoice=await finalize(invoice);
  assert.equal(invoice.status,'issued');assert.equal(invoice.issuance.attempts,3);assert.equal(invoice.issuance.number,reserved.number);assert.equal(await counter(),42);
  const response=await call('/documents/'+invoice.id+'/files/pdf');assert.equal(response.status,200);
  const finalBytes=Buffer.from(await response.arrayBuffer()),final=inspectPDF(finalBytes);
  assertSubjects(final,invoice.data);
  assert.equal(final.title,'FACTURE '+reserved.number);assert.match(final.text,/PDF-FACT-0041/);assert.match(final.text,/720,00/);assert.match(final.text,/DESCRIPTION-FIGEE-AVANT-FINALISATION/);
  assert.ok(final.text.includes(quoteNumber));assert.match(final.text,/00123/);assert.match(final.text,/ENG-FIGEE/);assert.doesNotMatch(final.text,/BROUILLON|Numéro attribué à la finalisation/);assert.deepEqual(final.attachments,[]);
  const generationCalls=calls.filter(value=>value.path.endsWith('/generate-issued-pdf')&&value.payload.documentId===invoice.id);
  assert.equal(generationCalls.length,3);assert.ok(generationCalls.every(value=>value.payload.number===reserved.number&&value.payload.snapshotSha256===reserved.snapshot_sha256));
  assert.ok(generationCalls.every(value=>billingCanonicalJSON(value.payload.document)===billingCanonicalJSON(JSON.parse(reserved.snapshot_json))));
  const job=await ctx.db.prepare('SELECT * FROM billing_issue_jobs WHERE issuance_id=?').bind(invoice.issuance.id).first(),manifest=JSON.parse(job.manifest_json);
  assert.equal(manifest.artifacts[0].sha256,sha(finalBytes));assert.equal((await bucket.list({prefix:'billing/'+invoice.issuance.id+'/'})).objects.length,1);
  // Invoice reports share the draftPDF transport but require the final invoice
  // number. Excluding numbers from invoice previews must not remove this one.
  const report={date:today(),title:'Relevé entièrement fictif',periods:['S1'],rows:[{
   id:randomUUID(),priceId:'',label:'Intervention fictive',description:'TRAVAIL-EFFECTUE-FICTIF',days:'2'
  }]};
  const reportPreview=await call('/documents/'+invoice.id+'/intervention-report.pdf','POST',report);
  assert.equal(reportPreview.status,200,await reportPreview.clone().text());
  assert.ok(inspectPDF(Buffer.from(await reportPreview.arrayBuffer())).text.includes(reserved.number));
  await ok(await call('/documents/'+invoice.id+'/intervention-report','PUT',report,{'If-Match':'0'}));
  const reportDownload=await call('/documents/'+invoice.id+'/intervention-report.pdf');
  assert.equal(reportDownload.status,200,await reportDownload.clone().text());
  const reportText=inspectPDF(Buffer.from(await reportDownload.arrayBuffer())).text;
  assert.ok(reportText.includes(reserved.number));assert.match(reportText,/TRAVAIL-EFFECTUE-FICTIF/);
  const beforeReplay=calls.length;
  for(const replay of await Promise.all([issue(invoice,reservation),finalize(invoice)]))assert.equal(replay.issuance.id,reserved.id);
  assert.equal(calls.length,beforeReplay);assert.equal(await counter(),42);
  assert.equal((await call('/documents/'+invoice.id,'PUT',{data:{...invoice.data,description:'INTERDIT'}},{'If-Match':String(invoice.version)})).status,409);
  assert.deepEqual(await ctx.db.prepare('SELECT * FROM billing_issuances WHERE document_id=?').bind(invoice.id).first(),reserved);
  assert.deepEqual(Buffer.from(await (await call('/documents/'+invoice.id+'/files/pdf')).arrayBuffer()),finalBytes);
  const linkedQuote=await ok(await call('/documents/'+quote.id));
  assert.equal(linkedQuote.quote.invoices[0].id,invoice.id);assert.equal(linkedQuote.quote.invoices[0].number,reserved.number);assert.equal(linkedQuote.quote.invoices[0].state,'issued');
  assert.equal(linkedQuote.issuance.number,quoteNumber);assert.deepEqual(Buffer.from(await (await call('/documents/'+quote.id+'/files/pdf')).arrayBuffer()),quoteBytes);
 }finally{if(ctx)await ctx.worker.dispose();pdf.close();}
});
