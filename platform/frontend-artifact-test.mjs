import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {unzipSync} from 'fflate';
import {gunzipSync} from 'node:zlib';
import {build} from 'esbuild';

const root=process.cwd(),dir=path.resolve(process.env.FRONTEND_ARTIFACT||''),out=path.resolve(process.env.PORTAL_QA||'');
assert.ok(process.env.FRONTEND_ARTIFACT&&process.env.PORTAL_QA,'FRONTEND_ARTIFACT and private PORTAL_QA are required');
const archive=unzipSync(new Uint8Array(await readFile(path.join(root,'.build/cdinnov-frontend.zip'))));
const names=Object.keys(archive).sort(),manifest=JSON.parse(await readFile(path.join(root,'.build/frontend-manifest.json'),'utf8'));
assert.deepEqual(names,manifest);assert.ok(names.every(name=>!name.startsWith('/')&&!name.split('/').includes('..')));
assert.ok(names.every(name=>!/(?:^|\/)(?:\.private|server|facturx-service|apps|tests?|security-audit[^/]*|node_modules)(?:\/|$)|\.(?:ts|tsx|py|map|env)$/.test(name)));
for(const name of ['agenda/install.mjs','marches/reader.js','platform/chunks/BrowserPerformanceMeasurement-H7SUVKMI.js'])assert.equal(name in archive,false,name);
const disk=[];async function tree(base,prefix=''){for(const item of await readdir(base,{withFileTypes:true})){const rel=prefix+item.name;if(item.isDirectory())await tree(path.join(base,item.name),rel+'/');else disk.push(rel);}}await tree(dir);assert.deepEqual(disk.sort(),names,'Fresh output must contain exactly the archive, with no stale files');
for(const name of names)assert.deepEqual(new Uint8Array(await readFile(path.join(dir,name))),archive[name],name);
const required=['_worker.js','_routes.json','index.html','feuilles/index.html','budgets-projets/index.html','platform/outlook-callback.html','platform/workspace-client.js','platform/session-ui.css','platform/pdf-editor-font.ttf','marches/reader.mjs','marches/vendor/pdf.mjs','marches/vendor/pdf.worker.mjs','marches/vendor/standard_fonts/FoxitSerif.pfb','marches/vendor/ocr/worker.min.js','marches/vendor/ocr/core/tesseract-core-lstm.wasm.js','marches/vendor/ocr/lang/eng.traineddata.gz','marches/vendor/ocr/lang/fra.traineddata.gz','budgets-projets/ocr/v7/fra.traineddata.gz','marches/vendor/wasm/openjpeg.wasm','marches/vendor/wasm/jbig2.wasm','marches/vendor/wasm/qcms_bg.wasm'];
for(const name of required)assert.ok(archive[name]?.length>0,name);
for(const name of names.filter(name=>name.endsWith('.traineddata.gz')))assert.ok(gunzipSync(archive[name]).length>100000,name);
const text=name=>new TextDecoder().decode(archive[name]);
const entryPoints=['dashboard','finance','billing','personnel','agenda','markets','stamping','workspace-client','outlook-callback','theme','icons','frame-guard'].map(name=>'platform/'+name+'.js');
entryPoints.push('marches/reader.mjs','marches/vendor/pdf.mjs','marches/vendor/pdf.worker.mjs');
for(const name of ['feuilles/index.html','budgets-projets/index.html'])for(const match of text(name).matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)){const value=match[1];entryPoints.push(path.posix.normalize(value.startsWith('/')?value.slice(1):path.posix.join(path.posix.dirname(name),value)));}
const resolved=await build({entryPoints,bundle:true,write:false,outdir:path.join(dir,'.unused-import-check'),platform:'browser',format:'esm',splitting:true,metafile:true,logLevel:'silent',plugins:[{name:'published-files-only',setup(builder){
  builder.onResolve({filter:/.*/},args=>{
    let name=args.path.split(/[?#]/)[0];if(/^(?:https?:|data:|blob:)/.test(name))return {path:name,external:true};
    if(args.kind==='entry-point')return {path:path.posix.normalize(name),namespace:'archive'};
    if(name.startsWith('/'))name=name.slice(1);else if(name.startsWith('.'))name=path.posix.normalize(path.posix.join(path.posix.dirname(args.importer),name));else return {errors:[{text:'Unexpected unbundled dependency '+name+' from '+args.importer}]};
    if(!archive[name])return {errors:[{text:'Missing published import '+name+' from '+args.importer}]};return {path:name,namespace:'archive'};
  });
  builder.onLoad({filter:/.*/,namespace:'archive'},args=>({contents:archive[args.path],loader:args.path.endsWith('.css')?'css':/\.(?:js|mjs)$/.test(args.path)?'js':'file'}));
}}]});
console.log('OK archive/manifest/output identical: '+names.length+' files; required PDF/OCR assets and '+Object.keys(resolved.metafile.inputs).length+' compiled imports resolved');

const frontend=(await import(pathToFileURL(path.join(dir,'_worker.js')).href)).default;
const requests=[],errors=[],external=[];
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm','.gz':'application/gzip','.pfb':'application/octet-stream','.ttf':'font/ttf','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{try{
  const request=new Request('http://127.0.0.1'+req.url),url=new URL(request.url);let name=decodeURIComponent(url.pathname).slice(1);
  const response=await frontend.fetch(request,{ASSETS:{fetch:async()=>name==='artifact-smoke.html'?new Response('<!doctype html><html><title>Local document test</title><body><canvas id="pdf"></canvas></body></html>',{headers:{'Content-Type':'text/html'}}):archive[name]?new Response(archive[name],{headers:{'Content-Type':mime[path.extname(name)]||'application/octet-stream'}}):new Response('Not found',{status:404})}});
  requests.push({path:url.pathname,status:response.status});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(error){errors.push(String(error));res.writeHead(500);res.end('Local test failure');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json'),{chromium}=require('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext();await context.route('**/*',route=>{if(route.request().url().startsWith(base+'/'))return route.continue();external.push(route.request().url());return route.abort();});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));const response=await page.goto(base+'/artifact-smoke.html');assert.match(response.headers()['content-security-policy'],/frame-ancestors 'self'/);
 const result=await page.evaluate(async()=>{
   const pdfjs=await import('/marches/vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/marches/vendor/pdf.worker.mjs';
   const stream='BT /F1 24 Tf 40 200 Td (DOCUMENT TEST 12345) Tj ET';
   const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'];
   let source='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(source.length);source+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}const xref=source.length;source+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
   const loading=pdfjs.getDocument({data:new TextEncoder().encode(source),useSystemFonts:false,standardFontDataUrl:location.origin+'/marches/vendor/standard_fonts/',wasmUrl:location.origin+'/marches/vendor/wasm/'});const doc=await loading.promise;
   const first=await doc.getPage(1),canvas=document.getElementById('pdf'),viewport=first.getViewport({scale:1});canvas.width=viewport.width;canvas.height=viewport.height;await first.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const text=(await first.getTextContent()).items.map(item=>item.str).join(' ');await loading.destroy();
   const {default:Tesseract}=await import('/marches/vendor/ocr/tesseract.esm.min.js');
   const worker=await Tesseract.createWorker('fra+eng',1,{workerPath:location.origin+'/marches/vendor/ocr/worker.min.js',corePath:location.origin+'/marches/vendor/ocr/core',langPath:location.origin+'/marches/vendor/ocr/lang',workerBlobURL:false,cacheMethod:'none'});
   const image=document.createElement('canvas');image.width=700;image.height=180;const draw=image.getContext('2d');draw.fillStyle='white';draw.fillRect(0,0,700,180);draw.fillStyle='black';draw.font='bold 42px Arial';draw.fillText('DOCUMENT TEST 12345',30,95);
   const recognized=await worker.recognize(image);await worker.terminate();return {pdfText:text,ocrText:recognized.data.text};
 });
 assert.match(result.pdfText,/DOCUMENT TEST 12345/);assert.match(result.ocrText,/DOCUMENT TEST 12345/);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.ok(requests.every(r=>r.status===200));
 assert.ok(requests.some(r=>r.path.endsWith('pdf.worker.mjs')));assert.ok(requests.some(r=>r.path.endsWith('FoxitSerif.pfb')));assert.ok(requests.some(r=>r.path.endsWith('fra.traineddata.gz')));assert.ok(requests.some(r=>r.path.endsWith('eng.traineddata.gz')));
 await mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,'artifact-pdf-render.png')});await writeFile(path.join(out,'frontend-artifact-checks.json'),JSON.stringify({artifact:dir,files:names.length,compiledImports:Object.keys(resolved.metafile.inputs).length,required,result,requests,errors,external},null,2));
 console.log('PASS compiled frontend artifact: real PDF worker, Type1 font rendering and French/English OCR with HTTP CSP, no external request or missing asset.');
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
