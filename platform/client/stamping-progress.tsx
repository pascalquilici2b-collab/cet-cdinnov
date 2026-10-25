import {useEffect,useState} from 'react';
import {Check,LoaderCircle} from 'lucide-react';
export const stampStage=(d:any)=>d.status==='QUEUED'?'En attente':d.data?.progress?.stage==='ai'?'Identification avec Qwen':d.data?.progress?.stage==='saving'?'Vérification de l’aperçu':'Lecture et préparation du tampon';
export function StampAnalysisProgress({documents,targets}:{documents:any[];targets:string[]}){
 const selected=targets.length?documents.filter(d=>targets.includes(d.id)):documents.filter(d=>d.data?.progress||['QUEUED','PROCESSING'].includes(d.status));
 const active=selected.filter(d=>['QUEUED','PROCESSING'].includes(d.status)),done=selected.filter(d=>!['UPLOADED','QUEUED','PROCESSING','DELETING'].includes(d.status)).length;
 const [now,setNow]=useState(Date.now());useEffect(()=>{if(!active.length)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[active.length>0]);
 if(!selected.length)return null;
 const started=Math.min(...selected.map(d=>d.data?.progress?.startedAt||Infinity)),seconds=Number.isFinite(started)?Math.max(0,Math.floor((now-started)/1000)):0;
 const review=selected.filter(d=>d.status==='REVIEW_REQUIRED').length,finished=!active.length&&done===selected.length;
 return <div className={'stamp-analysis-progress'+(finished?' complete':'')} role="status"><div><strong>{finished?<Check size={17}/>:<LoaderCircle size={17}/>} {finished?'Analyse terminée':'Analyse du lot'}</strong><span>{done} / {selected.length} pièces{active.length>0&&seconds>0?' · '+Math.floor(seconds/60)+' min '+String(seconds%60).padStart(2,'0')+' s':''}{finished&&review?' · '+review+' à vérifier':''}</span></div><div className="stamp-analysis-track" role="progressbar" aria-label="Pièces analysées" aria-valuemin={0} aria-valuemax={selected.length} aria-valuenow={done}><span style={{width:100*done/selected.length+'%'}}/>{!finished&&<i/>}</div></div>;
}
