import {strFromU8,strToU8} from 'fflate';
import type {BillingClientData} from '../billing-contracts';
import {validClientLogoData} from '../billing-client-logo';
import {clientLogo} from './billing-client-avatar';

// Fit any saved client logo inside the reference's right-hand header frame.
// Canvas output is PNG, including when the source is WebP or JPEG.
async function logoPng(source:string):Promise<Uint8Array>{
 const img=new Image();img.src=source;
 try{await img.decode();}catch{throw Error('Le logo du client ne peut pas être chargé. Vérifiez le logo dans sa fiche.');}
 if(!img.naturalWidth||!img.naturalHeight)throw Error('Logo du client invalide.');
 const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=276;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Préparation du logo impossible.');
 const scale=Math.min(canvas.width/img.naturalWidth,canvas.height/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;
 ctx.drawImage(img,canvas.width-w,(canvas.height-h)/2,w,h);
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Préparation du logo impossible.')),'image/png'));
 return new Uint8Array(await blob.arrayBuffer());
}
export async function brandMission(parts:Record<string,Uint8Array>,client:BillingClientData,programme:string){
 const source=validClientLogoData(client.logoData)?client.logoData:clientLogo(client.party.name,client.party.siren||client.party.siret,client.logoKey),logo=source?await logoPng(source):null;
 const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',A='http://schemas.openxmlformats.org/drawingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 for(const name of Object.keys(parts).filter(n=>/^word\/header\d+\.xml$/.test(n))){
  const doc=new DOMParser().parseFromString(strFromU8(parts[name]),'application/xml');
  for(const node of Array.from(doc.getElementsByTagNameNS(W,'drawing'))){
   const id=node.getElementsByTagNameNS(A,'blip')[0]?.getAttributeNS(R,'embed');
   // In the retained MFF model rId1 is the right client logo, rId2 Maritime.
   if(id==='rId1'){
    if(!logo){node.remove();continue;}
    parts['word/media/image1.png']=logo;
    for(const n of Array.from(node.getElementsByTagName('*')))if(n.localName==='docPr'||n.localName==='cNvPr')n.setAttribute('descr',client.party.name);
   }else if(id==='rId2'&&!/marit/i.test(programme))node.remove();
  }
  parts[name]=strToU8(new XMLSerializer().serializeToString(doc));
 }
 // Do not leave an unrelated client's logo in the generated package, even unused.
 if(!logo)delete parts['word/media/image1.png'];
 if(!/marit/i.test(programme))delete parts['word/media/image2.png'];
 for(const name of Object.keys(parts).filter(n=>/^word\/_rels\/header\d+\.xml.rels$/.test(n))){
  const doc=new DOMParser().parseFromString(strFromU8(parts[name]),'application/xml');
  for(const rel of Array.from(doc.documentElement.children))if((rel.getAttribute('Target')==='media/image1.png'&&!logo)||(rel.getAttribute('Target')==='media/image2.png'&&!/marit/i.test(programme)))rel.remove();
  parts[name]=strToU8(new XMLSerializer().serializeToString(doc));
 }
}
