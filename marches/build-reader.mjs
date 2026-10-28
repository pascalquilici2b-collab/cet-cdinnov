import {mkdir,readFile,writeFile,copyFile,readdir,cp} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(process.env.MARCHES_AI_PACKAGE||process.env.MARCHES_BUILD_PACKAGE||path.join(root,'package.json'));
const {build}=require('esbuild'),modules=path.dirname(path.dirname(path.dirname(require.resolve('fflate'))));
// Always refresh the PDF reader from the locked dependency, also when keeping
// the existing OCR language assets. Do not revive an older global runtime copy.
const pdfRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));
await mkdir(path.join(root,'vendor'),{recursive:true});
for(const [source,target] of [['build/pdf.mjs','pdf.mjs'],['build/pdf.worker.mjs','pdf.worker.mjs'],['LICENSE','PDFJS-LICENSE']])await copyFile(path.join(pdfRoot,source),path.join(root,'vendor',target));
for(const dir of ['wasm','standard_fonts'])await cp(path.join(pdfRoot,dir),path.join(root,'vendor',dir),{recursive:true});
if(!process.argv.includes('--bundle-only')){
const tesseract=path.dirname(require.resolve('tesseract.js/package.json')),core=path.dirname(require.resolve('tesseract.js-core/package.json'));
const dest=path.join(root,'vendor/ocr');await mkdir(path.join(dest,'core'),{recursive:true});await mkdir(path.join(dest,'lang'),{recursive:true});
for(const file of ['tesseract.esm.min.js','worker.min.js','tesseract.min.js.LICENSE.txt','worker.min.js.LICENSE.txt'])await copyFile(path.join(tesseract,'dist',file),path.join(dest,file));
await copyFile(path.join(path.dirname(path.dirname(require.resolve('fflate'))),'LICENSE'),path.join(root,'vendor/fflate-LICENSE.txt'));
await copyFile(path.join(tesseract,'LICENSE.md'),path.join(dest,'LICENSE.md'));
await copyFile(path.join(core,'LICENSE'),path.join(dest,'core/LICENSE'));
for(const file of await readdir(core))if(file.endsWith('.wasm.js'))await copyFile(path.join(core,file),path.join(dest,'core',file));
for(const lang of ['fra','eng']){const target=path.join(dest,'lang',lang+'.traineddata.gz');try{await readFile(target);}catch{const r=await fetch('https://tessdata.projectnaptha.com/4.0.0_fast/'+lang+'.traineddata.gz');if(!r.ok)throw new Error('Téléchargement langue OCR impossible');await writeFile(target,Buffer.from(await r.arrayBuffer()));}}
await writeFile(path.join(dest,'lang/NOTICE.txt'),'Tesseract tessdata_fast French and English; Apache License 2.0. https://github.com/tesseract-ocr/tessdata_fast\nDownloaded from tessdata.projectnaptha.com/4.0.0_fast/.');
}
// --bundle-only uses the OCR assets already checked into the application.
for(const file of ['ocr/tesseract.esm.min.js','ocr/worker.min.js','ocr/lang/fra.traineddata.gz','ocr/lang/eng.traineddata.gz','pdf.mjs','pdf.worker.mjs'])await readFile(path.join(root,'vendor',file));
await build({entryPoints:[path.join(root,'reader.js')],bundle:true,format:'esm',platform:'browser',nodePaths:[modules],external:['./vendor/pdf.mjs','./vendor/ocr/tesseract.esm.min.js'],outfile:path.join(root,'reader.mjs')});
console.log('Lecteur PDF, OCR, Word et Excel construit avec ressources locales.');
