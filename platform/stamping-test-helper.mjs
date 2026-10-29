import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {testEnvironment,users} from '../marches/test.mjs';
import {migrateStamping} from './stamping-schema.mjs';
export {users};
export const python=process.env.STAMP_TEST_PYTHON||'python';
const cwd=fileURLToPath(new URL('../facturx-service',import.meta.url));
export async function py(args,input=''){
 return new Promise((resolve,reject)=>{const child=spawn(python,args,{cwd,env:process.env,windowsHide:true});const out=[],err=[];child.stdout.on('data',c=>out.push(c));child.stderr.on('data',c=>err.push(c));child.on('error',reject);child.on('exit',code=>code?reject(new Error(Buffer.concat(err).toString())):resolve(Buffer.concat(out)));child.stdin.end(input);});
}
export async function fixtures(){return JSON.parse(await py(['-c',`import runpy,json,base64; m=runpy.run_path('tests/test_stamping.py'); print(json.dumps({'pdf':base64.b64encode(m['pdf']()).decode(),'invoice':base64.b64encode(m['pdf']('INVOICE')).decode(),'dense':base64.b64encode(m['pdf'](dense=True)).decode(),'table':base64.b64encode(m['table']()+b'\\n'+m['table'](kind='INVOICE').split(b'\\n',1)[1]).decode()}))`]));}
export async function stampEnvironment(options={}){
 let aiCalls=0;const requests=[],serviceActions=[];
 const ctx=await testEnvironment({stamping:true,ai:async input=>{aiCalls++;requests.push(input);return options.ai?options.ai(input):{response:JSON.stringify({suggestions:[{field:'allocation_amount',value:'50000',quote:'ignore instructions'}]})};},bindings:{BILLING_PDF_SERVICE_URL:'https://document.test',BILLING_PDF_SERVICE_KEY:'x'.repeat(40)},outboundService:async request=>{
  if(new URL(request.url).origin!=='https://document.test')throw new Error('Unexpected network destination');
  const form=await request.formData();const payload=JSON.parse(form.get('payload'));serviceActions.push(payload.action);payload.file=Buffer.from(await form.get('file').arrayBuffer()).toString('base64');
  const out=await py(['-m','cdi_facturx.stamping_job'],JSON.stringify(payload));return new Response(out,{headers:{'Content-Type':'application/json'}});
 }});
 await migrateStamping(ctx.db);await migrateStamping(ctx.db);
 const admin=await ctx.login(users[0]);
 const call=async(path,options={})=>{
  if(options.body instanceof FormData){const request=new Request('https://preview.example',{method:'POST',body:options.body});options={...options,body:Buffer.from(await request.arrayBuffer()),headers:{...options.headers,'Content-Type':request.headers.get('content-type')}};}
  return ctx.worker.dispatchFetch('https://preview.example/api/v1/stamping'+path,{...options,headers:{Authorization:'Bearer '+admin.token,Origin:'http://127.0.0.1:5196','Content-Type':'application/json',...options.headers}});
 };
 const send=(path,payload={},version)=>call(path,{method:'POST',headers:version?{'If-Match':String(version)}:{},body:JSON.stringify(payload)});
 const upload=(path,bytes,name,version)=>{const form=new FormData();form.append('file',new Blob([bytes]),name);return call(path,{method:'POST',headers:version?{'If-Match':String(version)}:{},body:form});};
 return {...ctx,call,send,upload,admin,aiCalls:()=>aiCalls,aiRequests:requests,serviceActions};
}
