import type {HTMLAttributes} from 'react';

/** Keep actions, text selection and portalled dialogs independent of row navigation. */
export function documentRow(open:()=>void,disabled=false):HTMLAttributes<HTMLTableRowElement>{
 return {className:disabled?'':'bill-clickable-row',tabIndex:disabled?undefined:0,
  onClick:event=>{const target=event.target as Element;if(disabled||!event.currentTarget.contains(target)||target.closest('button,a,input,select,textarea,summary,[role="button"],[role="menuitem"],dialog')||window.getSelection()?.toString())return;open();},
  onKeyDown:event=>{if(disabled||event.target!==event.currentTarget||!['Enter',' '].includes(event.key))return;event.preventDefault();open();}};
}
