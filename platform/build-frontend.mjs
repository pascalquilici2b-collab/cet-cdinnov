import {build} from 'esbuild';
import {mkdir,readdir,readFile,writeFile,copyFile,stat,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipSync} from 'fflate';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(path.join(root,'.build'),{recursive:true});
const output=await mkdtemp(path.join(root,'.build','frontend-'));
const selected=new Set(['index.html','favicon.ico','manifest.webmanifest','logo (1).png','modele_suivi_CET.xlsx','templates/client-mission-v2.docx']);
// Explicit published asset roots. Source, audits, tests, server, templates and
// private working folders are never placed in the public deployment.
// Only the reviewed, placeholder-only mission template above is published.
async function tree(dir){for(const item of await readdir(path.join(root,dir),{withFileTypes:true})){
  if(item.name.startsWith('.')||item.name==='node_modules')continue;
  const rel=dir+'/'+item.name;
  if(item.isDirectory())await tree(rel);
  else if((/\.(?:html|css|js|mjs|json|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|wasm|xlsx|txt)$/i.test(rel)||/\/(?:ocr\/.*\.traineddata\.gz|standard_fonts\/[^/]+\.pfb)$/.test(rel)||/^LICENSE(?:[-.]|$)/i.test(item.name))&&!/\b(?:test|spec)\b/i.test(item.name))selected.add(rel);
}}
for(const dir of ['design','icons','budgets-projets','feuilles','marches/vendor'])await tree(dir);
for(const item of await readdir(path.join(root,'platform'),{withFileTypes:true}))if(item.isFile()&&/\.(?:js|css|html|ttf|txt)$/.test(item.name)&&!/(?:test|worker|build|bridge)/i.test(item.name))selected.add('platform/'+item.name);
for(const dir of ['platform/chunks','platform/client-logos','platform/vendor','platform/programme-logos'])await tree(dir);
for(const name of ['reader.mjs','ui.css'])try{await stat(path.join(root,'marches',name));selected.add('marches/'+name);}catch{}
selected.delete('platform/chunks/BrowserPerformanceMeasurement-H7SUVKMI.js');
const files={};
for(const rel of [...selected].sort()){
  const data=await readFile(path.join(root,rel));files[rel]=new Uint8Array(data);
  await mkdir(path.dirname(path.join(output,rel)),{recursive:true});await copyFile(path.join(root,rel),path.join(output,rel));
}
const result=await build({entryPoints:[path.join(root,'platform/frontend-worker.mjs')],bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,plugins:[{name:'runtime-policy',setup(builder){builder.onResolve({filter:/security-policy\.mjs$/},()=>({path:'policy',namespace:'runtime-policy'}));builder.onLoad({filter:/.*/,namespace:'runtime-policy'},async()=>{const {contentSecurityPolicy}=await import('./security-policy.mjs');return {contents:'export const contentSecurityPolicy='+JSON.stringify(contentSecurityPolicy),loader:'js'};});}}]});
files['_worker.js']=result.outputFiles[0].contents;await writeFile(path.join(output,'_worker.js'),files['_worker.js']);
files['_routes.json']=new TextEncoder().encode(JSON.stringify({version:1,include:['/*'],exclude:[]}));await writeFile(path.join(output,'_routes.json'),files['_routes.json']);
const archive=path.join(root,'.build','cdinnov-frontend.zip');await writeFile(archive,zipSync(files,{level:6}));
await writeFile(path.join(root,'.build','frontend-manifest.json'),JSON.stringify(Object.keys(files).sort(),null,2));
console.log(JSON.stringify({files:Object.keys(files).length,archive,output,bytes:(await stat(archive)).size}));
