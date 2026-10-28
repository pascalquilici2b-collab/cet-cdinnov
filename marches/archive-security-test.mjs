import assert from 'node:assert/strict';
import {zipSync} from 'fflate';
import {expandImportFiles} from './import-files.js';
import {readDocument} from './reader.js';

// These files contain only repeated synthetic text. No filesystem extraction,
// browser navigation or external document/network is involved.
function forgedArchive(name,size){
 const raw=zipSync({[name]:new Uint8Array(size).fill(65)}),view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
 view.setUint32(22,0,true); // Misleading local uncompressed size.
 return raw;
}
await assert.rejects(()=>expandImportFiles([new File([forgedArchive('fictitious.txt',6*1024*1024)],'test.zip')]),/volumineuse|5 Mo|Archive illisible/);
await assert.rejects(()=>readDocument(new File([forgedArchive('word/document.xml',17*1024*1024)],'fictitious.docx')),/décompressé trop volumineux/);
const normal=await expandImportFiles([new File([zipSync({'nested/fictitious.txt':new TextEncoder().encode('FICTITIOUS CONTENT')})],'normal.zip')]);
assert.equal(await normal.files[0].text(),'FICTITIOUS CONTENT');
console.log('Archive limits reject forged uncompressed-size metadata and preserve ordinary imports: PASS');
