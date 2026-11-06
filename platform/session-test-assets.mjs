import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
export async function sessionTestAssets(root=process.cwd()){
 const assets=new Map();
 async function bundle(entryPoints,options={}){
   const outdir=path.join(root,'.session-test-memory');
   const result=await build({absWorkingDir:root,entryPoints,outdir,bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},loader:{'.component.css':'text','.png':'dataurl'},external:['/platform/pdf-editor-font.ttf'],...options});
   for(const file of result.outputFiles)assets.set('/platform/'+path.relative(outdir,file.path).replaceAll('\\','/'),file.contents);
 }
 await bundle(['dashboard','finance','billing','personnel','agenda','markets','stamping','rh','mission-letters'].map(n=>'platform/client/'+n+'.tsx'),{splitting:true,chunkNames:'chunks/[name]-[hash]'});
 await bundle(['platform/client/workspace-client.ts'],{format:'iife',globalName:'CDIPlatform'});
 const cssEmpty={name:'css-empty',setup(b){b.onResolve({filter:/\?url$/},async args=>{const item=await b.resolve(args.path.replace(/\?url$/,''),{resolveDir:args.resolveDir,kind:'import-statement'});const url='/platform/session-assets/'+path.basename(item.path);assets.set(url,await readFile(item.path));return {path:url,namespace:'asset-url'};});b.onLoad({filter:/.*/,namespace:'asset-url'},args=>({contents:'export default '+JSON.stringify(args.path),loader:'js'}));b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'css'}));}};
 await bundle({'session-sheets':'apps/sheets/src/main.tsx','session-budgets':'apps/budgets/integration/main.tsx','session-api':'apps/sheets/src/api.ts'},{plugins:[cssEmpty]});
 for(const [url,source,name] of [['/feuilles/index.html','feuilles/index.html','session-sheets'],['/budgets-projets/index.html','budgets-projets/index.html','session-budgets']]){
   let html=await readFile(path.join(root,source),'utf8');html=html.replace(/<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/,'<script type="module" src="/platform/'+name+'.js"></script>');
   if(name==='session-budgets')html=html.replace('</head>','<link rel="stylesheet" href="/apps/budgets/integration/standalone-auth.css"></head>');assets.set(url,html);
 }
 let html=await readFile(path.join(root,'index.html'),'utf8');
 for(const name of ['PORTAL','BILLING'])html=html.replace(new RegExp('(?:\\r?\\n)*\\/\\* CDI_'+name+'_START \\*\\/[\\s\\S]*?\\/\\* CDI_'+name+'_END \\*\\/(?:\\r?\\n)*'),'\n');
 const paths=['loading-markup','session-ui','portal-compat','facturx-integrity'];
 if(await readFile(path.join(root,'platform/client/facturx-auth-bridge.js'),'utf8').then(()=>true,()=>false))paths.push('facturx-auth-bridge');
 const bridge=(await Promise.all(paths.map(n=>readFile(path.join(root,'platform/client/'+n+'.js'),'utf8')))).join('\n');
 const names=new Set(ts.createSourceFile('b.js',bridge,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).statements.filter(ts.isFunctionDeclaration).map(n=>n.name.text));
 const start=html.indexOf('>',html.lastIndexOf('<script',html.indexOf('function freshState()')))+1,end=html.lastIndexOf('</script>');
 let script=html.slice(start,end);const ast=ts.createSourceFile('shell.js',script,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 for(const n of [...ast.statements].reverse())if(ts.isFunctionDeclaration(n)&&names.has(n.name?.text))script=script.slice(0,n.getStart(ast))+script.slice(n.end);
 const billing=(await Promise.all(['billing-bridge','billing-facturx-bridge','stamping-bridge','rh-bridge','mission-letters-bridge'].map(n=>readFile(path.join(root,'platform/client/'+n+'.js'),'utf8')))).join('\n');
 script=script.replace('\nbootAuth();',()=> '\n'+bridge+'\n'+billing+"\nsetView('dashboard');\nbootAuth();");
 html=html.slice(0,start)+script+html.slice(end);
 const markets=await build({absWorkingDir:root,entryPoints:['marches/ui.js'],bundle:true,format:'iife',platform:'browser',write:false,external:['./marches/vendor/pdf.mjs','./marches/reader.mjs?v=stamping-allocation-20261025','./platform/markets.js?v=security-contrast-20261030']});
 html=html.replace(/\/\* CDI_MARKETS_START \*\/[\s\S]*?\/\* CDI_MARKETS_END \*\//,()=>'/* CDI_MARKETS_START */\n'+markets.outputFiles[0].text+'\n/* CDI_MARKETS_END */');
 assets.set('/index.html',html);assets.set('/platform/session-ui.css',await readFile(path.join(root,'platform/client/session-ui.css')));
 return assets;
}



