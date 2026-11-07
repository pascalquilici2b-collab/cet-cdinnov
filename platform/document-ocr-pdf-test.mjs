import{test}from'node:test';import assert from'node:assert/strict';import{build}from'esbuild';
import{testEnvironment,users}from'../marches/test.mjs';import{createHash}from'node:crypto';
const bundle=await build({entryPoints:['platform/document-ocr-pdf.ts'],bundle:true,format:'esm',platform:'node',write:false});
const{collectPDFOCR,pdfVisionEnabled}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const hash='a'.repeat(64),png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=',model='@cf/google/gemma-4-26b-a4b-it';
const packet=(page,pages=2,needsOCR=true)=>({source_sha256:hash,page,pages,image:png,width:1,height:1,nativeText:'Page fictive '+page,needsOCR});
const answer=text=>({response:JSON.stringify({text,unreadableText:false,signaturePresent:false,warnings:[]}),usage:{neurons:10}});
const db=(quota=false)=>({prepare(){return{bind(){return{async first(){return quota?null:{reserved:1};},async run(){}};}};}});
test('PDF collection preserves native text, source/page bindings, sequential transcripts and manual quota fallback',async()=>{
 let calls=0;const env={DOCUMENT_OCR_MODEL:model,MARKETS_AI:{async run(){calls++;return answer('Page transcrite '+calls);}}};
 assert.equal(pdfVisionEnabled({...env,DOCUMENT_OCR_PDF_BRIDGE:'v1'}),true);assert.equal(pdfVisionEnabled(env),false);
 const native=await collectPDFOCR(db(),env,hash,async page=>packet(page,2,false));assert.equal(native.complete,true);assert.equal(native.inspected,2);assert.deepEqual(native.pages,[]);assert.equal(calls,0);
 const scans=await collectPDFOCR(db(),env,hash,async page=>packet(page));assert.equal(scans.complete,true);assert.deepEqual(scans.pages.map(p=>[p.page,p.source_sha256,p.text]),[[0,hash,'Page transcrite 1'],[1,hash,'Page transcrite 2']]);
 await assert.rejects(()=>collectPDFOCR(db(),env,hash,async page=>({...packet(page),source_sha256:'b'.repeat(64)})),/binding/);assert.equal(calls,2);
 await assert.rejects(()=>collectPDFOCR(db(),env,hash,async page=>({...packet(page),page:page+1})),/binding/);
 await assert.rejects(()=>collectPDFOCR(db(),env,hash,async page=>packet(page,3),{maximumPages:2}),/binding/);
 const limit=await collectPDFOCR(db(),env,hash,async page=>packet(page),{visionPages:1});assert.equal(limit.complete,false);assert.equal(limit.pages.length,2);assert.equal(limit.pages[1].complete,false);assert.equal(limit.pages[1].text,'[illisible]');
 await assert.rejects(()=>collectPDFOCR(db(),env,hash,async page=>packet(page,151),{maximumPages:500}),/binding/);
 const capped=await collectPDFOCR(db(),env,hash,async page=>packet(page,31),{visionPages:500});assert.equal(capped.complete,false);assert.equal(capped.pages.length,31);assert.equal(capped.pages[30].complete,false);
 const before=calls,quota=await collectPDFOCR(db(true),env,hash,async page=>packet(page));assert.equal(quota.complete,false);assert.equal(quota.pages[0].complete,false);assert.equal(calls,before);assert.match(quota.warnings.join(' '),/Quota/);
});
test('PDF global deadline also bounds a slow image renderer',async()=>{
 const env={DOCUMENT_OCR_MODEL:model,MARKETS_AI:{async run(){throw Error('must not call vision after deadline');}}};const started=Date.now();let renderingSignal;
 const result=await collectPDFOCR(db(),env,hash,async(page,signal)=>{renderingSignal=signal;await new Promise(resolve=>setTimeout(resolve,2200));return packet(page);},{deadlineMs:1500});
 assert.equal(result.complete,false);assert.equal(result.pages[0].complete,false);assert.equal(renderingSignal.aborted,true);assert.ok(Date.now()-started<1950,'slow preparation exceeded the global OCR deadline');
});

