/** Prepare the exact production OCR inputs from versioned synthetic JPEGs.
 * Usage: node platform/document-ocr-evaluation.mjs prepare
 * Writes only .private/ocr-evaluation/requests.json; no inference or credentials.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildOCRInput,OCR_PROMPT_VERSION,OCR_DEFAULT_MODEL,OCR_MODELS,ocrReservation} from './document-ocr-domain.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fixtureDirectory=resolve(root,'facturx-service/tests/fixtures/ocr');
const outputDirectory=resolve(root,'.private/ocr-evaluation');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const command=process.argv[2];
if(process.argv.length!==3||command!=='prepare'){
 console.error('Usage: node platform/document-ocr-evaluation.mjs prepare');
 process.exitCode=2;
}else{
 const manifestBytes=await readFile(resolve(fixtureDirectory,'manifest.json'));
 const manifest=JSON.parse(manifestBytes);
 const cases=[];
 for(const fixture of manifest.cases){
  if(!/^[a-z0-9-]+\.jpg$/.test(fixture.image))throw Error('Invalid fixture image path');
  const image=await readFile(resolve(fixtureDirectory,fixture.image));
  if(sha256(image)!==fixture.sha256)throw Error('Fixture hash mismatch: '+fixture.id);
  const input=buildOCRInput('data:image/jpeg;base64,'+image.toString('base64'),fixture.embeddedText);
  cases.push({id:fixture.id,image:fixture.image,imageSha256:fixture.sha256,inputSha256:sha256(JSON.stringify(input)),expected:fixture.expected,input});
 }
 const output={schemaVersion:1,synthetic:true,createdAt:new Date().toISOString(),promptVersion:OCR_PROMPT_VERSION,defaultModel:OCR_DEFAULT_MODEL,manifest:relative(root,resolve(fixtureDirectory,'manifest.json')),manifestSha256:sha256(manifestBytes),models:Object.keys(OCR_MODELS).map(model=>({model,reservedNeuronsPerRequest:ocrReservation(model)})),cases};
 await mkdir(outputDirectory,{recursive:true});
 const path=resolve(outputDirectory,'requests.json');
 await writeFile(path,JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({path:relative(root,path),cases:cases.length,inferencePerformed:false}));
}
