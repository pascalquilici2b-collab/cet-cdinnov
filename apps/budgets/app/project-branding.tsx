"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/budget-model";

const supported=/^image\/(png|jpeg|webp)$/;
export function ProjectLogo({project,className=""}:{project:Project;className?:string}){
 return project.logo&&/^data:image\/(png|jpeg|webp);base64,/.test(project.logo)?<img className={"project-logo "+className} src={project.logo} alt={"Logo du projet "+project.acronym}/>:null;
}
export async function readLogo(file:File):Promise<string>{
 if(!supported.test(file.type))throw new Error("Choisissez une image PNG, JPG ou WebP.");
 if(file.size>5*1024*1024)throw new Error("Le logo doit peser moins de 5 Mo.");
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error("Cette image ne peut pas être lue."));img.src=url});
  if(!img.naturalWidth||!img.naturalHeight)throw new Error("Image invalide.");
  const scale=Math.min(1,600/img.naturalWidth,240/img.naturalHeight),canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const context=canvas.getContext("2d");if(!context)throw new Error("Lecture du logo indisponible.");
  context.drawImage(img,0,0,canvas.width,canvas.height);
  const data=canvas.toDataURL("image/png");
  if(data.length>750000)throw new Error("Choisissez une image plus légère.");
  return data;
 }finally{URL.revokeObjectURL(url)}
}
export default function ProjectBranding({project,onChange}:{project:Project;onChange:(patch:Partial<Project>)=>void}){
 const input=useRef<HTMLInputElement>(null),request=useRef(0),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>()=>{request.current++},[]);
 return <section className="project-branding-settings"><h3>Identité du projet</h3>
  {project.jems?.projectId&&<p className="project-jems-id">Identifiant JEMS : <strong>{project.jems.projectId}</strong></p>}
  <div className="project-logo-controls"><div className="project-logo-preview">{project.logo?<ProjectLogo project={project}/>:<ImagePlus aria-hidden="true"/>}</div>
   <div><input ref={input} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Logo du projet" disabled={busy} onChange={async e=>{
    const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(!file)return;
    const current=++request.current;setBusy(true);setError("");
    try{const logo=await readLogo(file);if(current===request.current)onChange({logo})}catch(err){if(current===request.current)setError((err as Error).message)}finally{if(current===request.current)setBusy(false)}
   }}/>
   <div className="flex flex-wrap gap-2"><Button variant="outline" type="button" disabled={busy} onClick={()=>input.current?.click()}><Upload/>{busy?"Chargement…":project.logo?"Remplacer le logo":"Ajouter un logo"}</Button>{project.logo&&<Button variant="ghost" type="button" disabled={busy} onClick={()=>{request.current++;setError("");onChange({logo:undefined})}}><X/>Retirer</Button>}</div>
   <p className="logo-formats">PNG, JPG ou WebP · 5 Mo maximum</p></div>
  </div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </section>;
}
