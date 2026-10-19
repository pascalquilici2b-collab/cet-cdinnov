// Deliberately synthetic service responses exercise rejection/fencing, never PDF conformity.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {test} from 'node:test';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {blankDraft,calculateBilling} from './billing-domain.ts';
import {billingCanonicalJSON} from './billing-issuance.ts';

const sha=data=>createHash('sha256').update(data).digest('hex');
const fixture=()=>{
 const d=blankDraft('invoice','2026-10-20');d.dueDate='2026-11-19';d.title='Test de refus des réponses invalides';
 d.seller={...d.seller,name:'Émetteur fictif',addressLine1:'1 rue du Test',postalCode:'20000',city:'Ajaccio',siren:'732829320',vatId:'FR44732829320',electronicAddress:'732829320',electronicScheme:'0225'};
 d.buyer={...d.buyer,name:'Client fictif',addressLine1:'2 rue du Test',postalCode:'20200',city:'Bastia',siren:'552100554',electronicAddress:'552100554',electronicScheme:'0225'};
 d.lines[0]={...d.lines[0],description:'Prestation fictive',quantity:'1',unitPrice:'100'};
 d.paymentMeans='10';d.businessProcess='S1';d.legalNotes={recovery:'Test',penalties:'Test',discount:'Test'};return d;
};
function syntheticResult(request,mode){
 const pdf=Buffer.from('%PDF-synthetic-not-a-conformance-test'),xml=Buffer.from('<synthetic/>');
 const checks={structured_source:true,amounts:true,xsd:true,schematron:true,france:true,embedding:true,pdfa_3b:true};
 if(mode==='bad-report')checks.pdfa_3b=false;
 const report={valid:true,profile:'en16931',envelope_sha256:request.envelopeSha256,pdf_sha256:sha(pdf),xml_sha256:sha(xml),checks,pdf_differences_acknowledged:false};
 const artifacts=[['pdf',pdf,'application/pdf'],['xml',xml,'application/xml'],['validation',Buffer.from(JSON.stringify(report)),'application/json'],['verapdf',Buffer.from('<synthetic/>'),'application/xml']].map(([kind,bytes,contentType])=>({kind,sha256:sha(bytes),size:bytes.length,contentType,base64:bytes.toString('base64')}));
 if(mode==='bad-file-hash')artifacts[0].sha256='0'.repeat(64);
 if(mode==='missing-report')artifacts.pop();
 return {schemaVersion:1,generatorVersion:'synthetic-test',profile:'en16931',envelopeSha256:mode==='wrong-envelope'?'0'.repeat(64):request.envelopeSha256,artifacts};
}
await test('HTTP émission : refus avant réservation et contrôle des fichiers après réservation',async t=>{
 let mode='ok',requests=0,concurrentEdit;const key='synthetic-service-key-01234567890123456789';
 const ctx=await testEnvironment({bindings:{BILLING_PDF_SERVICE_URL:'https://pdf-service.test',BILLING_PDF_SERVICE_KEY:key},outboundService:async request=>{
  requests++;assert.equal(new URL(request.url).origin,'https://pdf-service.test');assert.equal(request.headers.get('x-api-key'),key);assert.equal(request.headers.has('authorization'),false);
  if(mode==='redirect')return new Response(null,{status:302,headers:{Location:'https://must-not-follow.test'}});
  if(mode==='unavailable')return Response.json({detail:'private upstream details'}, {status:503});
  const payload=await request.json();
  if(new URL(request.url).pathname.endsWith('/preflight')){
   if(concurrentEdit)await concurrentEdit();
   const result={valid:true,snapshotSha256:sha(billingCanonicalJSON({schemaVersion:1,document:payload.document,totals:calculateBilling(payload.document)})),checks:{render:true,amounts:true,xsd:true,schematron:true,france:true}};
   if(mode==='wrong-snapshot')result.snapshotSha256='0'.repeat(64);
   if(mode==='missing-check')delete result.checks.france;
   return Response.json(result);
  }
  return Response.json(syntheticResult(payload,mode));
 }});
 try{
  await migrateBilling(ctx.db);const admin=await ctx.login(users[0]),reader=await ctx.login(users[1]);
  const headers={Origin:'https://app.cdinnov.eu',Authorization:'Bearer '+admin.token,'Content-Type':'application/json'};
  const call=(path,method='GET',body,extra={})=>ctx.worker.dispatchFetch('https://preview.test/api/v1/billing'+path,{method,headers:{...headers,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const create=async()=>{const result=await call('/documents','POST',{id:randomUUID(),data:fixture()});assert.equal(result.status,201);return result.json();};
  const s={id:randomUUID(),issuerSiren:'732829320',kind:'invoice',prefix:'TEST-',width:4,firstValue:41,startDate:'2026-01-01',endDate:'2026-12-31'};
  assert.equal((await call('/number-series','POST',{data:s})).status,201);const doc=await create(),issueInput={id:randomUUID(),seriesId:s.id};
  const reserve=(document=doc,body=issueInput)=>call('/documents/'+document.id+'/issue','POST',body,{'If-Match':String(document.version)});
  const counter=async()=>(await ctx.db.prepare('SELECT next_value FROM billing_number_series WHERE id=?').bind(s.id).first()).next_value;
  await t.test('identité, droits, origine, méthode et version avant tout appel distant',async()=>{
   for(const [token,status] of [['',401],['Bearer '+reader.token,403]]){
    for(const [path,body] of [['/number-series',{data:{...s,id:randomUUID()}}],['/documents/'+doc.id+'/issue',issueInput],['/documents/'+doc.id+'/finalize',{}]])assert.equal((await call(path,'POST',body,{Authorization:token,'If-Match':'1'})).status,status);
   }
   assert.equal((await call('/documents/'+doc.id+'/issue','POST',issueInput,{Origin:'https://untrusted.test','If-Match':'1'})).status,403);
   assert.equal((await call('/documents/'+doc.id+'/issue','GET')).status,405);
   assert.equal((await call('/documents/'+doc.id+'/issue','POST',issueInput)).status,428);
   assert.equal((await reserve({...doc,version:2})).status,409);
   assert.equal(requests,0);assert.equal(await counter(),41);
  });
  await t.test('indisponibilité, redirection et précontrôle incohérent conservent le brouillon et le compteur',async()=>{
   for(const [value,status] of [['unavailable',503],['redirect',503],['wrong-snapshot',502],['missing-check',502]]){
    mode=value;const before=requests,result=await reserve();assert.equal(result.status,status,await result.clone().text());assert.equal(requests,before+1);assert.doesNotMatch(await result.text(),/private upstream|synthetic-service-key/);
    assert.equal((await (await call('/documents/'+doc.id)).json()).status,'draft');assert.equal(await counter(),41);
   }
   assert.equal((await ctx.db.prepare('SELECT count(*) AS n FROM billing_issuances').first()).n,0);
  });
  await t.test('une modification pendant le précontrôle interdit de réserver son ancien instantané',async()=>{
   mode='ok';concurrentEdit=async()=>assert.equal((await call('/documents/'+doc.id,'PUT',{data:{...doc.data,title:'Modification concurrente'}},{'If-Match':'1'})).status,200);
   assert.equal((await reserve()).status,409);concurrentEdit=undefined;assert.equal(await counter(),41);
   const current=await (await call('/documents/'+doc.id)).json();assert.equal(current.version,2);assert.equal(current.status,'draft');
  });
  const current=await (await call('/documents/'+doc.id)).json();assert.equal((await reserve(current)).status,200);assert.equal(await counter(),42);
  const found=await (await call('/documents?q=test-0041')).json();assert.equal(found.total,1);assert.equal(found.documents[0].id,doc.id);
  assert.equal((await (await call('/documents?q='+encodeURIComponent('%_'))).json()).total,0);
  await t.test('fichiers incomplets, mauvais numéro, empreinte ou contrôle faux ne deviennent jamais téléchargeables',async()=>{
   for(const value of ['wrong-envelope','bad-file-hash','missing-report','bad-report']){
    mode=value;const result=await call('/documents/'+doc.id+'/finalize','POST',{}, {'If-Match':'2'});assert.equal(result.status,200);const failed=await result.json();assert.equal(failed.status,'issue_failed');assert.equal(failed.issuance.number,'TEST-0041');assert.equal(failed.issuance.errorCode,'validation');
    assert.equal((await call('/documents/'+doc.id+'/files/pdf')).status,409);assert.equal(await counter(),42);
   }
   assert.equal((await ctx.db.prepare('SELECT count(*) AS n FROM billing_issuances').first()).n,1);
   const bucket=await ctx.worker.getR2Bucket('CET_FILES');assert.equal((await bucket.list({prefix:'billing/'})).objects.length,0);
  });
 }finally{await ctx.worker.dispose();}
});
