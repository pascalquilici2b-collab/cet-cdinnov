import{test}from'node:test';import assert from'node:assert/strict';
import{ocrRasterSize,substantialPdfRaster,hasPdfWrittenAnnotations,OCR_MAX_SIDE,OCR_MAX_PIXELS}from'./ocr-pages.mjs';
const ops={save:1,restore:2,transform:3,paintImageXObject:4,paintInlineImageXObject:5,paintImageMaskXObject:6,paintSolidColorImageMask:7,paintImageXObjectRepeat:8,paintInlineImageXObjectGroup:9,paintFormXObjectBegin:10,paintFormXObjectEnd:11};
const list=steps=>({fnArray:steps.map(([op])=>op),argsArray:steps.map(([,args])=>args)});
test('vision raster stays bounded independently of PDF dimensions',()=>{
 for(const[width,height]of[[100,200],[6000,8000],[200000,20000]]){const size=ocrRasterSize(width,height);assert.ok(size.width<=OCR_MAX_SIDE&&size.height<=OCR_MAX_SIDE);assert.ok(size.width*size.height<=OCR_MAX_PIXELS);assert.ok(Math.abs(size.width/size.height-width/height)<.02);}
 for(const dims of [[0,2],[-1,3],[Infinity,10]])assert.throws(()=>ocrRasterSize(...dims));
});
test('mixed PDF scan body is detected despite a large text header; a small logo keeps the text path',()=>{
 const scan=list([[ops.save,[]],[ops.transform,[600,0,0,700,0,50]],[ops.paintImageXObject,['scan']],[ops.restore,[]]]);
 const logo=list([[ops.save,[]],[ops.transform,[40,0,0,40,20,740]],[ops.paintImageXObject,['logo']],[ops.restore,[]]]);
 assert.equal(substantialPdfRaster(scan,ops,[0,0,600,800]),true);assert.equal(substantialPdfRaster(logo,ops,[0,0,600,800]),false);
 const repeated=list([[ops.paintImageXObjectRepeat,['scan',500,600,[30,40]]]]);assert.equal(substantialPdfRaster(repeated,ops,[0,0,600,800]),true);
 const form=list([[ops.paintFormXObjectBegin,[[2,0,0,2,0,0]]],[ops.transform,[300,0,0,350,0,25]],[ops.paintImageXObject,['scan']],[ops.paintFormXObjectEnd,[]]]);assert.equal(substantialPdfRaster(form,ops,[0,0,600,800]),true);
 const clipped=list([[ops.transform,[600,0,0,800,1000,1000]],[ops.paintImageXObject,['outside']]]);assert.equal(substantialPdfRaster(clipped,ops,[0,0,600,800]),false);
});
test('filled fields and pen annotations request visual reading without equating signatures with authentication',()=>{
 assert.equal(hasPdfWrittenAnnotations([{subtype:'Ink',inkLists:[[1,2,3,4]]}]),true);assert.equal(hasPdfWrittenAnnotations([{fieldType:'Tx',fieldValue:'Montant manuscrit'}]),true);assert.equal(hasPdfWrittenAnnotations([{fieldType:'Btn',fieldValue:'Off'}]),false);assert.equal(hasPdfWrittenAnnotations([{subtype:'Ink',hidden:true,inkLists:[[1,2]]}]),false);
});
