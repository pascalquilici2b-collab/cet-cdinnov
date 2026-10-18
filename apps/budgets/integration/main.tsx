import { createRoot } from "react-dom/client";
import Home from "../app/page";
import type { WorkspaceStorage } from "../lib/workspace-storage";
import "../app/globals.css";
import "./embedded.css";

const pending = new Map<string, {resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
let version = 0;
function request(method:string, workspace?:unknown):Promise<any> {
  if(window.parent===window)return Promise.reject(new Error("Ouvrez BUDGETS PROJETS depuis l’application CDInnov après connexion."));
  const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error("La connexion ou la sauvegarde n’a pas abouti. Gardez votre copie et réessayez."))},300000);
    pending.set(id,{resolve,reject,timer});
    window.parent.postMessage({type:"cdi-budget-request",id,method,workspace,version},window.location.origin);
  });
}
window.addEventListener("message",event=>{
  if(event.origin!==location.origin||event.source!==window.parent)return;
  if(event.data?.type==="cdi-budget-viewport"){
    const {top,height}=event.data;
    if(Number.isFinite(top)&&Number.isFinite(height)&&top>=0&&height>=160){
      document.documentElement.style.setProperty("--budget-dialog-top",top+height/2+"px");
      document.documentElement.style.setProperty("--budget-dialog-height",Math.max(120,height-32)+"px");
    }
    return;
  }
  if(event.data?.type!=="cdi-budget-response")return;
  const item=pending.get(event.data.id);if(!item)return;
  clearTimeout(item.timer);pending.delete(event.data.id);
  if(event.data.error)item.reject(new Error(event.data.error));else item.resolve(event.data.result);
});
const storage:WorkspaceStorage={
  empty:true,
  async load(){const data=await request("GET");version=data.version;return data.workspace},
  async save(workspace){const data=await request("PUT",workspace);version=data.version},
  dirty(value){window.parent.postMessage({type:"cdi-budget-dirty",dirty:value},location.origin)},
};
createRoot(document.getElementById("root")!).render(<Home storage={storage} embedded openClientsInitially={new URLSearchParams(location.search).get("clients")==="1"}/>);
new ResizeObserver(()=>{
  window.parent.postMessage({type:"cdi-budget-height",height:document.getElementById("root")!.scrollHeight},location.origin);
}).observe(document.getElementById("root")!);
