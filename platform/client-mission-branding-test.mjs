import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {billingPreview} from './billing-preview.mjs';
const require=createRequire('C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json'),{chromium}=require('playwright');
const preview=await billingPreview(),browser=await chromium.launch({channel:'msedge',headless:true}),out='platform/.private/followup-20261026';await mkdir(out,{recursive:true});
try{
 const result=await build({entryPoints:['platform/client/client-employee-documents.ts'],bundle:true,format:'esm',platform:'browser',write:false});
 const page=await browser.newPage();await page.goto(preview.base);
 const bytes=await page.evaluate(async source=>{
  const {missionDocument}=await import(URL.createObjectURL(new Blob([source],{type:'application/javascript'})));
  const canvas=document.createElement('canvas');canvas.width=300;canvas.height=90;const c=canvas.getContext('2d');c.fillStyle='#116c51';c.fillRect(0,0,300,90);c.fillStyle='#fff';c.font='bold 28px Arial';c.fillText('CLIENT EXEMPLE',20,55);
  const employee={id:'agent',name:'Camille Exemple',role:'Chargée de projet',supervisor:'Responsable Exemple',allocations:[]},allocation={project:'Projet Exemple',projectCode:'TEST-01',programme:'Interreg Italie-France Maritime',percent:'25',startDate:'2026-01-01',endDate:'2026-12-31',tasks:'Suivi administratif du projet.\nCoordination des partenaires.'};
  const first=await missionDocument({party:{name:'Organisme Exemple'},logoData:canvas.toDataURL('image/png')},employee,allocation,1);
  const none=await missionDocument({party:{name:'Autre organisme sans logo'}},employee,{...allocation,programme:'Horizon Europe'},1);
  return {first:Array.from(new Uint8Array(await first.arrayBuffer())),none:Array.from(new Uint8Array(await none.arrayBuffer()))};
 },result.outputFiles[0].text);
 const zipped=unzipSync(Uint8Array.from(bytes.first)),xml=strFromU8(zipped['word/document.xml']),header=strFromU8(zipped['word/header2.xml']);
 assert.match(xml,/Organisme Exemple/);assert.doesNotMatch(xml,/FAGGIANELLI|FRIHUB|PORRI|Établissement Public/);assert.match(header,/descr="Organisme Exemple"/);
 const template=unzipSync(new Uint8Array(await readFile('templates/client-mission-v2.docx')));assert.notDeepEqual(zipped['word/media/image1.png'],template['word/media/image1.png']);assert.deepEqual(zipped['word/media/image2.png'],template['word/media/image2.png']);
 const none=unzipSync(Uint8Array.from(bytes.none));assert.equal(none['word/media/image1.png'],undefined);assert.equal(none['word/media/image2.png'],undefined);assert.doesNotMatch(strFromU8(none['word/header2.xml']),/<w:drawing>/);
 await writeFile(out+'/mission-other.docx',Uint8Array.from(bytes.first));console.log('Client name and uploaded logo replaced; unrelated client/programme images removed.');
}finally{await browser.close();await preview.close();}
