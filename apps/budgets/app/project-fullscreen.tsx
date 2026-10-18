"use client";
import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function ProjectFullscreen(){
 const [expanded,setExpanded]=useState(false);
 useEffect(()=>{
  document.documentElement.classList.toggle("budget-expanded",expanded);
  if(window.parent!==window)window.parent.postMessage({type:"cdi-budget-fullscreen",active:expanded},location.origin);
  const key=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!document.querySelector('[role="dialog"]'))setExpanded(false)};
  const message=(e:MessageEvent)=>{if(e.origin===location.origin&&e.source===window.parent&&e.data?.type==="cdi-budget-exit-fullscreen")setExpanded(false)};
  window.addEventListener("keydown",key);window.addEventListener("message",message);
  return()=>{window.removeEventListener("keydown",key);window.removeEventListener("message",message)};
 },[expanded]);
 useEffect(()=>()=>{document.documentElement.classList.remove("budget-expanded");if(window.parent!==window)window.parent.postMessage({type:"cdi-budget-fullscreen",active:false},location.origin)},[]);
 return <Button variant="outline" className="fullscreen-button" aria-pressed={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?<Minimize2/>:<Maximize2/>}{expanded?"Quitter le plein écran":"Plein écran"}</Button>;
}
