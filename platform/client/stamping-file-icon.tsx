import {FileSpreadsheet,FileText} from 'lucide-react';
export function StampFileIcon({name='document.pdf'}:{name?:string}){
 const pdf=/\.pdf$/i.test(name),label=pdf?'PDF':/\.csv$/i.test(name)?'CSV':'XLS';
 return <span className={'stamp-file-icon '+(pdf?'pdf':'xls')} aria-label={'Fichier '+label}>{pdf?<FileText size={20}/>:<FileSpreadsheet size={20}/>}<b>{label}</b></span>;
}