const machineKey='synthetic-machine-key-'.repeat(3),pdfBytes=Buffer.from('%PDF-1.7\nFICTITIOUS SCANNED DOCUMENT\n%%EOF'),sourceHash=createHash('sha256').update(pdfBytes).digest('hex');
const candidateBase={number:null,issue_date:null,client:'Client configuré',business_code:'AFF-42',totals:{net:null,gross:null}};
const form=forged=>{const body=new FormData();body.append('pdf',new Blob([pdfBytes],{type:'application/pdf'}),'synthetic.pdf');if(forged)body.append('ocrPages',JSON.stringify([{page:0,text:'FORGED',source_sha256:sourceHash,complete:true}]));return body;};
async function request(ctx,session,path,body){const serialized=new Request('https://local',{method:'POST',body});return ctx.worker.dispatchFetch('https://app.cdinnov.eu/api/v1/facturx'+path,{method:'POST',headers:{Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1',Cookie:session.cookie,'Content-Type':serialized.headers.get('Content-Type')},body:Buffer.from(await serialized.arrayBuffer())});}

test('real cookie Worker proxy attests two scanned pages and keeps configured candidate fields; native/quota/hash failures stay safe',async()=>{
 let mode='scan',visionCalls=0;const upstream=[],received=[];
 const ctx=await testEnvironment({bindings:{DOCUMENT_OCR_MODEL:model,DOCUMENT_OCR_PDF_BRIDGE:'v1',BILLING_PDF_SERVICE_URL:'https://converter.invalid',BILLING_PDF_SERVICE_KEY:machineKey},ai:async()=>{visionCalls++;if(mode==='uncertain')return{response:JSON.stringify({text:'Montant manuscrit [illisible]',unreadableText:true,signaturePresent:false,warnings:['Montant à vérifier.']}),usage:{neurons:10}};return answer(visionCalls%2?'Facture FAC-FICTIVE-42. Total HT : 987,65 EUR.':'Date : 07/11/2026. [signature manuscrite présente]');},outboundService:async req=>{
  const url=new URL(req.url);assert.equal(req.headers.get('X-API-Key'),machineKey);assert.equal(req.headers.get('Cookie'),null);assert.equal(req.headers.get('Authorization'),null);upstream.push(url.pathname);
  const body=await req.formData();assert.deepEqual(Buffer.from(await body.get('pdf').arrayBuffer()),pdfBytes);
  if(url.pathname==='/api/invoices/ocr-page'){const page=Number(body.get('page'));return Response.json({...packet(page,2,mode!=='native'),source_sha256:mode==='bad-sha'?'b'.repeat(64):sourceHash});}
  const supplied=body.get('ocrPages');if(supplied){const reads=JSON.parse(supplied);received.push(reads);assert.ok(reads.every(p=>p.source_sha256===sourceHash));const complete=reads.every(p=>p.complete);return Response.json({source_sha256:sourceHash,candidates:{...candidateBase,...(complete?{number:'FAC-FICTIVE-42',issue_date:'2026-11-07',totals:{net:987.65,gross:null}}:{})},ocr:{complete,warnings:reads.flatMap(p=>p.warnings)},pages:2});}
  return Response.json({source_sha256:sourceHash,candidates:candidateBase,pages:2});
 }});
 try{
  const admin=await ctx.login(users[0]),staff=await ctx.login(users[1]);
  assert.equal((await request(ctx,staff,'/invoices/read-pdf',form())).status,403);assert.equal(upstream.length,0);
  let response=await request(ctx,admin,'/invoices/read-pdf',form());assert.equal(response.status,200,await response.clone().text());let result=await response.json();assert.equal(result.candidates.number,'FAC-FICTIVE-42');assert.equal(result.candidates.client,'Client configuré');assert.equal(result.candidates.business_code,'AFF-42');assert.equal(result.candidates.totals.net,987.65);assert.equal(result.ocr.complete,true);assert.equal(visionCalls,2);assert.deepEqual(received[0].map(p=>[p.page,p.model]),[[0,model],[1,model]]);assert.ok(received[0][1].text.includes('07/11/2026'));
  assert.match(response.headers.get('cache-control'),/no-store/);
  mode='native';let before=visionCalls;const forwarded=received.length;response=await request(ctx,admin,'/invoices/read-pdf',form());assert.equal(response.status,200);result=await response.json();assert.deepEqual(result.candidates,candidateBase);assert.equal(visionCalls,before);assert.equal(received.length,forwarded);
  mode='bad-sha';response=await request(ctx,admin,'/invoices/read-pdf',form());assert.equal(response.status,503);result=await response.json();assert.equal(result.candidates,undefined);assert.equal(visionCalls,before);
  mode='uncertain';response=await request(ctx,admin,'/invoices/read-pdf',form());assert.equal(response.status,422);result=await response.json();assert.equal(result.candidates,undefined);assert.match(result.error,/manuellement|incomplète/);assert.equal(received.length,forwarded);
  before=visionCalls;mode='scan';const day=new Date().toISOString().slice(0,10);await ctx.db.prepare('UPDATE market_ai_daily SET reserved=9000 WHERE day=?').bind(day).run();response=await request(ctx,admin,'/invoices/read-pdf',form());assert.equal(response.status,422);result=await response.json();assert.equal(result.candidates,undefined);assert.match(result.error,/manuellement|incomplète/);assert.equal(visionCalls,before);assert.equal(received.length,forwarded,'incomplete/quota transcripts never reach the field extractor');
 }finally{await ctx.worker.dispose();}
});
test('browser OCR forgery is rejected before upstream even when bridge flag is disabled; ordinary legacy read stays unchanged',async()=>{
 let upstream=0,vision=0;const ctx=await testEnvironment({bindings:{BILLING_PDF_SERVICE_URL:'https://converter.invalid',BILLING_PDF_SERVICE_KEY:machineKey},ai:async()=>{vision++;return answer('must not be called');},outboundService:async req=>{upstream++;assert.equal(req.headers.get('X-API-Key'),machineKey);const body=await req.formData();assert.equal(body.has('ocrPages'),false);return Response.json({source_sha256:sourceHash,candidates:candidateBase,pages:2});}});
 try{const admin=await ctx.login(users[0]);for(const path of ['/invoices/read-pdf','/facturx/import-pdf']){const response=await request(ctx,admin,path,form(true));assert.equal(response.status,400);assert.equal(upstream,0);}const response=await request(ctx,admin,'/invoices/read-pdf',form());assert.equal(response.status,200);assert.deepEqual((await response.json()).candidates,candidateBase);assert.equal(upstream,1);assert.equal(vision,0);}finally{await ctx.worker.dispose();}
});

test('authenticated stamping queue sends server-bound scan readings back to the documentary service before proposing configured allocations',async()=>{
 const{migrateStamping}=await import('./stamping-schema.mjs');let vision=0;const supplied=[],actions=[];
 const ctx=await testEnvironment({stamping:true,bindings:{DOCUMENT_OCR_MODEL:model,DOCUMENT_OCR_PDF_BRIDGE:'v1',BILLING_PDF_SERVICE_URL:'https://converter.invalid',BILLING_PDF_SERVICE_KEY:machineKey},ai:async()=>{vision++;return answer('Page '+vision+' : facture fictive FAC-42. HT 987,65 EUR.');},outboundService:async req=>{
  assert.equal(req.headers.get('X-API-Key'),machineKey);const body=await req.formData(),payload=JSON.parse(body.get('payload'));actions.push(payload.action);assert.deepEqual(Buffer.from(await body.get('file').arrayBuffer()),pdfBytes);
  let result;
  if(payload.action==='ocr-page')result={...packet(payload.page),source_sha256:sourceHash};
  else if(payload.action==='analyze'){
   if(!payload.ocrPages)result={needsAI:false,reading:{evidence:[]},cachedReading:null};
   else{const reads=payload.ocrPages;supplied.push(reads);assert.ok(reads.every(p=>p.source_sha256===sourceHash));assert.equal(payload.groups[0].project_ref,'PROJET-CONFIGURE');assert.equal(payload.options.header,'Tampon configuré');
    result={needsAI:false,pdf:pdfBytes.toString('base64'),output_sha256:sourceHash,source_sha256:sourceHash,checks:{sourcePreserved:true},groupId:'synthetic-group',allocations:[{id:'configured-allocation',amount_cents:98765,project_ref:'PROJET-CONFIGURE'}],base_cents:100000,total_cents:98765,algorithm:'synthetic-stamping-service',reading:{ocr_fingerprint:'server-bound-synthetic-vision',evidence:[]},cachedReading:{source_sha256:sourceHash}};
   }
  }else throw Error('Unexpected test action '+payload.action);
  return Response.json({ok:true,result});
 }});
 try{
  await migrateStamping(ctx.db);const admin=await ctx.login(users[0]);
  const call=(path,options={})=>ctx.worker.dispatchFetch('https://app.cdinnov.eu/api/v1/stamping'+path,{...options,headers:{Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1',Cookie:admin.cookie,'Content-Type':'application/json',...options.headers}});
  let response=await call('/batches',{method:'POST',body:JSON.stringify({name:'Synthetic vision allocation flow',category:'SERVICES'})});assert.equal(response.status,201,await response.clone().text());const{id:batchId}=await response.json();
  const row=await ctx.db.prepare('SELECT data FROM stamp_batches WHERE id=?').bind(batchId).first(),data=JSON.parse(row.data);data.importConfirmed=true;data.import={groups:[{id:'synthetic-group',project_ref:'PROJET-CONFIGURE'}],errors:[]};data.options={...data.options,header:'Tampon configuré'};await ctx.db.prepare('UPDATE stamp_batches SET data=? WHERE id=?').bind(JSON.stringify(data),batchId).run();
  const id=crypto.randomUUID();await ctx.db.prepare('INSERT INTO stamp_documents(id,batch_id,name,sha256,size,data) VALUES(?,?,?,?,?,?)').bind(id,batchId,'two-scanned-pages.pdf',sourceHash,pdfBytes.length,JSON.stringify({sourceUpload:{name:'two-scanned-pages.pdf',sha256:sourceHash,pages:[1,2]}})).run();
  const bucket=await ctx.worker.getR2Bucket('CET_FILES'),key='stamping/'+createHash('sha256').update(users[0]).digest('hex').slice(0,24)+'/'+batchId+'/'+id+'/source.pdf';await bucket.put(key,pdfBytes);
  response=await call('/batches/'+batchId+'/documents/'+id+'/analyze',{method:'POST',headers:{'If-Match':'1'},body:'{}'});assert.equal(response.status,202,await response.clone().text());
  let doc;const deadline=Date.now()+15000;while(Date.now()<deadline){const latest=await ctx.db.prepare('SELECT status,data FROM stamp_documents WHERE id=?').bind(id).first();doc={...latest,data:JSON.parse(latest.data)};if(!['QUEUED','PROCESSING'].includes(doc.status))break;await new Promise(resolve=>setTimeout(resolve,50));}
  assert.equal(doc.status,'NEEDS_APPROVAL',JSON.stringify(doc));assert.equal(vision,2);assert.deepEqual(actions,['analyze','ocr-page','ocr-page','analyze']);assert.deepEqual(supplied[0].map(p=>p.page),[0,1]);assert.ok(supplied[0].every(p=>p.complete));assert.equal(doc.data.allocations[0].project_ref,'PROJET-CONFIGURE');assert.equal(doc.data.total_cents,98765);assert.ok(await bucket.get(doc.data.candidateKey));
  response=await call('/batches/'+batchId+'/export');assert.equal(response.status,422,'vision never bypasses human approval');
 }finally{await ctx.worker.dispose();}
});

test('multi-page stamping intake carries the documentary service cache into the queued analysis without duplicate vision',async()=>{
 const{migrateStamping}=await import('./stamping-schema.mjs');let vision=0;const actions=[];
 // This Worker integration treats the machine service's cache as opaque. Its
 // cryptographic validation and actual PDF page rebinding have Python tests.
 const cache={source_sha256:sourceHash,reading:{ocr_fingerprint:'trusted-service-vision-v1',ocr_complete:true},signature:'opaque-synthetic-machine-attestation'};
 const ctx=await testEnvironment({stamping:true,bindings:{DOCUMENT_OCR_MODEL:model,DOCUMENT_OCR_PDF_BRIDGE:'v1',BILLING_PDF_SERVICE_URL:'https://converter.invalid',BILLING_PDF_SERVICE_KEY:machineKey},ai:async()=>{vision++;return answer('Facture FAC-FICTIVE-42, page '+vision+' : 987,65 EUR HT.');},outboundService:async req=>{
  const body=await req.formData(),payload=JSON.parse(body.get('payload'));actions.push(payload.action);assert.equal(req.headers.get('X-API-Key'),machineKey);assert.deepEqual(Buffer.from(await body.get('file').arrayBuffer()),pdfBytes);
  let result;
  if(payload.action==='ocr-page')result={...packet(payload.page),source_sha256:sourceHash};
  else if(payload.action==='document-info'){if(payload.ocrPages){assert.equal(payload.ocrPages.length,2);assert.ok(payload.ocrPages.every(p=>p.source_sha256===sourceHash&&p.complete));}result={pages:[0,1].map(page=>({page,needsOCR:!payload.ocrPages}))};}
  else if(payload.action==='document-split'){assert.equal(payload.ocrPages.length,2);result={parts:[{original:true,start:0,end:1,cachedReading:cache}]};}
  else if(payload.action==='analyze'){assert.deepEqual(payload.cachedReading,cache);assert.equal(payload.ocrPages,undefined);result={needsAI:false,pdf:pdfBytes.toString('base64'),source_sha256:sourceHash,output_sha256:sourceHash,groupId:'configured-group',allocations:[],checks:{sourcePreserved:true},algorithm:'synthetic-cached-analysis',reading:cache.reading,cachedReading:cache};}
  else throw Error('Unexpected test action '+payload.action);
  return Response.json({ok:true,result});
 }});
 try{
  await migrateStamping(ctx.db);const admin=await ctx.login(users[0]);const call=(path,options={})=>ctx.worker.dispatchFetch('https://app.cdinnov.eu/api/v1/stamping'+path,{...options,headers:{Origin:'https://app.cdinnov.eu','X-CDInnov-Request':'1',Cookie:admin.cookie,'Content-Type':'application/json',...options.headers}});
  const created=await call('/batches',{method:'POST',body:JSON.stringify({name:'Synthetic intake OCR cache',category:'SERVICES'})});assert.equal(created.status,201);const{id:batchId}=await created.json();
  const upload=new FormData();upload.append('file',new Blob([pdfBytes],{type:'application/pdf'}),'multi-page.pdf');const serialized=new Request('https://local',{method:'POST',body:upload});let response=await call('/batches/'+batchId+'/documents',{method:'POST',headers:{'Content-Type':serialized.headers.get('Content-Type')},body:Buffer.from(await serialized.arrayBuffer())});assert.equal(response.status,201,await response.clone().text());const{id}=await response.json();assert.equal(vision,2);
  let row=await ctx.db.prepare('SELECT data FROM stamp_documents WHERE id=?').bind(id).first();assert.deepEqual(JSON.parse(row.data).cachedReading,cache);
  row=await ctx.db.prepare('SELECT data FROM stamp_batches WHERE id=?').bind(batchId).first();const data=JSON.parse(row.data);data.importConfirmed=true;data.import={groups:[{id:'configured-group'}],errors:[]};await ctx.db.prepare('UPDATE stamp_batches SET data=? WHERE id=?').bind(JSON.stringify(data),batchId).run();
  response=await call('/batches/'+batchId+'/documents/'+id+'/analyze',{method:'POST',headers:{'If-Match':'1'},body:'{}'});assert.equal(response.status,202,await response.clone().text());
  const deadline=Date.now()+15000;let status;while(Date.now()<deadline){row=await ctx.db.prepare('SELECT status,data FROM stamp_documents WHERE id=?').bind(id).first();status=row.status;if(!['QUEUED','PROCESSING'].includes(status))break;await new Promise(resolve=>setTimeout(resolve,50));}
  assert.equal(status,'NEEDS_APPROVAL',row.data);assert.equal(vision,2);assert.deepEqual(actions,['document-info','ocr-page','ocr-page','document-info','document-split','analyze']);
 }finally{await ctx.worker.dispose();}
});
