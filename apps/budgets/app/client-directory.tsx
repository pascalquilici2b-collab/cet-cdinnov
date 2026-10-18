"use client";
import { useRef, useState } from "react";
import { Building2, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Client, Workspace } from "@/lib/budget-model";
import { clientNameKey, saveClient } from "@/lib/client-directory";
import { readLogo } from "./project-branding";

export function ClientLogo({client}:{client?:Client}){
 return client?.logo&&/^data:image\/(png|jpeg|webp);base64,/.test(client.logo)?<img className="client-logo" src={client.logo} alt={"Logo de "+client.name}/>:null;
}
export default function ClientDirectory({workspace,onChange,open,onOpenChange,shared=false}:{workspace:Workspace;onChange:(clients:Client[])=>void;open:boolean;onOpenChange:(value:boolean)=>void;shared?:boolean}){
 const [selected,setSelected]=useState<string>(),[name,setName]=useState(""),[logo,setLogo]=useState<string>(),[query,setQuery]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const fileInput=useRef<HTMLInputElement>(null),request=useRef(0);
 const select=(client?:Client)=>{request.current++;setBusy(false);setSelected(client?.id);setName(client?.name||"");setLogo(client?.logo);setError("")};
 const changeOpen=(value:boolean)=>{if(!value){select();setQuery("")}onOpenChange(value)};
 return <Dialog open={open} onOpenChange={changeOpen}><DialogContent className="client-directory-dialog"><DialogHeader><DialogTitle>Clients</DialogTitle><DialogDescription>{shared?"Répertoire commun au facturier et à l’outil budgets.":"Retrouvez vos clients et leur logo pour tous leurs projets."}</DialogDescription></DialogHeader>
  <div className="client-directory"><div className="client-directory-list"><input className="client-search" aria-label="Rechercher un client" placeholder="Rechercher un client" value={query} onChange={e=>setQuery(e.target.value)}/>
   <Button variant="outline" onClick={()=>select()}><Plus/>Nouveau client</Button>
   <div className="client-directory-items">{workspace.clients.filter(c=>clientNameKey(c.name).includes(clientNameKey(query))).sort((a,b)=>a.name.localeCompare(b.name,"fr")).map(c=><button type="button" key={c.id} className={"client-directory-item"+(selected===c.id?" selected":"")} onClick={()=>select(c)}><ClientLogo client={c}/><span>{c.name}</span></button>)}{!workspace.clients.length&&<p>Aucun client pour le moment.</p>}</div>
  </div><form className="client-directory-form" onSubmit={e=>{e.preventDefault();try{onChange(saveClient(workspace.clients,{id:selected,name,logo}));select()}catch(err){setError((err as Error).message)}}}>
   <h3>{selected?"Modifier le client":"Ajouter un client"}</h3><label>Nom du client<input name="name" required value={name} onChange={e=>setName(e.target.value)}/></label>
   <div className="client-logo-preview">{logo?<ClientLogo client={{id:"preview",name,logo,accounts:[]}}/>:<Building2 aria-hidden="true"/>}</div>
   <input ref={fileInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Logo du client" onChange={async e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(!file)return;const current=++request.current;setBusy(true);setError("");try{const image=await readLogo(file);if(current===request.current)setLogo(image)}catch(err){if(current===request.current)setError((err as Error).message)}finally{if(current===request.current)setBusy(false)}}}/>
   <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>fileInput.current?.click()}><Upload/>{busy?"Chargement…":logo?"Remplacer le logo":"Ajouter un logo"}</Button>{logo&&<Button type="button" variant="ghost" onClick={()=>{request.current++;setBusy(false);setLogo(undefined)}}><X/>Retirer</Button>}</div>
   <p className="logo-formats">PNG, JPG ou WebP · 5 Mo maximum</p>{error&&<p role="alert" className="text-destructive">{error}</p>}
   <Button type="submit" disabled={busy}>{selected?"Enregistrer le client":"Créer le client"}</Button>
  </form></div></DialogContent></Dialog>;
}
