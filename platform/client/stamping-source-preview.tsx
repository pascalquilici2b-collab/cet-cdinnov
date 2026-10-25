import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {StampPieceDialog} from './stamping-piece-dialog';
import {StampPDFScroll} from './stamping-pdf-scroll';
import {StampFileIcon} from './stamping-file-icon';

export function StampSourcePreview({id,name,load,onClose}:{id:string;name:string;load:()=>Promise<Blob>;onClose:()=>void}){
 const [file,setFile]=useState<Blob|null>(null),[error,setError]=useState(''),loader=useRef(load);loader.current=load;
 useEffect(()=>{let active=true;setFile(null);setError('');loader.current().then(blob=>{if(active)setFile(blob);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id]);
 return <StampPieceDialog label="Aperçu du PDF original" onClose={onClose}><section className="stamp-panel stamp-review stamp-source-review"><header className="stamp-section-head"><h2><StampFileIcon name={name}/>{name}</h2><button aria-label="Fermer l’aperçu original" onClick={onClose}><X size={18}/></button></header>{file?<StampPDFScroll blob={file} original blocks={[]} editable={false} position={null} onPosition={()=>{}}/>:<p role={error?'alert':'status'}>{error||'Chargement du PDF…'}</p>}</section></StampPieceDialog>;
}
