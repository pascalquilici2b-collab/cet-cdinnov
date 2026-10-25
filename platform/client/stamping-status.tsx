import React from 'react';
import {FileSearch,Clock,LoaderCircle,ClipboardCheck,Eye,CheckCircle2,Stamp,Trash2} from 'lucide-react';
export const stampStatusLabels:Record<string,string>={UPLOADED:'À analyser',QUEUED:'En attente',PROCESSING:'Analyse en cours',REVIEW_REQUIRED:'À vérifier',NEEDS_APPROVAL:'Aperçu à valider',APPROVED:'Prêt',VERIFIED:'Tamponné',DELETING:'Suppression à terminer'};
const icons:Record<string,typeof FileSearch>={UPLOADED:FileSearch,QUEUED:Clock,PROCESSING:LoaderCircle,REVIEW_REQUIRED:ClipboardCheck,NEEDS_APPROVAL:Eye,APPROVED:CheckCircle2,VERIFIED:Stamp,DELETING:Trash2};
export function StampStatus({status}:{status:string}){const Icon=icons[status]||FileSearch;return <span className={'stamp-status '+status}><Icon size={15}/>{stampStatusLabels[status]||status}</span>;}
