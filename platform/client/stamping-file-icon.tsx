import {FileArchive,FileSpreadsheet,FileText} from 'lucide-react';
export function StampFileIcon({name='document.pdf'}:{name?:string}){
 const zip=/\.zip$/i.test(name),pdf=/\.pdf$/i.test(name),label=zip?'ZIP':pdf?'PDF':/\.csv$/i.test(name)?'CSV':'XLS';
 const Icon=zip?FileArchive:pdf?FileText:FileSpreadsheet;
 return <span className={'stamp-file-icon '+(zip?'zip':pdf?'pdf':'xls')} aria-label={'Fichier '+label}><Icon size={20}/><b>{label}</b></span>;
}
