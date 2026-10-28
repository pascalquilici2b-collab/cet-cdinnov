/** CSV quoting does not stop a spreadsheet from interpreting text as a formula. */
export function csvCell(value:unknown):string {
 let text=String(value??'');
 if(typeof value!=='number'&&(/^[\s\u0000-\u001f\u007f]*[=+@-]/u.test(text)||/^[\t\r\n]/.test(text)))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
