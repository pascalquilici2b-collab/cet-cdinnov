// Isolated local application with synthetic records and the real Worker/D1 API.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join,extname,sep} from 'node:path';
import {testEnvironment,users} from '../marches/test.mjs';
import {dashboardFixture} from './dashboard-fixture.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {seedBusinessDocument} from './business-migration.mjs';
export async function billingPreview(testOptions={}){
  process.env.MARCHES_TEST_WORKER=fileURLToPath(new URL('../.build/entry.mjs',import.meta.url));
  process.env.MARCHES_TEST_COMPATIBILITY_DATE='2026-06-09';
  // UI fixtures expose the configured path; each PDF test supplies its own outbound service.
  const ctx=await testEnvironment({...testOptions,bindings:{BILLING_PDF_SERVICE_URL:'https://billing-fixture.invalid',BILLING_PDF_SERVICE_KEY:'synthetic-billing-fixture-key-0123456789',...testOptions.bindings}});
  try{
    await migrateBilling(ctx.db);
    const fixture=dashboardFixture(ctx.accounts,'2026-10-20');
    delete fixture.salaries[0].photo;delete fixture.salaries[0].payslip;
    fixture.factures.forEach(f=>delete f.pdfSource);
    fixture.factures[0].pdfSource={name:'facture-fictive.pdf',url:'data:application/pdf;base64,JVBERi0xLjc=',sha256:'synthetic-fixture'};
    fixture.codesAffaires=[{id:'code-test',code1:26,code2:10,pilote:'QA',label:'Accompagnement fictif',client:'Client fictif',montantHT:9000,progress:35}];
    await ctx.setPortal(JSON.stringify(fixture));
    await seedBusinessDocument(ctx.db,'budgets',{clients:[{id:'client-test',name:'Client fictif'}]},1);
    const sessions=await Promise.all(users.map(email=>ctx.login(email)));
    const root=fileURLToPath(new URL('../',import.meta.url)).replace(/[\\/]$/,'');
    const boot=`state={...freshState(),...${JSON.stringify(fixture)}};
      cloudEnabled=()=>false;budgetsObserveClients=()=>{};budgetsApi=()=>location.origin+'/budgets';
      budgetsEnsureSession=async()=>AUTH_USER===${JSON.stringify(users[0])}?${JSON.stringify(sessions[0])}:${JSON.stringify(sessions[1])};
      window.qaNotifications=[];notify=(...args)=>qaNotifications.push(args);
      window.qaFacturx=[];window.qaOpenFacturX=openFacturX;openFacturX=id=>{qaFacturx.push(id);toast('Aperçu local : aucun document fictif envoyé au convertisseur.');};
      const consultant=new URLSearchParams(location.search).has('consultant');
      unlockApp(consultant?${JSON.stringify(users[1])}:${JSON.stringify(users[0])});
      setView(consultant?'notesfrais':'facturier');`;
    const source=await readFile(join(root,'index.html'),'utf8');
    if(!source.includes('\nbootAuth();'))throw new Error('Portal boot marker missing');
    const html=source.replace('\nbootAuth();','\n'+boot),requests=[];
    const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
    const server=createServer(async(req,res)=>{try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/budgets/')){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const headers={Origin:'https://app.cdinnov.eu'};
        for(const key of ['authorization','content-type','if-match','if-none-match'])if(req.headers[key])headers[key]=req.headers[key];
        const response=await ctx.worker.dispatchFetch('https://preview.example'+url.pathname+url.search,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
        requests.push({path:url.pathname,method:req.method,status:response.status});
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      const name=url.pathname==='/'?'/index.html':url.pathname,path=resolve(root,'.'+decodeURIComponent(name));
      if(!path.startsWith(root+sep)||!types[extname(path)]||/[/\\](?:\.git|node_modules|\.build|\.private)[/\\]/i.test(path))throw new Error('Outside public tree');
      res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');
      res.end(name==='/index.html'?html:await readFile(path));
    }catch{res.writeHead(404);res.end('Not found');}});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    return {ctx,requests,sessions,base:'http://127.0.0.1:'+server.address().port,
      async close(){server.closeAllConnections();await new Promise(r=>server.close(r));await ctx.worker.dispose();}};
  }catch(error){await ctx.worker.dispose();throw error;}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const preview=await billingPreview();
  console.log('Aperçu local — données fictives, base temporaire : '+preview.base);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await preview.close();process.exit(0);});
}
