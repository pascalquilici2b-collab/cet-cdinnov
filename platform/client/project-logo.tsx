import {useRef,useState} from 'react';
import {FolderKanban,ImagePlus,Trash2} from 'lucide-react';
import {validClientLogoData} from '../billing-client-logo';
export function ProjectAvatar({logo,name=''}:{logo?:string;name?:string}){
 return <span className="bill-project-avatar">{logo?<img src={logo} alt={name?'Logo '+name:''}/>:<FolderKanban size={21} aria-hidden="true"/>}</span>;
}
export function ProjectLogoField({value,onChange,onError}:{value:string;onChange:(v:string)=>void;onError:(v:string)=>void}){
 const input=useRef<HTMLInputElement>(null),[loading,setLoading]=useState(false);
 async function load(file?:File){if(!file)return;setLoading(true);onError('');try{
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Choisissez une image PNG, JPEG ou WebP de moins de 5 Mo.');
  const bitmap=await createImageBitmap(file);try{
   const scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Lecture du logo impossible.');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const data=canvas.toDataURL('image/webp',.85);if(!validClientLogoData(data))throw new Error('Cette image est trop volumineuse. Choisissez un logo plus petit.');onChange(data);
  }finally{bitmap.close();}
 }catch(e){onError(e instanceof Error?e.message:'Lecture du logo impossible.');}finally{setLoading(false);if(input.current)input.current.value='';}}
 return <div className="bill-project-logo-field"><ProjectAvatar logo={value}/><input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label="Importer le logo du projet" onChange={e=>void load(e.target.files?.[0])}/><button type="button" disabled={loading} className="bill-button" onClick={()=>input.current?.click()}><ImagePlus size={17}/>{loading?'Importation…':value?'Changer le logo':'Importer le logo'}</button>{value&&<button type="button" className="bill-icon-button bill-remove" aria-label="Retirer le logo du projet" onClick={()=>onChange('')}><Trash2 size={16}/></button>}</div>;
}
