import {createRoot} from 'react-dom/client';
import {PDFPreview} from './billing-pdf-preview';
export function mountExpensePreview(element:HTMLElement,file:Blob){const root=createRoot(element);root.render(<PDFPreview record={null} file={file}/>);return ()=>root.unmount();}
