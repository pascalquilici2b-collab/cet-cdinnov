import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require=createRequire(process.env.MARCHES_BUILD_PACKAGE||'C:/Users/quili/OneDrive - cdinnov.com/CDInnov - Pascal QUILICI/40 - CDINNOV GESTION INTERNE/CET & CONGES PAYES/LOGICIEL CET/agenda/package.json');
const {build}=require('esbuild');
const file=path.join(root,'index.html');
let html=(await readFile(file,'utf8')).replace(/\r\n/g,'\n');
const css=await readFile(path.join(root,'marches/ui.css'),'utf8');
const js=(await build({entryPoints:[path.join(root,'marches/ui.js')],bundle:true,format:'iife',platform:'browser',write:false,external:['./marches/vendor/pdf.mjs','./marches/reader.mjs']})).outputFiles[0].text;
if(!html.includes('data-view="marches"')){
 const marker='    <div class="nav-item" data-view="facturier">';
 if(!html.includes(marker))throw new Error('Navigation du facturier introuvable.');
 html=html.replace(marker,'    <div class="nav-item" data-view="marches" role="button" tabindex="0" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();setView(\'marches\');toggleSidebar(false)}"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h10l3 3v15H8zM4 7H2v14h3M12 8h5M12 12h5M12 16h5"/></svg>Marchés et contrats</div>\n'+marker);
 html=html.replace('const VIEW_META = {',"const VIEW_META = {\n  marches:{title:'Marchés et contrats',sub:'Référentiel contractuel · prix, plafonds et périodes',action:null},");
 html=html.replace("  else if(currentView==='facturier') renderFacturier();","  else if(currentView==='marches') renderMarches();\n  else if(currentView==='facturier') renderFacturier();");
 html=html.replace('function setView(v){',"function setView(v){\n  if(currentView==='marches'&&v!==currentView&&!marchesLeave())return;");
 html=html.replace("style.display=v==='budgetsprojets'?'none':''","style.display=['budgetsprojets','marches'].includes(v)?'none':''");
 html=html.replace("  if(v==='agenda')agendaEnter();","  if(v==='agenda')agendaEnter();\n  if(v==='marches')marchesEnter();");
 html=html.replace('  agendaForget();','  marchesForget();\n  agendaForget();');
 // The app decides navigation visibility each time the authenticated account changes.
 html=html.replace('function renderUserChip(){',"function renderUserChip(){\n  document.querySelectorAll('[data-view=\"marches\"]').forEach(e=>e.style.display=isAdmin(AUTH_USER)?'':'none');");
 html=html.replace('  renderUserChip();\n  render();',"  renderUserChip();\n  render();\n  if(new URLSearchParams(location.search).get('view')==='marches'&&isAdmin(AUTH_USER))setTimeout(()=>setView('marches'),0);");
}
const cssBlock='<style id="cdi-markets-styles">'+css+'</style>';
if(!html.includes('/* Markets deep link */'))html=html.replace('  renderUserChip();\n  render();',"  renderUserChip();\n  render();\n  /* Markets deep link */ if(new URLSearchParams(location.search).get('view')==='marches'&&isAdmin(AUTH_USER))setTimeout(()=>setView('marches'),0);");
if(!html.includes("if(!marchesLeave())return;"))html=html.replace('function authLogout(){',"function authLogout(){\n  if(!marchesLeave())return;");
html=html.includes('<style id="cdi-markets-styles">')?html.replace(/<style id="cdi-markets-styles">[\s\S]*?<\/style>/,()=>cssBlock):html.replace('</head>',cssBlock+'\n</head>');
const jsBlock='/* CDI_MARKETS_START */\n'+js.replace(/<\/script/gi,'<\\/script')+'\n/* CDI_MARKETS_END */';
html=html.includes('/* CDI_MARKETS_START */')?html.replace(/\/\* CDI_MARKETS_START \*\/[\s\S]*?\/\* CDI_MARKETS_END \*\//,()=>jsBlock):html.replace('/* ===================== boot ===================== */',jsBlock+'\n/* ===================== boot ===================== */');
if(!html.includes('/* CDI_MARKETS_START */'))throw new Error('Point d’intégration de démarrage introuvable.');
await writeFile(file,html,'utf8');
const deps='C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pdfjs-dist';
await mkdir(path.join(root,'marches/vendor'),{recursive:true});
for(const [a,b] of [['build/pdf.mjs','pdf.mjs'],['build/pdf.worker.mjs','pdf.worker.mjs'],['LICENSE','PDFJS-LICENSE']])await copyFile(path.join(deps,a),path.join(root,'marches/vendor',b));
await build({entryPoints:[path.join(root,'server/budget-service-source.mjs')],bundle:true,format:'esm',platform:'node',outfile:path.join(root,'server/budget-service.mjs')});
console.log('Marchés intégrés au portail, ressources PDF locales copiées.');
